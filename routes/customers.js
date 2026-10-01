const express = require('express');
const Customer = require('../models/Customer');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/all', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try { res.json({ success: true, data: await Customer.find({ isActive: { $ne: false } }).sort({ name: 1 }) }); }
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
      Customer.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
      Customer.countDocuments(filter)
    ]);
    res.json({ success: true, data: items, meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/create', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try { res.status(201).json({ success: true, data: await Customer.create(req.body) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/update/:id', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    res.json({ success: true, data: customer });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/delete/:id', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try { const customer = await Customer.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }); if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' }); res.json({ success: true, data: customer }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
