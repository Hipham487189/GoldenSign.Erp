const mongoose = require('mongoose');

const supplierDebtSnapshotSchema = new mongoose.Schema({
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  totalNcc: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  savedBy: { type: String, default: 'Hệ thống', trim: true }
}, { collection: 'SUPPLIER_DEBT_SNAPSHOTS', timestamps: true });

supplierDebtSnapshotSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SupplierDebtSnapshot', supplierDebtSnapshotSchema);