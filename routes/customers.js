const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Employee = require('../models/Employee');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/all', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try { res.json({ success: true, data: await Customer.find({ isActive: { $ne: false } }).populate('nhanVienQuanLy', 'name').sort({ name: 1 }) }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Paginated + searchable listing for the customer management screen (avoids loading the whole collection)
router.get('/', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const q = String(req.query.q || '').trim();
    const filter = { isActive: { $ne: false } };
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { code: regex }, { phone: regex }, { email: regex }, { mst: regex }, { company: regex }];
    }
    const [items, total] = await Promise.all([
      Customer.find(filter).populate('nhanVienQuanLy', 'name').sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
      Customer.countDocuments(filter)
    ]);
    res.json({ success: true, data: items, meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/create', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    const nhanVienQuanLy = String(req.body.nhanVienQuanLy || '');
    if (nhanVienQuanLy && !mongoose.Types.ObjectId.isValid(nhanVienQuanLy)) {
      return res.status(400).json({ success: false, message: 'Nhân viên quản lý không hợp lệ.' });
    }
    if (nhanVienQuanLy && !await Employee.exists({ _id: nhanVienQuanLy, isActive: { $ne: false } })) {
      return res.status(400).json({ success: false, message: 'Nhân viên quản lý không tồn tại hoặc đã ngừng hoạt động.' });
    }
    res.status(201).json({ success: true, data: await Customer.create({ ...req.body, nhanVienQuanLy: nhanVienQuanLy || null }) });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/update/:id', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    const updates = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(req.body, 'nhanVienQuanLy')) {
      const nhanVienQuanLy = String(req.body.nhanVienQuanLy || '');
      if (nhanVienQuanLy && !mongoose.Types.ObjectId.isValid(nhanVienQuanLy)) {
        return res.status(400).json({ success: false, message: 'Nhân viên quản lý không hợp lệ.' });
      }
      if (nhanVienQuanLy && !await Employee.exists({ _id: nhanVienQuanLy, isActive: { $ne: false } })) {
        return res.status(400).json({ success: false, message: 'Nhân viên quản lý không tồn tại hoặc đã ngừng hoạt động.' });
      }
      updates.nhanVienQuanLy = nhanVienQuanLy || null;
    }
    const customer = await Customer.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).populate('nhanVienQuanLy', 'name');
    if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    res.json({ success: true, data: customer });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/delete/:id', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try { const customer = await Customer.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }); if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' }); res.json({ success: true, data: customer }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
