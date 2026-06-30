const { SlashCommandBuilder } = require('discord.js');
const { useQueue } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stops the music and clears the queue.'),
    async execute(interaction) {
        const queue = useQueue(interaction.guildId);

        if (!queue) {
            return interaction.reply({ content: '❌ There is no music playing right now!', ephemeral: true });
        }

        queue.delete();
        return interaction.reply({ content: '🛑 Stopped the music and cleared the queue.' });
    },
};
