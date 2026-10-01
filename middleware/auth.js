const jwt = require('jsonwebtoken');
const Role = require('../models/Role');
const User = require('../models/User');
const JWT_SECRET = process.env.JWT_SECRET || 'datags-development-secret-change-me';
async function requireAuth(req, res, next) {
	const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
	if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
	try {
		req.auth = jwt.verify(token, JWT_SECRET);
		const user = await User.findById(req.auth.userId).select('isActive roleId').lean();
		if (!user?.isActive) return res.status(401).json({ success: false, message: 'Tài khoản đã bị khóa hoặc không còn hoạt động' });
		req.auth.userRecord = user;
		next();
	} catch (error) {
		res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn' });
	}
}
function requirePermission(permission) { return async (req, res, next) => { try { if (req.auth?.isSuperAdmin) return next(); const role = await Role.findById(req.auth?.roleId).lean(); if (!role || !role.permissions.includes(permission)) return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này' }); req.auth.role = role; next(); } catch (error) { res.status(500).json({ success: false, message: 'Không thể kiểm tra quyền truy cập' }); } }; }
module.exports = { JWT_SECRET, requireAuth, requirePermission };
