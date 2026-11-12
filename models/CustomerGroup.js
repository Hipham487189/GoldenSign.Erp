const mongoose = require('mongoose');

const customerGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  customers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true }
}, { collection: 'CUSTOMER_GROUPS', timestamps: true });

customerGroupSchema.index({ name: 1, isActive: 1 });
customerGroupSchema.index({ customers: 1 });

module.exports = mongoose.model('CustomerGroup', customerGroupSchema);
