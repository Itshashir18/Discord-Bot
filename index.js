require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Express server to keep the bot alive on cloud platforms
const app = express();
const port = process.env.PORT || 7860;

app.get('/', (req, res) => {
    res.send('Chill Scene Bot is running 24/7! 🚀');
});

app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// Temporary voice channels tracking
const tempChannels = new Set();
let joinToCreateChannelId = null;

client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    client.user.setActivity('Chill Scene', { type: 3 }); // type 3 is "Watching"
});

client.on('interactionCreate', async interaction => {
    console.log(`DEBUG: Received interaction: ${interaction.type === 2 ? interaction.commandName : interaction.customId} from ${interaction.user.tag}`);
    
    if (interaction.isChatInputCommand()) {
        // Only allow the server owner to use commands for now
        if (interaction.user.id !== interaction.guild.ownerId) {
            return await interaction.reply({ content: '⛔ This bot is currently in maintenance mode. Only the server owner can use commands at this time.', ephemeral: true });
        }

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'verify_18') {
            if (interaction.user.bot) return; // Bots shouldn't be human verified
            
            await interaction.guild.roles.fetch(); // Ensure roles are cached
            const role = interaction.guild.roles.cache.find(r => r.name === '👻Members');
            if (role) {
                await interaction.member.roles.add(role);
                await interaction.reply({ content: '✅ Verification successful! Welcome to Chill Scene. The server is now unlocked for you.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Verification failed: Could not find the "👻Members" role in this server. Please run /setup-server to create it!', ephemeral: true });
            }
        } else if (interaction.customId === 'open_ticket') {
            const guild = interaction.guild;
            const staffRole = guild.roles.cache.find(r => r.name === '🛡️ Admin');
            const modRole = guild.roles.cache.find(r => r.name === '🗡️ Moderator');
            
            const permissionOverwrites = [
                { id: guild.id, deny: ['ViewChannel'] },
                { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] }
            ];
            
            if (staffRole) permissionOverwrites.push({ id: staffRole.id, allow: ['ViewChannel', 'SendMessages'] });
            if (modRole) permissionOverwrites.push({ id: modRole.id, allow: ['ViewChannel', 'SendMessages'] });

            const ticketChannel = await guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: interaction.channel.parentId, // Create it in the Support category
                permissionOverwrites: permissionOverwrites
            });
            await interaction.reply({ content: `Ticket created! Head over to ${ticketChannel}`, ephemeral: true });
            await ticketChannel.send(`Welcome ${interaction.user}, please describe your issue here and a staff member will be with you shortly.`);
        }
    }
});

// Join to create voice channel logic
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    
    // Try to find the join to create channel by name if not cached
    if (!joinToCreateChannelId) {
        const jtcChannel = guild.channels.cache.find(c => c.name === '➕ Create Voice' && c.type === ChannelType.GuildVoice);
        if (jtcChannel) joinToCreateChannelId = jtcChannel.id;
    }

    // User joined the "Create Voice" channel
    if (newState.channelId === joinToCreateChannelId && joinToCreateChannelId !== null) {
        try {
            const newChannel = await guild.channels.create({
                name: `${newState.member.user.username}'s Room`,
                type: ChannelType.GuildVoice,
                parent: newState.channel.parentId,
                permissionOverwrites: [
                    {
                        id: newState.member.id,
                        allow: ['ManageChannels', 'MoveMembers']
                    }
                ]
            });
            
            tempChannels.add(newChannel.id);
            await newState.setChannel(newChannel);
        } catch (err) {
            console.error("Error creating temporary channel: ", err);
        }
    }

    // User left a temporary channel
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const channel = guild.channels.cache.get(oldState.channelId);
        if (channel && channel.members.size === 0) {
            try {
                await channel.delete();
                tempChannels.delete(oldState.channelId);
            } catch (err) {
                console.error("Error deleting empty temp channel: ", err);
            }
        }
    }
});

// Anti-crash system
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

console.log('Attempting to login to Discord...');
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('CRITICAL: Failed to login to Discord:', err.message);
    if (err.message.includes('intents')) {
        console.error('ADVICE: Please enable all "Privileged Gateway Intents" in the Discord Developer Portal (Bot tab).');
    }
});
