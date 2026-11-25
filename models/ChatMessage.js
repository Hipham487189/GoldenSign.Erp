const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  senderUsername: { type: String, required: true, trim: true },
  maKenh: { type: String, default: 'datags-group', trim: true, index: true },
  text: { type: String, default: '', trim: true },
  attachmentName: { type: String, default: '' },
  attachmentSize: { type: Number, default: 0, min: 0 },
  attachmentType: { type: String, default: '', trim: true },
  attachmentData: { type: String, default: '' },
  traLoi: {
    messageId: { type: String, default: '' },
    senderUsername: { type: String, default: '' },
    text: { type: String, default: '', maxlength: 300 }
  },
  phanUng: [{
    emoji: { type: String, required: true, trim: true, maxlength: 8 },
    users: [{ type: String, trim: true }]
  }],
  luotXem: [{ type: String, trim: true }],
  daGhim: { type: Boolean, default: false },
  nguonNghiepVu: {
    loai: { type: String, default: '' },
    nhan: { type: String, default: '' },
    ma: { type: String, default: '' },
    mst: { type: String, default: '' },
    trangThai: { type: String, default: '' },
    tenCongTy: { type: String, default: '' },
    tenGoi: { type: String, default: '' },
    loaiHoSo: { type: String, default: '' },
    maDoiTuong: { type: String, default: '' }
  }
}, { collection: 'CHAT_MESSAGES', timestamps: true });

chatMessageSchema.index({ maKenh: 1, createdAt: -1 });
chatMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
