const {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    joinVoiceChannel,
    entersState,
} = require('@discordjs/voice');
const play = require('play-dl');
const { EmbedBuilder } = require('discord.js');

// Per-guild queue storage
const queues = new Map();

class MusicQueue {
    constructor(guildId, voiceChannel, textChannel) {
        this.guildId = guildId;
        this.voiceChannel = voiceChannel;
        this.textChannel = textChannel;
        this.songs = [];
        this.currentSong = null;
        this.player = createAudioPlayer();
        this.connection = null;
        this._inactivityTimer = null;

        this._setupPlayerEvents();
    }

    _setupPlayerEvents() {
        // When the current song ends, play the next one
        this.player.on(AudioPlayerStatus.Idle, () => {
            this._playNext();
        });

        this.player.on('error', (error) => {
            console.error(`[MusicQueue] Audio player error in guild ${this.guildId}:`, error.message);
            this._playNext(); // Skip broken song
        });
    }

    async connect(voiceChannel) {
        this.voiceChannel = voiceChannel;
        this.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        // Subscribe the audio player to the voice connection
        this.connection.subscribe(this.player);

        // Handle unexpected disconnects
        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                // Try to reconnect within 5 seconds
                await Promise.race([
                    entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                this.destroy();
            }
        });

        return this.connection;
    }

    addSong(song) {
        this.songs.push(song);
    }

    async _playNext() {
        // Clear inactivity timer
        if (this._inactivityTimer) {
            clearTimeout(this._inactivityTimer);
            this._inactivityTimer = null;
        }

        if (this.songs.length === 0) {
            this.currentSong = null;
            // Auto-disconnect after 5 minutes of inactivity
            this._inactivityTimer = setTimeout(() => {
                this.textChannel.send({ content: '👋 Left the voice channel due to inactivity.' }).catch(() => {});
                this.destroy();
            }, 5 * 60 * 1000);
            return;
        }

        this.currentSong = this.songs.shift();

        try {
            const stream = await play.stream(this.currentSong.url, { quality: 2 });
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
            });

            this.player.play(resource);

            // Send now playing embed
            const embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing')
                .setDescription(`**[${this.currentSong.title}](${this.currentSong.url})**`)
                .addFields(
                    { name: '⏱️ Duration', value: this.currentSong.duration || 'Unknown', inline: true },
                    { name: '👤 Requested by', value: this.currentSong.requestedBy, inline: true },
                    { name: '📋 Up Next', value: this.songs.length > 0 ? `${this.songs.length} song(s)` : 'Nothing', inline: true }
                )
                .setThumbnail(this.currentSong.thumbnail)
                .setColor('#1DB954'); // Spotify green

            this.textChannel.send({ embeds: [embed] }).catch(() => {});
        } catch (error) {
            console.error(`[MusicQueue] Failed to stream song "${this.currentSong?.title}":`, error.message);
            this.textChannel.send({ content: `❌ Couldn't play **${this.currentSong?.title}** — skipping...` }).catch(() => {});
            this._playNext(); // Skip to next song on error
        }
    }

    async startPlaying() {
        if (this.player.state.status === AudioPlayerStatus.Idle) {
            await this._playNext();
        }
    }

    skip() {
        this.player.stop(true); // force stop → triggers Idle → plays next
    }

    pause() {
        return this.player.pause();
    }

    resume() {
        return this.player.unpause();
    }

    getStatus() {
        return this.player.state.status;
    }

    destroy() {
        if (this._inactivityTimer) clearTimeout(this._inactivityTimer);
        this.songs = [];
        this.currentSong = null;
        try {
            this.connection?.destroy();
        } catch {}
        queues.delete(this.guildId);
    }
}

function getQueue(guildId) {
    return queues.get(guildId) || null;
}

function createQueue(guildId, voiceChannel, textChannel) {
    const queue = new MusicQueue(guildId, voiceChannel, textChannel);
    queues.set(guildId, queue);
    return queue;
}

module.exports = { getQueue, createQueue };
