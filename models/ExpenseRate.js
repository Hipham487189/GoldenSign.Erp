const mongoose = require('mongoose');

const expenseRateSchema = new mongoose.Schema({
  tenChiPhi: { type: String, required: true, trim: true, maxlength: 100 },
  tenChiPhiKey: { type: String, required: true, trim: true },
  donGia: { type: Number, required: true, min: 0, max: 1e12 },
  donVi: { type: String, required: true, trim: true, maxlength: 40 },
  tuNgay: { type: Date, required: true },
  denNgay: { type: Date, default: null },
  ghiChu: { type: String, default: '', trim: true, maxlength: 300 },
  updatedBy: { type: String, default: '', trim: true }
}, { collection: 'CHI_PHI_THAY_DOI', timestamps: true });

expenseRateSchema.index({ tuNgay: -1, _id: -1 });
expenseRateSchema.index({ tenChiPhiKey: 1, tuNgay: 1 });

module.exports = mongoose.model('ExpenseRate', expenseRateSchema);
