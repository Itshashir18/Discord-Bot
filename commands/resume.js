const { SlashCommandBuilder } = require('discord.js');
const { getPlayer } = require('../utils/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resumes the currently paused song.'),
    async execute(interaction) {
        const shoukaku = getPlayer();
        if (!shoukaku) return interaction.reply({ content: '❌ Lavalink is not connected!', ephemeral: true });

        const player = shoukaku.players.get(interaction.guildId);

        if (!player || !player.track) {
            return interaction.reply({ content: '❌ There is no music playing right now!', ephemeral: true });
        }

        if (!player.paused) {
            return interaction.reply({ content: '❌ The music is not paused!', ephemeral: true });
        }

        await player.setPaused(false);
        return interaction.reply({ content: '▶️ Resumed the music.' });
    },
};
