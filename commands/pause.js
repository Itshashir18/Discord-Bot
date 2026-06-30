const { SlashCommandBuilder } = require('discord.js');
const { useQueue } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pauses the currently playing song.'),
    async execute(interaction) {
        const queue = useQueue(interaction.guildId);

        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ There is no music playing right now!', ephemeral: true });
        }

        queue.node.setPaused(true);
        return interaction.reply({ content: '⏸️ Paused the music.' });
    },
};
