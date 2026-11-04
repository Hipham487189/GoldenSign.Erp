const mongoose = require('mongoose');

const taiLieuHoTroSchema = new mongoose.Schema({
  tieuDe: { type: String, required: true, trim: true, maxlength: 160 },
  chuDe: { type: String, default: '', trim: true, maxlength: 80 },
  noiDung: { type: String, required: true, maxlength: 8000000 },
  nguoiTao: { type: String, default: '', trim: true },
  nguoiCapNhat: { type: String, default: '', trim: true }
}, { collection: 'TAI_LIEU_HO_TRO', timestamps: true });

taiLieuHoTroSchema.index({ updatedAt: -1, _id: -1 });

module.exports = mongoose.model('TaiLieuHoTro', taiLieuHoTroSchema);
