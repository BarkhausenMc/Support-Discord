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
const dmMessageIds = new Map(); 



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
    if (message.channel.type !== 1) return; // Nur DMs

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
                if (post.archived) await post.setArchived(false);
                await post.send(`📨 **${message.author.tag}:** ${message.content || '*Kein Text*'}`);
                await message.react('📨');
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

        // ÄNDERUNG: Wir speichern die gesendete Nachricht-ID, um sie später löschen zu können
        const sentMessage = await message.channel.send({
            components: [pictureContainer, categoryContainer, buttonContainer],
            flags: MessageFlags.IsComponentsV2
        });
        
        dmMessageIds.set(message.author.id, sentMessage.id);
        console.log(`📨 Ticket-Options gesendet an ${message.author.tag} (ID: ${sentMessage.id})`);

    } catch (error) {
        console.error('❌ Fehler:', error.message);
    }
});

client.on('interactionCreate', async (interaction) => {
    // ===== TEIL 1: MODAL WURDE ABGESCHICKT =====
    if (interaction.isModalSubmit()) {
        try {
            const categoryKey = interaction.customId.replace('ticket_modal_', '');
            const config = MODAL_CONFIG[categoryKey];
            if (!config) {
                console.warn('⚠️ Keine Config für:', categoryKey);
                return;
            }

            const answers = {};
            for (const field of config.fields) {
                answers[field.id] = interaction.fields.getTextInputValue(field.id);
            }

            if (userIdToPostId.has(interaction.user.id)) {
                await interaction.reply({
                    content: '🚫 Du hast bereits ein offenes Ticket!',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // 1. ALTE DM-NACHRICHT LÖSCHEN (Punkt 1 deiner Wünsche)
            const oldDmMessageId = dmMessageIds.get(interaction.user.id);
            if (oldDmMessageId) {
                try {
                    // Hole die DM-Nachricht und lösche sie
                    const channel = await interaction.user.createDM();
                    const msg = await channel.messages.fetch(oldDmMessageId);
                    await msg.delete();
                    console.log('✅ Alte Ticket-Buttons gelöscht.');
                } catch (err) {
                    console.warn('⚠️ Konnte alte DM-Nachricht nicht löschen (evtl. schon gelöscht?):', err.message);
                }
                // ID aus Map entfernen
                dmMessageIds.delete(interaction.user.id);
            }

            const targetChannel = await client.channels.fetch(process.env.CHANNEL_ID);

            // 2. NEUER, ANPASSBARER CONTAINER FÜR DAS TICKET (Punkt 2 deiner Wünsche)
            const modalContainer = new ContainerBuilder()
                // Header Bereich
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# 🎫 Neues Ticket eröffnet')
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                // User Info Block
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**Von:** ${interaction.user.tag}\n` +
                        `**Kategorie:** ${config.modalTitle}`
                    ).setColor('#6d4aff') // Optional: Farbe für den Text (wird je nach Client unterstützt)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Medium)
                );

            // Dynamische Felder hinzufügen - Hier ist die Anpassbarkeit!
            for (const field of config.fields) {
                // Wir fügen ein Text-Element für das Label (fett) und eines für den Inhalt hinzu
                // Oder kombinieren sie, wie dir lieber ist. Hier eine saubere Variante:
                
                modalContainer.addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`**${field.label}**`)
                        .setColor('#aaaaaa') // Leicht grauer für Labels
                );
                
                modalContainer.addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(answers[field.id])
                );

                // Optional: Kleiner Abstand zwischen den Fragen
                if (field.id !== config.fields[config.fields.length - 1].id) {
                     modalContainer.addSeparatorComponents(
                        new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
                    );
                }
            }

            // Post erstellen
            const post = await targetChannel.threads.create({
                name: `${interaction.user.tag}`,
                message: {
                    components: [modalContainer],
                    flags: MessageFlags.IsComponentsV2
                },
            });

            userIdToPostId.set(interaction.user.id, post.id);
            postIdToUserId.set(post.id, interaction.user.id);

            // Bestätigungsnachricht an den User 
            await interaction.reply({
                flags:MessageFlags.IsComponentsV2,
                components: [
                    new ContainerBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent('## ✅ Ticket erfolgreich erstellt!')
                                .setColor('#00ff00')
                        )
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent('> *||Du wirst nun im Thread benachrichtigt, sobald das Team antwortet.||*')
                        )
                ]
            });

            console.log(`🎫 Ticket erstellt: ${interaction.user.tag} | ${answers[config.fields[0].id]}`);

        } catch (error) {
            console.error('❌ Modal-Submit Fehler:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Da ist etwas schiefgelaufen.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
        return;
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