const mongoose = require('mongoose');

const chuDeTaiLieuSchema = new mongoose.Schema({
  ten: { type: String, required: true, trim: true, maxlength: 80, unique: true },
  nguoiTao: { type: String, default: '', trim: true }
}, { collection: 'CHU_DE_TAI_LIEU', timestamps: true });

module.exports = mongoose.model('ChuDeTaiLieu', chuDeTaiLieuSchema);
