const mongoose = require('mongoose');
const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  department: { type: String, default: '' },
  bankAccount: { type: String, default: '' },
  birthDate: { type: String, default: '', match: [/^(\d{4}-\d{2}-\d{2})?$/, 'Ngày sinh không hợp lệ.'] },
  avatar: { type: String, default: '', maxlength: [300000, 'Ảnh đại diện quá lớn.'], match: [/^(data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+)?$/, 'Ảnh đại diện không hợp lệ.'] },
  isActive: { type: Boolean, default: true }
}, { collection: 'EMPLOYEES', timestamps: true });
module.exports = mongoose.model('Employee', employeeSchema);
