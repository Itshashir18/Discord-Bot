const { SlashCommandBuilder } = require('discord.js');
const { getQueue } = require('../utils/musicQueue');
const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the paused song'),

    async execute(interaction) {
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        const queue = getQueue(interaction.guild.id);
        if (!queue || !queue.currentSong) {
            return interaction.reply({ content: '❌ Nothing is playing right now!', ephemeral: true });
        }

        if (queue.getStatus() !== AudioPlayerStatus.Paused) {
            return interaction.reply({ content: '▶️ Music is already playing!', ephemeral: true });
        }

        queue.resume();
        await interaction.reply({ content: `▶️ Resumed **${queue.currentSong.title}**` });
    },
};
