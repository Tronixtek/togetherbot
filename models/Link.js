const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
    linkId: String,
    ownerName: String,
    telegramUsername: String,
    ownerChatId: Number,
    thumbnail: String,
    createdAt: Date
});

module.exports = mongoose.model('Link', linkSchema);