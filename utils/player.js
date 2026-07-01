const { Shoukaku, Connectors } = require('shoukaku');

let shoukaku = null;

// This is a free public Lavalink node. 
// For production, you should host your own and replace these credentials!
// These are free public Lavalink nodes from community lists.
// Shoukaku will automatically connect and pick a working one.
const Nodes = [
    {
        name: 'PrivateHFNode',
        url: 'urboihj-my-lavalink-node.hf.space:443',
        auth: 'chillscene_secure_pass_2026',
        secure: true
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
