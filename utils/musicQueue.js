const {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    joinVoiceChannel,
    entersState,
    StreamType,
} = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const play = require('play-dl');

const queues = new Map();

// Initialize SoundCloud Client ID for play-dl
play.getFreeClientID().then(clientID => {
    play.setToken({
        soundcloud: {
            client_id: clientID
        }
    });
}).catch(console.error);

function formatDuration(seconds) {
    if (!seconds) return 'Live';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Searches SoundCloud instead of YouTube.
 * YouTube actively blocks all cloud hosting IPs (like Railway).
 * SoundCloud allows free streaming without IP bans.
 */
async function searchMusic(query) {
    try {
        const isUrl = query.startsWith('http://') || query.startsWith('https://');

        if (isUrl && query.includes('soundcloud.com')) {
            const info = await play.soundcloud(query);
            return {
                title: info.name,
                url: info.url,
                duration: formatDuration(info.durationInSec),
                thumbnail: info.thumbnail || '',
            };
        } else {
            // Search SoundCloud
            const results = await play.search(query, { limit: 1, source: { soundcloud: 'tracks' } });
            if (!results || results.length === 0) return null;
            
            const track = results[0];
            return {
                title: track.name || track.title || 'Unknown',
                url: track.url,
                duration: formatDuration(track.durationInSec),
                thumbnail: track.thumbnail || '',
            };
        }
    } catch (error) {
        console.error('SoundCloud Search Error:', error);
        return null;
    }
}

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
        this.player.on(AudioPlayerStatus.Idle, () => this._playNext());
        this.player.on('error', (err) => {
            console.error(`[MusicQueue] Player error:`, err.message);
            this._playNext();
        });
    }

    async connect(voiceChannel) {
        this.voiceChannel = voiceChannel;
        this.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        this.connection.subscribe(this.player);

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
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
        if (this._inactivityTimer) {
            clearTimeout(this._inactivityTimer);
            this._inactivityTimer = null;
        }

        if (this.songs.length === 0) {
            this.currentSong = null;
            this._inactivityTimer = setTimeout(() => {
                this.textChannel.send({ content: '👋 Left the voice channel due to inactivity.' }).catch(() => {});
                this.destroy();
            }, 5 * 60 * 1000);
            return;
        }

        this.currentSong = this.songs.shift();

        try {
            // Stream directly using play-dl (which now safely pulls from SoundCloud)
            const stream = await play.stream(this.currentSong.url);
            
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
            });
            
            this.player.play(resource);

            const embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing')
                .setDescription(`**[${this.currentSong.title}](${this.currentSong.url})**`)
                .addFields(
                    { name: '⏱️ Duration', value: this.currentSong.duration || 'Unknown', inline: true },
                    { name: '👤 Requested by', value: this.currentSong.requestedBy, inline: true },
                    { name: '📋 Up Next', value: this.songs.length > 0 ? `${this.songs.length} song(s)` : 'Nothing', inline: true }
                )
                .setThumbnail(this.currentSong.thumbnail)
                .setColor('#FF5500'); // SoundCloud Orange

            this.textChannel.send({ embeds: [embed] }).catch(() => {});
        } catch (error) {
            console.error(`[MusicQueue] Failed to play "${this.currentSong?.title}":`, error.message);
            this.textChannel.send({ content: `❌ Couldn't play **${this.currentSong?.title}** — skipping...` }).catch(() => {});
            this._playNext();
        }
    }

    async startPlaying() {
        if (this.player.state.status === AudioPlayerStatus.Idle) {
            await this._playNext();
        }
    }

    skip() { this.player.stop(true); }
    pause() { return this.player.pause(); }
    resume() { return this.player.unpause(); }
    getStatus() { return this.player.state.status; }

    destroy() {
        if (this._inactivityTimer) clearTimeout(this._inactivityTimer);
        this.songs = [];
        this.currentSong = null;
        try { this.connection?.destroy(); } catch {}
        queues.delete(this.guildId);
    }
}

function getQueue(guildId) { return queues.get(guildId) || null; }

function createQueue(guildId, voiceChannel, textChannel) {
    const queue = new MusicQueue(guildId, voiceChannel, textChannel);
    queues.set(guildId, queue);
    return queue;
}

module.exports = { getQueue, createQueue, searchMusic };
