const mongoose = require('mongoose');

const employeePaymentSchema = new mongoose.Schema({
  employee: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  paymentDate: { type: String, required: true, trim: true },
  enteredBy: { type: String, default: '', trim: true },
  paymentMethod: { type: String, default: '', trim: true },
  imageData: { type: String, default: '' },
  imageName: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: String, default: 'Hệ thống', trim: true }
}, { collection: 'EMPLOYEE_PAYMENTS', timestamps: true });

employeePaymentSchema.index({ employee: 1, paymentDate: -1 });
employeePaymentSchema.index({ paymentDate: -1 });

module.exports = mongoose.model('EmployeePayment', employeePaymentSchema);
