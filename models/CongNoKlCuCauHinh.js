const mongoose = require('mongoose');

const congNoKlCuCauHinhSchema = new mongoose.Schema({
  ma: { type: String, unique: true, default: 'khanh-linh-cu', trim: true },
  tenCongTy: { type: String, default: 'Công Ty KHÁNH LINH', trim: true, maxlength: 150 },
  soNoBanDau: { type: Number, default: 0, min: 0, max: 1e13 },
  ngayChotNo: { type: Date, default: null },
  ghiChu: { type: String, default: '', trim: true, maxlength: 500 },
  nguoiCapNhat: { type: String, default: '', trim: true }
}, { collection: 'CONG_NO_KL_CU_CAU_HINH', timestamps: true });

module.exports = mongoose.model('CongNoKlCuCauHinh', congNoKlCuCauHinhSchema);
