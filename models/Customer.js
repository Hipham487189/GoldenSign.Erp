const mongoose = require('mongoose');

const thongTinCapNhatGiaoNhanSchema = new mongoose.Schema({
  lucCapNhat: { type: Date },
  soDienThoai: { maPhieu: { type: mongoose.Schema.Types.ObjectId, ref: 'ChuyenPhatNhanh' } },
  diaChi: { maPhieu: { type: mongoose.Schema.Types.ObjectId, ref: 'ChuyenPhatNhanh' } }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  type: { type: String, enum: ['KTDV', 'Khách Lẻ'], default: 'Khách Lẻ' },
  name: { type: String, required: true, trim: true },
  tenTruoc: { type: [String], default: [] },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  mst: { type: String, default: '', trim: true },
  company: { type: String, default: '', trim: true },
  deliveryAddress: { type: String, default: '', trim: true },
  bankAccount: { type: String, default: '', trim: true },
  nhanVienQuanLy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  customerGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerGroup', default: null },
  notes: { type: String, default: '', trim: true },
  capNhatTuGiaoNhan: { type: thongTinCapNhatGiaoNhanSchema, select: false },
  isActive: { type: Boolean, default: true }
}, { collection: 'CUSTOMERS', timestamps: true });

customerSchema.index({ name: 1, isActive: 1 });
customerSchema.index({ customerGroup: 1 });
customerSchema.index({ 'capNhatTuGiaoNhan.lucCapNhat': -1, _id: -1 }, {
  partialFilterExpression: { 'capNhatTuGiaoNhan.lucCapNhat': { $exists: true } }
});

module.exports = mongoose.model('Customer', customerSchema);
