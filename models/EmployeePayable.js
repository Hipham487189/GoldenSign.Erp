const mongoose = require('mongoose');

const amount = { type: Number, default: 0, min: 0 };

const employeePayableSchema = new mongoose.Schema({
  employee: { type: String, required: true, trim: true },
  employeeKey: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  salary: amount,
  advance: amount,
  dossierFee: amount,
  otherFee: amount,
  deliveryFee: amount,
  updatedBy: { type: String, default: '', trim: true }
}, { collection: 'EMPLOYEE_PAYABLES', timestamps: true });

employeePayableSchema.index({ employeeKey: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('EmployeePayable', employeePayableSchema);
