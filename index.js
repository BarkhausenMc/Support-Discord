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
    TextInputStyle,
    ChannelType
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
    partials: [Partials.Channel]
});


// ======================================================
// DATABASE
// ======================================================

const db = new Database('./tickets.db');

db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_id TEXT NOT NULL,
        thread_id TEXT NOT NULL UNIQUE,

        category TEXT NOT NULL,

        status TEXT NOT NULL DEFAULT 'open',

        created_at INTEGER NOT NULL,
        closed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_user
    ON tickets(user_id);

    CREATE INDEX IF NOT EXISTS idx_tickets_thread
    ON tickets(thread_id);

    CREATE INDEX IF NOT EXISTS idx_tickets_status
    ON tickets(status);
`);

console.log('💾 SQLite-Datenbank geladen.');


// ======================================================
// DATABASE FUNCTIONS
// ======================================================

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
    SET status = 'closed',
        closed_at = ?
    WHERE thread_id = ?
      AND status = 'open'
`);

const deleteTicket = db.prepare(`
    DELETE FROM tickets
    WHERE thread_id = ?
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
// TICKET AUS DATENBANK PRÜFEN
// ======================================================

function getUserTicket(userId) {
    return getOpenTicketByUser.get(userId);
}

function getThreadTicket(threadId) {
    return getOpenTicketByThread.get(threadId);
}


// ======================================================
// TICKET-MENÜ
// ======================================================

function createTicketMenu() {

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


    return [
        pictureContainer,
        categoryContainer,
        buttonContainer
    ];
}


// ======================================================
// READY
// ======================================================

client.once('clientReady', async () => {

    console.log('========================================');
    console.log('Bot ist Online ✅');
    console.log('========================================');

    try {

        const forum =
            await client.channels.fetch(
                process.env.CHANNEL_ID
            );


        if (!forum) {
            console.error('❌ Forum nicht gefunden!');
            return;
        }


        console.log(
            `Forum gefunden: ${forum.name} | Type: ${forum.type}`
        );


        // ==================================================
        // DB TICKETS ANZEIGEN
        // ==================================================

        const result = db.prepare(`
            SELECT COUNT(*) AS count
            FROM tickets
            WHERE status = 'open'
        `).get();


        console.log(
            `💾 Offene Tickets in DB: ${result.count}`
        );


        // ==================================================
        // OPTIONAL: THREADS AUFRÄUMEN
        // ==================================================

        const tickets =
            db.prepare(`
                SELECT *
                FROM tickets
                WHERE status = 'open'
            `).all();


        for (const ticket of tickets) {

            try {

                const thread =
                    await client.channels.fetch(
                        ticket.thread_id
                    );


                if (!thread) {

                    console.log(
                        `⚠️ Thread ${ticket.thread_id} nicht gefunden → DB-Eintrag wird gelöscht.`
                    );

                    deleteTicket.run(
                        ticket.thread_id
                    );

                    continue;
                }


                console.log(
                    `✅ Ticket aktiv: ${ticket.user_id} → ${ticket.thread_id}`
                );


            } catch (error) {

                console.log(
                    `⚠️ Thread ${ticket.thread_id} nicht erreichbar → DB-Eintrag wird gelöscht.`
                );

                deleteTicket.run(
                    ticket.thread_id
                );
            }
        }


        console.log('💾 Ticket-Datenbank geprüft.');


    } catch (error) {

        console.error(
            '❌ Fehler beim Start:',
            error
        );
    }
});


// ======================================================
// MESSAGE CREATE
// ======================================================

client.on('messageCreate', async (message) => {

    // Bots ignorieren
    if (message.author.bot) return;


    // ==================================================
    // DM → TICKET
    // ==================================================

    if (message.channel.type === ChannelType.DM) {

        try {

            console.log(
                `📨 DM von ${message.author.tag}`
            );


            // ==============================================
            // TICKET AUS DB HOLEN
            // ==============================================

            const ticket =
                getUserTicket(
                    message.author.id
                );


            // ==============================================
            // TICKET EXISTIERT
            // ==============================================

            if (ticket) {

                console.log(
                    `🎫 Ticket gefunden: ${ticket.thread_id}`
                );


                let thread;


                try {

                    thread =
                        await client.channels.fetch(
                            ticket.thread_id
                        );

                } catch (error) {

                    console.error(
                        `❌ Ticket-Thread konnte nicht geladen werden:`,
                        error.message
                    );


                    // DB-Eintrag entfernen,
                    // weil Thread nicht mehr existiert
                    deleteTicket.run(
                        ticket.thread_id
                    );


                    // User informieren
                    await message.channel.send(
                        '⚠️ Dein bisheriges Ticket konnte nicht mehr gefunden werden. Bitte erstelle ein neues Ticket.'
                    ).catch(() => {});


                    return;
                }


                if (!thread) {

                    await message.channel.send(
                        '⚠️ Dein Ticket konnte nicht gefunden werden.'
                    ).catch(() => {});

                    return;
                }


                // ==========================================
                // ARCHIVIERTES TICKET ÖFFNEN
                // ==========================================

                if (thread.archived) {

                    try {

                        await thread.setArchived(false);

                        console.log(
                            `📂 Ticket wieder geöffnet: ${thread.name}`
                        );

                    } catch (error) {

                        console.error(
                            '❌ Ticket konnte nicht geöffnet werden:',
                            error.message
                        );
                    }
                }


                // ==========================================
                // USER-NACHRICHT INS TICKET
                // ==========================================

                const content =
                    message.content?.trim() ||
                    '*Kein Text*';


                await thread.send(
                    `📨 **${message.author.tag}:** ${content}`
                );


                await message.react('📨')
                    .catch(() => {});


                console.log(
                    `📤 Nachricht von ${message.author.tag} → ${thread.name}`
                );


                return;
            }


            // ==================================================
            // KEIN TICKET
            // ==================================================

            console.log(
                `ℹ️ Kein offenes Ticket für ${message.author.tag}`
            );


            await message.channel.send({

                components:
                    createTicketMenu(),

                flags:
                    MessageFlags.IsComponentsV2

            });


            console.log(
                `📨 Ticket-Optionen gesendet an ${message.author.tag}`
            );


        } catch (error) {

            console.error(
                '❌ DM-Verarbeitungsfehler:',
                error
            );
        }


        return;
    }


    // ==================================================
    // TEAM → TICKET → USER
    // ==================================================

    if (!message.channel.isThread()) {
        return;
    }


    if (
        message.channel.parentId !==
        process.env.CHANNEL_ID
    ) {
        return;
    }


    try {

        console.log(
            `📮 Nachricht im Ticket: ${message.channel.name}`
        );


        // ==================================================
        // TICKET AUS DB
        // ==================================================

        const ticket =
            getThreadTicket(
                message.channel.id
            );


        if (!ticket) {

            console.log(
                `⚠️ Kein offenes Ticket für Thread ${message.channel.id}`
            );

            return;
        }


        console.log(
            `👤 User-ID: ${ticket.user_id}`
        );


        // ==================================================
        // USER HOLEN
        // ==================================================

        let user;


        try {

            user =
                await client.users.fetch(
                    ticket.user_id
                );

        } catch (error) {

            console.error(
                `❌ User konnte nicht geladen werden:`,
                error.message
            );

            return;
        }


        // ==================================================
        // NACHRICHT AN USER
        // ==================================================

        try {

            const content =
                message.content?.trim() ||
                '*Keine Textnachricht*';


            await user.send(
                content
            );


            await message.react('📨')
                .catch(() => {});


            console.log(
                `📤 DM erfolgreich an ${user.tag}`
            );


        } catch (error) {

            console.error(
                `❌ DM an ${user.tag} nicht möglich:`,
                error.message
            );


            await message.react('⚠️')
                .catch(() => {});


            // Wichtig:
            // Ticket bleibt in DB!
            // Wir löschen es NICHT.
        }
    } catch (error) {

        console.error(
            '❌ Team-Nachrichten-Fehler:',
            error
        );
    }
});


// ======================================================
// INTERACTIONS
// ======================================================

client.on('interactionCreate', async (interaction) => {


    // ==================================================
    // MODAL SUBMIT
    // ==================================================

    if (interaction.isModalSubmit()) {

        try {

            const categoryKey =
                interaction.customId.replace(
                    'ticket_modal_',
                    ''
                );


            const config =
                MODAL_CONFIG[categoryKey];


            if (!config) {

                console.warn(
                    `⚠️ Keine Modal-Config: ${categoryKey}`
                );

                return;
            }


            // ==========================================
            // PRÜFEN OB BEREITS TICKET EXISTIERT
            // ==========================================

            const existingTicket =
                getUserTicket(
                    interaction.user.id
                );


            if (existingTicket) {

                await interaction.reply({

                    content:
                        '🚫 Du hast bereits ein offenes Ticket!',

                    flags:
                        MessageFlags.Ephemeral

                });

                return;
            }


            // ==========================================
            // FORMULAR AUSLESEN
            // ==========================================

            const answers = {};


            for (const field of config.fields) {

                answers[field.id] =
                    interaction.fields.getTextInputValue(
                        field.id
                    );
            }


            // ==========================================
            // FORUM HOLEN
            // ==========================================

            const targetChannel =
                await client.channels.fetch(
                    process.env.CHANNEL_ID
                );


            if (!targetChannel) {

                throw new Error(
                    'Forum konnte nicht gefunden werden.'
                );
            }


            // ==========================================
            // TICKET CONTAINER
            // ==========================================

            const modalContainer =
                new ContainerBuilder()

                    .addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(
                                `## 🎫 Neues Ticket\n` +
                                `**Benutzer:** ${interaction.user.tag}\n` +
                                `**Kategorie:** ${config.modalTitle}`
                            )
                    )

                    .addSeparatorComponents(

                        new SeparatorBuilder()
                            .setDivider(true)
                            .setSpacing(1)
                    );


            // ==========================================
            // FORMULAR-ANTWORTEN
            // ==========================================

            let fieldContent = '';


            for (const field of config.fields) {

                const answer =
                    answers[field.id] ||
                    '*Keine Angabe*';


                fieldContent +=
                    `**${field.label}:** ${answer}\n`;
            }


            modalContainer.addTextDisplayComponents(

                new TextDisplayBuilder()
                    .setContent(
                        fieldContent
                    )
            );


            // ==========================================
            // THREAD ERSTELLEN
            // ==========================================

            const post =
                await targetChannel.threads.create({

                    name:
                        interaction.user.tag,

                    message: {

                        components: [
                            modalContainer
                        ],

                        flags:
                            MessageFlags.IsComponentsV2
                    }
                });


            // ==========================================
            // DB EINTRAG ERSTELLEN
            // ==========================================

            try {

                createTicket.run(

                    interaction.user.id,

                    post.id,

                    categoryKey,

                    Date.now()
                );


            } catch (dbError) {

                console.error(
                    '❌ DB-Fehler beim Ticket:',
                    dbError
                );


                // Falls DB-Eintrag nicht funktioniert,
                // Thread wieder löschen.
                await post.delete()
                    .catch(() => {});


                throw dbError;
            }


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
                                    '## ✅ Ticket erfolgreich erstellt!'
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
                                    '> *|| Du kannst nun hier im Chat mit dem Support kommunizieren. ||*'
                                )
                        )
                ]
            });


            console.log(
                `🎫 Ticket erstellt: ${interaction.user.tag}`
            );

            console.log(
                `   User: ${interaction.user.id}`
            );

            console.log(
                `   Thread: ${post.id}`
            );

            console.log(
                `   Kategorie: ${categoryKey}`
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


        return;
    }


    // ==================================================
    // BUTTON
    // ==================================================

    if (!interaction.isButton()) {
        return;
    }


    try {

        const category =
            interaction.customId;


        const config =
            MODAL_CONFIG[category];


        if (!config) {

            console.warn(
                `⚠️ Unbekannter Button: ${category}`
            );

            return;
        }


        // ==============================================
        // DB CHECK
        // ==============================================

        const existingTicket =
            getUserTicket(
                interaction.user.id
            );


        if (existingTicket) {

            await interaction.reply({

                content:
                    '🚫 Du hast bereits ein offenes Ticket!',

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


    } catch (error) {

        console.error(
            '❌ Button-Fehler:',
            error
        );


        if (
            !interaction.replied &&
            !interaction.deferred
        ) {

            await interaction.reply({

                content:
                    '❌ Da ist etwas schiefgelaufen.',

                flags:
                    MessageFlags.Ephemeral

            }).catch(() => {});
        }
    }
});


// ======================================================
// THREAD DELETE
// ======================================================

client.on('threadDelete', (thread) => {

    try {

        const ticket =
            getThreadTicket(
                thread.id
            );


        if (ticket) {

            deleteTicket.run(
                thread.id
            );


            console.log(
                `🗑️ Ticket aus DB entfernt: ${thread.id}`
            );
        }

    } catch (error) {

        console.error(
            '❌ Fehler beim Löschen des DB-Tickets:',
            error
        );
    }
});


// ======================================================
// GRACEFUL SHUTDOWN
// ======================================================

function shutdown() {

    console.log(
        '🛑 Bot wird beendet...'
    );


    try {

        db.close();

        console.log(
            '💾 Datenbank geschlossen.'
        );

    } catch (error) {

        console.error(
            '❌ Fehler beim Schließen der DB:',
            error
        );
    }


    process.exit(0);
}


process.on(
    'SIGINT',
    shutdown
);

process.on(
    'SIGTERM',
    shutdown
);


// ======================================================
// LOGIN
// ======================================================

client.login(
    process.env.TOKEN
);
