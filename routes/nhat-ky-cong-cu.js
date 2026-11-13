const express = require('express');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { congCu, congCuDuocPhep, ghiNhatKy } = require('../services/nhatKyCongCu');

const router = express.Router();

router.use(async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const nguoiDung = await User.findById(req.auth.userId).select('isActive roleId').populate('roleId', 'name permissions').lean();
    if (!nguoiDung?.isActive || !nguoiDung.roleId) {
      return res.status(403).json({ success: false, message: 'Tài khoản chưa được phân quyền.' });
    }
    req.vaiTroNhatKy = nguoiDung.roleId;
    return next();
  } catch (loi) {
    console.error('Không thể kiểm tra quyền xem nhật ký công cụ:', loi.message);
    return res.status(500).json({ success: false, message: 'Không thể kiểm tra quyền xem nhật ký công cụ.' });
  }
});

router.post('/mo', async (req, res) => {
  const ma = req.body?.ma;
  if (typeof ma !== 'string' || !Object.prototype.hasOwnProperty.call(congCu, ma)) {
    return res.status(400).json({ success: false, message: 'Công cụ không hợp lệ.' });
  }
  if (!congCuDuocPhep(req.vaiTroNhatKy).includes(ma)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền sử dụng công cụ này.' });
  }
  try {
    await ghiNhatKy(req, ma, 'mo');
    return res.status(201).json({ success: true });
  } catch (loi) {
    console.error('Không thể ghi lượt mở công cụ:', loi.message);
    return res.status(500).json({ success: false, message: 'Không thể ghi lượt mở công cụ.' });
  }
});

router.get('/', async (req, res) => {
  const trang = req.query.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isSafeInteger(trang) || trang < 1 || trang > 10000) {
    return res.status(400).json({ success: false, message: 'Số trang không hợp lệ.' });
  }
  const gioiHan = 10;
  const dsCongCu = congCuDuocPhep(req.vaiTroNhatKy);
  const boLoc = { module: { $in: dsCongCu.map(ma => `cong-cu:${ma}`) } };
  if (req.vaiTroNhatKy.name !== 'Admin') boLoc.actorUserId = req.auth.userId;
  try {
    const items = await AuditLog.find(boLoc)
      .select('module action actorUsername recordId after.soLuong createdAt')
      .sort({ createdAt: -1, _id: -1 }).skip((trang - 1) * gioiHan).limit(gioiHan + 1).lean();
    const hasMore = items.length > gioiHan;
    if (hasMore) items.pop();
    return res.json({ success: true, data: { items, page: trang, hasMore } });
  } catch (loi) {
    console.error('Không thể tải nhật ký công cụ:', loi.message);
    return res.status(500).json({ success: false, message: 'Không thể tải nhật ký công cụ.' });
  }
});

module.exports = router;
