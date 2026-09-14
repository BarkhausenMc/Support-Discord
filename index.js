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

// Cache für aktive Threads pro User (in-Memory, bei Neustart verloren)
const userThreads = new Map();

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} ist online!`);
    console.log(`📬 Support-Threads werden in Kanal ${SUPPORT_CHANNEL_ID} erstellt`);
    
    // Bei Start alle vorhandenen Threads im Support-Kanal laden
    const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
    const threads = await channel.threads.fetchActive();
    
    threads.threads.forEach(thread => {
        // Thread-Namen parsen für User-ID (z.B. "Support - User#1234")
        const match = thread.name.match(/User:(\d+)/);
        if (match) {
            userThreads.set(match[1], thread.id);
        }
    });
    
    console.log(`🔄 ${userThreads.size} aktive Threads geladen`);
});

// DM-Empfang handler
client.on('messageCreate', async (message) => {
    // Nur DMs verarbeiten (keine Server-Nachrichten)
    if (!message.guild && !message.author.bot) {
        const userId = message.author.id;
        
        try {
            let threadId = userThreads.get(userId);
            let targetChannel;
            
            // Prüfen ob Thread noch existiert, wenn ja wiederverwenden
            if (threadId) {
                try {
                    targetChannel = await client.channels.fetch(threadId);
                } catch (e) {
                    // Thread wurde gelöscht, neuen erstellen
                    threadId = null;
                }
            }
            
            // Neuen Thread erstellen falls nötig
            if (!targetChannel || !threadId) {
                const parentChannel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
                
                await parentChannel.threads.create({
                    name: `Support - ${message.author.username}`,
                    topic: `UserID: ${userId}`,  // ⭐ Wichtig!
                    autoArchiveDuration: 60
                });

                // Beim Abrufen eines Threads:
                const threadUserId = message.channel.topic?.match(/UserID: (\d+)/)?.[1];
                if (threadUserId) {
                    // Diese Nachricht gehört zu User threadUserId
                    // Antwort per DM senden: await client.users.fetch(threadUserId)
                }                
                // Im Cache speichern
                userThreads.set(userId, threadId.id);
                console.log(`✨ Neuer Thread erstellt: ${threadId.url}`);
            }
            
            // Nachricht im Thread posten mit Info über Absender
            const embed = new EmbedBuilder()
                .setColor('#6d4aff')
                .setAuthor({ 
                    name: `${message.author.tag}`, 
                    iconURL: message.author.displayAvatarURL(),
                    url: `https://discord.com/users/${userId}`
                })
                .setDescription(message.content || '*Kein Textinhalt*')
                .addFields(
                    { name: '👤 User ID', value: `\`${userId}\``, inline: true },
                    { name: '🕐 Zeit', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: 'Thread-Beendigung: /close' })
                .setTimestamp();
            
            await targetChannel.send({ embeds: [embed] });
            
            // Anhänge mitsenden falls vorhanden
            if (message.attachments.size > 0) {
                const files = message.attachments.map(att => ({
                    attachment: att.url,
                    name: att.name || 'attachment'
                }));
                await targetChannel.send({ files });
            }
            
        } catch (error) {
            console.error('❌ Fehler beim Erstellen des Threads:', error);
            // Fallback: Nachricht direkt in den Support-Kanal ohne Thread
            const fallbackChannel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
            await fallbackChannel.send(`${message.author}: ${message.content}`);
        }
    }
});

// Thread-Antworten vom Support weiterleiten
client.on('messageCreate', async (message) => {
    if (message.channel.isThread() && message.channel.parentId === SUPPORT_CHANNEL_ID && !message.author.bot) {
        
        // User-ID aus Thread-Topic extrahieren
        const match = message.channel.topic?.match(/UserID: (\d+)/);
        if (!match) return;
        
        const userId = match[1];
        
        try {
            const user = await client.users.fetch(userId);
            
            // Original-Nachricht als Antwort-forwarden
            const embed = new EmbedBuilder()
                .setColor('#6d4aff')
                .setTitle('📩 Antwort vom Support')
                .setDescription(message.content)
                .setAuthor({ 
                    name: message.author.tag, 
                    iconURL: message.author.displayAvatarURL() 
                })
                .setFooter({ text: `Thread: ${message.channel.name}` })
                .setTimestamp();
            
            await user.send({ embeds: [embed] });
        } catch (e) {
            console.error('Konnte User nicht erreichen:', e.message);
        }
    }
});

// Befehl um Thread zu schließen (löscht und entfernt aus Cache)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    
    if (interaction.commandName === 'close') {
        if (!interaction.channel.isThread()) {
            return interaction.reply({ content: 'Nur in Threads verfügbar', ephemeral: true });
        }
        
        // Thread schließen
        await interaction.channel.delete('Support abgeschlossen');
        
        // Aus Cache entfernen (falls User-ID bekannt wäre)
        
        await interaction.reply({ content: '✅ Thread geschlossen!', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);