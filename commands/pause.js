const { SlashCommandBuilder } = require('discord.js');
const { getQueue } = require('../utils/musicQueue');
const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current song'),

    async execute(interaction) {
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        const queue = getQueue(interaction.guild.id);
        if (!queue || !queue.currentSong) {
            return interaction.reply({ content: '❌ Nothing is playing right now!', ephemeral: true });
        }

        if (queue.getStatus() === AudioPlayerStatus.Paused) {
            return interaction.reply({ content: '⏸️ Already paused! Use `/resume` to continue.', ephemeral: true });
        }

        queue.pause();
        await interaction.reply({ content: `⏸️ Paused **${queue.currentSong.title}**` });
    },
};
