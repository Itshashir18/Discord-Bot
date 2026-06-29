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
const { spawn, exec } = require('child_process');
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
 * Resolves a URL or search query into song info using play-dl (which works great for search).
 */
async function searchYouTube(query) {
    const isUrl = query.startsWith('http://') || query.startsWith('https://');

    if (isUrl) {
        // Just extract info, play-dl is fine for this
        const info = await play.video_info(query);
        const v = info.video_details;
        return {
            title: v.title,
            url: v.url,
            duration: v.durationRaw || 'Unknown',
            thumbnail: v.thumbnails?.[v.thumbnails.length - 1]?.url || '',
        };
    } else {
        const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
        if (!results?.length) return null;
        const v = results[0];
        return {
            title: v.title || 'Unknown',
            url: v.url,
            duration: v.durationRaw || 'Unknown',
            thumbnail: v.thumbnails?.[v.thumbnails.length - 1]?.url || '',
        };
    }
}

/**
 * Gets a raw PCM audio stream from YouTube via system yt-dlp + ffmpeg pipe.
 * yt-dlp binary is the ONLY downloader that consistently defeats YouTube's 403 blocks.
 */
function getAudioStream(url) {
    const ytdlp = spawn('yt-dlp', [
        '-f', 'bestaudio[ext=webm]/bestaudio/best',
        '--no-warnings',
        '--no-call-home',
        '--no-check-certificate',
        '-o', '-',   // output to stdout
        url,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',          // read from stdin (yt-dlp stdout)
        '-analyzeduration', '0',
        '-loglevel', '0',
        '-f', 's16le',           // raw PCM
        '-ar', '48000',          // 48kHz (Discord standard)
        '-ac', '2',              // stereo
        'pipe:1',                // output to stdout
    ], { stdio: ['pipe', 'pipe', 'ignore'] });

    // Pipe yt-dlp into ffmpeg
    ytdlp.stdout.pipe(ffmpeg.stdin);

    ytdlp.on('error', (e) => console.error('[yt-dlp spawn error]', e.message));
    ffmpeg.on('error', (e) => console.error('[ffmpeg spawn error]', e.message));

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
            const stream = getAudioStream(this.currentSong.url);
            
            // Raw PCM stream from ffmpeg needs StreamType.Raw
            const resource = createAudioResource(stream, {
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
