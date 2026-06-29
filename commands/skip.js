const { SlashCommandBuilder } = require('discord.js');
const { getQueue } = require('../utils/musicQueue');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),

    async execute(interaction) {
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        const queue = getQueue(interaction.guild.id);
        if (!queue || !queue.currentSong) {
            return interaction.reply({ content: '❌ Nothing is playing right now!', ephemeral: true });
        }

        const skipped = queue.currentSong.title;
        queue.skip();

        await interaction.reply({ content: `⏭️ Skipped **${skipped}**` });
    },
};
