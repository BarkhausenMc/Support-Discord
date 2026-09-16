const { Client, GatewayIntentBits, Partials } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.on('clientReady', () => {
    console.log('Bot ist Online ✅');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.type !== 1) return;

    try {
        const targetChannel = await client.channels.fetch(process.env.CHANNEL_ID);

        const isValidChannel = targetChannel.type === 0 || targetChannel.type === 15;
        if (!targetChannel || !isValidChannel) {
            console.log('❌ Ziel-Channel ungültig oder nicht gefunden');
            console.log('Gefundener Typ:', targetChannel.type);
            return;
        }

        const post = await targetChannel.threads.create({
            name: message.author.username,
            message: {
                content: `📨 **${message.author.tag}** (ID: ${message.author.id}):\n${message.content || '*Kein Text*'}`
            },
            reason: `DM-Post für ${message.author.tag}`
        });

        await message.react('📨');

        console.log(`📤 Neuer Post von ${message.author.tag}`);

    } catch (error) {
        console.error('❌ Fehler:', error);
        await message.react('❌');
    }
});

client.login(process.env.TOKEN);