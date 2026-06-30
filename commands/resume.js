const { SlashCommandBuilder } = require('discord.js');
const { useQueue } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resumes the currently paused song.'),
    async execute(interaction) {
        const queue = useQueue(interaction.guildId);

        if (!queue || !queue.node.isPaused()) {
            return interaction.reply({ content: '❌ The music is not paused!', ephemeral: true });
        }

        queue.node.setPaused(false);
        return interaction.reply({ content: '▶️ Resumed the music.' });
    },
};
