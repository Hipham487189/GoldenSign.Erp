const express = require('express');
const Notification = require('../models/Notification');

const router = express.Router();
router.get('/all', async (req, res) => { try { res.json({ success: true, data: await Notification.find({}).select('-content -attachmentData').sort({ createdAt: -1 }).lean() }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
router.get('/detail/:id', async (req, res) => { try { const data = await Notification.findById(req.params.id).lean(); if (!data) return res.status(404).json({ success: false, message: 'Not found' }); res.json({ success: true, data }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
router.post('/create', async (req, res) => { try { res.status(201).json({ success: true, data: await Notification.create(req.body).then(doc => { const o = doc.toObject(); delete o.content; delete o.attachmentData; return o; }) }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.put('/update/:id', async (req, res) => { try { const data = await Notification.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true, select: '-content -attachmentData', lean: true }); if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' }); res.json({ success: true, data }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.delete('/delete/:id', async (req, res) => { try { await Notification.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });

module.exports = router;
