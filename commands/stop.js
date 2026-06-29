const { SlashCommandBuilder } = require('discord.js');
const { getQueue } = require('../utils/musicQueue');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and disconnect the bot from voice'),

    async execute(interaction) {
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        const queue = getQueue(interaction.guild.id);
        if (!queue) {
            return interaction.reply({ content: '❌ Nothing is playing right now!', ephemeral: true });
        }

        queue.destroy();
        await interaction.reply({ content: '⏹️ Stopped the music and disconnected!' });
    },
};
