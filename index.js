const { Client, GatewayIntentBits, Partials, MessageActivityType } = require('discord.js');
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

client.on('clientReady', () => {
    console.log('Bot ist Online ✅');
    console.log('=== DEBUG CHANNEL INFO ===');
    console.log('ID:', targetChannel.id);
    console.log('Name:', targetChannel.name);
    console.log('Type:', targetChannel.type); // Sollte 15 sein für Forum
    console.log('IsTextBased:', targetChannel.isTextBased());
    console.log('========================');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.type !== 1) return;

    try {
        const isValidChannel = targetChannel.type === 0 || targetChannel.type === 15; 
        if (!targetChannel || !isValidChannel) {
            console.log('❌ Ziel-Channel ungültig oder nicht gefunden');
            console.log('Gefundener Typ:', targetChannel.type); 
            return;
        }

        const post = await targetChannel.threads.create({
            name: message.author.username,
            message: {
                content: `📨 **${message.author.tag}** (ID: ${message.author.id}):\n${message.content || '*Kein Text*'}`
            },
            reason: `DM-Post für ${message.author.tag}`
        });

        await message.react('📨');

        const role = await targetChannel.guild.roles.fetch(process.env.ROLE_ID);
        if (role) {
            await Promise.all(
                [...role.members.values()].map(member =>
                    post.members.add(member.id).catch(() => {})
                )
            );
        }

        console.log(`📤 Neuer Post von ${message.author.tag}`);

    } catch (error) {
        console.error('❌ Fehler:', error);
        await message.react('❌');
    }
});

client.login(process.env.TOKEN);