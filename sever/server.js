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

app.get('/t/:id', async (req, res) => {
    try {
        const linkId = req.params.id;
        const linkData = await getLinkData(linkId);

        if (!linkData || !linkData.thumbnail) {
            return res.status(404).send('Link not found');
        }

        const imageUrl = linkData.thumbnail;
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
            color: #1f2933;
            background: #f4f7fb;
            display: grid;
            place-items: center;
            padding: 24px;
        }

        main {
            width: min(100%, 560px);
            background: #ffffff;
            border: 1px solid #d9e2ec;
            border-radius: 8px;
            padding: 24px;
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
        }

        h1 {
            margin: 0 0 10px;
            font-size: 24px;
            line-height: 1.25;
        }

        p {
            margin: 0 0 18px;
            color: #52606d;
            line-height: 1.5;
        }

        button {
            width: 100%;
            border: 0;
            border-radius: 6px;
            background: #146c94;
            color: #ffffff;
            cursor: pointer;
            font-size: 16px;
            font-weight: 700;
            padding: 14px 18px;
        }

        button:disabled {
            cursor: wait;
            opacity: 0.7;
        }

        img {
            display: none;
            width: 100%;
            max-height: 75vh;
            object-fit: contain;
            border-radius: 8px;
            background: #111827;
        }

        .status {
            min-height: 24px;
            margin-top: 14px;
            color: #334e68;
        }
    </style>
</head>
<body>
    <main>
        <section id="consent">
            <h1>View shared image</h1>
            <p>This page needs your permission to share your current location with the person who sent the link. After you allow location access, the image will be shown.</p>
            <button id="allowButton" type="button">Allow location and view image</button>
            <p id="status" class="status" role="status"></p>
        </section>

        <img id="sharedImage" src="${escapeHtml(imageUrl)}" alt="Shared image">
    </main>

    <script>
        const linkId = ${JSON.stringify(linkId)};
        const allowButton = document.getElementById('allowButton');
        const statusEl = document.getElementById('status');
        const consentEl = document.getElementById('consent');
        const imageEl = document.getElementById('sharedImage');

        function showImage() {
            consentEl.style.display = 'none';
            imageEl.style.display = 'block';
        }

        function setStatus(message) {
            statusEl.textContent = message;
        }

        allowButton.addEventListener('click', () => {
            if (!navigator.geolocation) {
                setStatus('Location is not supported by this browser.');
                return;
            }

            allowButton.disabled = true;
            setStatus('Waiting for location permission...');

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    try {
                        setStatus('Opening image...');

                        await fetch('/save-location', {
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
                        });

                        showImage();
                    } catch (error) {
                        allowButton.disabled = false;
                        setStatus('Could not save location. Please try again.');
                    }
                },
                () => {
                    allowButton.disabled = false;
                    setStatus('Location permission is required to view this image.');
                },
                {
                    enableHighAccuracy: true,
                    timeout: 30000,
                    maximumAge: 0
                }
            );
        });
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
