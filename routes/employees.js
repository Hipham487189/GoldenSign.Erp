const express = require('express');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { requireAuth, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.get('/all', requireAuth, requirePermission('view_employees'), async (req, res) => { try { res.json({ success: true, data: await Employee.find({ isActive: { $ne: false } }).sort({ name: 1 }) }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
router.get('/options', requireAuth, requirePermission('view_employees'), async (req, res) => {
  try {
    const data = await Employee.find({ isActive: { $ne: false } }).select('name').sort({ name: 1 }).limit(100).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.patch('/me/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.userId).select('username employeeId');
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản đang đăng nhập.' });

    const fields = ['name', 'phone', 'email', 'department', 'bankAccount', 'birthDate', 'avatar'];
    const updates = {};
    fields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : '';
      }
    });
    if (!updates.name) return res.status(400).json({ success: false, message: 'Vui lòng nhập họ tên nhân viên.' });
    if (updates.avatar && updates.avatar.length > 300000) return res.status(400).json({ success: false, message: 'Ảnh đại diện quá lớn. Vui lòng chọn ảnh khác.' });

    let employee;
    if (user.employeeId) {
      employee = await Employee.findOneAndUpdate(
        { _id: user.employeeId, isActive: { $ne: false } },
        { $set: updates },
        { new: true, runValidators: true }
      );
    } else {
      const username = String(user.username || '');
      const existingByEmail = username.includes('@')
        ? await Employee.findOne({ email: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), isActive: { $ne: false } })
        : null;
      if (existingByEmail) {
        Object.assign(existingByEmail, updates);
        employee = await existingByEmail.save();
      } else {
        employee = await Employee.create({ ...updates, isActive: true });
      }
      user.employeeId = employee._id;
      await user.save();
    }
    if (!employee) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ nhân viên đang hoạt động.' });
    res.json({ success: true, data: employee });
  } catch (error) {
    console.error('Lỗi cập nhật hồ sơ nhân viên của người dùng:', error.message);
    const status = error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
});
router.post('/create', requireAuth, requirePermission('manage_employees'), async (req, res) => { try { res.status(201).json({ success: true, data: await Employee.create(req.body) }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.put('/update/:id', requireAuth, requirePermission('manage_employees'), async (req, res) => { try { res.json({ success: true, data: await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }) }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.delete('/delete/:id', requireAuth, requirePermission('manage_employees'), async (req, res) => { try { const employee = await Employee.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }); if (!employee) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên.' }); res.json({ success: true, data: employee }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
module.exports = router;
