const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { quyenMa, quyenTheoChinhSach, phamViDuLieu, chinhSachApi, duocXemCongCu, choPhepCongCuTheoCauHinh } = require('../services/permissionRegistry');
if (!process.env.JWT_SECRET) throw new Error('Thiếu cấu hình JWT_SECRET; máy chủ không thể khởi động an toàn.');
const JWT_SECRET = process.env.JWT_SECRET;
const userCache = new Map();
async function requireAuth(req, res, next) {
	const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
	if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
	try {
		req.auth = jwt.verify(token, JWT_SECRET);
		const cached = userCache.get(req.auth.userId);
		let user = cached && cached.expires > Date.now() ? cached.user : null;
		if (!user) {
			user = await User.findById(req.auth.userId)
				.select('username isActive roleId employeeId doiMatKhauLuc')
				.populate('roleId')
				.populate('employeeId', 'name department isActive')
				.lean();
			if (user) userCache.set(String(req.auth.userId), { user, expires: Date.now() + 30000 });
		}
		if (!user?.isActive) return res.status(401).json({ success: false, message: 'Tài khoản đã bị khóa hoặc không còn hoạt động' });
		if (!user.roleId || user.roleId.archivedAt) return res.status(403).json({ success: false, message: 'Vai trò của tài khoản không còn hoạt động' });
		if (user.doiMatKhauLuc && Math.floor(new Date(user.doiMatKhauLuc).getTime() / 1000) > Number(req.auth.iat || 0)) {
			return res.status(401).json({ success: false, message: 'Mật khẩu đã thay đổi. Vui lòng đăng nhập lại' });
		}
		req.auth.userRecord = user;
		req.auth.username = user.username;
		req.auth.roleId = String(user.roleId._id);
		req.auth.role = user.roleId;
		req.auth.employeeId = user.employeeId?._id ? String(user.employeeId._id) : null;
		req.auth.isSuperAdmin = user.roleId.name === 'Admin';
		next();
	} catch (error) {
		res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn' });
	}
}
function requirePermission(permission) {
	return (req, res, next) => {
		const role = req.auth?.userRecord?.roleId;
		if (!role) return res.status(403).json({ success: false, message: 'Tài khoản chưa được phân quyền' });
		if (!quyenMa(role, permission)) {
			return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này' });
		}
		req.auth.role = role;
		next();
	};
}
function requireAdmin(req, res, next) {
	if (req.auth?.userRecord?.roleId?.name !== 'Admin') {
		return res.status(403).json({ success: false, message: 'Chỉ Admin mới được thực hiện thao tác này' });
	}
	return next();
}
function yeuCauCongCu(ma) {
	return (req, res, next) => {
		if (!choPhepCongCuTheoCauHinh(req.auth?.userRecord?.roleId, ma)) return res.status(403).json({ success: false, message: 'Bạn không có quyền sử dụng công cụ này' });
		next();
	};
}
function requireApiPermission(req, res, next) {
	requireAuth(req, res, () => {
		const duongDan = req.originalUrl.split('?')[0].replace(/\/+$/, '');
		if (duongDan === '/api/nhat-ky-cong-cu' || duongDan === '/api/nhat-ky-cong-cu/mo') {
			if (!duocXemCongCu(req.auth?.userRecord?.roleId)) return res.status(403).json({ success: false, message: 'Bạn không có quyền sử dụng Công Cụ' });
		}
		const chinhSach = chinhSachApi(req.originalUrl, req.method);
		if (!chinhSach) return res.status(403).json({ success: false, message: 'API chưa được đăng ký quyền truy cập' });
		const role = req.auth?.userRecord?.roleId;
		if (!quyenTheoChinhSach(role, chinhSach.taiNguyen, chinhSach.thaoTac)) {
			return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này' });
		}
		if (role?.accessControl?.version === 1 && phamViDuLieu(role, chinhSach.taiNguyen) === 'none') {
			return res.status(403).json({ success: false, message: 'Vai trò chưa được cấp phạm vi dữ liệu cho chức năng này' });
		}
		req.apiPolicy = chinhSach;
		return next();
	});
}
function xoaCacheNguoiDung(userId) { userCache.delete(String(userId)); }
function xoaCacheNguoiDungTheoVaiTro(roleId) {
	const id = String(roleId);
	for (const [userId, cached] of userCache) {
		if (String(cached.user?.roleId?._id || cached.user?.roleId || '') === id) userCache.delete(userId);
	}
}
module.exports = { JWT_SECRET, requireAuth, requirePermission, requireAdmin, requireApiPermission, yeuCauCongCu, xoaCacheNguoiDung, xoaCacheNguoiDungTheoVaiTro };
