const { SlashCommandBuilder } = require('discord.js');
const { getPlayer } = require('../utils/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips the currently playing song.'),
    async execute(interaction) {
        const shoukaku = getPlayer();
        if (!shoukaku) return interaction.reply({ content: '❌ Lavalink is not connected!', ephemeral: true });

        const player = shoukaku.players.get(interaction.guildId);

        if (!player) {
            return interaction.reply({ content: '❌ There is no music playing right now!', ephemeral: true });
        }

        player.stopTrack(); // This stops the current track. A full queue system would automatically play the next one.
        return interaction.reply({ content: `⏭️ Skipped the current track!` });
    },
};
