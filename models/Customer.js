const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  type: { type: String, enum: ['KTDV', 'Khách Lẻ'], default: 'Khách Lẻ' },
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  mst: { type: String, default: '', trim: true },
  company: { type: String, default: '', trim: true },
  deliveryAddress: { type: String, default: '', trim: true },
  bankAccount: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true }
}, { collection: 'CUSTOMERS', timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
