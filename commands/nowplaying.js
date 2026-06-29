const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueue } = require('../utils/musicQueue');
const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the current song and music queue'),

    async execute(interaction) {
        const queue = getQueue(interaction.guild.id);

        if (!queue || !queue.currentSong) {
            return interaction.reply({ content: '❌ Nothing is playing right now!', ephemeral: true });
        }

        const status = queue.getStatus() === AudioPlayerStatus.Paused ? '⏸️ Paused' : '▶️ Now Playing';

        let description = `**[${queue.currentSong.title}](${queue.currentSong.url})**\n\n`;

        if (queue.songs.length > 0) {
            description += '**📋 Up Next:**\n';
            const preview = queue.songs.slice(0, 8);
            preview.forEach((song, i) => {
                description += `\`${i + 1}.\` [${song.title}](${song.url}) \`${song.duration}\`\n`;
            });
            if (queue.songs.length > 8) {
                description += `\n*...and ${queue.songs.length - 8} more*`;
            }
        } else {
            description += '*No songs in queue*';
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎵 ${status}`)
            .setDescription(description)
            .addFields(
                { name: '⏱️ Duration', value: queue.currentSong.duration || 'Unknown', inline: true },
                { name: '👤 Requested by', value: queue.currentSong.requestedBy, inline: true },
                { name: '📋 Queue Size', value: `${queue.songs.length} song(s)`, inline: true }
            )
            .setThumbnail(queue.currentSong.thumbnail)
            .setColor('#1DB954');

        await interaction.reply({ embeds: [embed] });
    },
};
