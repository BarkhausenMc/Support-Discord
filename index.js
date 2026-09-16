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

client.on('clientReady', async () => {
    console.log('Bot ist Online ✅');

    try {
        const forum = await client.channels.fetch(process.env.CHANNEL_ID);
        console.log('Forum gefunden:', forum ? forum.name : 'NICHT GEFUNDEN', '| Type:', forum?.type);

        const active = await forum.threads.fetchActive();
        console.log('Aktive Posts:', active.threads.size);

        const archived = await forum.threads.fetchArchived().catch(err => {
            console.log('Archiv-Fehler:', err.message);
            return { threads: new Map() };
        });
        console.log('Archivierte Posts:', archived.threads.size);

        const allPosts = [...active.threads.values(), ...archived.threads.values()];
        console.log('TOTAL Posts gefunden:', allPosts.length);

        for (const post of allPosts) {
            const starter = await post.fetchStarterMessage().catch(err => {
                console.log(`⚠️ Post "${post.name}" Starter-Fehler:`, err.message);
                return null;
            });
            if (!starter) continue;

            console.log(`📄 Post "${post.name}" Starter:`, starter.content.slice(0, 100));

            const match = starter.content.match(/\(ID: (\d+)\)/);
            if (match) {
                userIdToPostId.set(match[1], post.id);
                postIdToUserId.set(post.id, match[1]);
            } else {
                console.log(`⚠️ Post "${post.name}" hat KEIN (ID: ...) im Starter!`);
            }
        }

        console.log(`📂 ${userIdToPostId.size} Posts wiederhergestellt`);

    } catch (error) {
        console.error('❌ Fehler beim Wiederherstellen:', error.message);
    }
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
                    content: `📨 **${message.author.tag}** (ID: ${message.author.id}):\n${message.content || '*Kein Text*'}`
                },
                reason: `DM-Post für ${message.author.tag}`
            });

            userIdToPostId.set(message.author.id, post.id);
            postIdToUserId.set(post.id, message.author.id);

        }

        if (post.archived) {
            await post.setArchived(false);
            console.log('♻️ Archivierter Post wieder geöffnet');
        }

        await post.send(`**${message.author.tag}**---> ${message.content || '*Kein Text*'}`);

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