const mongoose = require('mongoose');

const kenhChatSchema = new mongoose.Schema({
  maKenh: { type: String, required: true, unique: true, trim: true },
  tenKenh: { type: String, required: true, trim: true, maxlength: 100 },
  loaiKenh: { type: String, enum: ['group', 'direct'], default: 'group', index: true },
  tenThanhVien: [{ type: String, required: true, trim: true }],
  nguoiTao: { type: String, required: true, trim: true }
}, { collection: 'KENH_CHAT', timestamps: true });

kenhChatSchema.index({ loaiKenh: 1, tenThanhVien: 1, updatedAt: -1 });

module.exports = mongoose.model('KenhChat', kenhChatSchema);
