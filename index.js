const {
    Client, GatewayIntentBits, Partials, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    SlashCommandBuilder
} = require('discord.js');
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

// ⭐ KATEGORIEN mit MODAL-FRAGEN
// questions: max. 5 pro Kategorie (Discord-Limit), required: true erzwingt Antwort
const CATEGORIES = [
    {
        id: 'allgemein',
        label: 'Allgemeine Frage',
        emoji: '💬',
        channelId: '1549062504250871838',
        questions: [
            {
                label: 'Worum geht es bei deiner Frage?',
                style: TextInputStyle.Paragraph,
                placeholder: 'Beschreibe dein Anliegen kurz...',
                required: true
            }
        ]
    },
    {
        id: 'bestellung',
        label: 'Bestellung',
        emoji: '📦',
        channelId: '1549438597479006288',
        questions: [
            {
                label: 'Bestellnummer',
                style: TextInputStyle.Short,
                placeholder: 'z.B. #12345',
                required: true
            },
            {
                label: 'Was ist das Problem?',
                style: TextInputStyle.Paragraph,
                placeholder: 'Beschreibe dein Problem...',
                required: true
            }
        ]
    },
    {
        id: 'technik',
        label: 'Technisches Problem',
        emoji: '🛠️',
        channelId: '1549439103706210457',
        questions: [
            {
                label: 'Wo tritt das Problem auf?',
                style: TextInputStyle.Short,
                placeholder: 'z.B. Webseite, App, Discord-Bot',
                required: true
            },
            {
                label: 'Fehlermeldung / Beschreibung',
                style: TextInputStyle.Paragraph,
                placeholder: 'Was genau passiert? Seit wann?',
                required: true
            },
            {
                label: 'Was hast du schon probiert?',
                style: TextInputStyle.Paragraph,
                placeholder: 'Optional...',
                required: false
            }
        ]
    }
];

const userThreads = new Map();      // userId -> threadId (offene Tickets)
const pendingMessages = new Map();  // userId -> erste DM vor Kategorie-Wahl

function getUserIdFromThread(thread) {
    const match = thread.name.match(/\[(\d+)\]/);
    return match ? match[1] : null;
}

function getCategoryChannels() {
    return CATEGORIES.map(c => c.channelId);
}

client.on('clientReady', async () => {
    console.log(`✅ ${client.user.tag} ist online!`);

    // ⭐ /close Command in ALLEN Guilds registrieren
    const closeCommand = new SlashCommandBuilder()
        .setName('close')
        .setDescription('Schließt das aktuelle Support-Ticket')
        .addStringOption(opt =>
            opt.setName('grund')
                .setDescription('Grund für die Schließung (optional)')
                .setRequired(false));

    for (const guild of client.guilds.cache.values()) {
        await guild.commands.set([closeCommand]);
        console.log(`🔧 /close registriert in: ${guild.name}`);
    }

    // Threads laden – NUR offene (🆕) zählen als aktives Ticket
    for (const cat of CATEGORIES) {
        try {
            const channel = await client.channels.fetch(cat.channelId);
            const active = await channel.threads.fetchActive();
            const archived = await channel.threads.fetchArchived();

            [...active.threads.values(), ...archived.threads.values()].forEach(thread => {
                const userId = getUserIdFromThread(thread);
                // 🔒-Threads sind geschlossen → nicht als offen laden!
                if (userId && !thread.name.startsWith('🔒') && !userThreads.has(userId)) {
                    userThreads.set(userId, thread.id);
                }
            });
        } catch (e) {
            console.error(`⚠️ Channel für "${cat.label}" nicht ladbar:`, e.message);
        }
    }
    console.log(`🔄 ${userThreads.size} offene Tickets geladen`);
});

// ⭐ 1. DM vom User → Ticket oder Kategorie-Auswahl
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
            pendingMessages.set(userId, message);

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
                    `Wähle bitte eine Kategorie aus 👇\n\n` +
                    `Danach öffnet sich ein kurzes Formular, das du ausfüllen musst.\n` +
                    `Deine Nachricht wird mit dem Ticket übertragen.`
                )
                .setFooter({ text: 'ℹ️ Pro User ist nur ein offenes Ticket möglich' })
                .setTimestamp();

            await message.reply({ embeds: [selectEmbed], components: [row] });
            return;
        }

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
                attachment: att.url, name: att.name || 'attachment'
            }));
            await thread.send({ files });
        }

        await message.react('📨');

    } catch (error) {
        console.error('❌ Fehler:', error);
        await message.react('⚠️').catch(() => {});
    }
});

// ⭐ 2. Kategorie-Button → MODAL öffnen
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('cat_')) return;

    const category = CATEGORIES.find(c => `cat_${c.id}` === interaction.customId);
    if (!category) return;

    if (userThreads.has(interaction.user.id)) {
        return interaction.reply({
            content: '⚠️ Du hast bereits ein offenes Ticket!',
            ephemeral: true
        });
    }

    // ⭐ Modal mit den Fragen der Kategorie bauen
    const modal = new ModalBuilder()
        .setCustomId(`modal_${category.id}`)
        .setTitle(`${category.emoji} ${category.label}`);

    category.questions.forEach((q, i) => {
        const input = new TextInputBuilder()
            .setCustomId(`frage_${i}`)
            .setLabel(q.label)              // max. 45 Zeichen!
            .setStyle(q.style)
            .setRequired(q.required);
        if (q.placeholder) input.setPlaceholder(q.placeholder);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
    });

    await interaction.showModal(modal);
});

// ⭐ 3. Modal abgeschickt → Ticket erstellen
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith('modal_')) return;

    const categoryId = interaction.customId.replace('modal_', '');
    const category = CATEGORIES.find(c => c.id === categoryId);
    if (!category) return;

    const userId = interaction.user.id;

    if (userThreads.has(userId)) {
        return interaction.reply({
            content: '⚠️ Du hast bereits ein offenes Ticket!',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const parentChannel = await client.channels.fetch(category.channelId);

        // ⭐ 🆕-Präfix im Namen = Status "offen" fürs Team sichtbar
        const thread = await parentChannel.threads.create({
            name: `🆕 ${category.emoji} ${category.label} - ${interaction.user.username} [${userId}]`,
            autoArchiveDuration: 1440,
            reason: `Support-Ticket (${category.label}) von ${interaction.user.tag}`
        });
        userThreads.set(userId, thread.id);

        // ⭐ Intro-Embed GRÜN + "NEUES TICKET" → sofort erkennbar
        const introEmbed = new EmbedBuilder()
            .setColor('#00cc66')
            .setTitle('🆕 NEUES TICKET')
            .setDescription(
                `**Nutzer:** ${interaction.user}\n` +
                `**User-ID:** \`${userId}\`\n` +
                `**Kategorie:** ${category.emoji} ${category.label}\n` +
                `**Status:** 🟢 Offen\n\n` +
                `↩️ Antworte hier im Thread – der User erhält die Nachricht per DM.`
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        await thread.send({ embeds: [introEmbed] });

        // ⭐ Antworten aus dem Modal einbetten
        const answerFields = category.questions.map((q, i) => ({
            name: q.label,
            value: (interaction.fields.getTextInputValue(`frage_${i}`) || '-').slice(0, 1024)
        }));

        const answersEmbed = new EmbedBuilder()
            .setColor('#5865f2')
            .setTitle('📋 Angaben des Nutzers')
            .addFields(answerFields)
            .setTimestamp();

        await thread.send({ embeds: [answersEmbed] });

        // Geparkte erste DM ebenfalls einfügen (falls vorhanden)
        const firstMessage = pendingMessages.get(userId);
        pendingMessages.delete(userId);

        if (firstMessage) {
            const msgEmbed = new EmbedBuilder()
                .setColor('#6d4aff')
                .setAuthor({
                    name: firstMessage.author.tag,
                    iconURL: firstMessage.author.displayAvatarURL()
                })
                .setDescription(`*Ursprüngliche Nachricht:*\n${firstMessage.content || '*Kein Textinhalt*'}`)
                .setTimestamp();
            await thread.send({ embeds: [msgEmbed] });

            if (firstMessage.attachments.size > 0) {
                const files = firstMessage.attachments.map(att => ({
                    attachment: att.url, name: att.name || 'attachment'
                }));
                await thread.send({ files });
            }
            await firstMessage.react('📨').catch(() => {});
        }

        // Bestätigung an den User
        await interaction.editReply({
            content: `✅ Dein Ticket wurde in **${category.label}** eröffnet! Schreibe einfach weiter per DM.`
        });

        const confirmDM = new EmbedBuilder()
            .setColor('#00cc66')
            .setTitle('✅ Ticket erstellt!')
            .setDescription(
                `Dein Ticket (**${category.label}**) ist beim Support-Team eingegangen.\n` +
                `Schreibe einfach weiter hier in den DMs.`
            )
            .setTimestamp();
        await interaction.user.send({ embeds: [confirmDM] }).catch(() => {});

    } catch (error) {
        console.error('❌ Fehler beim Ticket-Erstellen:', error);
        await interaction.editReply({
            content: '⚠️ Da ist was schiefgelaufen. Bitte versuche es erneut.'
        });
    }
});

// ⭐ 4. /close – Ticket schließen
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'close') return;

    const thread = interaction.channel;

    if (!thread.isThread() || !getCategoryChannels().includes(thread.parentId)) {
        return interaction.reply({
            content: '❌ `/close` funktioniert nur in Support-Tickets!',
            ephemeral: true
        });
    }

    const userId = getUserIdFromThread(thread);
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';

    await interaction.deferReply();

    try {
        // ⭐ Status-Änderungen: Name 🔒, rotes Closing-Embed, User informieren, Cache leeren
        await thread.setName(thread.name.replace('🆕', '🔒'));

        const closeEmbed = new EmbedBuilder()
            .setColor('#ed4245')
            .setTitle('🔒 TICKET GESCHLOSSEN')
            .setDescription(
                `**Geschlossen von:** ${interaction.user}\n` +
                `**Grund:** ${reason}`
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [closeEmbed] });

        if (userId) {
            userThreads.delete(userId);
            pendingMessages.delete(userId);

            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const closeDM = new EmbedBuilder()
                    .setColor('#ed4245')
                    .setTitle('🔒 Dein Ticket wurde geschlossen')
                    .setDescription(
                        `Dein Ticket wurde vom Support-Team geschlossen.\n` +
                        `**Grund:** ${reason}\n\n` +
                        `Du kannst jederzeit ein neues Ticket über eine DM eröffnen.`
                    )
                    .setTimestamp();
                await user.send({ embeds: [closeDM] }).catch(() => {});
            }
        }

        // Thread archivieren (nur löschen, das verschwindet)
        await thread.setArchived(true, `Ticket geschlossen von ${interaction.user.tag}`);

    } catch (error) {
        console.error('❌ Fehler beim Schließen:', error);
        await interaction.editReply({ content: '⚠️ Konnte das Ticket nicht schließen.' });
    }
});

// ⭐ 5. Antwort im Thread → DM an den User
client.on('messageCreate', async (message) => {
    if (!message.channel.isThread()) return;
    if (!getCategoryChannels().includes(message.channel.parentId)) return;
    if (message.author.bot) return;

    const userId = getUserIdFromThread(message.channel);
    if (!userId) return;

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
        message.reply('⚠️ Konnte dem User keine DM schicken (evtl. DMs blockiert).').catch(() => {});
    }
});

client.login(process.env.DISCORD_TOKEN);