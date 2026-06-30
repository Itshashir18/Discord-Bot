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

            // If the user typed a plain song name (not a link), force YouTube search.
            // Regular YouTube search finds original lyrical/music videos better than YouTube Music.
            const isUrl = query.startsWith('http://') || query.startsWith('https://');
            const searchEngine = isUrl ? QueryType.AUTO : QueryType.YOUTUBE_SEARCH;

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
                    onBeforeCreateStream: async (track, source, _queue) => {
                        // YouTube streaming is severely blocked globally right now.
                        // We will bridge all YouTube audio streams to SoundCloud using play-dl!
                        if (track.url.includes('youtube.com') || track.url.includes('youtu.be')) {
                            try {
                                const playdl = require('play-dl');
                                const clientId = await playdl.getFreeClientID();
                                await playdl.setToken({ soundcloud: { client_id: clientId } });
                                
                                const searchQuery = `${track.title} ${track.author}`;
                                const searched = await playdl.search(searchQuery, { source: { soundcloud: 'tracks' }, limit: 1 });
                                
                                if (searched && searched.length > 0) {
                                    const stream = await playdl.stream(searched[0].url);
                                    return stream.stream;
                                }
                            } catch (e) {
                                console.error('Bridge failed:', e);
                            }
                        }
                        return null; // fallback to default extractors if bridge fails
                    }
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
