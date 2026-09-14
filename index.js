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

// Cache: userId -> threadId
const userThreads = new Map();

client.on('clientReady', async () => {  // ⭐ renamed (Deprecation-Warning weg)
    console.log(`✅ ${client.user.tag} ist online!`);

    const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID);

    // Aktive UND archivierte Threads laden, damit der Cache nach Restart funktioniert
    const active = await channel.threads.fetchActive();
    const archived = await channel.threads.fetchArchived();

    [...active.threads.values(), ...archived.threads.values()].forEach(thread => {
        // User-ID steht im Topic
        const match = thread.topic?.match(/UserID: (\d+)/);
        if (match) {
            userThreads.set(match[1], thread.id);
        }
    });

    console.log(`🔄 ${userThreads.size} Threads geladen`);
});

client.on('messageCreate', async (message) => {
    if (message.guild || message.author.bot) return;

    const userId = message.author.id;

    try {
        let thread = null;
        let threadId = userThreads.get(userId);

        // Existierenden Thread holen (falls vorhanden und noch nicht gelöscht)
        if (threadId) {
            try {
                thread = await client.channels.fetch(threadId);
                // Archivierten Thread wieder öffnen
                if (thread.archived) await thread.setArchived(false);
            } catch {
                thread = null; // Thread existiert nicht mehr
            }
        }

        // ⭐ FIX: Thread erstellen UND direkt in `thread` speichern
        if (!thread) {
            const parentChannel = await client.channels.fetch(SUPPORT_CHANNEL_ID);

            thread = await parentChannel.threads.create({
                name: `Support - ${message.author.username}`,
                topic: `UserID: ${userId}`,       // ⭐ User-ID für Persistenz & Rückantworten
                autoArchiveDuration: 1440,        // Archive nach 24h
                reason: `Support-Ticket von ${message.author.tag}`
            });

            userThreads.set(userId, thread.id);
            console.log(`✨ Neuer Thread: ${thread.name} (${thread.id})`);
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

        // Anhänge separat senden
        if (message.attachments.size > 0) {
            const files = message.attachments.map(att => ({
                attachment: att.url,
                name: att.name || 'attachment'
            }));
            await thread.send({ files });
        }

    } catch (error) {
        console.error('❌ Fehler:', error);
        try {
            // Fallback OHNE Mention (deswegen wurdet du gepingt!)
            const fallbackChannel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
            await fallbackChannel.send({
                content: `⚠️ DM erhalten (Fehler beim Thread-Handling). User: \`${message.author.tag}\` / \`${userId}\``,
                allowedMentions: { parse: [] }   // ⭐ keine Pings
            });
        } catch (e) {
            console.error('Fallback fehlgeschlagen:', e);
        }
    }
});

// Support-Antworten im Thread zurück an den User per DM
client.on('messageCreate', async (message) => {
    if (!message.channel.isThread()) return;
    if (message.channel.parentId !== SUPPORT_CHANNEL_ID) return;
    if (message.author.bot) return;

    const match = message.channel.topic?.match(/UserID: (\d+)/);
    if (!match) return;

    try {
        const user = await client.users.fetch(match[1]);

        const embed = new EmbedBuilder()
            .setColor('#6d4aff')
            .setTitle('📩 Antwort vom Support')
            .setDescription(message.content || '*Kein Textinhalt*')
            .setFooter({ text: `Antworte direkt hier per DM` })
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (e) {
        console.error('DM an User fehlgeschlagen:', e.message);
        message.reply('⚠️ Konnte dem User keine DM schicken (evtl. DMs blockiert).');
    }
});

client.login(process.env.DISCORD_TOKEN);