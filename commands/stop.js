const { SlashCommandBuilder } = require('discord.js');
const { getPlayer } = require('../utils/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stops the music and clears the queue.'),
    async execute(interaction) {
        const shoukaku = getPlayer();
        if (!shoukaku) return interaction.reply({ content: '❌ Lavalink is not connected!', ephemeral: true });

        const player = shoukaku.players.get(interaction.guildId);

        if (!player) {
            return interaction.reply({ content: '❌ There is no music playing right now!', ephemeral: true });
        }

        shoukaku.leaveVoiceChannel(interaction.guildId);
        return interaction.reply({ content: '🛑 Stopped the music and disconnected.' });
    },
};
