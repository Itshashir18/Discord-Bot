const { Shoukaku, Connectors } = require('shoukaku');

let shoukaku = null;

// This is a free public Lavalink node. 
// For production, you should host your own and replace these credentials!
const Nodes = [{
    name: 'PublicLava',
    url: 'lava.link:80',
    auth: 'anything' // Public nodes often accept any password
}];

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
