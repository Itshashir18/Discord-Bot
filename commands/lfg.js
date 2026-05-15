const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lfg')
        .setDescription('Create a Looking for Group post')
        .addStringOption(option => 
            option.setName('game')
                .setDescription('The game you want to play')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('players_needed')
                .setDescription('Number of players needed')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('details')
                .setDescription('Extra details (Rank, Region, etc.)')
                .setRequired(false)),
                
    async execute(interaction) {
        const game = interaction.options.getString('game');
        const playersNeeded = interaction.options.getInteger('players_needed');
        const details = interaction.options.getString('details') || 'None';

        const embed = new EmbedBuilder()
            .setTitle(`🎮 Looking for Group: ${game}`)
            .setColor('#0099ff')
            .setDescription(`${interaction.user} is looking for players!`)
            .addFields(
                { name: 'Players Needed', value: `${playersNeeded}`, inline: true },
                { name: 'Details', value: details, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Click the button below to join!' });

        const joinButton = new ButtonBuilder()
            .setCustomId('join_lfg')
            .setLabel('Join Group')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✋');

        const row = new ActionRowBuilder().addComponents(joinButton);

        const response = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({ time: 3600000 }); // 1 hour

        let joinedPlayers = [];

        collector.on('collect', async i => {
            if (i.customId === 'join_lfg') {
                if (joinedPlayers.includes(i.user.id)) {
                    await i.reply({ content: 'You have already joined this group!', ephemeral: true });
                    return;
                }
                
                if (joinedPlayers.length >= playersNeeded) {
                    await i.reply({ content: 'This group is already full!', ephemeral: true });
                    return;
                }

                joinedPlayers.push(i.user.id);
                const updatedEmbed = EmbedBuilder.from(embed)
                    .addFields({ name: `Player ${joinedPlayers.length}`, value: `${i.user}`, inline: false });
                
                if (joinedPlayers.length >= playersNeeded) {
                    updatedEmbed.setColor('#00ff00');
                    updatedEmbed.setTitle(`✅ Group Full: ${game}`);
                    const disabledRow = new ActionRowBuilder().addComponents(
                        ButtonBuilder.from(joinButton).setDisabled(true)
                    );
                    await i.update({ embeds: [updatedEmbed], components: [disabledRow] });
                    await interaction.channel.send(`The group for ${game} created by ${interaction.user} is now full! Players: ${joinedPlayers.map(id => `<@${id}>`).join(', ')}`);
                } else {
                    await i.update({ embeds: [updatedEmbed], components: [row] });
                }
            }
        });
    },
};
