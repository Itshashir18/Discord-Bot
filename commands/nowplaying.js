const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useQueue } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Shows the currently playing song.'),
    async execute(interaction) {
        const queue = useQueue(interaction.guildId);

        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ There is no music playing right now!', ephemeral: true });
        }

        const track = queue.currentTrack;

        const embed = new EmbedBuilder()
            .setTitle('🎵 Now Playing')
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields(
                { name: '⏱️ Duration', value: track.duration, inline: true },
                { name: '👤 Requested by', value: track.requestedBy?.username || 'Unknown', inline: true },
                { name: '🎙️ Artist', value: track.author, inline: true }
            )
            .setColor('#1DB954');

        if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }

        return interaction.reply({ embeds: [embed] });
    },
};
