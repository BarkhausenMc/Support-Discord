const { Client,
        GatewayIntentBits,
        Partials,
        ActionRowBuilder, 
        ButtonBuilder, 
        ButtonStyle, 
        Embed, 
        EmbedBuilder, 
        ContainerBuilder, 
        TextDisplayBuilder, 
        SeparatorBuilder, 
        SeparatorSpacingSize, 
        MessageFlags, 
        MediaGalleryBuilder, 
        MediaGalleryItemBuilder, 
        AttachmentBuilder,
        ModalBuilder, 
        TextInputBuilder, 
        TextInputStyle  } = require('discord.js');
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

const userIdToPostId = new Map(); 
const postIdToUserId = new Map(); 


const MODAL_CONFIG = {
    generel_support: {
        modalTitle: '❓ Generell Support',
        fields: [
            {
                id: 'problem',
                label: 'Anliegen',  // OK (12 Zeichen)
                style: 'SHORT',
                placeholder: 'z.B. Bot antwortet nicht',
                required: true,
                maxLength: 100
            },
            {
                id: 'problem_since_when',
                label: 'Seit wann?',  // OK (12 Zeichen)
                style: 'SHORT',
                placeholder: 'z.B. seit heute Morgen',
                required: false,
                maxLength: 100
            },
            {
                id: 'problem_description',
                label: 'Details',  // OK (7 Zeichen)
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
                label: 'Dein Name/Server',  // ✅ 20 Zeichen (<45)
                style: 'SHORT',
                placeholder: 'Discord-Invite/Website',
                required: true,
                maxLength: 100
            },
            {
                id: 'cooperation_why',
                label: 'Warum Kooperation?',  // ✅ 19 Zeichen (<45)
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
                label: 'Position',  // ✅ 8 Zeichen (<45)
                style: 'SHORT',
                placeholder: 'z.B. Moderator',
                required: true,
                maxLength: 100
            },
            {
                id: 'staff_apply_why',
                label: 'Warum als Staff?',  // ✅ 17 Zeichen (<45)
                style: 'PARAGRAPH',
                placeholder: 'Deine Gründe',
                required: true,
                maxLength: 1000
            },
            {
                id: 'staff_apply_personal',
                label: 'Warum dich?',  // ✅ 12 Zeichen (<45)
                style: 'PARAGRAPH',
                placeholder: 'Deine Stärken',
                required: true,
                maxLength: 1000
            }
        ]
    }
};

client.on('clientReady', async () => {
    console.log('Bot ist Online ✅');

    try {
        const forum = await client.channels.fetch(process.env.CHANNEL_ID);
        console.log('Forum gefunden:', forum ? forum.name : 'NICHT GEFUNDEN', '| Type:', forum?.type);

        const active = await forum.threads.fetchActive();
        console.log('Aktive Posts:', active.threads.size);

        const archived = await forum.threads.fetchArchived().catch(err => {
            console.log('Archiv-Fehler:', err.message);
            return { threads: new Map() };
        });
        console.log('Archivierte Posts:', archived.threads.size);

        const allPosts = [...active.threads.values(), ...archived.threads.values()];
        console.log('TOTAL Posts gefunden:', allPosts.length);

        for (const post of allPosts) {
            const starter = await post.fetchStarterMessage().catch(err => {
                console.log(`⚠️ Post "${post.name}" Starter-Fehler:`, err.message);
                return null;
            });
            if (!starter) continue;

            console.log(`📄 Post "${post.name}" Starter:`, starter.content.slice(0, 100));

            const match = starter.content.match(/\(ID: (\d+)\)/);
            if (match) {
                userIdToPostId.set(match[1], post.id);
                postIdToUserId.set(post.id, match[1]);
            } else {
                console.log(`⚠️ Post "${post.name}" hat KEIN (ID: ...) im Starter!`);
            }
        }

        console.log(`📂 ${userIdToPostId.size} Posts wiederhergestellt`);

    } catch (error) {
        console.error('❌ Fehler beim Wiederherstellen:', error.message);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.type !== 1) return; 

    try {

        const existingPostId = userIdToPostId.get(message.author.id);

        if (existingPostId) {

            let post;
            try {
                post = await client.channels.fetch(existingPostId);
            } catch (err) {

                userIdToPostId.delete(message.author.id);
                postIdToUserId.delete(existingPostId);
            }

            if (post) {

                if (post.archived) {
                    await post.setArchived(false);
                }


                await post.send(`📨 **${message.author.tag}:** ${message.content || '*Kein Text*'}`);
                await message.react('📨');
                console.log(`📤 Ticket-Nachricht von ${message.author.tag}`);
                return;
            }
        }
                // BILD CONTAINER
                const pictureContainer = new ContainerBuilder()
                    .addMediaGalleryComponents(
                        new MediaGalleryBuilder()
                            .addItems([
                                new MediaGalleryItemBuilder()
                                    .setURL('https://minigames.flo.asksven.io/images/bot/logosdb.png')
                            ])
                    );

                // TEXT CONTAINER
                const categoryContainer = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent('# `📩` Ticket Erstellen\n> *||Drücke den Button, der zu deinem Anliegen passt, um ein Ticket zu erstellen.||*')
                    );

                // BUTTON CONTAINER
                const buttonContainer = new ContainerBuilder()
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

                await message.channel.send({
                    components: [pictureContainer, categoryContainer, buttonContainer],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 
                });

        console.log(`📨 Ticket-Options gesendet an ${message.author.tag}`);

    } catch (error) {
        console.error('❌ Fehler:', error.message);
    }

});

// ===== TEAM-ANTWORT IM POST → DM AN USER =====
client.on('messageCreate', async (message) => {
    if (!message.channel.isThread()) return;
    if (message.author.bot) return;
    if (message.channel.parentId !== process.env.CHANNEL_ID) return;
    if (message.id === message.channel.id) return; 
    try {
        console.log('📮 Team-Antwort in Post:', message.channel.name);

        let userId = postIdToUserId.get(message.channel.id);

        if (!userId) {
            console.log('⚠️ Map leer, suche ID aus Start-Nachricht...');
            const starter = await message.channel.fetchStarterMessage();
            const match = starter.content.match(/\(ID: (\d+)\)/);
            if (!match) {
                console.error('❌ Keine User-ID in Start-Nachricht gefunden!');
                return;
            }
            userId = match[1];
            postIdToUserId.set(message.channel.id, userId); 
        }

        console.log('👤 User-ID gefunden:', userId);

        // 3. DM AN DEN USER SENDEN
        const user = await client.users.fetch(userId);
        await user.send(`${message.content}`);

        // 4. BESTÄTIGUNG IM POST SETZEN
        await message.react('📨');

        console.log(`📤 DM gesendet an ${user.tag}`);

    } catch (error) {
        console.error('❌ DM-Fehler:', error.message);
        await message.react('⚠️');
    }
});

client.on('interactionCreate', async (interaction) => {
     // ===== TEIL 1: MODAL WURDE ABGESCHICKT =====
    if (interaction.isModalSubmit()) {
        try {
            console.log('📝 Modal-Submit gekommen! CustomID:', interaction.customId);

            // Kategorie aus der Modal-ID holen
            const categoryKey = interaction.customId.replace('ticket_modal_', '');
            const config = MODAL_CONFIG[categoryKey];
            if (!config) {
                console.warn('⚠️ Keine Config für:', categoryKey);
                return;
            }

            // Alle Antworten einsammeln
            const answers = {};
            for (const field of config.fields) {
                answers[field.id] = interaction.fields.getTextInputValue(field.id);
            }

            // Doppel-Check: schon ein Ticket offen?
            if (userIdToPostId.has(interaction.user.id)) {
                await interaction.reply({
                    content: '🚫 Du hast bereits ein offenes Ticket!',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Forum-Kanal holen
            const targetChannel = await client.channels.fetch(process.env.CHANNEL_ID);

            // Ticket-Text zusammenbauen
            let ticketText = `🎫 **Neues Ticket von ${interaction.user.tag}** (ID: ${interaction.user.id})\n`;
            ticketText += `Kategorie: **${config.modalTitle}**\n`;
            for (const field of config.fields) {
                ticketText += `\n**${field.label}**\n${answers[field.id]}`;
            }

            // Betreff = erstes Feld
            const subject = answers[config.fields[0].id];

            // Post erstellen
            const post = await targetChannel.threads.create({
                name: `🎫 ${subject}`,
                message: { content: ticketText },
                reason: `Ticket von ${interaction.user.tag}`
            });

            // Maps pflegen
            userIdToPostId.set(interaction.user.id, post.id);
            postIdToUserId.set(post.id, interaction.user.id);

            // Bestätigung an User
            await interaction.reply({
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                components: [
                    new ContainerBuilder()
                        .setAccentColor(0x57F287)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(
                                    '## ✅ Ticket erfolgreich erstellt!'
                                )
                        )
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(
                                    '> *|| Du kannst nun hier im Chat mit dem Support kommunizieren. ||*'
                                )
                        )
                ]
            });


            console.log(`🎫 Ticket erstellt: ${interaction.user.tag} | ${subject}`);

        } catch (error) {
            console.error('❌ Modal-Submit Fehler:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Da ist etwas schiefgelaufen.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
        return; // Wichtig: danach nicht mehr in die Button-Logik fallen
    }

    
    if (!interaction.isButton()) return;

    try {
        // === 1. TICKET-SCHON-OFFEN-CHECK ===
        const existingPostId = userIdToPostId.get(interaction.user.id);

        if (existingPostId) {
            await interaction.reply({
                content: '🚫 Du hast bereits ein offenes Ticket!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // === 2. CONFIG FÜR DIESE KATEGORIE HOLEN ===
        const category = interaction.customId;
        const config = MODAL_CONFIG[category];
        if (!config) {
            console.warn(`⚠️ Keine Config für Button: ${category}`);
            return;
        }

        // === 3. MODAL DYNAMISCH BAUEN ===
        const modal = new ModalBuilder()
            .setCustomId(`ticket_modal_${category}`)
            .setTitle(config.modalTitle);

        for (const field of config.fields) {
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(field.id)
                        .setLabel(field.label)
                        .setStyle(field.style === 'SHORT' ? TextInputStyle.Short : TextInputStyle.Paragraph)
                        .setPlaceholder(field.placeholder)
                        .setRequired(field.required)
                        .setMaxLength(field.maxLength)
                )
            );
        }

        // === 4. MODAL ANZEIGEN ===
        await interaction.showModal(modal);

    } catch (error) {
        console.error('❌ Button-Fehler:', error.message);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ Da ist etwas schiefgelaufen.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);