const express = require('express');
const Task = require('../models/Task');

const router = express.Router();
const clean = doc => { const { _id, __v, createdAt, updatedAt, ...task } = doc; return task; };

router.get('/all', async (req, res) => {
	try {
		const docs = await Task.find({}).sort({ createdAt: -1 }).lean();
		res.json({ success: true, data: docs.map(doc => ({ ...clean(doc), id: doc.taskId })) });
	} catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.put('/:id', async (req, res) => {
	try {
		const { id, taskId, _id, ...task } = req.body || {};
		await Task.updateOne({ taskId: req.params.id }, { $set: { ...task, taskId: req.params.id } }, { upsert: true });
		res.json({ success: true });
	} catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/:id', async (req, res) => {
	try {
		await Task.deleteOne({ taskId: req.params.id });
		res.json({ success: true });
	} catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;