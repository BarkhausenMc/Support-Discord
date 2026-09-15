const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

// ⭐ KATEGORIEN-KONFIGURATION – hier fügst du neue Kategorien hinzu
// custom_id → nur Kleinbuchstaben & Unterstriche
const CATEGORIES = [
    {
        id: 'generell',
        label: 'Genereller Support',
        emoji: '💬',
        channelId: '1549062504250871838'
    },
    {
        id: 'bestellung',
        label: 'Bestellung',
        emoji: '📦',
        channelId: '1549438597479006288'
    },
    {
        id: 'technik',
        label: 'Technisches Problem',
        emoji: '🛠️',
        channelId: '1549439103706210457'
    },
    {
        id: 'bewerbung',
        label: 'Bewerbung',
        emoji: '📋',
        channelId: '1549439141362667702'
    }
];

// Cache: userId -> threadId (unabhängig von Kategorie – pro User max. 1 Ticket)
const userThreads = new Map();

// Warteschlange: userId -> erste Nachricht des Users (bevor Kategorie gewählt wurde)
const pendingMessages = new Map();

function getUserIdFromThread(thread) {
    const match = thread.name.match(/\[(\d+)\]/);
    return match ? match[1] : null;
}

function getCategoryChannels() {
    return CATEGORIES.map(c => c.channelId);
}

client.on('clientReady', async () => {
    console.log(`✅ ${client.user.tag} ist online!`);

    // Threads aus ALLEN Kategorie-Channels laden
    for (const cat of CATEGORIES) {
        try {
            const channel = await client.channels.fetch(cat.channelId);
            if (!channel) continue;

            const active = await channel.threads.fetchActive();
            const archived = await channel.threads.fetchArchived();

            [...active.threads.values(), ...archived.threads.values()].forEach(thread => {
                const userId = getUserIdFromThread(thread);
                if (userId && !userThreads.has(userId)) {
                    userThreads.set(userId, thread.id);
                }
            });
        } catch (e) {
            console.error(`⚠️ Konnte Channel für "${cat.label}" nicht laden:`, e.message);
        }
    }

    console.log(`🔄 ${userThreads.size} Threads geladen`);
});

// ⭐ 1. DM vom User → Thread (falls Ticket offen) oder Kategorie-Auswahl
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

        // ⭐ KEIN offenes Ticket → Kategorie-Auswahl mit Buttons
        if (!thread) {
            // Erste Nachricht für später parken
            pendingMessages.set(userId, message);

            // Buttons bauen (max. 5 pro Reihe!)
            const buttons = CATEGORIES.map(cat =>
                new ButtonBuilder()
                    .setCustomId(`cat_${cat.id}`)
                    .setLabel(cat.label)
                    .setEmoji(cat.emoji)
                    .setStyle(ButtonStyle.Secondary)
            );

            const row = new ActionRowBuilder().addComponents(buttons);

            const selectEmbed = new EmbedBuilder()
                .setColor('#6d4aff')
                .setTitle('📨 Support-Anfrage erhalten!')
                .setDescription(
                    `Wähle bitte eine Kategorie aus, damit dein Anliegen beim richtigen Team landet 👇\n\n` +
                    `Deine Nachricht wird nach der Auswahl automatisch weitergeleitet.`
                )
                .setFooter({ text: 'ℹ️ Pro User ist nur ein offenes Ticket möglich' })
                .setTimestamp();

            await message.reply({ embeds: [selectEmbed], components: [row] });
            return; // Nachricht geht erst nach der Kategorie-Wahl raus
        }

        // Offenes Ticket → normale Nachricht in den Thread
        const embed = new EmbedBuilder()
            .setColor('#6d4aff')
            .setAuthor({
                name: message.author.tag,
                iconURL: message.author.displayAvatarURL()
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

        await message.react('📨');

    } catch (error) {
        console.error('❌ Fehler:', error);
        await message.react('⚠️').catch(() => {});
    }
});

// ⭐ 2. Button-Klick → Thread in Kategorie-Channel erstellen
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('cat_')) return;

    const category = CATEGORIES.find(c => `cat_${c.id}` === interaction.customId);
    if (!category) return;

    const userId = interaction.user.id;

    // Falls inzwischen doch schon ein Ticket existiert
    if (userThreads.has(userId)) {
        return interaction.reply({
            content: '⚠️ Du hast bereits ein offenes Ticket! Schreib einfach weiter per DM.',
            ephemeral: true
        });
    }

    await interaction.deferUpdate().catch(() => {});

    const firstMessage = pendingMessages.get(userId);
    pendingMessages.delete(userId);

    try {
        const parentChannel = await client.channels.fetch(category.channelId);

        const thread = await parentChannel.threads.create({
            name: `${category.emoji} ${category.label} - ${interaction.user.username} [${userId}]`,
            autoArchiveDuration: 1440,
            reason: `Support-Ticket (${category.label}) von ${interaction.user.tag}`
        });
        userThreads.set(userId, thread.id);

        // Intro-Embed im Thread
        const introEmbed = new EmbedBuilder()
            .setColor('#00cc66')
            .setTitle(`📨 Neue Support-Anfrage — ${category.label}`)
            .setDescription(
                `**Nutzer:** ${interaction.user}\n` +
                `**User-ID:** \`${userId}\`\n` +
                `**Kategorie:** ${category.emoji} ${category.label}\n\n` +
                `↩️ Antworte einfach hier im Thread – der User bekommt die Nachricht per DM.`
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        await thread.send({ embeds: [introEmbed] });

        // Die ursprüngliche erste Nachricht des Users einfügen
        if (firstMessage) {
            const msgEmbed = new EmbedBuilder()
                .setColor('#6d4aff')
                .setAuthor({
                    name: firstMessage.author.tag,
                    iconURL: firstMessage.author.displayAvatarURL()
                })
                .setDescription(firstMessage.content || '*Kein Textinhalt*')
                .setTimestamp();

            await thread.send({ embeds: [msgEmbed] });

            if (firstMessage.attachments.size > 0) {
                const files = firstMessage.attachments.map(att => ({
                    attachment: att.url,
                    name: att.name || 'attachment'
                }));
                await thread.send({ files });
            }

            await firstMessage.react('📨').catch(() => {});

        } else {
            // User hat nur den Button gedrückt, ohne vorher geschrieben zu haben
            const emptyEmbed = new EmbedBuilder()
                .setColor('#6d4aff')
                .setAuthor({
                    name: interaction.user.tag,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setDescription('*Ticket über Kategorieauswahl geöffnet*')
                .setTimestamp();
            await thread.send({ embeds: [emptyEmbed] });
        }

        // Bestätigung per DM an den User
        const confirmEmbed = new EmbedBuilder()
            .setColor('#00cc66')
            .setTitle('✅ Ticket erstellt!')
            .setDescription(
                `Dein Ticket wurde in **${category.label}** eröffnet.\n\n` +
                `Schreibe einfach weiter hier in den DMs – alle Nachrichten landen im Ticket.`
            )
            .setTimestamp();

        await interaction.user.send({ embeds: [confirmEmbed] }).catch(() => {});

    } catch (error) {
        console.error('❌ Fehler beim Kategorie-Thread:', error);
        await interaction.user.send('⚠️ Da ist was schiefgelaufen. Bitte versuch es später erneut.')
            .catch(() => {});
    }
});

// ⭐ 3. Antwort im Thread → DM an den User (funktioniert für ALLE Kategorien)
client.on('messageCreate', async (message) => {
    if (!message.channel.isThread()) return;
    if (!getCategoryChannels().includes(message.channel.parentId)) return;
    if (message.author.bot) return;

    const userId = getUserIdFromThread(message.channel);
    if (!userId) {
        return console.warn('⚠️ Keine User-ID im Thread-Namen:', message.channel.name);
    }

    try {
        const user = await client.users.fetch(userId);

        const embed = new EmbedBuilder()
            .setColor('#6d4aff')
            .setTitle('📩 Antwort vom Support')
            .setDescription(message.content || '*Kein Textinhalt*')
            .setFooter({ text: 'Antworte einfach direkt hier per DM' })
            .setTimestamp();

        if (message.attachments.size > 0) {
            embed.setImage(message.attachments.first().url);
        }

        await user.send({ embeds: [embed] });
        await message.react('📨');

    } catch (e) {
        console.error('DM fehlgeschlagen:', e.message);
        message.reply('⚠️ Konnte dem User keine DM schicken (evtl. DMs blockiert).');
    }
});

client.login(process.env.DISCORD_TOKEN);