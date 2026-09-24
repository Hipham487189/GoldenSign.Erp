const express = require('express');
const Customer = require('../models/Customer');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/all', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try { res.json({ success: true, data: await Customer.find({}).sort({ name: 1 }) }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
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
  try { await Customer.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
