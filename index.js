const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Server Events
        GatewayIntentBits.GuildMessages,    // Nachrichten auf Servern
        GatewayIntentBits.DirectMessages,   // PRIVATE DMs (wichtig!)
        GatewayIntentBits.MessageContent    // INHALT der Nachrichten (wichtig!)
    ],
    partials: [
        Partials.Channel,   // ← DM-Channels, die nicht im Cache sind
        Partials.Message    // ← Falls Nachrichten aus dem Cache geflogen sind
    ]
});

client.on('ready', async () => {
    console.log(`✅ Bot ist online als ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    console.log('📩 Nachricht erhalten von:', message.author.tag, 'in Kanal-Type:', message.channel.type);
    if (!message.author.bot && message.channel.type === 1) {
        try {
            const targetChannel = await client.channels.fetch(process.env.CHANNEL_ID);

            if (!targetChannel || !targetChannel.isTextBased()) {
                console.error('❌ Target Channel nicht gefunden oder kein Textchannel');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#6d4aff')
                .setTitle('📨 Neue DM erhalten')
                .addFields(
                    { name: 'Von:', value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: 'Zeit:', value: message.createdAt.toLocaleString(), inline: true },
                    { name: 'Inhalt:', value: message.content || '*Kein Text*' }
                )
                .setFooter({ text: 'Direct Message vom Bot' })
                .setTimestamp();

            if (message.attachments.size > 0) {
                embed.addFields({
                    name: 'Anhänge:',
                    value: message.attachments.map(a => a.url).join('\n')
                });
            }

            console.log('🔍 Channel-Name:', targetChannel.name);
            console.log('🔍 Bot hat Schreibrecht?', targetChannel.permissionsFor(client.user).has('SendMessages'));
            await targetChannel.send({ embeds: [embed] });
            await message.reply('✅ Deine Nachricht wurde weitergeleitet!');
            console.log(`📤 Weitergeleitet von ${message.author.tag}`);

        } catch (error) {
            console.error('❌ Fehler beim Weiterleiten:', error);
            await message.reply('❌ Leider ging etwas schief.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN)