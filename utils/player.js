const { Shoukaku, Connectors } = require('shoukaku');

let shoukaku = null;

// Private Lavalink node on Railway (internal networking).
// Set LAVALINK_HOST in Railway env vars to the internal hostname of your Lavalink service.
// Format: <service-name>.railway.internal
const privateHost = process.env.LAVALINK_HOST;

const Nodes = [
    // Private node — first priority
    ...(privateHost ? [{
        name: 'PrivateRailway',
        url: `${privateHost}:2333`,
        auth: 'ChillScene_Lavalink_2026!',
        secure: false
    }] : []),
    // Public fallbacks
    {
        name: 'AjieDev',
        url: 'lava-v4.ajieblogs.eu.org:443',
        auth: 'https://dsc.gg/ajidevserver',
        secure: true
    },
    {
        name: 'Jirayu',
        url: 'lavalink.jirayu.net:13592',
        auth: 'youshallnotpass',
        secure: false
    }
];

async function initPlayer(client) {
    if (shoukaku) return shoukaku;

    shoukaku = new Shoukaku(new Connectors.DiscordJS(client), Nodes, {
        moveOnDisconnect: false,
        resumable: false,
        resumableTimeout: 30,
        reconnectTries: 2,
        restTimeout: 10000
    });

    shoukaku.on('error', (_, error) => console.error('Shoukaku Error:', error));
    shoukaku.on('ready', (name) => console.log(`Lavalink Node ${name} is now connected.`));
    shoukaku.on('close', (name, code, reason) => console.log(`Lavalink Node ${name} closed: ${code} - ${reason}`));
    shoukaku.on('disconnect', (name, players, moved) => console.log(`Lavalink Node ${name} disconnected.`));
    shoukaku.on('debug', (name, info) => console.log(`[Shoukaku Debug] ${name}: ${info}`));

    return shoukaku;
}

function getPlayer() {
    return shoukaku;
}

module.exports = { initPlayer, getPlayer };
