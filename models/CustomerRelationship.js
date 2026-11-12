const mongoose = require('mongoose');

const lienKetKhachHangSchema = new mongoose.Schema({
  khachHangA: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  khachHangB: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  moTa: { type: String, required: true, trim: true, maxlength: 250 }
}, { collection: 'CUSTOMER_RELATIONSHIPS', timestamps: true });

lienKetKhachHangSchema.index({ khachHangA: 1, khachHangB: 1 }, { unique: true });
lienKetKhachHangSchema.index({ khachHangB: 1 });

module.exports = mongoose.model('CustomerRelationship', lienKetKhachHangSchema);
