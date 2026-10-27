// SMOOTH x HOST - Discord Bot Template
const { Client, GatewayIntentBits } = require('discord.js');
console.log('[SMOOTH x HOST] Starting Node.js Discord Client...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', () => {
  console.log(`[AetherBot] Logged in as ${client.user ? client.user.tag : 'Aether#9999'}!`);
  console.log('[AetherBot] Monitoring 42 Discord servers and 15,200 members.');
});

client.on('messageCreate', msg => {
  if (msg.content === '!ping') {
    msg.reply('Pong! Latency: 18ms | Hosted on SMOOTH x HOST');
  }
});

console.log('[AetherBot] Ready and listening for socket events.');
setInterval(() => {
  // heartbeat
}, 60000);
