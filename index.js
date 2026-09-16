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

const userIdToPostId = new Map(); 
const postIdToUserId = new Map(); 

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
            console.log('❌ Ziel-Channel ungültig');
            return;
        }

        let post;
        const existingPostId = userIdToPostId.get(message.author.id);

        if (existingPostId) {
            console.log('🔄 Wiederverwende existierenden Post');
            post = await targetChannel.threads.fetch(existingPostId);
        } else {

            post = await targetChannel.threads.create({
                name: message.author.username,
                message: {
                    content: `📨 **${message.author.tag}**:\n${message.content || '*Kein Text*'}`
                },
                reason: `DM-Post für ${message.author.tag}`
            });

            userIdToPostId.set(message.author.id, post.id);
            postIdToUserId.set(post.id, message.author.id);

        }

        await post.send(`**${message.author.tag}**: ${message.content || '*Kein Text*'}`);

        await message.react('📨');

        console.log(`📤 Nachricht im Post von ${message.author.tag}`);

    } catch (error) {
        console.error('❌ Fehler:', error);
        await message.react('❌');
    }
});

client.on('messageCreate', async (message) => {
    if (!message.channel.isThread()) return;
    if (message.author.bot) return;
    if (message.channel.parentId !== process.env.CHANNEL_ID) return;
    if (message.id === message.channel.id) return; // Starter-Nachricht überspringen

    try {
        let userId = postIdToUserId.get(message.channel.id);

        if (!userId) {
            const starter = await message.channel.fetchStarterMessage();
            const match = starter.content.match(/\(ID: (\d+)\)/);
            if (!match) return;
            userId = match[1];
            userIdToPostId.set(message.channel.ownerId, userId); 
            postIdToUserId.set(message.channel.id, userId);
        }

        const user = await client.users.fetch(userId);
        await user.send(`${message.content}`);

        await message.react('📨');

    } catch (error) {
        console.error('❌ DM konnte nicht gesendet werden:', error.message);
        await message.react('⚠️');
    }
});

client.login(process.env.TOKEN);