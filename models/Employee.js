const mongoose = require('mongoose');
const employeeSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true }, phone: { type: String, default: '' }, email: { type: String, default: '' }, department: { type: String, default: '' }, bankAccount: { type: String, default: '' }, isActive: { type: Boolean, default: true } }, { collection: 'EMPLOYEES', timestamps: true });
module.exports = mongoose.model('Employee', employeeSchema);
