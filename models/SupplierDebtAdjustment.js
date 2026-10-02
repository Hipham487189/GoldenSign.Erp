const mongoose = require('mongoose');

const supplierDebtAdjustmentSchema = new mongoose.Schema({
  supplier: { type: String, required: true, trim: true },
  periodKey: { type: String, required: true, trim: true },
  dossierFee: { type: Number, default: 0, min: 0 },
  dsQui: { type: Number, default: 0, min: 0 },
  updatedBy: { type: String, default: 'Hệ thống', trim: true }
}, { collection: 'SUPPLIER_DEBT_ADJUSTMENTS', timestamps: true });

supplierDebtAdjustmentSchema.index({ supplier: 1, periodKey: 1 }, { unique: true });

module.exports = mongoose.model('SupplierDebtAdjustment', supplierDebtAdjustmentSchema);