const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  STT: String,
  "Mã Đơn Hàng": String,
  "Ngày Đăng Ký": String,
  "Ngày hồ sơ": String,
  "Nhân Viên Nhập Liệu": String,
  "Nhân Viên Đăng Ký": String,
  "Bộ Phận": String,
  "Tên Khách Hàng": String,
  MST: mongoose.Schema.Types.Mixed,
  "Tên Công Ty ": String,
  "Loại Sản Phẩm": String,
  NCC: String,
  "Hình Thức": String,
  "Gói ": String,
  "Thành Tiền": Number,
  "Thực Thu": Number,
  "TÌNH TRẠNG": String,
  "Tình  Trạng Giao Nhận": String,
  "FILE ĐÍNH KÈM": String,
  "Quốc An Check": Boolean,
  "KH Thanh Toán": Number,
  "Còn lại": Number,
  "Hình Thức Thanh Toán": String,
  "Ngày KH thanh toán": String,
  "Xuất Hóa Đơn": Boolean,
  "SmartSign PDF Available": Boolean,
  "SmartSign PDF Payload": mongoose.Schema.Types.Mixed,
  "Thực Đóng Công Ty": Number,
  "Lợi Nhuận Dự Kiến": Number,
  "THỰC CÔNG NỢ CTY": Number,
  priceSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  lockedAt: { type: Date, default: null },
  lockedReason: { type: String, default: '' },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: String, default: '' }
}, { 
  collection: 'GS-DONHANG',
  strict: false 
});

orderSchema.index({ STT: 1 }, { unique: true, partialFilterExpression: { STT: { $type: 'string', $gt: '' } } });

module.exports = mongoose.model('Order', orderSchema);