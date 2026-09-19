const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, Embed, EmbedBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder } = require('discord.js');
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

client.on('messageCreate', async (message) => {
    if (!message.channel.isThread()) return;
    if (message.author.bot) return;
    if (message.channel.parentId !== process.env.CHANNEL_ID) return;
    if (message.id === message.channel.id) return; // Starter-Nachricht überspringen

    try {
        let userId = postIdToUserId.get(message.channel.id);

        if (!userId) {
            const starter = await message.channel.fetchStarterMessage();
            const match = starter.content.match(/\(ID: (\d+)\)/);
            if (!match) return;
            userId = match[1];
            postIdToUserId.set(message.channel.id, userId);
        }

        const user = await client.users.fetch(userId);
        await user.send(`${message.content}`);

        await message.react('📨');

    } catch (error) {
        console.error('❌ DM konnte nicht gesendet werden:', error.message);
        await message.react('⚠️');
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    try {
        const targetChannel = await client.channels.fetch(process.env.CHANNEL_ID);
        const userId = interaction.user.id;
        const category = interaction.customId;

        // PRÜFE OB USER BEREITS EIN TICKET HAT
        const existingPostId = userIdToPostId.get(userId);

        if (existingPostId) {
            await interaction.reply({
                content: '🚫 Du hast bereits ein offenes Ticket!',
                ephemeral: true
            });
            return;
        }

        // KATEGORIENAMEN BESTIMMEN
        const categoryName = category.replace('ticket_', '').toUpperCase();

        // NEUES TICKET ERSTELLEN
        const post = await targetChannel.threads.create({
            name: `🎫 ${categoryName} — ${interaction.user.username}`,
            message: {
                content: `🎫 **Neues Ticket von ${interaction.user.tag}**\nKategorie: **${categoryName}**\n\nBitte warte auf Unterstützung...`
            },
            reason: `Ticket für ${interaction.user.tag}`
        });

        // MAPS SPEICHERN
        userIdToPostId.set(userId, post.id);
        postIdToUserId.set(post.id, userId);

        // DM AN USER MIT TICKET-LINK
        await interaction.reply({
            content: `✅ Ticket erstellt!\n📎 [Zum Ticket gehen](${post.url})`,
            ephemeral: true
        });

        console.log(`🎫 Ticket erstellt für ${interaction.user.tag} (${categoryName})`);

    } catch (error) {
        console.error('❌ Ticket-Fehler:', error.message);
        if (!interaction.replied) {
            await interaction.reply({ content: '❌ Fehler beim Erstellen.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);