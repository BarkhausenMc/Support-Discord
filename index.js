const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
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

client.on('clientReady', async () => {
    console.log('Bot ist Online ✅');
});

client.on('messageCreate', async (message) => {
    if (!message.author.bot && message.channel.type === 1) {
        try {
            const targetChannel = await client.channels.fetch(process.env.CHANNEL_ID);

            if (!targetChannel || !targetChannel.isTextBased()) {
                console.log('❌ Target Channel nicht gefunden oder kein Textchannel');
                return;
            }
        
        const embed = new EmbedBuilder()
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
                })
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



