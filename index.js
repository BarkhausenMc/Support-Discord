const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const Database = require('better-sqlite3');
require('dotenv').config();


// ======================================================
// CLIENT
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel
    ]
});


// ======================================================
// DATABASE
// ======================================================

const db = new Database('./tickets.db');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');


// ======================================================
// TABELLEN
// ======================================================

// Ein Eintrag pro Discord-User.
// Ein User hat IMMER maximal einen Forum-Thread.
db.exec(`
    CREATE TABLE IF NOT EXISTS user_threads (
        user_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
    )
`);


// Ein Eintrag pro Ticket.
// Ein User kann beliebig viele Tickets haben.
db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL,
        closed_at INTEGER,
        closed_by TEXT
    )
`);


// Pro User darf maximal EIN offenes Ticket existieren.
db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_ticket_per_user
    ON tickets(user_id)
    WHERE status = 'open'
`);


// ======================================================
// PREPARED STATEMENTS
// ======================================================

const getUserThread = db.prepare(`
    SELECT *
    FROM user_threads
    WHERE user_id = ?
`);

const createUserThread = db.prepare(`
    INSERT INTO user_threads (
        user_id,
        thread_id,
        created_at
    )
    VALUES (?, ?, ?)
`);

const getTicket = db.prepare(`
    SELECT *
    FROM tickets
    WHERE id = ?
`);

const getOpenTicketByUser = db.prepare(`
    SELECT *
    FROM tickets
    WHERE user_id = ?
    AND status = 'open'
    LIMIT 1
`);

const getOpenTicketByThread = db.prepare(`
    SELECT *
    FROM tickets
    WHERE thread_id = ?
    AND status = 'open'
    LIMIT 1
`);

const createTicket = db.prepare(`
    INSERT INTO tickets (
        user_id,
        thread_id,
        category,
        status,
        created_at
    )
    VALUES (?, ?, ?, 'open', ?)
`);

const closeTicket = db.prepare(`
    UPDATE tickets
    SET
        status = 'closed',
        closed_at = ?,
        closed_by = ?
    WHERE id = ?
    AND status = 'open'
`);


// ======================================================
// MODAL CONFIG
// ======================================================

const MODAL_CONFIG = {

    generel_support: {
        modalTitle: '❓ Generell Support',

        fields: [
            {
                id: 'problem',
                label: 'Anliegen',
                style: 'SHORT',
                placeholder: 'z.B. Bot antwortet nicht',
                required: true,
                maxLength: 100
            },
            {
                id: 'problem_since_when',
                label: 'Seit wann?',
                style: 'SHORT',
                placeholder: 'z.B. seit heute Morgen',
                required: false,
                maxLength: 100
            },
            {
                id: 'problem_description',
                label: 'Details',
                style: 'PARAGRAPH',
                placeholder: 'Was hast du versucht?',
                required: true,
                maxLength: 1000
            }
        ]
    },

    cooperation: {
        modalTitle: '🤝 Kooperation',

        fields: [
            {
                id: 'cooperation_request',
                label: 'Dein Name/Server',
                style: 'SHORT',
                placeholder: 'Discord-Invite/Website',
                required: true,
                maxLength: 100
            },
            {
                id: 'cooperation_why',
                label: 'Warum Kooperation?',
                style: 'PARAGRAPH',
                placeholder: 'Erzähl uns mehr...',
                required: true,
                maxLength: 1000
            }
        ]
    },

    staff_apply: {
        modalTitle: '📝 Staff Bewerbung',

        fields: [
            {
                id: 'staff_apply',
                label: 'Position',
                style: 'SHORT',
                placeholder: 'z.B. Moderator',
                required: true,
                maxLength: 100
            },
            {
                id: 'staff_apply_why',
                label: 'Warum als Staff?',
                style: 'PARAGRAPH',
                placeholder: 'Deine Gründe',
                required: true,
                maxLength: 1000
            },
            {
                id: 'staff_apply_personal',
                label: 'Warum dich?',
                style: 'PARAGRAPH',
                placeholder: 'Deine Stärken',
                required: true,
                maxLength: 1000
            }
        ]
    }
};


// ======================================================
// HILFSFUNKTIONEN
// ======================================================

function getCategoryName(category) {
    return MODAL_CONFIG[category]?.modalTitle || category;
}


function getCurrentTimestamp() {
    return Date.now();
}


// ======================================================
// TICKET-BUTTON
// ======================================================

function createCloseButton(ticketId) {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId(`close_ticket:${ticketId}`)
                .setLabel('🔒 Ticket schließen')
                .setStyle(ButtonStyle.Danger)
        );
}


// ======================================================
// TICKET HEADER
// ======================================================

function createTicketContainer({
    ticketId,
    userTag,
    category,
    answers
}) {

    const container =
        new ContainerBuilder()

            .addTextDisplayComponents(

                new TextDisplayBuilder()
                    .setContent(
                        `# 🎫 Ticket #${ticketId}`
                    )
            )

            .addSeparatorComponents(

                new SeparatorBuilder()
                    .setDivider(true)
                    .setSpacing(1)
            )

            .addTextDisplayComponents(

                new TextDisplayBuilder()
                    .setContent(
                        `**Benutzer:** ${userTag}\n` +
                        `**Kategorie:** ${getCategoryName(category)}\n` +
                        `**Status:** 🟢 Offen`
                    )
            )

            .addSeparatorComponents(

                new SeparatorBuilder()
                    .setDivider(true)
                    .setSpacing(1)
            );


    let content = '';


    for (const [label, value] of answers) {

        content +=
            `**${label}:** ${value || '*Keine Angabe*'}\n`;
    }


    container.addTextDisplayComponents(

        new TextDisplayBuilder()
            .setContent(content)
    );


    return container;
}


// ======================================================
// TICKET GESCHLOSSEN CONTAINER
// ======================================================

function createClosedTicketContainer(ticket, closedByTag) {

    return new ContainerBuilder()

        .addTextDisplayComponents(

            new TextDisplayBuilder()
                .setContent(
                    `# 🔒 Ticket #${ticket.id} geschlossen`
                )
        )

        .addSeparatorComponents(

            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(1)
        )

        .addTextDisplayComponents(

            new TextDisplayBuilder()
                .setContent(
                    `**Kategorie:** ${getCategoryName(ticket.category)}\n` +
                    `**Status:** 🔴 Geschlossen\n` +
                    `**Geschlossen von:** ${closedByTag}`
                )
        );
}


// ======================================================
// TICKET-OPTIONEN
// ======================================================

async function sendTicketOptions(channel) {

    const pictureContainer =
        new ContainerBuilder()
            .addMediaGalleryComponents(

                new MediaGalleryBuilder()
                    .addItems([

                        new MediaGalleryItemBuilder()
                            .setURL(
                                'https://minigames.flo.asksven.io/images/bot/logosdb.png'
                            )
                    ])
            );


    const categoryContainer =
        new ContainerBuilder()
            .addTextDisplayComponents(

                new TextDisplayBuilder()
                    .setContent(
                        '# `📩` Ticket Erstellen\n' +
                        '> *||Drücke den Button, der zu deinem Anliegen passt, um ein Ticket zu erstellen.||*'
                    )
            );


    const buttonContainer =
        new ContainerBuilder()
            .addActionRowComponents(

                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId('generel_support')
                            .setLabel('❓ Generell Support')
                            .setStyle(ButtonStyle.Secondary),

                        new ButtonBuilder()
                            .setCustomId('cooperation')
                            .setLabel('🤝 Kooperation')
                            .setStyle(ButtonStyle.Secondary),

                        new ButtonBuilder()
                            .setCustomId('staff_apply')
                            .setLabel('📝 Staff Bewerbung')
                            .setStyle(ButtonStyle.Secondary)
                    )
            );


    await channel.send({

        components: [
            pictureContainer,
            categoryContainer,
            buttonContainer
        ],

        flags:
            MessageFlags.IsComponentsV2
    });
}


// ======================================================
// USER THREAD FINDEN / ERSTELLEN
// ======================================================

async function getOrCreateUserThread(user) {

    // ==============================================
    // DB NACH THREAD SUCHEN
    // ==============================================

    let userThread =
        getUserThread.get(user.id);


    // ==============================================
    // EXISTIERENDER THREAD
    // ==============================================

    if (userThread) {

        try {

            const thread =
                await client.channels.fetch(
                    userThread.thread_id
                );


            if (thread) {

                // Falls archiviert → wieder öffnen
                if (thread.archived) {

                    await thread.setArchived(false)
                        .catch(() => {});
                }


                return thread;
            }

        } catch (error) {

            console.log(
                `⚠️ Gespeicherter Thread nicht erreichbar: ${error.message}`
            );
        }
    }


    // ==============================================
    // NEUEN THREAD ERSTELLEN
    // ==============================================

    const forum =
        await client.channels.fetch(
            process.env.CHANNEL_ID
        );


    if (!forum) {
        throw new Error('Forum nicht gefunden.');
    }


    // Temporärer Starter.
    // Der eigentliche Ticket-Inhalt wird danach gesendet.
    const thread =
        await forum.threads.create({

            name:
                `${user.tag}`,

            message: {

                content:
                    `🎫 Support-Post für ${user.tag}`

            }
        });


    // ==============================================
    // DB SPEICHERN
    // ==============================================

    try {

        createUserThread.run(
            user.id,
            thread.id,
            getCurrentTimestamp()
        );

    } catch (error) {

        // Falls durch Race Condition bereits vorhanden
        console.error(
            '❌ Fehler beim Speichern des User-Threads:',
            error.message
        );
    }


    console.log(
        `📁 Neuer User-Thread erstellt: ${user.tag} → ${thread.id}`
    );


    return thread;
}


// ======================================================
// NEUES TICKET ERSTELLEN
// ======================================================

function createNewTicket(userId, threadId, category) {

    try {

        const result =
            createTicket.run(
                userId,
                threadId,
                category,
                getCurrentTimestamp()
            );


        return result.lastInsertRowid;

    } catch (error) {

        // UNIQUE INDEX:
        // User hat bereits ein offenes Ticket

        if (
            error.message.includes(
                'one_open_ticket_per_user'
            )
        ) {

            return null;
        }


        throw error;
    }
}


// ======================================================
// BOT READY
// ======================================================

client.once('clientReady', async () => {

    console.log('Bot ist Online ✅');


    try {

        const forum =
            await client.channels.fetch(
                process.env.CHANNEL_ID
            );


        console.log(
            'Forum gefunden:',
            forum?.name,
            '| Type:',
            forum?.type
        );


        // ==========================================
        // DB ÜBERSICHT
        // ==========================================

        const users =
            db.prepare(
                'SELECT COUNT(*) AS count FROM user_threads'
            ).get();


        const tickets =
            db.prepare(
                'SELECT COUNT(*) AS count FROM tickets'
            ).get();


        const openTickets =
            db.prepare(
                `SELECT COUNT(*) AS count
                 FROM tickets
                 WHERE status = 'open'`
            ).get();


        console.log(
            `📂 User-Threads in DB: ${users.count}`
        );

        console.log(
            `🎫 Tickets insgesamt: ${tickets.count}`
        );

        console.log(
            `🟢 Offene Tickets: ${openTickets.count}`
        );


    } catch (error) {

        console.error(
            '❌ Ready-Fehler:',
            error
        );
    }
});


// ======================================================
// USER → BOT DM
// ======================================================

client.on('messageCreate', async (message) => {

    if (message.author.bot) return;

    // Nur DMs
    if (message.channel.type !== 1) return;


    try {

        console.log(
            `📨 DM von ${message.author.tag}`
        );


        // ==========================================
        // OFFENES TICKET SUCHEN
        // ==========================================

        const openTicket =
            getOpenTicketByUser.get(
                message.author.id
            );


        // ==========================================
        // OFFENES TICKET EXISTIERT
        // ==========================================

        if (openTicket) {

            try {

                const thread =
                    await client.channels.fetch(
                        openTicket.thread_id
                    );


                if (!thread) {
                    throw new Error(
                        'Thread nicht gefunden'
                    );
                }


                // Falls archiviert
                if (thread.archived) {

                    await thread.setArchived(false)
                        .catch(() => {});
                }


                await thread.send(
                    `📨 **${message.author.tag}:**\n` +
                    `${message.content || '*Kein Text*'}`
                );


                await message.react('📨')
                    .catch(() => {});


                console.log(
                    `📤 Nachricht zu Ticket #${openTicket.id} gesendet`
                );


                return;

            } catch (error) {

                console.error(
                    '❌ Fehler beim Senden ins Ticket:',
                    error.message
                );
            }
        }


        // ==========================================
        // KEIN OFFENES TICKET
        // ==========================================

        await sendTicketOptions(
            message.channel
        );


        console.log(
            `📨 Ticket-Optionen gesendet an ${message.author.tag}`
        );


    } catch (error) {

        console.error(
            '❌ DM-Fehler:',
            error
        );
    }
});


// ======================================================
// TEAM → USER
// ======================================================

client.on('messageCreate', async (message) => {

    if (message.author.bot) return;

    if (!message.channel.isThread()) return;

    if (
        message.channel.parentId !==
        process.env.CHANNEL_ID
    ) {
        return;
    }


    try {

        // ==========================================
        // OFFENES TICKET DES THREADS
        // ==========================================

        const ticket =
            getOpenTicketByThread.get(
                message.channel.id
            );


        // ==========================================
        // KEIN OFFENES TICKET
        // ==========================================

        if (!ticket) {

            console.log(
                `ℹ️ Nachricht in geschlossenem/leerem Thread ignoriert: ${message.channel.name}`
            );

            return;
        }


        // ==========================================
        // USER AUS DB
        // ==========================================

        const userId =
            ticket.user_id;


        console.log(
            `👤 User für Ticket #${ticket.id}: ${userId}`
        );


        // ==========================================
        // USER LADEN
        // ==========================================

        const user =
            await client.users.fetch(
                userId
            );


        // ==========================================
        // DM
        // ==========================================

        await user.send(
            message.content ||
            '*Keine Textnachricht*'
        );


        await message.react('📨')
            .catch(() => {});


        console.log(
            `📤 DM für Ticket #${ticket.id} an ${user.tag} gesendet`
        );


    } catch (error) {

        console.error(
            '❌ DM-Fehler:',
            error.message
        );


        await message.react('⚠️')
            .catch(() => {});
    }
});


// ======================================================
// INTERACTIONS
// ======================================================

client.on('interactionCreate', async (interaction) => {


    // ==================================================
    // BUTTON
    // ==================================================

    if (interaction.isButton()) {

        // ==============================================
        // TICKET SCHLIESSEN
        // ==============================================

        if (
            interaction.customId.startsWith(
                'close_ticket:'
            )
        ) {

            try {

                const ticketId =
                    Number(
                        interaction.customId.split(':')[1]
                    );


                if (!ticketId) {

                    await interaction.reply({

                        content:
                            '❌ Ungültige Ticket-ID.',

                        flags:
                            MessageFlags.Ephemeral
                    });

                    return;
                }


                // ==========================================
                // TICKET LADEN
                // ==========================================

                const ticket =
                    getTicket.get(ticketId);


                if (!ticket) {

                    await interaction.reply({

                        content:
                            '❌ Dieses Ticket existiert nicht mehr.',

                        flags:
                            MessageFlags.Ephemeral
                    });

                    return;
                }


                // ==========================================
                // BEREITS GESCHLOSSEN
                // ==========================================

                if (ticket.status === 'closed') {

                    await interaction.reply({

                        content:
                            'ℹ️ Dieses Ticket ist bereits geschlossen.',

                        flags:
                            MessageFlags.Ephemeral
                    });

                    return;
                }


                // ==========================================
                // TICKET SCHLIESSEN
                // ==========================================

                closeTicket.run(
                    getCurrentTimestamp(),
                    interaction.user.id,
                    ticketId
                );


                // ==========================================
                // TICKET NEU LADEN
                // ==========================================

                const closedTicket =
                    getTicket.get(ticketId);


                // ==========================================
                // GESCHLOSSEN-NACHRICHT
                // ==========================================

                const closedContainer =
                    createClosedTicketContainer(
                        closedTicket,
                        interaction.user.tag
                    );


                await interaction.channel.send({

                    components: [
                        closedContainer
                    ],

                    flags:
                        MessageFlags.IsComponentsV2
                });


                // ==========================================
                // USER INFORMIEREN
                // ==========================================

                try {

                    const user =
                        await client.users.fetch(
                            ticket.user_id
                        );


                    await user.send(
                        `🔒 Dein Ticket **#${ticket.id}** wurde geschlossen.\n\n` +
                        `Wenn du ein neues Anliegen hast, kannst du einfach wieder eine DM an mich senden.`
                    );

                } catch (dmError) {

                    console.log(
                        `⚠️ User konnte nicht über Schließung informiert werden: ${dmError.message}`
                    );
                }


                await interaction.reply({

                    content:
                        `🔒 Ticket #${ticket.id} wurde geschlossen.`,

                    flags:
                        MessageFlags.Ephemeral
                });


                console.log(
                    `🔒 Ticket #${ticket.id} geschlossen von ${interaction.user.tag}`
                );


            } catch (error) {

                console.error(
                    '❌ Fehler beim Schließen:',
                    error
                );


                if (!interaction.replied) {

                    await interaction.reply({

                        content:
                            '❌ Das Ticket konnte nicht geschlossen werden.',

                        flags:
                            MessageFlags.Ephemeral
                    }).catch(() => {});
                }
            }


            return;
        }


        // ==============================================
        // NORMALE TICKET-BUTTONS
        // ==============================================

        const category =
            interaction.customId;


        const config =
            MODAL_CONFIG[category];


        if (!config) return;


        // ==============================================
        // PRÜFEN OB OFFENES TICKET
        // ==============================================

        const openTicket =
            getOpenTicketByUser.get(
                interaction.user.id
            );


        if (openTicket) {

            await interaction.reply({

                content:
                    `🚫 Du hast bereits ein offenes Ticket (#${openTicket.id})!`,

                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }


        // ==============================================
        // MODAL
        // ==============================================

        const modal =
            new ModalBuilder()

                .setCustomId(
                    `ticket_modal_${category}`
                )

                .setTitle(
                    config.modalTitle
                );


        for (const field of config.fields) {

            modal.addComponents(

                new ActionRowBuilder()
                    .addComponents(

                        new TextInputBuilder()

                            .setCustomId(
                                field.id
                            )

                            .setLabel(
                                field.label
                            )

                            .setStyle(

                                field.style === 'SHORT'
                                    ? TextInputStyle.Short
                                    : TextInputStyle.Paragraph
                            )

                            .setPlaceholder(
                                field.placeholder
                            )

                            .setRequired(
                                field.required
                            )

                            .setMaxLength(
                                field.maxLength
                            )
                    )
            );
        }


        await interaction.showModal(
            modal
        );


        return;
    }


    // ==================================================
    // MODAL SUBMIT
    // ==================================================

    if (interaction.isModalSubmit()) {

        try {

            const category =
                interaction.customId.replace(
                    'ticket_modal_',
                    ''
                );


            const config =
                MODAL_CONFIG[category];


            if (!config) {

                console.warn(
                    `⚠️ Keine Config für ${category}`
                );

                return;
            }


            // ==========================================
            // NOCHMAL PRÜFEN
            // ==========================================

            const existingTicket =
                getOpenTicketByUser.get(
                    interaction.user.id
                );


            if (existingTicket) {

                await interaction.reply({

                    content:
                        `🚫 Du hast bereits ein offenes Ticket (#${existingTicket.id})!`,

                    flags:
                        MessageFlags.Ephemeral
                });

                return;
            }


            // ==========================================
            // ANTWORTEN
            // ==========================================

            const answers = [];


            for (const field of config.fields) {

                const value =
                    interaction.fields.getTextInputValue(
                        field.id
                    );


                answers.push([
                    field.label,
                    value
                ]);
            }


            // ==========================================
            // USER THREAD
            // ==========================================

            const thread =
                await getOrCreateUserThread(
                    interaction.user
                );


            // ==========================================
            // TICKET ERSTELLEN
            // ==========================================

            const ticketId =
                createNewTicket(
                    interaction.user.id,
                    thread.id,
                    category
                );


            // ==========================================
            // RACE CONDITION
            // ==========================================

            if (!ticketId) {

                const ticket =
                    getOpenTicketByUser.get(
                        interaction.user.id
                    );


                await interaction.reply({

                    content:
                        `🚫 Du hast bereits ein offenes Ticket (#${ticket?.id || '?'})!`,

                    flags:
                        MessageFlags.Ephemeral
                });

                return;
            }


            // ==========================================
            // TICKET CONTAINER
            // ==========================================

            const ticketContainer =
                createTicketContainer({

                    ticketId,
                    userTag:
                        interaction.user.tag,
                    category,
                    answers
                });


            // ==========================================
            // CLOSE BUTTON
            // ==========================================

            const closeButton =
                createCloseButton(
                    ticketId
                );


            // ==========================================
            // TICKET IN THREAD SENDEN
            // ==========================================

            await thread.send({

                components: [
                    ticketContainer,
                    closeButton
                ],

                flags:
                    MessageFlags.IsComponentsV2
            });


            // ==========================================
            // BESTÄTIGUNG
            // ==========================================

            await interaction.reply({

                flags:
                    MessageFlags.Ephemeral |
                    MessageFlags.IsComponentsV2,

                components: [

                    new ContainerBuilder()

                        .addTextDisplayComponents(

                            new TextDisplayBuilder()
                                .setContent(
                                    `## ✅ Ticket #${ticketId} erfolgreich erstellt!`
                                )
                        )

                        .addSeparatorComponents(

                            new SeparatorBuilder()
                                .setDivider(true)
                                .setSpacing(1)
                        )

                        .addTextDisplayComponents(

                            new TextDisplayBuilder()
                                .setContent(
                                    '> *|| Dein Anliegen wurde an den Support weitergeleitet. ||*'
                                )
                        )
                ]
            });


            console.log(
                `🎫 Ticket #${ticketId} erstellt | ${interaction.user.tag} | ${category}`
            );


        } catch (error) {

            console.error(
                '❌ Modal-Submit Fehler:',
                error
            );


            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({

                    content:
                        '❌ Beim Erstellen des Tickets ist ein Fehler aufgetreten.',

                    flags:
                        MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }
});


// ======================================================
// FEHLERHANDLING
// ======================================================

process.on('uncaughtException', error => {

    console.error(
        '❌ Uncaught Exception:',
        error
    );
});


process.on('unhandledRejection', error => {

    console.error(
        '❌ Unhandled Rejection:',
        error
    );
});


// ======================================================
// LOGIN
// ======================================================

client.login(
    process.env.TOKEN
);
