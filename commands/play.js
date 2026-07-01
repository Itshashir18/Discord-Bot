const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPlayer } = require('../utils/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a song using the new Lavalink architecture.')
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

        await interaction.deferReply();

        try {
            const shoukaku = getPlayer();
            if (!shoukaku) {
                return interaction.editReply({ content: '❌ The Lavalink node is not connected yet! Please try again in a few seconds.' });
            }

            console.log('[Play] Resolving node...');
            // Get a node to perform the search
            const node = shoukaku.options.nodeResolver(shoukaku.nodes);
            if (!node) {
                return interaction.editReply({ content: '❌ No Lavalink nodes are available!' });
            }

            console.log(`[Play] Selected node: ${node.name}. Resolving track: ${query}`);
            // Check if it's a URL or a search query
            const isUrl = query.startsWith('http://') || query.startsWith('https://');
            const searchPrefix = isUrl ? '' : 'scsearch:'; // Use SoundCloud by default to bypass YouTube IP blocks
            
            // Resolve the track using the Lavalink node REST API
            let result = await node.rest.resolve(`${searchPrefix}${query}`);

            // If SoundCloud fails, fallback to YouTube search just in case
            if (!result || !result.data || (result.loadType === 'empty' || result.loadType === 'error')) {
                console.log('[Play] SoundCloud failed. Falling back to YouTube...');
                result = await node.rest.resolve(`ytsearch:${query}`);
            }

            console.log(`[Play] Track resolved. LoadType: ${result ? result.loadType : 'null'}`);
            if (!result || !result.data || (result.loadType === 'empty' || result.loadType === 'error')) {
                return interaction.editReply({ content: `❌ No results found or error occurred for \`${query}\`.` });
            }

            // Handle track or playlist
            let track;
            if (result.loadType === 'playlist') {
                track = result.data.tracks[0]; // Just play the first track for simplicity in this basic setup
            } else if (result.loadType === 'search') {
                track = result.data[0];
            } else {
                track = result.data;
            }

            if (!track) {
                return interaction.editReply({ content: `❌ Could not extract track data for \`${query}\`.` });
            }

            console.log(`[Play] Track selected: ${track.info.title}. Joining voice channel...`);
            // Join the voice channel
            const player = await shoukaku.joinVoiceChannel({
                guildId: interaction.guildId,
                channelId: voiceChannel.id,
                shardId: 0
            });

            console.log(`[Play] Joined voice channel. Playing track...`);
            // Set up basic events
            player.removeAllListeners('closed');
            player.removeAllListeners('end');
            player.removeAllListeners('exception');
            player.removeAllListeners('stuck');
            
            player.on('closed', (reason) => {
                console.log('[Play] Player closed.', reason);
                shoukaku.leaveVoiceChannel(interaction.guildId);
            });
            player.on('exception', (err) => {
                console.error('[Play] Track exception:', err);
                interaction.channel.send(`⚠️ Track exception: ${err.exception.message}`).catch(() => {});
            });
            player.on('stuck', (data) => {
                console.error('[Play] Track stuck:', data);
                interaction.channel.send(`⚠️ Track got stuck.`).catch(() => {});
            });
            player.on('end', (data) => {
                console.log('[Play] Track ended. Reason:', data.reason);
                if (data.reason !== 'replaced') {
                    shoukaku.leaveVoiceChannel(interaction.guildId);
                    interaction.channel.send(`✅ Finished playing track! (Reason: ${data.reason})`).catch(() => {});
                }
            });

            // Play the track
            await player.playTrack({ track: { encoded: track.encoded } });
            console.log(`[Play] Track play command sent to Lavalink.`);

            const durationFormatted = track.info.isStream ? 'LIVE' : new Date(track.info.length).toISOString().substr(11, 8).replace(/^00:/, '');

            const embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing (Lavalink)')
                .setDescription(`**[${track.info.title}](${track.info.uri})**`)
                .addFields(
                    { name: '⏱️ Duration', value: durationFormatted, inline: true },
                    { name: '🎙️ Artist', value: track.info.author, inline: true }
                )
                .setColor('#FF5500');

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[Play Command Error]:', error);
            await interaction.editReply({ content: `❌ Couldn't play \`${query}\`.\nError: ${error.message}` });
        }
    },
};
