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
// const banner = new AttachmentBuilder('');

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

        // const pictureContainer = new ContainerBuilder()
        //     .addMediaGalleryComponents(
        //         new MediaGalleryBuilder()
        //             .addMediaGalleryItems(
        //                 new MediaGalleryItemBuilder()
        //                     .setURL('')  
        //             )
        //     );

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
                components: [/*pictureContainer,*/ categoryContainer, buttonContainer],
                // files: [banner],
                flags: MessageFlags.IsComponentsV2
            });

        console.log(`📨 Ticket-Options gesendet an ${message.author.tag}`);

    } catch (error) {
        console.error('❌ Fehler:', error.message);
    }
});

client.on('modalSubmit', async (modalInteraction) => {
    try {
        // Kategorie aus der Modal-ID extrahieren (ticket_modal_ticket_support → SUPPORT)
        const category = modalInteraction.customId.replace('ticket_modal_ticket_', '').toUpperCase();

        // Eingaben aus den Feldern holen
        const subject = modalInteraction.fields.getTextInputValue('ticket_subject');
        const description = modalInteraction.fields.getTextInputValue('ticket_description');

        // Forum-Kanal holen
        const targetChannel = await client.channels.fetch(process.env.CHANNEL_ID);

        // Doppel-Check: doch schon ein Ticket offen? (User könnte 2 Tabs offen haben)
        const existingPostId = userIdToPostId.get(modalInteraction.user.id);
        if (existingPostId) {
            await modalInteraction.reply({
                content: '🚫 Du hast bereits ein offenes Ticket!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Ticket-Post erstellen – mit Betreff im Titel und ID fürs Backup!
        const post = await targetChannel.threads.create({
            name: `🎫 ${subject}`,
            message: {
                content: `🎫 **Neues Ticket von ${modalInteraction.user.tag}** (ID: ${modalInteraction.user.id})\nKategorie: **${category}**\nBetreff: **${subject}**\n\n${description}`
            },
            reason: `Ticket von ${modalInteraction.user.tag}`
        });

        // Maps füllen
        userIdToPostId.set(modalInteraction.user.id, post.id);
        postIdToUserId.set(post.id, modalInteraction.user.id);

        // Rollen-Mitglieder adden
        const role = await targetChannel.guild.roles.fetch(process.env.ROLE_ID);
        if (role) {
            await Promise.all(
                [...role.members.values()].map(member =>
                    post.members.add(member.id).catch(() => {})
                )
            );
        }

        // User Bestätigung mit Link
        await modalInteraction.reply({
            content: `✅ Ticket erstellt!\n📎 [Zum Ticket](${post.url})`,
            flags: MessageFlags.Ephemeral
        });

        console.log(`🎫 Ticket von ${modalInteraction.user.tag} (${category}): ${subject}`);

    } catch (error) {
        console.error('❌ Modal-Fehler:', error.message);
        if (!modalInteraction.replied) {
            await modalInteraction.reply({
                content: '❌ Da ist etwas schiefgelaufen.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
});

client.login(process.env.TOKEN);