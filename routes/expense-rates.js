const express = require('express');
const Role = require('../models/Role');
const ExpenseRate = require('../models/ExpenseRate');

const router = express.Router();
const GIOI_HAN_TRANG = 50;
const GIOI_HAN_TOI_DA = 100;
const SO_TRANG_TOI_DA = 10000;
const GIA_TRI_NGAY_TOI_DA = new Date('9999-12-31T23:59:59.999Z');

async function yeuCauAdmin(req, res, next) {
  try {
    const vaiTro = await Role.findById(req.auth?.userRecord?.roleId).select('name').lean();
    if (vaiTro?.name !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Chỉ Admin được quản lý số liệu chi phí.' });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Không thể kiểm tra quyền quản lý số liệu chi phí.' });
  }
}

function ngayHopLe(giaTri, batBuoc) {
  const chuoi = String(giaTri ?? '').trim();
  if (!chuoi && !batBuoc) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chuoi)) return undefined;
  const ngay = new Date(`${chuoi}T00:00:00.000Z`);
  return Number.isNaN(ngay.getTime()) || ngay.toISOString().slice(0, 10) !== chuoi ? undefined : ngay;
}

function layDuLieu(duLieu = {}) {
  const tenChiPhi = String(duLieu.tenChiPhi || '').trim().replace(/\s+/g, ' ');
  const donVi = String(duLieu.donVi || '').trim();
  const ghiChu = String(duLieu.ghiChu || '').trim();
  const donGia = duLieu.donGia === '' || duLieu.donGia == null ? NaN : Number(duLieu.donGia);
  const tuNgay = ngayHopLe(duLieu.tuNgay, true);
  const denNgay = ngayHopLe(duLieu.denNgay, false);

  if (!tenChiPhi) return { loi: 'Vui lòng nhập tên khoản chi phí.' };
  if (tenChiPhi.length > 100) return { loi: 'Tên khoản chi phí không được vượt quá 100 ký tự.' };
  if (!Number.isSafeInteger(donGia) || donGia < 0 || donGia > 1e12) return { loi: 'Đơn giá phải là số nguyên từ 0 đến 1.000.000.000.000 đồng.' };
  if (!donVi) return { loi: 'Vui lòng nhập đơn vị tính.' };
  if (donVi.length > 40) return { loi: 'Đơn vị tính không được vượt quá 40 ký tự.' };
  if (!tuNgay) return { loi: 'Ngày bắt đầu không hợp lệ.' };
  if (denNgay === undefined) return { loi: 'Ngày kết thúc không hợp lệ.' };
  if (denNgay && denNgay < tuNgay) return { loi: 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.' };
  if (ghiChu.length > 300) return { loi: 'Ghi chú không được vượt quá 300 ký tự.' };

  return {
    tenChiPhi,
    tenChiPhiKey: tenChiPhi.toLowerCase(),
    donGia,
    donVi,
    tuNgay,
    denNgay,
    ghiChu
  };
}

function duLieuTraVe(item) {
  return {
    _id: item._id,
    tenChiPhi: item.tenChiPhi,
    donGia: item.donGia,
    donVi: item.donVi,
    tuNgay: item.tuNgay,
    denNgay: item.denNgay,
    ghiChu: item.ghiChu,
    updatedAt: item.updatedAt
  };
}

async function kiemTraKhoangNgay(duLieu, idBoQua) {
  return ExpenseRate.exists({
    tenChiPhiKey: duLieu.tenChiPhiKey,
    ...(idBoQua ? { _id: { $ne: idBoQua } } : {}),
    tuNgay: { $lte: duLieu.denNgay || GIA_TRI_NGAY_TOI_DA },
    $or: [{ denNgay: null }, { denNgay: { $gte: duLieu.tuNgay } }]
  });
}

router.use(yeuCauAdmin);

router.get('/', async (req, res) => {
  const trang = req.query.page === undefined ? 1 : Number(req.query.page);
  const gioiHanYeuCau = req.query.limit === undefined ? GIOI_HAN_TRANG : Number(req.query.limit);
  if (!Number.isSafeInteger(trang) || trang < 1 || trang > SO_TRANG_TOI_DA) {
    return res.status(400).json({ success: false, message: 'Số trang không hợp lệ.' });
  }
  if (!Number.isSafeInteger(gioiHanYeuCau) || gioiHanYeuCau < 1) {
    return res.status(400).json({ success: false, message: 'Số bản ghi mỗi trang không hợp lệ.' });
  }

  const gioiHan = Math.min(gioiHanYeuCau, GIOI_HAN_TOI_DA);
  try {
    const danhSach = await ExpenseRate.find()
      .select('tenChiPhi donGia donVi tuNgay denNgay ghiChu updatedAt')
      .sort({ tuNgay: -1, _id: -1 })
      .skip((trang - 1) * gioiHan)
      .limit(gioiHan + 1)
      .lean();
    const coTrangSau = danhSach.length > gioiHan;
    return res.json({
      success: true,
      data: { items: danhSach.slice(0, gioiHan).map(duLieuTraVe), page: trang, limit: gioiHan, hasMore: coTrangSau }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách số liệu chi phí.' });
  }
});

router.post('/', async (req, res) => {
  const duLieu = layDuLieu(req.body);
  if (duLieu.loi) return res.status(400).json({ success: false, message: duLieu.loi });
  try {
    if (await kiemTraKhoangNgay(duLieu)) {
      return res.status(409).json({ success: false, message: 'Khoản chi phí này đã có mức áp dụng trùng thời gian.' });
    }
    const item = await ExpenseRate.create({ ...duLieu, updatedBy: req.auth?.username || '' });
    return res.status(201).json({ success: true, data: duLieuTraVe(item) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Không thể lưu số liệu chi phí.' });
  }
});

router.put('/:id', async (req, res) => {
  const duLieu = layDuLieu(req.body);
  if (duLieu.loi) return res.status(400).json({ success: false, message: duLieu.loi });
  try {
    const item = await ExpenseRate.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy số liệu chi phí.' });
    if (await kiemTraKhoangNgay(duLieu, item._id)) {
      return res.status(409).json({ success: false, message: 'Khoản chi phí này đã có mức áp dụng trùng thời gian.' });
    }
    Object.assign(item, duLieu, { updatedBy: req.auth?.username || '' });
    await item.save();
    return res.json({ success: true, data: duLieuTraVe(item) });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Mã số liệu chi phí không hợp lệ.' });
    return res.status(500).json({ success: false, message: 'Không thể cập nhật số liệu chi phí.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const item = await ExpenseRate.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy số liệu chi phí.' });
    await item.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Mã số liệu chi phí không hợp lệ.' });
    return res.status(500).json({ success: false, message: 'Không thể xóa số liệu chi phí.' });
  }
});

module.exports = router;
