const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
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


// ======================================================
// TICKET MAPS
// ======================================================

const userIdToPostId = new Map();
const postIdToUserId = new Map();


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
// USER-ID AUS COMPONENTS V2 AUSLESEN
// ======================================================

function findUserIdInMessage(message) {

    // Normale Nachricht
    if (message.content) {

        const match = message.content.match(/\(ID:\s*(\d+)\)/);

        if (match) {
            return match[1];
        }
    }


    // Components V2
    if (message.components && message.components.length > 0) {

        for (const component of message.components) {

            const userId = findUserIdInComponent(component);

            if (userId) {
                return userId;
            }
        }
    }

    return null;
}


function findUserIdInComponent(component) {

    // TextDisplay
    if (
        component.type === 10 &&
        component.content
    ) {

        const match = component.content.match(/\(ID:\s*(\d+)\)/);

        if (match) {
            return match[1];
        }
    }


    // Verschachtelte Components
    if (
        component.components &&
        component.components.length > 0
    ) {

        for (const child of component.components) {

            const userId = findUserIdInComponent(child);

            if (userId) {
                return userId;
            }
        }
    }

    return null;
}


// ======================================================
// TICKETS NACH BOT-RESTART WIEDERHERSTELLEN
// ======================================================

client.on('clientReady', async () => {

    console.log('Bot ist Online ✅');

    try {

        const forum = await client.channels.fetch(
            process.env.CHANNEL_ID
        );

        console.log(
            'Forum gefunden:',
            forum ? forum.name : 'NICHT GEFUNDEN',
            '| Type:',
            forum?.type
        );


        // ==============================================
        // AKTIVE THREADS
        // ==============================================

        const active = await forum.threads.fetchActive();

        console.log(
            'Aktive Posts:',
            active.threads.size
        );


        // ==============================================
        // ARCHIVIERTE THREADS
        // ==============================================

        const archived = await forum.threads.fetchArchived()
            .catch(error => {

                console.log(
                    'Archiv-Fehler:',
                    error.message
                );

                return {
                    threads: new Map()
                };
            });


        console.log(
            'Archivierte Posts:',
            archived.threads.size
        );


        // ==============================================
        // ALLE THREADS
        // ==============================================

        const allPosts = [
            ...active.threads.values(),
            ...archived.threads.values()
        ];


        console.log(
            'TOTAL Posts gefunden:',
            allPosts.length
        );


        // ==============================================
        // TICKETS WIEDERHERSTELLEN
        // ==============================================

        for (const post of allPosts) {

            let userId = null;


            // ------------------------------------------
            // 1. Versuch: Thread Owner
            // ------------------------------------------

            if (post.ownerId) {

                userId = post.ownerId;

                console.log(
                    `👤 Owner-ID für "${post.name}":`,
                    userId
                );
            }


            // ------------------------------------------
            // 2. Versuch: Starter Message
            // ------------------------------------------

            if (!userId) {

                const starter =
                    await post.fetchStarterMessage()
                        .catch(error => {

                            console.log(
                                `⚠️ Post "${post.name}" Starter-Fehler:`,
                                error.message
                            );

                            return null;
                        });


                if (starter) {

                    userId =
                        findUserIdInMessage(starter);


                    if (userId) {

                        console.log(
                            `🔎 ID aus Starter gefunden: ${userId}`
                        );
                    }
                }
            }


            // ------------------------------------------
            // Ticket speichern
            // ------------------------------------------

            if (userId) {

                userIdToPostId.set(
                    userId,
                    post.id
                );

                postIdToUserId.set(
                    post.id,
                    userId
                );


                console.log(
                    `✅ Ticket wiederhergestellt: ${userId} → ${post.id}`
                );

            } else {

                console.log(
                    `⚠️ Post "${post.name}" konnte keinem User zugeordnet werden!`
                );
            }
        }


        console.log(
            `📂 ${userIdToPostId.size} Tickets wiederhergestellt`
        );


    } catch (error) {

        console.error(
            '❌ Fehler beim Wiederherstellen:',
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

        // ==============================================
        // EXISTIERENDES TICKET SUCHEN
        // ==============================================

        const existingPostId =
            userIdToPostId.get(
                message.author.id
            );


        if (existingPostId) {

            let post = null;


            try {

                post = await client.channels.fetch(
                    existingPostId
                );

            } catch (error) {

                console.log(
                    '⚠️ Ticket nicht mehr erreichbar:',
                    error.message
                );


                userIdToPostId.delete(
                    message.author.id
                );

                postIdToUserId.delete(
                    existingPostId
                );
            }


            if (post) {

                // ======================================
                // ARCHIVIERTES TICKET ÖFFNEN
                // ======================================

                if (post.archived) {

                    await post.setArchived(false);

                    console.log(
                        `📂 Ticket wieder geöffnet: ${post.name}`
                    );
                }


                // ======================================
                // NACHRICHT AN TICKET
                // ======================================

                await post.send(
                    `📨 **${message.author.tag}:** ${
                        message.content || '*Kein Text*'
                    }`
                );


                await message.react('📨');


                console.log(
                    `📤 Ticket-Nachricht von ${message.author.tag}`
                );


                return;
            }
        }


        // ==================================================
        // KEIN TICKET → TICKET-AUSWAHL SENDEN
        // ==================================================


        // ==============================================
        // BILD CONTAINER
        // ==============================================

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


        // ==============================================
        // TEXT CONTAINER
        // ==============================================

        const categoryContainer =
            new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            '# `📩` Ticket Erstellen\n' +
                            '> *||Drücke den Button, der zu deinem Anliegen passt, um ein Ticket zu erstellen.||*'
                        )
                );


        // ==============================================
        // BUTTON CONTAINER
        // ==============================================

        const buttonContainer =
            new ContainerBuilder()
                .addActionRowComponents(

                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()
                                .setCustomId(
                                    'generel_support'
                                )
                                .setLabel(
                                    '❓ Generell Support'
                                )
                                .setStyle(
                                    ButtonStyle.Secondary
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    'cooperation'
                                )
                                .setLabel(
                                    '🤝 Kooperation'
                                )
                                .setStyle(
                                    ButtonStyle.Secondary
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    'staff_apply'
                                )
                                .setLabel(
                                    '📝 Staff Bewerbung'
                                )
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                        )
                );


        await message.channel.send({

            components: [
                pictureContainer,
                categoryContainer,
                buttonContainer
            ],

            flags:
                MessageFlags.IsComponentsV2
        });


        console.log(
            `📨 Ticket-Options gesendet an ${message.author.tag}`
        );


    } catch (error) {

        console.error(
            '❌ Fehler:',
            error
        );
    }

});


// ======================================================
// TEAM → TICKET → USER DM
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


    // Starter Message ignorieren
    if (
        message.id ===
        message.channel.id
    ) {
        return;
    }


    try {

        console.log(
            '📮 Team-Antwort in Post:',
            message.channel.name
        );


        // ==============================================
        // USER-ID AUS MAP
        // ==============================================

        let userId =
            postIdToUserId.get(
                message.channel.id
            );


        // ==============================================
        // FALLBACK: STARTER MESSAGE
        // ==============================================

        if (!userId) {

            console.log(
                '⚠️ Map leer, suche ID aus Start-Nachricht...'
            );


            const starter =
                await message.channel.fetchStarterMessage()
                    .catch(() => null);


            if (starter) {

                userId =
                    findUserIdInMessage(starter);
            }


            if (!userId) {

                console.error(
                    '❌ Keine User-ID in Start-Nachricht gefunden!'
                );

                return;
            }


            postIdToUserId.set(
                message.channel.id,
                userId
            );

            userIdToPostId.set(
                userId,
                message.channel.id
            );
        }


        console.log(
            '👤 User-ID gefunden:',
            userId
        );


        // ==============================================
        // USER HOLEN
        // ==============================================

        const user =
            await client.users.fetch(
                userId
            );


        // ==============================================
        // DM SENDEN
        // ==============================================

        await user.send(
            message.content ||
            '*Keine Textnachricht*'
        );


        // ==============================================
        // BESTÄTIGUNG
        // ==============================================

        await message.react('📨');


        console.log(
            `📤 DM gesendet an ${user.tag}`
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
                    '⚠️ Keine Config für:',
                    categoryKey
                );

                return;
            }


            // ==========================================
            // ANTWORTEN AUSLESEN
            // ==========================================

            const answers = {};


            for (const field of config.fields) {

                answers[field.id] =
                    interaction.fields.getTextInputValue(
                        field.id
                    );
            }


            // ==========================================
            // TICKET-CHECK
            // ==========================================

            if (
                userIdToPostId.has(
                    interaction.user.id
                )
            ) {

                await interaction.reply({

                    content:
                        '🚫 Du hast bereits ein offenes Ticket!',

                    flags:
                        MessageFlags.Ephemeral
                });

                return;
            }


            // ==========================================
            // FORUM HOLEN
            // ==========================================

            const targetChannel =
                await client.channels.fetch(
                    process.env.CHANNEL_ID
                );


            // ==========================================
            // USER-ID
            // ==========================================

            const hiddenID =
                `(ID: ${interaction.user.id})`;


            // ==========================================
            // TICKET CONTAINER
            // ==========================================

            const modalContainer =
                new ContainerBuilder()

                    .addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(
                                `||${hiddenID}||`
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
                                '# 🎫 Neues Ticket'
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

                fieldContent +=
                    `\n**${field.label}:** ${answers[field.id]}\n`;
            }


            modalContainer.addTextDisplayComponents(

                new TextDisplayBuilder()
                    .setContent(
                        fieldContent.trim()
                    )
            );


            // ==========================================
            // THREAD ERSTELLEN
            // ==========================================

            const post =
                await targetChannel.threads.create({

                    name:
                        `${interaction.user.tag}`,

                    message: {

                        components: [
                            modalContainer
                        ],

                        flags:
                            MessageFlags.IsComponentsV2
                    }
                });


            // ==========================================
            // MAPS SPEICHERN
            // ==========================================

            userIdToPostId.set(
                interaction.user.id,
                post.id
            );

            postIdToUserId.set(
                post.id,
                interaction.user.id
            );


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

                                    '> *|| Du kannst nun hier im Chat mit dem Support kommunizieren. ||*\n' +
                                    `> ||${hiddenID}||`
                                )
                        )
                ]
            });


            console.log(
                `🎫 Ticket erstellt: ${interaction.user.tag} | ${hiddenID}`
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
                        '❌ Da ist etwas schiefgelaufen.',

                    flags:
                        MessageFlags.Ephemeral

                }).catch(() => {});
            }
        }


        return;
    }


    // ==================================================
    // NUR BUTTONS
    // ==================================================

    if (!interaction.isButton()) {
        return;
    }


    try {

        // ==============================================
        // EXISTIERENDES TICKET CHECKEN
        // ==============================================

        const existingPostId =
            userIdToPostId.get(
                interaction.user.id
            );


        if (existingPostId) {

            await interaction.reply({

                content:
                    '🚫 Du hast bereits ein offenes Ticket!',

                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }


        // ==============================================
        // KATEGORIE
        // ==============================================

        const category =
            interaction.customId;


        const config =
            MODAL_CONFIG[category];


        if (!config) {

            console.warn(
                `⚠️ Keine Config für Button: ${category}`
            );

            return;
        }


        // ==============================================
        // MODAL ERSTELLEN
        // ==============================================

        const modal =
            new ModalBuilder()

                .setCustomId(
                    `ticket_modal_${category}`
                )

                .setTitle(
                    config.modalTitle
                );


        // ==============================================
        // INPUT-FELDER
        // ==============================================

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


        // ==============================================
        // MODAL ANZEIGEN
        // ==============================================

        await interaction.showModal(
            modal
        );


        // ==============================================
        // ALTE BUTTON-NACHRICHT LÖSCHEN
        // ==============================================

        try {

            const existingMessage =
                await interaction.channel.messages
                    .fetch(interaction.message.id)
                    .catch(() => null);


            if (existingMessage) {

                await existingMessage
                    .delete()
                    .catch(() => {});
            }

        } catch (deleteError) {

            console.warn(
                '⚠️ Konnte alte Nachricht nicht löschen:',
                deleteError.message
            );
        }


    } catch (error) {

        console.error(
            '❌ Button-Fehler:',
            error.message
        );


        if (!interaction.replied) {

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
// LOGIN
// ======================================================

client.login(
    process.env.TOKEN
);
