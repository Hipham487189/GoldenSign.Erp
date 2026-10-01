const express = require('express');
const Employee = require('../models/Employee');
const { requireAuth, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.get('/all', requireAuth, requirePermission('view_employees'), async (req, res) => { try { res.json({ success: true, data: await Employee.find({ isActive: { $ne: false } }).sort({ name: 1 }) }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
router.post('/create', requireAuth, requirePermission('manage_employees'), async (req, res) => { try { res.status(201).json({ success: true, data: await Employee.create(req.body) }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.put('/update/:id', requireAuth, requirePermission('manage_employees'), async (req, res) => { try { res.json({ success: true, data: await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }) }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.delete('/delete/:id', requireAuth, requirePermission('manage_employees'), async (req, res) => { try { const employee = await Employee.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }); if (!employee) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên.' }); res.json({ success: true, data: employee }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
module.exports = router;
