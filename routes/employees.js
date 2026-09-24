const express = require('express');
const Employee = require('../models/Employee');
const router = express.Router();
router.get('/all', async (req, res) => { try { res.json({ success: true, data: await Employee.find({}).sort({ name: 1 }) }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
router.post('/create', async (req, res) => { try { res.status(201).json({ success: true, data: await Employee.create(req.body) }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.put('/update/:id', async (req, res) => { try { res.json({ success: true, data: await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }) }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.delete('/delete/:id', async (req, res) => { try { await Employee.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
module.exports = router;
