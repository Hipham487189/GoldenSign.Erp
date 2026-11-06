const express = require('express');
const Task = require('../models/Task');
const User = require('../models/User');
const Role = require('../models/Role');

const router = express.Router();
const clean = doc => { const { _id, __v, createdAt, updatedAt, ...task } = doc; return task; };

router.get('/all', async (req, res) => {
	try {
		const user = await User.findById(req.auth.userId)
			.select('roleId employeeId')
			.populate('roleId', 'name dataScopes')
			.populate('employeeId', 'name')
			.lean();
		if (!user) return res.status(401).json({ success: false, message: 'Tài khoản không còn hoạt động' });
		if (!user.roleId) return res.status(403).json({ success: false, message: 'Tài khoản chưa được phân quyền' });
		const role = user?.roleId;
		const employeeName = user?.employeeId?.name?.trim();
		const ownScope = role?.dataScopes?.tasks === 'own' || ['Nhân Viên', 'Chỉ Xem'].includes(role?.name);
		const filter = ownScope
			? { $or: [...(employeeName ? [{ owner: employeeName }] : []), { owner: null }, { owner: '' }] }
			: {};
		const docs = await Task.find(filter).sort({ createdAt: -1 }).lean();
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
		const role = req.auth?.isSuperAdmin
			? null
			: await Role.findById(req.auth?.roleId).select('name').lean();
		if (!req.auth?.isSuperAdmin && role?.name !== 'Admin') {
			return res.status(403).json({ success: false, message: 'Chỉ Admin mới được xóa công việc' });
		}
		await Task.deleteOne({ taskId: req.params.id });
		res.json({ success: true });
	} catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;