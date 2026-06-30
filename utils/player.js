const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { EmbedBuilder } = require('discord.js');

let globalPlayer = null;

async function initPlayer(client) {
    if (globalPlayer) return globalPlayer;

    const player = new Player(client, {
        ytdlOptions: {
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        }
    });

    const { YoutubeiExtractor } = require('discord-player-youtubei');

    const fs = require('fs');
    const path = require('path');
    let youtubeCookies = '';
    const cookiesPath = path.join(__dirname, '..', 'youtube.cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        youtubeCookies = fs.readFileSync(cookiesPath, 'utf8');
    }

    // Load all default extractors
    await player.extractors.loadMulti(DefaultExtractors);

    // Register discord-player-youtubei to handle YouTube with our cookies
    await player.extractors.register(YoutubeiExtractor, {
        authentication: youtubeCookies
    });

    // Set up event listeners for the player
    player.events.on('playerStart', (queue, track) => {
        if (!queue.metadata || !queue.metadata.channel) return;

        const embed = new EmbedBuilder()
            .setTitle('🎵 Now Playing')
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields(
                { name: '⏱️ Duration', value: track.duration || 'Unknown', inline: true },
                { name: '👤 Requested by', value: track.requestedBy?.username || 'Unknown', inline: true },
                { name: '🎙️ Artist', value: track.author || 'Unknown', inline: true }
            )
            .setColor('#1DB954'); // Spotify Green

        if (track.thumbnail) embed.setThumbnail(track.thumbnail);

        queue.metadata.channel.send({ embeds: [embed] }).catch(() => {});
    });

    player.events.on('emptyQueue', (queue) => {
        if (!queue.metadata || !queue.metadata.channel) return;
        queue.metadata.channel.send('✅ Queue is empty!').catch(() => {});
    });

    player.events.on('emptyChannel', (queue) => {
        if (!queue.metadata || !queue.metadata.channel) return;
        queue.metadata.channel.send('👋 Left the voice channel because it was empty.').catch(() => {});
    });

    player.events.on('error', (queue, error) => {
        console.error(`[Player Error] ${error.message}`);
    });

    player.events.on('playerError', (queue, error) => {
        console.error(`[Audio Stream Error] ${error.message}`);
        if (queue.metadata && queue.metadata.channel) {
            queue.metadata.channel.send(`❌ A stream error occurred: \`${error.message}\``).catch(() => {});
        }
    });

    globalPlayer = player;
    return player;
}

function getPlayer() {
    return globalPlayer;
}

module.exports = { initPlayer, getPlayer };
