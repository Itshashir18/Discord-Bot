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

        connection.subscribe(player);
        
        // Wait for the UDP connection to fully establish before playing
        const { entersState, VoiceConnectionStatus } = require('@discordjs/voice');
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
            console.log('[Voice Debug] Connection is READY. Starting playback.');
        } catch (error) {
            console.error('[Voice Error] Failed to connect to UDP voice server within 20s');
            return interaction.editReply('❌ Network Error: The bot could not establish a UDP connection to Discord\'s voice servers. This is likely a cloud hosting firewall issue.');
        }

        // Use a publicly accessible mp3 sound effect
        const resource = createAudioResource('https://www.soundjay.com/buttons/sounds/button-1.mp3');
        
        player.play(resource);
        
        player.on(AudioPlayerStatus.Playing, () => {
            interaction.editReply('🔊 Beeping! If you hear this, Discord voice is working. If you don\'t, the issue is ffmpeg/opus dependencies.');
        });
        
        player.on('error', e => {
            console.error(e);
            interaction.editReply(`Error: ${e.message}`);
        });
    }
}
