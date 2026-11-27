const mongoose = require('mongoose');

const congNoKlCuGiaoDichSchema = new mongoose.Schema({
  ngayChuyen: { type: Date, required: true },
  nguoiChuyen: { type: String, required: true, trim: true, maxlength: 100 },
  soTien: { type: Number, required: true, min: 1, max: 1e13 },
  ghiChu: { type: String, default: '', trim: true, maxlength: 500 },
  anhChungTu: { type: String, default: '' },
  tenAnhChungTu: { type: String, default: '', trim: true, maxlength: 150 },
  nguoiTao: { type: String, default: '', trim: true },
  nguoiCapNhat: { type: String, default: '', trim: true }
}, { collection: 'CONG_NO_KL_CU_GIAO_DICH', timestamps: true });

congNoKlCuGiaoDichSchema.index({ ngayChuyen: 1, createdAt: 1, _id: 1 });
congNoKlCuGiaoDichSchema.index({ ngayChuyen: -1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('CongNoKlCuGiaoDich', congNoKlCuGiaoDichSchema);
