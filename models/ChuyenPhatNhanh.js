const mongoose = require('mongoose');

const chuyenPhatNhanhSchema = new mongoose.Schema({
  maSheet: { type: String, required: true, unique: true, trim: true },
  ngayGuiDate: { type: Date, default: null },
  ngayThucHienDate: { type: Date, default: null },
  tenNhanVienTimKiem: { type: String, default: '' },
  nhanVienThucHienTimKiem: { type: String, default: '' },
  tuKhoaTimKiem: { type: [String], default: [], index: true }
}, { collection: 'CHUYEN_PHAT_NHANH', strict: false, timestamps: true });

chuyenPhatNhanhSchema.index({ ngayGuiDate: -1, _id: -1 });
chuyenPhatNhanhSchema.index({ 'TÌNH TRẠNG': 1, ngayGuiDate: -1, _id: -1 });
chuyenPhatNhanhSchema.index({ tenNhanVienTimKiem: 1, ngayGuiDate: -1, _id: -1 });
chuyenPhatNhanhSchema.index({ nhanVienThucHienTimKiem: 1, ngayGuiDate: -1, _id: -1 });

module.exports = mongoose.model('ChuyenPhatNhanh', chuyenPhatNhanhSchema);
