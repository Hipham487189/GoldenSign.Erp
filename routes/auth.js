const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { JWT_SECRET, requireAuth, requireAdmin, xoaCacheNguoiDung, xoaCacheNguoiDungTheoVaiTro } = require('../middleware/auth');
const { datLaiMatKhau, yeuCauMa } = require('../services/khoiPhucMatKhau');
const { layRegistry, loiAccessControl, loiQuyenCongCu } = require('../services/permissionRegistry');
const router = express.Router();
async function writeAudit(req, action, module, recordId, before, after) { await AuditLog.create({ actorUserId: req.auth?.userId || null, actorUsername: req.auth?.username || '', action, module, recordId: String(recordId || ''), before, after, ip: req.ip || '' }); }
router.post('/login', async (req, res) => { try { const username = String(req.body.username || '').trim().toLowerCase(); let user = await User.findOne({ username }).populate('roleId').populate('employeeId'); if (!user && username.includes('@')) { const emp = await Employee.findOne({ email: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).select('_id').lean(); if (emp) user = await User.findOne({ employeeId: emp._id }).populate('roleId').populate('employeeId'); } if (!user || !user.isActive || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' }); user.lastLogin = new Date(); await user.save(); const token = jwt.sign({ userId: user._id, username: user.username, roleId: user.roleId._id, isSuperAdmin: user.roleId.name === 'Admin' }, JWT_SECRET, { expiresIn: '8h' }); res.json({ success: true, token, user: { username: user.username, role: user.roleId, hiddenColumns: user.hiddenColumns || {} } }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
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
		user.doiMatKhauLuc = new Date();
		await user.save();
		xoaCacheNguoiDung(user._id);

		res.json({ success: true, message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.' });
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
});
router.post('/forgot-password/request', async (req, res) => {
	try {
		await yeuCauMa({ identifier: req.body.identifier, channel: req.body.channel });
		res.json({ success: true, message: 'Nếu thông tin hợp lệ, mã khôi phục sẽ được gửi trong ít phút.' });
	} catch (error) {
		res.status(error.status || 500).json({ success: false, message: error.message || 'Không thể gửi mã khôi phục.' });
	}
});
router.post('/forgot-password/reset', async (req, res) => {
	try {
		const userId = await datLaiMatKhau({ identifier: req.body.identifier, code: req.body.code, newPassword: req.body.newPassword });
		xoaCacheNguoiDung(userId);
		res.json({ success: true, message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' });
	} catch (error) {
		res.status(error.status || 500).json({ success: false, message: error.message || 'Không thể đặt lại mật khẩu.' });
	}
});
router.get('/permission-registry', requireAuth, requireAdmin, (req, res) => res.json({ success: true, data: layRegistry() }));
router.get('/roles/page', requireAuth, requireAdmin, async (req, res) => {
	try {
		const trang = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
		const gioiHan = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
		const [duLieu, tong] = await Promise.all([
			Role.find({}).select('name description permissions accessControl quyenCongCu hiddenColumns dataScopes archivedAt').sort({ name: 1, _id: 1 }).skip((trang - 1) * gioiHan).limit(gioiHan).lean(),
			Role.countDocuments({})
		]);
		res.json({ success: true, data: duLieu, page: trang, total: tong, totalPages: Math.max(1, Math.ceil(tong / gioiHan)) });
	} catch (error) { console.error('Lỗi tải danh sách vai trò:', error.message); res.status(500).json({ success: false, message: 'Không thể tải danh sách vai trò' }); }
});
router.get('/roles', requireAuth, requireAdmin, async (req, res) => res.json({ success: true, data: await Role.find({}).sort({ name: 1, _id: 1 }).limit(100).lean() }));
router.post('/roles', requireAuth, requireAdmin, async (req, res) => {
	try { const accessControl = req.body.accessControl || { version: 1, resources: {} }; const loi = loiAccessControl(accessControl); if (loi) return res.status(400).json({ success: false, message: loi }); const role = await Role.create({ name: req.body.name, description: req.body.description || '', permissions: req.body.permissions || [], accessControl, hiddenColumns: req.body.hiddenColumns || {}, dataScopes: req.body.dataScopes || {} }); await writeAudit(req, 'CREATE', 'roles', role._id, null, { name: role.name, permissions: role.permissions, accessControl: role.accessControl, dataScopes: role.dataScopes }); res.status(201).json({ success: true, data: role }); }
	catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
router.put('/roles/:id', requireAuth, requireAdmin, async (req, res) => {
	try { const before = await Role.findById(req.params.id).lean(); const thayDoi = { name: req.body.name, description: req.body.description || '', permissions: req.body.permissions || [], hiddenColumns: req.body.hiddenColumns || {} }; if (Object.prototype.hasOwnProperty.call(req.body, 'accessControl')) { const loi = loiAccessControl(req.body.accessControl); if (loi) return res.status(400).json({ success: false, message: loi }); thayDoi.accessControl = req.body.accessControl; } if (Object.prototype.hasOwnProperty.call(req.body, 'quyenCongCu')) { const loi = loiQuyenCongCu(req.body.quyenCongCu); if (loi) return res.status(400).json({ success: false, message: loi }); thayDoi.quyenCongCu = req.body.quyenCongCu; } if (Object.prototype.hasOwnProperty.call(req.body, 'dataScopes')) thayDoi.dataScopes = req.body.dataScopes; const role = await Role.findByIdAndUpdate(req.params.id, thayDoi, { new: true, runValidators: true }); if (!role) return res.status(404).json({ success: false, message: 'Không tìm thấy vai trò' }); xoaCacheNguoiDungTheoVaiTro(role._id); await writeAudit(req, 'UPDATE', 'roles', role._id, before, role.toObject()); res.json({ success: true, data: role }); }
	catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
router.delete('/roles/:id', requireAuth, requireAdmin, async (req, res) => { if (await User.exists({ roleId: req.params.id })) return res.status(400).json({ success: false, message: 'Không thể xóa vai trò đang được sử dụng' }); const role = await Role.findByIdAndUpdate(req.params.id, { $set: { archivedAt: new Date() } }, { new: true }); if (!role) return res.status(404).json({ success: false, message: 'Không tìm thấy vai trò' }); xoaCacheNguoiDungTheoVaiTro(role._id); await writeAudit(req, 'ARCHIVE', 'roles', role._id, { name: role.name }, { archivedAt: role.archivedAt }); res.json({ success: true, data: role }); });
router.get('/users/page', requireAuth, requireAdmin, async (req, res) => {
	try {
		const trang = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
		const gioiHan = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
		const tuKhoa = String(req.query.q || '').trim().slice(0, 100);
		const boLoc = tuKhoa ? { username: new RegExp(tuKhoa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } : {};
		const [duLieu, tong] = await Promise.all([
			User.find(boLoc).select('username roleId employeeId isActive').populate('roleId', 'name').populate('employeeId', 'name email').sort({ username: 1, _id: 1 }).skip((trang - 1) * gioiHan).limit(gioiHan).lean(),
			User.countDocuments(boLoc)
		]);
		res.json({ success: true, data: duLieu, page: trang, total: tong, totalPages: Math.max(1, Math.ceil(tong / gioiHan)) });
	} catch (error) { console.error('Lỗi tải danh sách tài khoản:', error.message); res.status(500).json({ success: false, message: 'Không thể tải danh sách tài khoản' }); }
});
router.get('/employee-options', requireAuth, requireAdmin, async (req, res) => {
	try {
		const tuKhoa = String(req.query.q || '').trim().slice(0, 100);
		if (!tuKhoa) return res.json({ success: true, data: [] });
		const mau = new RegExp(tuKhoa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
		const duLieu = await Employee.find({ isActive: { $ne: false }, $or: [{ name: mau }, { email: mau }] }).select('name email').sort({ name: 1, _id: 1 }).limit(20).lean();
		res.json({ success: true, data: duLieu });
	} catch (error) { console.error('Lỗi tìm nhân viên:', error.message); res.status(500).json({ success: false, message: 'Không thể tìm nhân viên' }); }
});
router.get('/users', requireAuth, requireAdmin, async (req, res) => res.json({ success: true, data: await User.find({}).select('-passwordHash').populate('roleId').populate('employeeId').sort({ username: 1, _id: 1 }).limit(100).lean() }));
router.post('/users', requireAuth, requireAdmin, async (req, res) => { try { const user = await User.create({ username: req.body.username, passwordHash: await bcrypt.hash(req.body.password, 12), roleId: req.body.roleId, employeeId: req.body.employeeId || null, hiddenColumns: req.body.hiddenColumns || {}, isActive: req.body.isActive !== false }); await writeAudit(req, 'CREATE', 'users', user._id, null, { username: user.username, roleId: user.roleId, employeeId: user.employeeId }); res.status(201).json({ success: true, data: user }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => { try { if (String(req.auth.userId) === String(req.params.id)) return res.status(403).json({ success: false, message: 'Không được tự thay đổi quyền của chính mình' }); const before = await User.findById(req.params.id).select('-passwordHash').lean(); const data = { roleId: req.body.roleId, employeeId: req.body.employeeId || null, isActive: req.body.isActive !== false }; if (Object.prototype.hasOwnProperty.call(req.body, 'hiddenColumns')) data.hiddenColumns = req.body.hiddenColumns || {}; if (req.body.password) { data.passwordHash = await bcrypt.hash(req.body.password, 12); data.doiMatKhauLuc = new Date(); } const user = await User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-passwordHash'); if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' }); xoaCacheNguoiDung(user._id); await writeAudit(req, 'UPDATE', 'users', user._id, before, user.toObject()); res.json({ success: true, data: user }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } });
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => { if (String(req.auth.userId) === String(req.params.id)) return res.status(403).json({ success: false, message: 'Không được tự xóa tài khoản của mình' }); const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }).select('-passwordHash'); if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' }); xoaCacheNguoiDung(user._id); await writeAudit(req, 'ARCHIVE', 'users', user._id, { isActive: true }, { isActive: false }); res.json({ success: true, data: user }); });
module.exports = router;
