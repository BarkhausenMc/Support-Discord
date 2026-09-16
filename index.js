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

const activePosts = new Map();

client.on('clientReady', () => {
    console.log('Bot ist Online ✅');
});

async function getOrCreatePost(message, forumChannel) {
    // Existiert schon ein Post für diesen User?
    if (activeThreads.has(message.author.id)) {
        const cached = activeThreads.get(message.author.id);
        const post = await forumChannel.threads.fetch(cached.id);
        if (post && !post.archived) return post;
    }

    // Neuen Post erstellen – die DM IST direkt die Start-Nachricht
    const post = await forumChannel.threads.create({
        name: message.author.username,
        message: {
            content: `📨 **${message.author.tag}** (ID: ${message.author.id}) hat geschrieben:\n${message.content || '*Kein Text*'}`
        },
        reason: `DM-Post für ${message.author.tag}`
    });

    // Rollen-Mitglieder direkt zum Post hinzufügen
    const role = await forumChannel.guild.roles.fetch(process.env.ROLE_ID);
    if (role) {
        await Promise.all(
            [...role.members.values()].map(member =>
                post.members.add(member.id).catch(() => {})
            )
        );
    }

    activeThreads.set(message.author.id, post);
    return post;
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

        const { post, isNew } = await getOrCreatePost(message, targetChannel);

        if (!isNew) {
            await post.send(`📨 **${message.author.tag}:** ${message.content || '*Kein Text*'}`);
        }

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