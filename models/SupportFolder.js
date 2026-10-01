const mongoose = require('mongoose');

const supportFolderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  createdBy: { type: String, default: '', trim: true }
}, { collection: 'SUPPORT_FOLDERS', timestamps: true });

module.exports = mongoose.model('SupportFolder', supportFolderSchema);
