const mongoose = require('mongoose');

const soTien = { type: Number, default: 0, min: 0 };

const employeeDebtChargeSchema = new mongoose.Schema({
  employee: { type: String, required: true, trim: true },
  employeeKey: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  tienDienThoai: soTien,
  chiPhiKhac: soTien,
  updatedBy: { type: String, default: '', trim: true }
}, { collection: 'EMPLOYEE_DEBT_CHARGES', timestamps: true });

employeeDebtChargeSchema.index({ employeeKey: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('EmployeeDebtCharge', employeeDebtChargeSchema);
