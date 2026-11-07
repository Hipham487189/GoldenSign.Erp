const express = require('express');
const mongoose = require('mongoose');
const { luuPhieuUnc, luuKetQuaDuyetUnc } = require('../services/luuPhieuUncNhieuSanPham');
const { docTepUnc } = require('../services/tepUncMongo');

module.exports = function taoRouterUncNhieuSanPham(h) {
  const router = express.Router();
  router.use(h.requireAuth);
  router.use((req, res, next) => {
    if (!h.daBat()) return res.status(503).json({ success: false, message: 'UNC nhiều sản phẩm chưa được kích hoạt.' });
    next();
  });

  function baoLoi(res, loi) {
    const ma = loi.statusCode || (loi.name === 'ValidationError' ? 400 : 500);
    if (ma >= 500) console.error('Lỗi xử lý UNC nhiều sản phẩm:', loi.message);
    return res.status(ma).json({ success: false, message: ma >= 500 ? 'Không thể xử lý phiếu UNC.' : loi.message });
  }

  async function layQuyen(req, res, thaoTac) {
    const user = await h.getAccessUser(req);
    if (!user || !user.isActive) {
      res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
      return null;
    }
    const role = user.roleId;
    const admin = role?.name === 'Admin' || req.auth?.isSuperAdmin;
    const soHuu = h.orderScope(user) === 'own';
    const duocXem = admin || role?.permissions?.includes('view_debts') || (soHuu && role?.permissions?.includes('view_orders'));
    const duocGhi = soHuu && role?.permissions?.includes('manage_orders');
    if ((thaoTac === 'xem' && !duocXem) || (thaoTac === 'gui' && !duocGhi) || (thaoTac === 'duyet' && !admin)) {
      res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác UNC này.' });
      return null;
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ.' });
      return null;
    }
    return { ...h.buildOrderFilter({}, { scopeUser: user }), _id: new mongoose.Types.ObjectId(req.params.id) };
  }

  router.get('/:id', async (req, res) => {
    try {
      const filter = await layQuyen(req, res, 'xem');
      if (!filter) return;
      const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
      const limit = 20;
      const [don] = await h.Order.aggregate([
        { $match: filter },
        { $project: {
          tongPhieu: { $add: [
            { $size: { $cond: [{ $isArray: '$phieuUnc' }, '$phieuUnc', []] } },
            { $cond: [{ $gt: [{ $convert: { input: '$Số Tiền UNC', to: 'double', onError: 0, onNull: 0 } }, 0] }, 1, 0] }
          ] },
          phieuUnc: { $slice: [{ $cond: [{ $isArray: '$phieuUnc' }, '$phieuUnc', []] }, (page - 1) * limit, limit + 1] }
        } },
        { $project: { tongPhieu: 1, phieuUnc: { $map: { input: '$phieuUnc', as: 'p', in: {
          maPhieu: '$$p.maPhieu', soTien: '$$p.soTien', ngay: '$$p.ngay', ghiChu: '$$p.ghiChu',
          phanBo: '$$p.phanBo', chuaPhanBo: '$$p.chuaPhanBo', trangThai: '$$p.trangThai',
          lyDoTuChoi: '$$p.lyDoTuChoi', tenTep: '$$p.tep.ten'
        } } } } }
      ]).option({ maxTimeMS: 15000 });
      if (!don) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
      return res.json({ success: true, data: { items: don.phieuUnc.slice(0, limit), page, hasMore: don.phieuUnc.length > limit, tongPhieu: don.tongPhieu } });
    } catch (loi) { return baoLoi(res, loi); }
  });

  router.get('/:id/:maPhieu/file', async (req, res) => {
    try {
      const filter = await layQuyen(req, res, 'xem');
      if (!filter) return;
      const don = await h.Order.findOne(filter)
        .select({ phieuUnc: { $elemMatch: { maPhieu: req.params.maPhieu } } }).lean();
      const tep = don?.phieuUnc?.[0]?.tep;
      if (!tep) return res.status(404).json({ success: false, message: 'Không tìm thấy tệp UNC.' });
      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, data: await docTepUnc(h.Order, tep) });
    } catch (loi) { return baoLoi(res, loi); }
  });

  router.post('/:id', async (req, res) => {
    try {
      const filter = await layQuyen(req, res, 'gui');
      if (!filter) return;
      const phieu = await luuPhieuUnc(h.Order, filter, req.body);
      return res.status(201).json({ success: true, data: phieu });
    } catch (loi) { return baoLoi(res, loi); }
  });

  router.patch('/:id/:maPhieu', async (req, res) => {
    try {
      const filter = await layQuyen(req, res, 'duyet');
      if (!filter) return;
      const phieu = await luuKetQuaDuyetUnc(h.Order, filter, req.params.maPhieu, req.body.trangThai, req.body.lyDoTuChoi);
      return res.json({ success: true, data: phieu });
    } catch (loi) { return baoLoi(res, loi); }
  });
  return router;
};
