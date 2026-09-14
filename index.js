const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
});

const SUPPORT_CHANNEL_ID = '1549062504250871838';
const userThreads = new Map();

// ⭐ Helper: User-ID aus dem Thread-Namen parsen
// Name-Format: "Support - username [123456789]"
function getUserIdFromThread(thread) {
    const match = thread.name.match(/\[(\d+)\]/);
    return match ? match[1] : null;
}

client.on('clientReady', async () => {
    console.log(`✅ ${client.user.tag} ist online!`);

    const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
    const active = await channel.threads.fetchActive();
    const archived = await channel.threads.fetchArchived();

    [...active.threads.values(), ...archived.threads.values()].forEach(thread => {
        const userId = getUserIdFromThread(thread);
        if (userId) {
            userThreads.set(userId, thread.id);
        }
    });

    console.log(`🔄 ${userThreads.size} Threads geladen`);
});

// DM vom User → Thread
client.on('messageCreate', async (message) => {
    if (message.guild || message.author.bot) return;

    const userId = message.author.id;

    try {
        let thread = null;
        const threadId = userThreads.get(userId);

        if (threadId) {
            try {
                thread = await client.channels.fetch(threadId);
                if (thread.archived) await thread.setArchived(false);
            } catch {
                thread = null;
            }
        }

        if (!thread) {
            const parentChannel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
            thread = await parentChannel.threads.create({
                name: `Support - ${message.author.username} [${userId}]`,
                autoArchiveDuration: 1440,
                reason: `Support-Ticket von ${message.author.tag}`
            });
            userThreads.set(userId, thread.id);
        }

        const embed = new EmbedBuilder()
            .setColor('#6d4aff')
            .setAuthor({
                name: message.author.tag,
                iconURL: message.author.displayAvatarURL(),
                url: `https://discord.com/users/${userId}`
            })
            .setDescription(message.content || '*Kein Textinhalt*')
            .setTimestamp();

        await thread.send({ embeds: [embed] });

        if (message.attachments.size > 0) {
            const files = message.attachments.map(att => ({
                attachment: att.url,
                name: att.name || 'attachment'
            }));
            await thread.send({ files });
        }

        // ⭐ NEU: Bestätigung in der DM (Reaktion auf die Nachricht des Users)
        await message.react('📨');

    } catch (error) {
        console.error('❌ Fehler:', error);
        // ⭐ NEU: Bei Fehler anderes Emoji, damit der User merkt, dass was schiefging
        await message.react('⚠️').catch(() => {});
    }
});

// ⭐ Antwort im Thread → DM an den User
client.on('messageCreate', async (message) => {
    if (!message.channel.isThread()) return;
    if (message.channel.parentId !== SUPPORT_CHANNEL_ID) return;
    if (message.author.bot) return;

    const userId = getUserIdFromThread(message.channel);
    if (!userId) {
        return console.warn('⚠️ Keine User-ID im Thread-Namen gefunden:', message.channel.name);
    }

    try {
        const user = await client.users.fetch(userId);

        const embed = new EmbedBuilder()
            .setColor('#6d4aff')
            .setTitle('📩 Antwort vom Support')
            .setDescription(message.content || '*Kein Textinhalt*')
            .setFooter({ text: 'Antworte einfach direkt hier per DM' })
            .setTimestamp();

        // Anhänge mit in die DM packen
        if (message.attachments.size > 0) {
            embed.setImage(message.attachments.first().url);
        }

        await user.send({ embeds: [embed] });
        await message.react('📨');  // Bestätigung, dass die Antwort raus ist

    } catch (e) {
        console.error('DM fehlgeschlagen:', e.message);
        message.reply('⚠️ Konnte dem User keine DM schicken (evtl. DMs blockiert).');
    }
});

client.login(process.env.DISCORD_TOKEN);