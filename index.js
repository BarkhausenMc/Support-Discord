const { Client, GatewayIntentBits, Partials, Routes } = require('discord.js');
const dotenv = require('dotenv');
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

// Ziel-Kanal-ID eintragen (wohin DMs gesendet werden sollen)
const SUPPORT_CHANNEL_ID = '1549062504250871838';

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} ist online!`);
    console.log(`📬 Support-DMs werden an Kanal ${SUPPORT_CHANNEL_ID} weitergeleitet`);
});

// DM-Empfang handler
client.on('messageCreate', async (message) => {
    // Nur private Nachrichten verarbeiten (keine Server-Nachrichten)
    if (!message.guild && !message.author.bot) {
        
        // Autor-Info für Embed
        const authorInfo = `\`ID:\` ${message.author.id} • \`User:\` ${message.author.tag}`;
        const messageContent = message.content || '*Kein Textinhalt*';
        
        // Embed erstellen mit User-Informationen
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor('#6d4aff')  // Proton-Purple 🟣
            .setTitle('📨 Neue Support-Anfrage')
            .setAuthor({ 
                name: `${message.author.tag}`, 
                iconURL: message.author.displayAvatarURL() 
            })
            .setDescription(messageContent)
            .addFields(
                { name: '👤 Nutzer', value: authorInfo, inline: true },
                { name: '🕐 Zeit', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Antwort per DM möglich' })
            .setTimestamp();
        
        // Optional: Anhänge mitsenden falls vorhanden
        const attachmentOptions = {};
        if (message.attachments.size > 0) {
            attachmentOptions.files = message.attachments.map(att => ({
                attachment: att.url,
                name: att.name || 'attachment'
            }));
        }
        
        // Nachricht an Support-Kanal senden
        const targetChannel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
        await targetChannel.send({
            embeds: [embed],
            ...attachmentOptions
        }).catch(console.error);
    }
});

// Bot-Token laden
client.login(process.env.DISCORD_TOKEN);