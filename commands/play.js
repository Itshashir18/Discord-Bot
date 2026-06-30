const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPlayer } = require('../utils/player');
const { useMainPlayer, QueryType } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a song from YouTube, Spotify, or Apple Music.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The name of the song or URL to play')
                .setRequired(true)),
    async execute(interaction) {
        const query = interaction.options.getString('query');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You must be in a voice channel to play music!', ephemeral: true });
        }

        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.reply({ content: '❌ I need the permissions to join and speak in your voice channel!', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            // Get the global player instance
            const player = getPlayer() || useMainPlayer();
            
            if (!player) {
                return interaction.editReply({ content: '❌ The music player is not initialized yet!' });
            }

            // If the user typed a plain song name (not a link), force Apple Music search.
            // Apple Music returns official studio metadata without needing API keys.
            const isUrl = query.startsWith('http://') || query.startsWith('https://');
            const searchEngine = isUrl ? QueryType.AUTO : QueryType.APPLE_MUSIC_SEARCH;

            // Execute the search and play
            const { track } = await player.play(voiceChannel, query, {
                searchEngine: searchEngine,
                nodeOptions: {
                    metadata: {
                        channel: interaction.channel,
                        client: interaction.guild.members.me
                    },
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 300000,
                    leaveOnEnd: true,
                    leaveOnEndCooldown: 300000,
                }
            });

            const embed = new EmbedBuilder()
                .setTitle('➕ Added to Queue')
                .setDescription(`**[${track.title}](${track.url})**`)
                .addFields(
                    { name: '⏱️ Duration', value: track.duration, inline: true },
                    { name: '🎙️ Artist', value: track.author, inline: true }
                )
                .setColor('#FF5500');

            if (track.thumbnail) {
                embed.setThumbnail(track.thumbnail);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[Play Command Error]:', error);
            await interaction.editReply({ content: `❌ Couldn't play \`${query}\`.\nError: ${error.message}` });
        }
    },
};
