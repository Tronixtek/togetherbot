const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;

const bot = new TelegramBot(token, {
    polling: true
});

console.log('🤖 Bot running...');

const userSessions = {};


// START
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    userSessions[chatId] = {
        step: 'awaiting_name'
    };

    bot.sendMessage(
        chatId,
        'Welcome.\n\nWhat is your name?'
    );
});


// HANDLE TEXT
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (!userSessions[chatId]) return;

    const session = userSessions[chatId];

    if (
        session.step === 'awaiting_name' &&
        msg.text &&
        !msg.text.startsWith('/')
    ) {
        session.name = msg.text;
        session.telegramUsername =
            msg.from.username || 'No username';

        session.telegramId = msg.from.id;
        session.step = 'awaiting_photo';

        bot.sendMessage(
            chatId,
            'Great. Now upload the image you want to use as the link thumbnail.'
        );
    }
});


// HANDLE PHOTO
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;

    if (!userSessions[chatId]) return;

    const session = userSessions[chatId];

    if (session.step !== 'awaiting_photo') return;

    const photo =
        msg.photo[msg.photo.length - 1];

    const fileId = photo.file_id;

    // Get Telegram file URL
    const file = await bot.getFile(fileId);

    const fileUrl =
        `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const localName =
        `uploads/${uuidv4()}.jpg`;

    // Download image
    const response = await axios({
        url: fileUrl,
        method: 'GET',
        responseType: 'stream'
    });

    response.data.pipe(
        fs.createWriteStream(localName)
    );

    // Create tracking link
    const linkId = uuidv4();

    const trackingLink =
        `${BASE_URL}/t/${linkId}`;

    // Save
    saveLink({
        linkId,
        ownerName: session.name,
        telegramUsername:
            session.telegramUsername,
        ownerChatId: chatId,
        thumbnail: `/${localName}`,
        createdAt:
            new Date().toISOString()
    });

    bot.sendMessage(
        chatId,
        `✅ Link created.\n\n${trackingLink}`
    );

    delete userSessions[chatId];
});


// SAVE
function saveLink(data) {
    let links = [];

    if (fs.existsSync('links.json')) {
        links = JSON.parse(
            fs.readFileSync('links.json')
        );
    }

    links.push(data);

    fs.writeFileSync(
        'links.json',
        JSON.stringify(links, null, 2)
    );
}