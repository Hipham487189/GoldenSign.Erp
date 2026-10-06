const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  employee: { type: String, required: true, trim: true },
  employeeKey: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  target: { type: Number, required: true, min: 0 },
  delta: { type: Number, required: true },
  note: { type: String, default: '', trim: true },
  updatedBy: { type: String, default: '', trim: true }
}, { collection: 'EMPLOYEE_OPENING_ADJUSTMENTS', timestamps: true });

schema.index({ employeeKey: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('EmployeeOpeningAdjustment', schema);
