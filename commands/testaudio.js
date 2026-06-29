const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testaudio')
        .setDescription('Test bot audio with a local beep'),

    async execute(interaction) {
        if (!interaction.member.voice.channel) return interaction.reply('Join a VC first.');
        
        await interaction.deferReply();
        
        const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
        
        const connection = joinVoiceChannel({
            channelId: interaction.member.voice.channel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });
        
        // --- ADDING VERBOSE NETWORK DEBUGGING ---
        connection.on('debug', msg => console.log('[Voice Debug]', msg));
        connection.on('error', err => console.error('[Voice Error]', err));
        connection.on('stateChange', (oldState, newState) => {
            console.log(`[Voice State] ${oldState.status} -> ${newState.status}`);
        });

        const player = createAudioPlayer();
        player.on('debug', msg => console.log('[Player Debug]', msg));
        player.on('error', err => console.error('[Player Error]', err));
        player.on('stateChange', (oldState, newState) => {
            console.log(`[Player State] ${oldState.status} -> ${newState.status}`);
        });

        // Test SoundCloud Stream
        const play = require('play-dl');
        const voice = require('@discordjs/voice');
        try {
            await interaction.editReply(`🔍 Testing SoundCloud extraction...\n\`\`\`\n${voice.generateDependencyReport()}\n\`\`\``);
            
            // Ensure client ID is ready
            const cid = await play.getFreeClientID();
            await play.setToken({ soundcloud: { client_id: cid } });

            const results = await play.search('blinding lights', { limit: 1, source: { soundcloud: 'tracks' } });
            const trackUrl = results[0].url;
            
            await interaction.editReply(`✅ Found track: ${trackUrl}\n🔄 Attempting to extract stream...`);

            const stream = await play.stream(trackUrl);
            
            await interaction.editReply(`✅ Stream extracted (Type: ${stream.type}).\n▶️ Attempting playback via Discord.js...`);

            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
                inlineVolume: false,
            });
            
            player.play(resource);
            
            player.on(AudioPlayerStatus.Playing, () => {
                interaction.editReply('🔊 **SUCCESS!** The audio pipeline is fully working. You should hear music now.');
            });

        } catch (error) {
            console.error('[TestAudio Error]', error);
            interaction.editReply(`❌ **PIPELINE ERROR:**\n\`\`\`js\n${error.message}\n${error.stack}\n\`\`\``);
        }
    }
}
