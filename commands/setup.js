const { SlashCommandBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-server')
        .setDescription('Builds the exclusive Chill Scene server layout with 18+ verification.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addBooleanOption(option => 
            option.setName('clear_server')
                .setDescription('WARNING: Deletes ALL existing channels and categories before setting up.')
                .setRequired(false)),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const guild = interaction.guild;
        const shouldClear = interaction.options.getBoolean('clear_server');

        try {
            if (shouldClear) {
                const channels = await guild.channels.fetch();
                for (const channel of channels.values()) {
                    if (channel.id !== interaction.channelId) {
                        try {
                            await channel.delete();
                        } catch (e) {}
                    }
                }
                const roles = await guild.roles.fetch();
                for (const role of roles.values()) {
                    if (role.name !== '@everyone' && !role.managed) {
                        try {
                            await role.delete();
                        } catch (e) {}
                    }
                }
            }

            // 1. Create Advanced Role Hierarchy
            const rolesToCreate = [
                { name: '👑 Owner', color: '#FFD700', hoist: true, permissions: [PermissionsBitField.Flags.Administrator] },
                { name: '🛡️ Admin', color: '#FF4500', hoist: true, permissions: [PermissionsBitField.Flags.Administrator] },
                { name: '🗡️ Moderator', color: '#1E90FF', hoist: true, permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.BanMembers, PermissionsBitField.Flags.ModerateMembers, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles] },
                { name: '✨ VIP', color: '#FF1493', hoist: true, permissions: [] },
                { name: '🤖 Bots', color: '#A9A9A9', hoist: false, permissions: [] }
            ];
            
            const roleCache = {};
            for (const roleData of rolesToCreate) {
                let role = guild.roles.cache.find(r => r.name === roleData.name);
                if (!role) {
                    role = await guild.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        hoist: roleData.hoist,
                        permissions: roleData.permissions,
                        reason: 'Chill Scene Setup'
                    });
                }
                roleCache[roleData.name] = role;
            }

            // Get or create Members role
            let memberRole = guild.roles.cache.find(r => r.name === 'Members');
            if (!memberRole) {
                memberRole = await guild.roles.create({
                    name: 'Members',
                    color: '#00FA9A',
                    hoist: true,
                    reason: 'Chill Scene Setup (Verification Role)'
                });
            }
            roleCache['Members'] = memberRole;

            // --- PERMISSIONS SETUP ---
            // Everyone is locked out of seeing the server by default.
            // Verified users can see the server but Info channels are read-only.
            const lockedCategoryPerms = [
                { id: guild.id, deny: ['ViewChannel'] },
                { id: roleCache['Members'].id, allow: ['ViewChannel'] }
            ];

            const readOnlyInfoPerms = [
                { id: guild.id, deny: ['ViewChannel'] },
                { id: roleCache['Members'].id, allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages', 'AddReactions'] }
            ];

            // 2. 🔞 Verification Gate
            const verifyCat = await guild.channels.create({ 
                name: '🛑 Gatekeeper', 
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    { id: guild.id, allow: ['ViewChannel'] } // Everyone can see the gate!
                ]
            });
            const verifyChannel = await guild.channels.create({ 
                name: '🔞・verification', 
                type: ChannelType.GuildText, 
                parent: verifyCat.id,
                permissionOverwrites: [
                    { id: guild.id, allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages', 'AddReactions'] }
                ]
            });

            // 3. 🔰 Welcome & Info Category
            const infoCat = await guild.channels.create({ name: '🔰 Welcome & Info', type: ChannelType.GuildCategory, permissionOverwrites: lockedCategoryPerms });
            const welcomeChannel = await guild.channels.create({ name: '👋・welcome', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: readOnlyInfoPerms });
            const rulesChannel = await guild.channels.create({ name: '📜・rules', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: readOnlyInfoPerms });
            await guild.channels.create({ name: '📢・announcements', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: readOnlyInfoPerms });
            await guild.channels.create({ name: '🎁・giveaways', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: readOnlyInfoPerms });

            // 4. 🎭 Customization Category
            const customCat = await guild.channels.create({ name: '🎭 Customization', type: ChannelType.GuildCategory, permissionOverwrites: lockedCategoryPerms });
            const gameRolesChannel = await guild.channels.create({ name: '🎭・game-roles', type: ChannelType.GuildText, parent: customCat.id, permissionOverwrites: readOnlyInfoPerms });
            await guild.channels.create({ name: '🎨・color-roles', type: ChannelType.GuildText, parent: customCat.id, permissionOverwrites: readOnlyInfoPerms });

            // 5. 💬 Community Hub Category (With Slowmode!)
            const commCat = await guild.channels.create({ name: '💬 Community Hub', type: ChannelType.GuildCategory, permissionOverwrites: lockedCategoryPerms });
            await guild.channels.create({ name: '💬・general-chat', type: ChannelType.GuildText, parent: commCat.id, rateLimitPerUser: 5 });
            await guild.channels.create({ name: '🐸・memes', type: ChannelType.GuildText, parent: commCat.id });
            await guild.channels.create({ name: '📷・media-and-clips', type: ChannelType.GuildText, parent: commCat.id });
            await guild.channels.create({ name: '🤖・bot-commands', type: ChannelType.GuildText, parent: commCat.id });

            // 6. 🎯 VALORANT ZONE
            const valCat = await guild.channels.create({ name: '🎯 VALORANT ZONE', type: ChannelType.GuildCategory, permissionOverwrites: lockedCategoryPerms });
            await guild.channels.create({ name: '💬・val-chat', type: ChannelType.GuildText, parent: valCat.id });
            await guild.channels.create({ name: '🎮・val-lfg', type: ChannelType.GuildText, parent: valCat.id });
            await guild.channels.create({ name: '🔊 Val Squad 1', type: ChannelType.GuildVoice, parent: valCat.id, userLimit: 5 });
            await guild.channels.create({ name: '🔊 Val Squad 2', type: ChannelType.GuildVoice, parent: valCat.id, userLimit: 5 });

            // 7. ⚔️ LEAGUE OF LEGENDS ZONE
            const lolCat = await guild.channels.create({ name: '⚔️ LEAGUE ZONE', type: ChannelType.GuildCategory, permissionOverwrites: lockedCategoryPerms });
            await guild.channels.create({ name: '💬・league-chat', type: ChannelType.GuildText, parent: lolCat.id });
            await guild.channels.create({ name: '🎮・league-lfg', type: ChannelType.GuildText, parent: lolCat.id });
            await guild.channels.create({ name: '🔊 League Squad 1', type: ChannelType.GuildVoice, parent: lolCat.id, userLimit: 5 });

            // 8. 🔊 Dynamic Voice Lounge
            const voiceCat = await guild.channels.create({ name: '🔊 Voice Lounge', type: ChannelType.GuildCategory, permissionOverwrites: lockedCategoryPerms });
            await guild.channels.create({ name: '🔊 The Lounge', type: ChannelType.GuildVoice, parent: voiceCat.id });
            await guild.channels.create({ name: '🔴 Streamers', type: ChannelType.GuildVoice, parent: voiceCat.id });
            await guild.channels.create({ name: '➕ Create Voice', type: ChannelType.GuildVoice, parent: voiceCat.id });

            // 9. 💎 Exclusive VIP Lounge
            const vipCat = await guild.channels.create({ 
                name: '💎 VIP Lounge', 
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    { id: guild.id, deny: ['ViewChannel'] },
                    { id: roleCache['👑 Owner'].id, allow: ['ViewChannel'] },
                    { id: roleCache['✨ VIP'].id, allow: ['ViewChannel'] }
                ]
            });
            await guild.channels.create({ name: '💬・vip-chat', type: ChannelType.GuildText, parent: vipCat.id });
            await guild.channels.create({ name: '🔊 VIP Voice', type: ChannelType.GuildVoice, parent: vipCat.id });

            // 10. 🎫 Support & Staff Category (Hidden)
            const staffCat = await guild.channels.create({ 
                name: '🎫 Support & Staff', 
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    { id: guild.id, deny: ['ViewChannel'] },
                    { id: roleCache['🛡️ Admin'].id, allow: ['ViewChannel'] },
                    { id: roleCache['🗡️ Moderator'].id, allow: ['ViewChannel'] }
                ]
            });
            
            // Ticket creation channel is visible to verified members
            const ticketChannel = await guild.channels.create({ 
                name: '🎫・create-ticket', 
                type: ChannelType.GuildText, 
                parent: staffCat.id,
                permissionOverwrites: [
                    { id: guild.id, deny: ['ViewChannel'] },
                    { id: roleCache['Members'].id, allow: ['ViewChannel'], deny: ['SendMessages'] }
                ]
            });
            
            await guild.channels.create({ name: '🚨・staff-chat', type: ChannelType.GuildText, parent: staffCat.id });
            await guild.channels.create({ name: 'logs', type: ChannelType.GuildText, parent: staffCat.id });

            // --- SEND EMBEDS ---

            // Send Verification Embed
            const verifyEmbed = new EmbedBuilder()
                .setTitle('🛑 Age Verification Required')
                .setDescription('Welcome to **Chill Scene**! This is an exclusive 18+ community.\n\nBy clicking the button below, you confirm that you are at least **18 years of age**. If you are not 18, please leave the server immediately.')
                .setColor('#FF0000');
            const verifyBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('verify_18').setLabel('I am 18+ (Verify)').setStyle(ButtonStyle.Success).setEmoji('🔞')
            );
            await verifyChannel.send({ embeds: [verifyEmbed], components: [verifyBtn] });

            // Send Ticket Message
            const ticketEmbed = new EmbedBuilder()
                .setTitle('🎫 Support Tickets')
                .setDescription('Need help? Click the button below to open a private ticket with our staff.')
                .setColor('#2b2d31');
            const ticketBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
            );
            await ticketChannel.send({ embeds: [ticketEmbed], components: [ticketBtn] });

            // Send Welcome Message
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('👋 Welcome to Chill Scene!')
                .setDescription(`Welcome to the ultimate chill gaming community!\n\n🔹 Check the <#${rulesChannel.id}> before chatting.\n🔹 Grab your roles in <#${gameRolesChannel.id}>.\n🔹 Find players in our dedicated LFG zones!\n\nEnjoy your stay!`)
                .setColor('#2b2d31')
                .setImage('https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80');
            await welcomeChannel.send({ embeds: [welcomeEmbed] });

            // Send Rules Message
            const rulesEmbed = new EmbedBuilder()
                .setTitle('📜 Chill Scene Rules')
                .setDescription('**1. Be Respectful**\nTreat everyone with respect. Absolutely no harassment, witch hunting, sexism, racism, or hate speech will be tolerated.\n\n**2. No Spam or Self-Promotion**\nDo not spam messages, emojis, or links. No self-promotion (server invites, advertisements, etc) without permission.\n\n**3. NSFW Content is Prohibited**\nEven though this is an 18+ server, keep all public channels free of explicit NSFW media.\n\n**4. Follow Discord TOS**\nAll members must follow the Discord Terms of Service and Community Guidelines.\n\n**5. Listen to Staff**\nStaff members have the final say. If you have an issue, use the ticket system.')
                .setColor('#2b2d31');
            await rulesChannel.send({ embeds: [rulesEmbed] });

            // Send Game Roles Message
            const rolesEmbed = new EmbedBuilder()
                .setTitle('🎭 Select Your Games')
                .setDescription('React to this message or ask a moderator to assign you the specific roles for the games you play! This will give you access to be pinged when players are looking for a group.')
                .setColor('#2b2d31');
            await gameRolesChannel.send({ embeds: [rolesEmbed] });

            await interaction.editReply({ content: '✅ Chill Scene Setup Complete! The server is now locked behind an 18+ verification gate.' });

        } catch (error) {
            console.error('Setup error:', error);
            await interaction.editReply({ content: 'There was an error setting up the server. Make sure my role is at the very top!' });
        }
    },
};
