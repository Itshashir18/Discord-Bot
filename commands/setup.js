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
            // Function to get or create a role
            const getOrCreateRole = async (roleData) => {
                let role = guild.roles.cache.find(r => r.name === roleData.name);
                if (role) {
                    // Update existing role permissions if needed
                    await role.edit({
                        color: roleData.color,
                        hoist: roleData.hoist,
                        permissions: roleData.permissions
                    });
                    return role;
                }
                return await guild.roles.create({
                    name: roleData.name,
                    color: roleData.color,
                    hoist: roleData.hoist,
                    permissions: roleData.permissions,
                    reason: 'Chill Scene Setup'
                });
            };

            // Function to get or create a channel
            const getOrCreateChannel = async (name, type, options = {}) => {
                let channel = guild.channels.cache.find(c => c.name === name && c.type === type);
                if (channel) {
                    // Update existing channel
                    await channel.edit(options);
                    return channel;
                }
                return await guild.channels.create({ name, type, ...options });
            };

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
                roleCache[roleData.name] = await getOrCreateRole(roleData);
            }

            // Get or create 👻Members role
            let memberRole = guild.roles.cache.find(r => r.name === '👻Members');
            if (!memberRole) {
                memberRole = await guild.roles.create({
                    name: '👻Members',
                    color: '#00FA9A',
                    hoist: true,
                    reason: 'Chill Scene Setup (Verification Role)'
                });
            }
            roleCache['Members'] = memberRole;

            // --- PERMISSIONS SETUP ---
            const lockedCategoryPerms = [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: roleCache['Members'].id, allow: [PermissionsBitField.Flags.ViewChannel] }
            ];

            const readOnlyInfoPerms = [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: roleCache['Members'].id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions] }
            ];

            // 2. 🔞 Verification Gate
            const verifyCat = await getOrCreateChannel('🛑 Gatekeeper', ChannelType.GuildCategory, {
                permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel] }]
            });
            const verifyChannel = await getOrCreateChannel('🔞・verification', ChannelType.GuildText, {
                parent: verifyCat.id,
                permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions] }]
            });

            // 3. 🔰 Welcome & Info Category
            const infoCat = await getOrCreateChannel('🔰 Welcome & Info', ChannelType.GuildCategory, { permissionOverwrites: lockedCategoryPerms });
            const welcomeChannel = await getOrCreateChannel('👋・welcome', ChannelType.GuildText, { parent: infoCat.id, permissionOverwrites: readOnlyInfoPerms });
            const rulesChannel = await getOrCreateChannel('📜・rules', ChannelType.GuildText, { parent: infoCat.id, permissionOverwrites: readOnlyInfoPerms });
            await getOrCreateChannel('📢・announcements', ChannelType.GuildText, { parent: infoCat.id, permissionOverwrites: readOnlyInfoPerms });
            await getOrCreateChannel('🎁・giveaways', ChannelType.GuildText, { parent: infoCat.id, permissionOverwrites: readOnlyInfoPerms });

            // 4. 🎭 Customization Category
            const customCat = await getOrCreateChannel('🎭 Customization', ChannelType.GuildCategory, { permissionOverwrites: lockedCategoryPerms });
            const gameRolesChannel = await getOrCreateChannel('🎭・game-roles', ChannelType.GuildText, { parent: customCat.id, permissionOverwrites: readOnlyInfoPerms });
            await getOrCreateChannel('🎨・color-roles', ChannelType.GuildText, { parent: customCat.id, permissionOverwrites: readOnlyInfoPerms });

            // 5. 💬 Community Hub Category
            const commCat = await getOrCreateChannel('💬 Community Hub', ChannelType.GuildCategory, { permissionOverwrites: lockedCategoryPerms });
            await getOrCreateChannel('💬・general-chat', ChannelType.GuildText, { parent: commCat.id, rateLimitPerUser: 5 });
            await getOrCreateChannel('🐸・memes', ChannelType.GuildText, { parent: commCat.id });
            await getOrCreateChannel('📷・media-and-clips', ChannelType.GuildText, { parent: commCat.id });
            await getOrCreateChannel('🤖・bot-commands', ChannelType.GuildText, { parent: commCat.id });

            // 6. 🎯 VALORANT ZONE
            const valCat = await getOrCreateChannel('🎯 VALORANT ZONE', ChannelType.GuildCategory, { permissionOverwrites: lockedCategoryPerms });
            await getOrCreateChannel('💬・val-chat', ChannelType.GuildText, { parent: valCat.id });
            await getOrCreateChannel('🎮・val-lfg', ChannelType.GuildText, { parent: valCat.id });
            await getOrCreateChannel('🔊 Val Squad 1', ChannelType.GuildVoice, { parent: valCat.id, userLimit: 5 });
            await getOrCreateChannel('🔊 Val Squad 2', ChannelType.GuildVoice, { parent: valCat.id, userLimit: 5 });

            // 7. ⚔️ LEAGUE OF LEGENDS ZONE
            const lolCat = await getOrCreateChannel('⚔️ LEAGUE ZONE', ChannelType.GuildCategory, { permissionOverwrites: lockedCategoryPerms });
            await getOrCreateChannel('💬・league-chat', ChannelType.GuildText, { parent: lolCat.id });
            await getOrCreateChannel('🎮・league-lfg', ChannelType.GuildText, { parent: lolCat.id });
            await getOrCreateChannel('🔊 League Squad 1', ChannelType.GuildVoice, { parent: lolCat.id, userLimit: 5 });

            // 8. 🔊 Dynamic Voice Lounge
            const voiceCat = await getOrCreateChannel('🔊 Voice Lounge', ChannelType.GuildCategory, { permissionOverwrites: lockedCategoryPerms });
            await getOrCreateChannel('🔊 The Lounge', ChannelType.GuildVoice, { parent: voiceCat.id });
            await getOrCreateChannel('🔴 Streamers', ChannelType.GuildVoice, { parent: voiceCat.id });
            await getOrCreateChannel('➕ Create Voice', ChannelType.GuildVoice, { parent: voiceCat.id });

            // 9. 💎 Exclusive VIP Lounge
            const vipCat = await getOrCreateChannel('💎 VIP Lounge', ChannelType.GuildCategory, {
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: roleCache['👑 Owner'].id, allow: [PermissionsBitField.Flags.ViewChannel] },
                    { id: roleCache['✨ VIP'].id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });
            await getOrCreateChannel('💬・vip-chat', ChannelType.GuildText, { parent: vipCat.id });
            await getOrCreateChannel('🔊 VIP Voice', ChannelType.GuildVoice, { parent: vipCat.id });

            // 10. 🎫 Support & Staff Category
            const staffCat = await getOrCreateChannel('🎫 Support & Staff', ChannelType.GuildCategory, {
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: roleCache['🛡️ Admin'].id, allow: [PermissionsBitField.Flags.ViewChannel] },
                    { id: roleCache['🗡️ Moderator'].id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });
            
            const ticketChannel = await getOrCreateChannel('🎫・create-ticket', ChannelType.GuildText, {
                parent: staffCat.id,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: roleCache['Members'].id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] }
                ]
            });
            
            await getOrCreateChannel('🚨・staff-chat', ChannelType.GuildText, { parent: staffCat.id });
            await getOrCreateChannel('logs', ChannelType.GuildText, { parent: staffCat.id });

            // --- SEND EMBEDS (Only if channel is empty to avoid spam) ---
            const sendEmbedIfEmpty = async (channel, embed, components = []) => {
                const messages = await channel.messages.fetch({ limit: 1 });
                if (messages.size === 0) {
                    await channel.send({ embeds: [embed], components: components });
                }
            };

            const verifyEmbed = new EmbedBuilder()
                .setTitle('🤖 Anti-Bot Verification')
                .setDescription('Welcome to **Chill Scene**! To prevent spam and maintain a high-quality community, we require all new members to verify they are not automated bots.\n\nBy clicking the button below, you confirm that you are a human user. This will unlock the rest of the server.')
                .setColor('#00FA9A');
            const verifyBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('verify_18').setLabel('I am Human (Verify)').setStyle(ButtonStyle.Success).setEmoji('👤')
            );
            await sendEmbedIfEmpty(verifyChannel, verifyEmbed, [verifyBtn]);

            const ticketEmbed = new EmbedBuilder()
                .setTitle('🎫 Support Tickets')
                .setDescription('Need help? Click the button below to open a private ticket with our staff.')
                .setColor('#2b2d31');
            const ticketBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
            );
            await sendEmbedIfEmpty(ticketChannel, ticketEmbed, [ticketBtn]);

            const welcomeEmbed = new EmbedBuilder()
                .setTitle('👋 Welcome to Chill Scene!')
                .setDescription(`Welcome to the ultimate chill gaming community!\n\n🔹 Check the <#${rulesChannel.id}> before chatting.\n🔹 Grab your roles in <#${gameRolesChannel.id}>.\n🔹 Find players in our dedicated LFG zones!\n\nEnjoy your stay!`)
                .setColor('#2b2d31')
                .setImage('https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80');
            await sendEmbedIfEmpty(welcomeChannel, welcomeEmbed);

            const rulesEmbed = new EmbedBuilder()
                .setTitle('📜 Chill Scene Rules')
                .setDescription('**1. Be Respectful**\nTreat everyone with respect. Absolutely no harassment, witch hunting, sexism, racism, or hate speech will be tolerated.\n\n**2. No Spam or Self-Promotion**\nDo not spam messages, emojis, or links. No self-promotion (server invites, advertisements, etc) without permission.\n\n**3. NSFW Content is Prohibited**\nEven though this is an 18+ server, keep all public channels free of explicit NSFW media.\n\n**4. Follow Discord TOS**\nAll members must follow the Discord Terms of Service and Community Guidelines.\n\n**5. Listen to Staff**\nStaff members have the final say. If you have an issue, use the ticket system.')
                .setColor('#2b2d31');
            await sendEmbedIfEmpty(rulesChannel, rulesEmbed);

            await interaction.editReply({ content: '✅ Chill Scene Setup Complete! Existing channels were updated to preserve chat history.' });

        } catch (error) {
            console.error('Setup error:', error);
            await interaction.editReply({ content: 'There was an error setting up the server. Make sure my role is at the very top!' });
        }
    },
};
