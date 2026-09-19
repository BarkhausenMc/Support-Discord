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
                label: 'Wie lautet dein Anliegen?',
                style: 'SHORT',
                placeholder: 'z.B. Bot antwortet nicht',
                required: true,
                maxLength: 100
            },
            {
                id: 'problem_since_when',
                label: 'Seit wann besteht das Problem?',
                style: 'SHORT',
                placeholder: 'z.B. seit heute Morgen',
                required: false,
                maxLength: 100
            },
            {
                id: 'problem_description',
                label: 'Beschreibe das Problem genau',
                style: 'PARAGRAPH',
                placeholder: 'Was hast du versucht? Welche Fehlermeldungen kamen?',
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
                label: 'Wie heißt dein Discord Server/Clan/Twitch usw. ?',
                style: 'SHORT',
                placeholder: 'z.B. https://discord.com/invite/yayk',
                required: true,
                maxLength: 100
            },
            {
                id: 'cooperation_why',
                label: 'Wieso möchtest du mit uns eine Kooperation eingehen? ',
                style: 'PARAGRAPH',
                // placeholder: '',
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
                label: 'Für welche Position möchteste du dich Bewerben?',
                style: 'SHORT',
                placeholder: 'z.B. Moderator, Helper, Admin, Developer',
                required: true,
                maxLength: 100
            },
            {
                id: 'staff_apply_why',
                label: 'Wieso und warum möchtest du dich als Staff bewerben?',
                style: 'PARAGRAPH',
                // placeholder: '',
                required: true,
                maxLength: 1000
            },
            {
                id: 'staff_apply_personal',
                label: 'Wieso sollten wir genau dich als (deine ausgewählte Position) nehmen?',
                style: 'PARAGRAPH',
                // placeholder: '',
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
        // CHECK: HAT DER USER SCHON EIN OFFENES TICKET?
        const existingPostId = userIdToPostId.get(message.author.id);

        if (existingPostId) {
            // >>> FALL A: TICKET EXISTIERT SCHON >>>
            let post;
            try {
                post = await client.channels.fetch(existingPostId);
            } catch (err) {
                // Post existiert nicht mehr (gelöscht) → aufräumen
                userIdToPostId.delete(message.author.id);
                postIdToUserId.delete(existingPostId);
            }

            if (post) {
                // Archiviert? Dann wieder öffnen
                if (post.archived) {
                    await post.setArchived(false);
                }

                // Nachricht in den Post weiterleiten
                await post.send(`📨 **${message.author.tag}:** ${message.content || '*Kein Text*'}`);
                await message.react('📬');
                console.log(`📤 Ticket-Nachricht von ${message.author.tag}`);
                return; // WICHTIG: Hier stoppen, Button-Menü nicht mehr senden!
            }
        }
            const MediaGalleryBuilder = new (require('discord.js').MediaGalleryBuilder)();
            console.log('MediaGalleryBuilder methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(MediaGalleryBuilder)));
            
            const pictureContainer = new ContainerBuilder()
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder()
                        .addItem(
                            new MediaGalleryItemBuilder()
                                .setURL('https://minigames.flo.asksven.io/images/bot/Support-Discord-Bot.png')
                        )
                );

            const categoryContainer = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent('# `📩` Ticket Erstellen\n> *||Drücke den Button, der zu deinem Anliegen passt, um ein Ticket zu erstellen.||*')
            );

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
                flags: MessageFlags.IsComponentsV2
            });

        console.log(`📨 Ticket-Options gesendet an ${message.author.tag}`);

    } catch (error) {
        console.error('❌ Fehler:', error.message);
    }
});

client.on('interactionCreate', async (interaction) => {
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

client.on('modalSubmit', async (modalInteraction) => {
    try {
        console.log('📝 Modal eingegangen:', modalInteraction.customId);

        // === 1. KATEGORIE AUS DER MODAL-ID EXTRAHIEREN ===
        const categoryKey = modalInteraction.customId.replace('ticket_modal_', '');
        const config = MODAL_CONFIG[categoryKey];
        if (!config) {
            console.warn(`⚠️ Unbekannte Modal-ID: ${modalInteraction.customId}`);
            return;
        }

        // === 2. ALLE ANTWORTEN EINSAMMELN ===
        const answers = {};
        for (const field of config.fields) {
            answers[field.id] = modalInteraction.fields.getTextInputValue(field.id);
        }

        // === 3. DOPPEL-CHECK: DOCH SCHON EIN TICKET OFFEN? ===
        const existingPostId = userIdToPostId.get(modalInteraction.user.id);
        if (existingPostId) {
            await modalInteraction.reply({
                content: '🚫 Du hast bereits ein offenes Ticket!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // === 4. FORUM-KANAL HOLEN ===
        const targetChannel = await client.channels.fetch(process.env.CHANNEL_ID);

        // === 5. START-NACHRICHT AUS DEN ANTWORTEN BAUEN ===
        let ticketText = `🎫 **Neues Ticket von ${modalInteraction.user.tag}** (ID: ${modalInteraction.user.id})\nKategorie: **${config.modalTitle}**\n`;
        for (const field of config.fields) {
            ticketText += `\n**${field.label}**\n${answers[field.id]}`;
        }

        // Erste Frage = Betreff = Post-Titel
        const subject = answers[config.fields[0].id];

        // === 6. TICKET-POST ERSTELLEN ===
        const post = await targetChannel.threads.create({
            name: `🎫 ${subject}`,
            message: { content: ticketText },
            reason: `Ticket von ${modalInteraction.user.tag}`
        });

        // === 7. MAPS PFLEGEN (Persistenz!) ===
        userIdToPostId.set(modalInteraction.user.id, post.id);
        postIdToUserId.set(post.id, modalInteraction.user.id);

        // === 8. TEAM-ROLLE IN DEN POST ADDEN ===
        const role = await targetChannel.guild.roles.fetch(process.env.ROLE_ID);
        if (role) {
            await Promise.all(
                [...role.members.values()].map(member =>
                    post.members.add(member.id).catch(() => {})
                )
            );
        }

        // === 9. BESTÄTIGUNG AN DEN USER ===
        await modalInteraction.reply({
            content: `✅ Ticket erstellt!\n📎 [Zum Ticket](${post.url})`,
            flags: MessageFlags.Ephemeral
        });

        console.log(`🎫 Ticket erstellt: ${modalInteraction.user.tag} | ${subject}`);

    } catch (error) {
        console.error('❌ Modal-Fehler:', error);
        if (!modalInteraction.replied) {
            await modalInteraction.reply({
                content: '❌ Da ist etwas schiefgelaufen.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);