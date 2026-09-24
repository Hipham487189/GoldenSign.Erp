const jwt = require('jsonwebtoken');
const Role = require('../models/Role');
const JWT_SECRET = process.env.JWT_SECRET || 'datags-development-secret-change-me';
function requireAuth(req, res, next) { const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' }); try { req.auth = jwt.verify(token, JWT_SECRET); next(); } catch (error) { res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn' }); } }
function requirePermission(permission) { return async (req, res, next) => { if (req.auth?.isSuperAdmin) return next(); const role = await Role.findById(req.auth?.roleId).lean(); if (!role || !role.permissions.includes(permission)) return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này' }); next(); }; }
module.exports = { JWT_SECRET, requireAuth, requirePermission };
