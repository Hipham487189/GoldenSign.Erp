const express = require('express');
const Task = require('../models/Task');
const User = require('../models/User');
const { requirePermission } = require('../middleware/auth');
const { phamViDuLieu } = require('../services/permissionRegistry');

const router = express.Router();
const clean = doc => { const { _id, __v, createdAt, updatedAt, ...task } = doc; return task; };

router.get('/all', requirePermission('tasks:view'), async (req, res) => {
	try {
		const user = await User.findById(req.auth.userId)
			.select('roleId employeeId')
			.populate('roleId', 'name dataScopes accessControl')
			.populate('employeeId', 'name')
			.lean();
		if (!user) return res.status(401).json({ success: false, message: 'Tài khoản không còn hoạt động' });
		if (!user.roleId) return res.status(403).json({ success: false, message: 'Tài khoản chưa được phân quyền' });
		const role = user?.roleId;
		const tenChuSoHuu = user?.employeeId?.name?.trim() || user?.username;
		const phamVi = phamViDuLieu(role, 'tasks');
		if (phamVi === 'none') return res.json({ success: true, data: [] });
		const filter = phamVi === 'own' ? { owner: tenChuSoHuu } : {};
		const docs = await Task.find(filter).sort({ createdAt: -1 }).lean();
		res.json({ success: true, data: docs.map(doc => ({ ...clean(doc), id: doc.taskId })) });
	} catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.put('/:id', requirePermission('tasks:edit'), async (req, res) => {
	try {
		const { id, taskId, _id, ...task } = req.body || {};
		const user = await User.findById(req.auth.userId)
			.select('username roleId employeeId')
			.populate('roleId', 'name dataScopes accessControl')
			.populate('employeeId', 'name')
			.lean();
		if (!user?.roleId) return res.status(403).json({ success: false, message: 'Tài khoản chưa được phân quyền' });
		const phamVi = phamViDuLieu(user.roleId, 'tasks');
		const tenChuSoHuu = user.employeeId?.name?.trim() || user.username;
		if (phamVi === 'none') return res.status(403).json({ success: false, message: 'Bạn không có phạm vi thao tác công việc.' });
		const congViecCu = await Task.findOne({ taskId: req.params.id }).lean();
		if (phamVi === 'own' && congViecCu && String(congViecCu.owner || '') !== tenChuSoHuu) {
			return res.status(403).json({ success: false, message: 'Bạn chỉ được sửa công việc của mình.' });
		}
		if (phamVi === 'own' && task.owner && String(task.owner) !== tenChuSoHuu) {
			return res.status(403).json({ success: false, message: 'Không được thay đổi người phụ trách công việc.' });
		}
		if (phamVi === 'own') task.owner = tenChuSoHuu;
		await Task.updateOne({ taskId: req.params.id }, { $set: { ...task, taskId: req.params.id } }, { upsert: true });
		res.json({ success: true });
	} catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/:id', requirePermission('tasks:delete'), async (req, res) => {
	try {
		const user = await User.findById(req.auth.userId)
			.select('username roleId employeeId')
			.populate('roleId', 'name dataScopes accessControl')
			.populate('employeeId', 'name')
			.lean();
		if (!user?.roleId) return res.status(403).json({ success: false, message: 'Tài khoản chưa được phân quyền' });
		const phamVi = phamViDuLieu(user.roleId, 'tasks');
		const tenChuSoHuu = user.employeeId?.name?.trim() || user.username;
		const boLoc = { taskId: req.params.id };
		if (phamVi === 'none') return res.status(403).json({ success: false, message: 'Bạn không có phạm vi thao tác công việc.' });
		if (phamVi === 'own') boLoc.owner = tenChuSoHuu;
		const ketQua = await Task.deleteOne(boLoc);
		if (!ketQua.deletedCount) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc trong phạm vi của bạn.' });
		res.json({ success: true });
	} catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;