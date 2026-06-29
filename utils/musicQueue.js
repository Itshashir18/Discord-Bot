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
const ytdlp = require('yt-dlp-exec');
const { spawn } = require('child_process');

// Per-guild queue storage
const queues = new Map();

/**
 * Uses yt-dlp to get direct audio stream URL, then pipes through ffmpeg.
 * This is far more reliable than play-dl which breaks when YouTube changes their API.
 */
async function getAudioStream(url) {
    // Get the best audio-only format URL from yt-dlp
    const info = await ytdlp(url, {
        format: 'bestaudio[ext=webm]/bestaudio/best',
        getUrl: true,
        noWarnings: true,
        noCallHome: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true,
    });

    const audioUrl = info.toString().trim();

    // Pipe it through ffmpeg to get a PCM stream
    const ffmpeg = spawn('ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', audioUrl,
        '-analyzeduration', '0',
        '-loglevel', '0',
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    return ffmpeg.stdout;
}

/**
 * Search YouTube using yt-dlp and return video info.
 */
async function searchYouTube(query) {
    const isUrl = query.startsWith('http://') || query.startsWith('https://');
    const searchQuery = isUrl ? query : `ytsearch1:${query}`;

    const result = await ytdlp(searchQuery, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true,
        flatPlaylist: true,
    });

    // yt-dlp returns the video directly for URLs, or wrapped in entries for searches
    const video = result.entries ? result.entries[0] : result;

    if (!video) return null;

    return {
        title: video.title || 'Unknown Title',
        url: video.webpage_url || video.url || query,
        duration: formatDuration(video.duration || 0),
        thumbnail: video.thumbnail || '',
    };
}

function formatDuration(seconds) {
    if (!seconds) return 'Live';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
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
        this.player.on(AudioPlayerStatus.Idle, () => {
            this._playNext();
        });

        this.player.on('error', (error) => {
            console.error(`[MusicQueue] Player error in guild ${this.guildId}:`, error.message);
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
            const audioStream = await getAudioStream(this.currentSong.url);
            const resource = createAudioResource(audioStream, {
                inputType: StreamType.Raw,
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
                .setColor('#1DB954');

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

    skip() {
        this.player.stop(true);
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
        try { this.connection?.destroy(); } catch {}
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

module.exports = { getQueue, createQueue, searchYouTube };
