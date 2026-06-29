const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueue, createQueue, searchYouTube } = require('../utils/musicQueue');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song in your voice channel')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name or YouTube URL')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.editReply({ content: '❌ You need to join a voice channel first!' });
        }

        const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.editReply({ content: '❌ I don\'t have permission to join or speak in your voice channel!' });
        }

        const query = interaction.options.getString('query');

        try {
            await interaction.editReply({ content: `🔍 Searching for **${query}**...` });

            const songInfo = await searchYouTube(query);
            if (!songInfo) {
                return interaction.editReply({ content: '❌ No results found! Try a different search term or YouTube URL.' });
            }

            songInfo.requestedBy = interaction.user.username;

            let queue = getQueue(interaction.guild.id);

            if (!queue) {
                queue = createQueue(interaction.guild.id, voiceChannel, interaction.channel);
                await queue.connect(voiceChannel);
            } else if (queue.voiceChannel.id !== voiceChannel.id) {
                return interaction.editReply({ content: '❌ I\'m already playing in a different voice channel!' });
            }

            queue.addSong(songInfo);

            const isFirst = !queue.currentSong && queue.songs.length === 1;

            if (isFirst) {
                await queue.startPlaying();
                await interaction.editReply({ content: `▶️ Starting **${songInfo.title}**...` });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('➕ Added to Queue')
                    .setDescription(`**[${songInfo.title}](${songInfo.url})**`)
                    .addFields(
                        { name: '⏱️ Duration', value: songInfo.duration, inline: true },
                        { name: '📋 Position', value: `#${queue.songs.length}`, inline: true }
                    )
                    .setThumbnail(songInfo.thumbnail)
                    .setColor('#1DB954');

                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('[/play] Error:', error);
            await interaction.editReply({ content: '❌ Something went wrong. Try a YouTube URL directly (e.g. `https://youtube.com/watch?v=...`)' });
        }
    },
};
