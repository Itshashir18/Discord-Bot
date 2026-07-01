const { Shoukaku, Connectors } = require('shoukaku');

let shoukaku = null;

// This is a free public Lavalink node. 
// For production, you should host your own and replace these credentials!
// These are free public Lavalink nodes from community lists.
// Shoukaku will automatically connect and pick a working one.
const Nodes = [
    {
        name: 'AjieDev',
        url: 'lava-v4.ajieblogs.eu.org:443',
        auth: 'https://dsc.gg/ajidevserver',
        secure: true
    },
    {
        name: 'Serenetia',
        url: 'lavalinkv4-id.serenetia.com:443',
        auth: 'BatuManaBisa',
        secure: true
    },
    {
        name: 'SleepyInsomniac',
        url: 'll.sleepyinsomniac.eu.org:80',
        auth: 'youshallnotpass',
        secure: false
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

    return shoukaku;
}

function getPlayer() {
    return shoukaku;
}

module.exports = { initPlayer, getPlayer };
