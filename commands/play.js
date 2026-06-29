const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const play = require('play-dl');
const { getQueue, createQueue } = require('../utils/musicQueue');

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
            let songInfo;

            // Detect if it's a YouTube URL or a search query
            const urlType = await play.validate(query);

            if (urlType === 'yt_video') {
                const info = await play.video_info(query);
                const v = info.video_details;
                songInfo = {
                    title: v.title,
                    url: v.url,
                    duration: v.durationRaw || 'Live',
                    thumbnail: v.thumbnails?.[0]?.url || '',
                    requestedBy: interaction.user.username,
                };
            } else {
                // Search YouTube
                const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
                if (!results || results.length === 0) {
                    return interaction.editReply({ content: '❌ No results found for that query!' });
                }
                const v = results[0];
                songInfo = {
                    title: v.title,
                    url: v.url,
                    duration: v.durationRaw || 'Unknown',
                    thumbnail: v.thumbnails?.[0]?.url || '',
                    requestedBy: interaction.user.username,
                };
            }

            let queue = getQueue(interaction.guild.id);

            if (!queue) {
                // Create a new queue and connect to the voice channel
                queue = createQueue(interaction.guild.id, voiceChannel, interaction.channel);
                await queue.connect(voiceChannel);
            } else if (queue.voiceChannel.id !== voiceChannel.id) {
                return interaction.editReply({ content: '❌ I\'m already playing music in a different voice channel!' });
            }

            queue.addSong(songInfo);

            const isFirst = !queue.currentSong && queue.songs.length === 1;

            if (isFirst) {
                await queue.startPlaying();
                await interaction.editReply({ content: `▶️ Starting to play **${songInfo.title}**...` });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('➕ Added to Queue')
                    .setDescription(`**[${songInfo.title}](${songInfo.url})**`)
                    .addFields(
                        { name: '⏱️ Duration', value: songInfo.duration, inline: true },
                        { name: '📋 Position in Queue', value: `#${queue.songs.length}`, inline: true }
                    )
                    .setThumbnail(songInfo.thumbnail)
                    .setColor('#1DB954');

                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('[/play] Error:', error);
            await interaction.editReply({ content: '❌ Something went wrong while fetching that song. Try again or use a direct YouTube URL!' });
        }
    },
};
