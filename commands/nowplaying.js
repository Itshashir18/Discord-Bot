const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPlayer } = require('../utils/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Shows the currently playing song.'),
    async execute(interaction) {
        const shoukaku = getPlayer();
        if (!shoukaku) return interaction.reply({ content: '❌ Lavalink is not connected!', ephemeral: true });

        const player = shoukaku.players.get(interaction.guildId);

        if (!player || !player.track) {
            return interaction.reply({ content: '❌ There is no music playing right now!', ephemeral: true });
        }

        try {
            const node = shoukaku.options.nodeResolver(shoukaku.nodes);
            const decodedTrack = await node.rest.decode(player.track);

            if (!decodedTrack) {
                return interaction.reply({ content: '❌ Could not decode track information.', ephemeral: true });
            }

            const durationFormatted = decodedTrack.info.isStream ? 'LIVE' : new Date(decodedTrack.info.length).toISOString().substr(11, 8).replace(/^00:/, '');

            const embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing (Lavalink)')
                .setDescription(`**[${decodedTrack.info.title}](${decodedTrack.info.uri})**`)
                .addFields(
                    { name: '⏱️ Duration', value: durationFormatted, inline: true },
                    { name: '🎙️ Artist', value: decodedTrack.info.author, inline: true }
                )
                .setColor('#1DB954');

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Nowplaying error:', error);
            return interaction.reply({ content: '❌ An error occurred while fetching track information.', ephemeral: true });
        }
    },
};
