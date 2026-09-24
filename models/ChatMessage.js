const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  senderUsername: { type: String, required: true, trim: true },
  text: { type: String, default: '', trim: true },
  attachmentName: { type: String, default: '' },
  attachmentSize: { type: Number, default: 0, min: 0 },
  attachmentType: { type: String, default: '', trim: true },
  attachmentData: { type: String, default: '' }
}, { collection: 'CHAT_MESSAGES', timestamps: true });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
