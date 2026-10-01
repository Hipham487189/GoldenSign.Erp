const mongoose = require('mongoose');

const supportFileSchema = new mongoose.Schema({
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportFolder', default: null },
  name: { type: String, required: true, trim: true },
  mimeType: { type: String, default: 'application/octet-stream', trim: true },
  size: { type: Number, default: 0, min: 0 },
  fileData: { type: String, required: true }, // base64 data URL, same convention as chat/order attachments
  description: { type: String, default: '', trim: true },
  uploadedBy: { type: String, default: '', trim: true }
}, { collection: 'SUPPORT_FILES', timestamps: true });

module.exports = mongoose.model('SupportFile', supportFileSchema);
