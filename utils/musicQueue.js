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
 * Intelligently filters out remixes, slowed, reverb, and covers to find the original track.
 */
async function searchMusic(query) {
    try {
        // Ensure token is set before doing any stream testing
        const cid = await play.getFreeClientID();
        await play.setToken({ soundcloud: { client_id: cid } });

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
            // Search SoundCloud for top 20 results to widen the pool
            const results = await play.search(query, { limit: 20, source: { soundcloud: 'tracks' } });
            if (!results || results.length === 0) return null;
            
            // Keywords that indicate a non-original track
            const badKeywords = [
                'slowed', 'reverb', 'nightcore', 'sped up', 'fast', 'cover', 'remix', 'mashup', 
                '8d', 'bass boosted', 'instrumental', 'karaoke', 'lofi', 'lo-fi', 'tiktok version', 'live',
                'remake', 'bootleg', 'edit', 'rework', 'mix', 'loop', 'full', 'extended', 'version'
            ];
            
            // Function to score a track (lower score is better)
            const getScore = (track) => {
                let score = 0;
                const titleLower = (track.name || track.title || '').toLowerCase();
                
                // Heavily penalize tracks containing bad keywords
                for (const word of badKeywords) {
                    if (titleLower.includes(word)) score += 100;
                }
                
                // Prefer tracks that have a reasonable duration (e.g., > 1min and < 10min) to avoid snippets or full albums
                if (track.durationInSec < 60) score += 50;
                if (track.durationInSec > 600) score += 50;
                
                return score;
            };

            // Sort results by score (ascending)
            const sortedTracks = results.sort((a, b) => getScore(a) - getScore(b));
            
            // Iterate through the best tracks and find the first one that is actually streamable (no 404s)
            for (const track of sortedTracks) {
                try {
                    // Test if the track can be streamed without throwing a 404
                    await play.stream(track.url);
                    
                    return {
                        title: track.name || track.title || 'Unknown',
                        url: track.url,
                        duration: formatDuration(track.durationInSec),
                        thumbnail: track.thumbnail || '',
                    };
                } catch (err) {
                    console.log(`[MusicQueue] Skipping ${track.url} due to stream error: ${err.message}`);
                    continue; // Try the next best track
                }
            }
            
            return null; // No streamable tracks found
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
            // Ensure SoundCloud client ID is strictly set before extraction to prevent 404s
            const cid = await play.getFreeClientID();
            await play.setToken({ soundcloud: { client_id: cid } });

            // Stream directly using play-dl (which now safely pulls from SoundCloud)
            const stream = await play.stream(this.currentSong.url);
            
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
                inlineVolume: false, // Strictly disable JS volume transformations to preserve 100% original audio fidelity
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
                .setColor('#FF5500'); // SoundCloud Orange

            if (this.currentSong.thumbnail) {
                embed.setThumbnail(this.currentSong.thumbnail);
            }

            this.textChannel.send({ embeds: [embed] }).catch(() => {});
        } catch (error) {
            console.error(`[MusicQueue] Failed to play "${this.currentSong?.title}":`, error.stack);
            this.textChannel.send({ content: `❌ PIPELINE CRASH on **${this.currentSong?.title}**:\n\`\`\`js\n${error.message}\n${error.stack.split('\n')[1]}\n\`\`\`` }).catch(() => {});
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
