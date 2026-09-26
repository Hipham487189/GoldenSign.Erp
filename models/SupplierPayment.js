const mongoose = require('mongoose');

const supplierPaymentSchema = new mongoose.Schema({
  supplier: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  paymentDate: { type: String, required: true, trim: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: String, default: 'Hệ thống', trim: true }
}, { collection: 'SUPPLIER_PAYMENTS', timestamps: true });

supplierPaymentSchema.index({ supplier: 1, paymentDate: -1 });
supplierPaymentSchema.index({ paymentDate: -1 });

module.exports = mongoose.model('SupplierPayment', supplierPaymentSchema);
