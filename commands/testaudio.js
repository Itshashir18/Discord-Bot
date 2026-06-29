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
        
        const player = createAudioPlayer();
        connection.subscribe(player);
        
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
