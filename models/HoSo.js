const mongoose = require('mongoose');

const hoSoSchema = new mongoose.Schema({
  ID: { type: String, required: true, trim: true },
  tuKhoaChuanHoa: { type: String, default: '', select: false },
  loaiChuanHoa: { type: String, default: '', select: false },
  tinhTrangChuanHoa: { type: String, default: '', select: false },
  ngayNhanDate: { type: Date, default: null, select: false }
}, { collection: 'HOSO', timestamps: true, strict: false });

hoSoSchema.index({ ID: 1 }, { unique: true });
hoSoSchema.index({ MST: 1 });
hoSoSchema.index({ loaiChuanHoa: 1, tinhTrangChuanHoa: 1, ngayNhanDate: -1 });
hoSoSchema.index({ ngayNhanDate: -1, _id: -1 });

module.exports = mongoose.model('HoSo', hoSoSchema);
