const { Client, GatewayIntentBits, Partials, MessageActivityType } = require('discord.js');
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

const activeThreads = new Map(); 

client.on('clientReady', () => {
    console.log('Bot ist Online ✅');
});

async function getOrCreatThread(message, channel) {
    if (activThread.has(message.author.id)) {
        const cached = activThread.get(message.author.id);
        const thread = await channel.thread.fetch(cached.id);
        if (thread && !thread.archived) return thread;
    }

    const thread = await channel.thread.create({
        name: `📩 ${message.author.username}`,
        reason: 'DM-Thread für ${message.author.tag}', 
    });

    activThread.set(message.author.tag);
    return thread;
}

client.on('messageCreate', async (message) => {

    if (message.author.bot) return;
    if (message.channel.type !== 1) return; 

    try {
        const targetChannel = await client.channels.fetch(process.env.CHANNEL_ID);

        if (!targetChannel || !targetChannel.isTextBased()) {
            console.log('❌ Target Channel nicht gefunden oder kein Textchannel');
            return;
        }

        await  message.react('📨');

        await thread.send(
            `📨 **Neue DM** von **${message.author.tag}** (ID: ${message.author.id}):\n${message.content || '*Kein Text*'}`
        );

        if (message.attachments.size > 0) {
            const links = message.attachments.map(a => a.url).join('\n');
            await targetChannel.send(`📎 **Anhänge:**\n${links}`);
        }

        await message.reply('✅ Deine Nachricht wurde weitergeleitet!');
        console.log(`📤 Weitergeleitet von ${message.author.tag}`);

    } catch (error) {
        console.error('❌ Fehler beim Weiterleiten:', error);
        await message.reply('❌ Leider ging etwas schief.');
    }
});

client.login(process.env.TOKEN);