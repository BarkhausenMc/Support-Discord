const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

// DEBUG-SICHERUNG: Prüft sofort ob .env geladen wurde
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ FEHLER: DISCORD_TOKEN fehlt! Prüfe deine .env Datei!');
    process.exit(1);
}
if (!process.env.CHANNEL_ID) {
    console.error('❌ FEHLER: CHANNEL_ID fehlt! Prüfe deine .env Datei!');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages
    ]
});

client.on('ready', async () => {
    console.log(`✅ Bot ist online als ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
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
    .then(() => console.log('🔑 Login erfolgreich, verbinde...'))
    .catch((err) => {
        console.error('❌ Login fehlgeschlagen:', err.message);
        process.exit(1);
    });