const mongoose = require('mongoose');

const soTien = { type: Number, default: 0, min: 0 };

const thietLapLuongSchema = new mongoose.Schema({
  employee: { type: String, required: true, trim: true },
  employeeKey: { type: String, required: true, trim: true },
  tuNam: { type: Number, required: true, min: 2000, max: 2100 },
  tuThang: { type: Number, required: true, min: 1, max: 12 },
  luongCoBan: soTien,
  phuCap: soTien,
  phiGiaoNhan: soTien,
  phiHoSo: soTien,
  ghiChu: { type: String, default: '', trim: true, maxlength: 300 },
  updatedBy: { type: String, default: '', trim: true }
}, { collection: 'THIET_LAP_LUONG_NHAN_VIEN', timestamps: true });

thietLapLuongSchema.index({ employeeKey: 1, tuNam: 1, tuThang: 1 }, { unique: true });

module.exports = mongoose.model('ThietLapLuongNhanVien', thietLapLuongSchema);
