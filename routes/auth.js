const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const { JWT_SECRET, requireAuth, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.post('/login', async (req, res) => { try { const username = String(req.body.username || '').trim().toLowerCase(); const user = await User.findOne({ username }).populate('roleId').populate('employeeId'); if (!user || !user.isActive || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' }); user.lastLogin = new Date(); await user.save(); const token = jwt.sign({ userId: user._id, username: user.username, roleId: user.roleId._id, isSuperAdmin: user.roleId.name === 'Admin' }, JWT_SECRET, { expiresIn: '8h' }); res.json({ success: true, token, user: { username: user.username, role: user.roleId, hiddenColumns: user.hiddenColumns || {} } }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
router.get('/me', requireAuth, async (req, res) => { const user = await User.findById(req.auth.userId).populate('roleId').populate('employeeId').lean(); if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' }); delete user.passwordHash; res.json({ success: true, user: { username: user.username, employee: user.employeeId, role: user.roleId, hiddenColumns: user.hiddenColumns || {} } }); });
router.post('/change-password', async (req, res) => {
	try {
		const username = String(req.body.username || '').trim().toLowerCase();
		const currentPassword = String(req.body.currentPassword || '');
		const newPassword = String(req.body.newPassword || '');

		if (!username || !currentPassword || !newPassword) {
			return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tài khoản, mật khẩu hiện tại và mật khẩu mới' });
		}
		if (newPassword.length < 6) {
			return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
		}
		if (currentPassword === newPassword) {
			return res.status(400).json({ success: false, message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại' });
		}

		const user = await User.findOne({ username });
		if (!user || !user.isActive) {
			return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa' });
		}

		const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
		if (!isMatch) {
			return res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không chính xác' });
		}

		user.passwordHash = await bcrypt.hash(newPassword, 12);
		await user.save();

		res.json({ success: true, message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.' });
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
});
router.get('/roles', requireAuth, requirePermission('manage_roles'), async (req, res) => res.json({ success: true, data: await Role.find({}) }));
router.post('/roles', requireAuth, requirePermission('manage_roles'), async (req, res) => {
	try { const role = await Role.create({ name: req.body.name, description: req.body.description || '', permissions: req.body.permissions || [], hiddenColumns: req.body.hiddenColumns || {} }); res.status(201).json({ success: true, data: role }); }
	catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
router.put('/roles/:id', requireAuth, requirePermission('manage_roles'), async (req, res) => {
	try { const role = await Role.findByIdAndUpdate(req.params.id, { name: req.body.name, description: req.body.description || '', permissions: req.body.permissions || [], hiddenColumns: req.body.hiddenColumns || {} }, { new: true, runValidators: true }); if (!role) return res.status(404).json({ success: false, message: 'Không tìm thấy vai trò' }); res.json({ success: true, data: role }); }
	catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
router.delete('/roles/:id', requireAuth, requirePermission('manage_roles'), async (req, res) => { if (await User.exists({ roleId: req.params.id })) return res.status(400).json({ success: false, message: 'Không thể xóa vai trò đang được sử dụng' }); await Role.findByIdAndDelete(req.params.id); res.json({ success: true }); });
router.get('/users', requireAuth, requirePermission('manage_users'), async (req, res) => res.json({ success: true, data: await User.find({}).select('-passwordHash').populate('roleId').populate('employeeId') }));
router.post('/users', requireAuth, requirePermission('manage_users'), async (req, res) => { try { const user = await User.create({ username: req.body.username, passwordHash: await bcrypt.hash(req.body.password, 12), roleId: req.body.roleId, employeeId: req.body.employeeId || null, hiddenColumns: req.body.hiddenColumns || {} }); res.status(201).json({ success: true, data: user }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.put('/users/:id', requireAuth, requirePermission('manage_users'), async (req, res) => { try { const data = { roleId: req.body.roleId, employeeId: req.body.employeeId || null, isActive: req.body.isActive !== false }; if (Object.prototype.hasOwnProperty.call(req.body, 'hiddenColumns')) data.hiddenColumns = req.body.hiddenColumns || {}; if (req.body.password) data.passwordHash = await bcrypt.hash(req.body.password, 12); res.json({ success: true, data: await User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-passwordHash') }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.delete('/users/:id', requireAuth, requirePermission('manage_users'), async (req, res) => { await User.findByIdAndDelete(req.params.id); res.json({ success: true }); });
module.exports = router;
