const { SlashCommandBuilder } = require('discord.js');
const { getPlayer } = require('../utils/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pauses the currently playing song.'),
    async execute(interaction) {
        const shoukaku = getPlayer();
        if (!shoukaku) return interaction.reply({ content: '❌ Lavalink is not connected!', ephemeral: true });

        const player = shoukaku.players.get(interaction.guildId);

        if (!player || !player.track) {
            return interaction.reply({ content: '❌ There is no music playing right now!', ephemeral: true });
        }

        if (player.paused) {
            return interaction.reply({ content: '❌ The music is already paused!', ephemeral: true });
        }

        await player.setPaused(true);
        return interaction.reply({ content: '⏸️ Paused the music.' });
    },
};
