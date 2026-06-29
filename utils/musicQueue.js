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
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const queues = new Map();

function formatDuration(seconds) {
    if (!seconds) return 'Live';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Search YouTube or resolve a URL using system yt-dlp binary.
 * Returns basic song info (title, url, duration, thumbnail).
 */
async function searchYouTube(query) {
    const isUrl = query.startsWith('http://') || query.startsWith('https://');
    const target = isUrl ? `"${query}"` : `"ytsearch1:${query}"`;

    const { stdout } = await execAsync(
        `yt-dlp --dump-json --no-warnings --no-check-certificate ${target}`,
        { maxBuffer: 10 * 1024 * 1024 }
    );

    const lines = stdout.trim().split('\n').filter(Boolean);
    if (!lines.length) return null;

    const video = JSON.parse(lines[0]);

    return {
        title: video.title || 'Unknown Title',
        url: video.webpage_url || video.original_url || query,
        duration: formatDuration(video.duration || 0),
        thumbnail: video.thumbnail || '',
    };
}

/**
 * Two-step audio streaming:
 * 1. yt-dlp --get-url → extract the direct CDN audio URL
 * 2. ffmpeg -i <CDN_URL> → stream with reconnect support → raw PCM to Discord
 *
 * This is more reliable than piping yt-dlp into ffmpeg directly.
 */
async function getAudioStream(url) {
    // Step 1: get the direct CDN audio URL from yt-dlp
    const { stdout } = await execAsync(
        `yt-dlp -f "bestaudio[ext=webm]/bestaudio/best" --get-url --no-warnings --no-check-certificate "${url}"`,
        { maxBuffer: 1 * 1024 * 1024, timeout: 30000 }
    );

    const audioUrl = stdout.trim().split('\n')[0];
    if (!audioUrl) throw new Error('yt-dlp returned no audio URL');

    // Step 2: stream from CDN URL through ffmpeg, output raw PCM
    const ffmpeg = spawn('ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', audioUrl,
        '-analyzeduration', '0',
        '-loglevel', '0',
        '-f', 's16le',   // signed 16-bit little-endian PCM
        '-ar', '48000',  // 48kHz (Discord standard)
        '-ac', '2',      // stereo
        'pipe:1',        // output to stdout
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    ffmpeg.on('error', (e) => console.error('[ffmpeg error]', e.message));

    return ffmpeg.stdout;
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
            const stream = await getAudioStream(this.currentSong.url);
            const resource = createAudioResource(stream, { inputType: StreamType.Raw });
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

module.exports = { getQueue, createQueue, searchYouTube };
