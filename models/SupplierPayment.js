const mongoose = require('mongoose');

const supplierPaymentSchema = new mongoose.Schema({
  supplier: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  paymentDate: { type: String, required: true, trim: true },
  employee: { type: String, default: '', trim: true },
  enteredBy: { type: String, default: '', trim: true },
  paymentMethod: { type: String, default: '', trim: true },
  imageData: { type: String, default: '' },
  imageName: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: String, default: 'Hệ thống', trim: true }
}, { collection: 'SUPPLIER_PAYMENTS', timestamps: true });

supplierPaymentSchema.index({ supplier: 1, paymentDate: -1 });
supplierPaymentSchema.index({ paymentDate: -1 });

module.exports = mongoose.model('SupplierPayment', supplierPaymentSchema);
