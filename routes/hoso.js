const express = require('express');
const { randomUUID } = require('crypto');
const Role = require('../models/Role');
const HoSo = require('../models/HoSo');
const { cacCotHoSo, chuanHoaTimKiem, thoiDiemNhanHoSo, taoTruongTimKiem, escapeRegex } = require('../services/hoso');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

async function yeuCauQuyenAdmin(req, res, next) {
  if (req.auth?.isSuperAdmin) return next();
  try {
    const vaiTro = await Role.findById(req.auth?.roleId).select('name').lean();
    if (vaiTro?.name !== 'Admin') return res.status(403).json({ success: false, message: 'Chỉ Admin mới được lưu hồ sơ vào MongoDB.' });
    return next();
  } catch (loi) {
    console.error('Lỗi kiểm tra quyền cập nhật hồ sơ:', loi);
    return res.status(500).json({ success: false, message: 'Không thể kiểm tra quyền cập nhật hồ sơ.' });
  }
}

function chuanHoaDuLieu(duLieu) {
  if (!duLieu || typeof duLieu !== 'object' || Array.isArray(duLieu)) {
    return { loi: 'Dữ liệu hồ sơ không hợp lệ.' };
  }

  const cotKhongHopLe = Object.keys(duLieu).find(cot => !cacCotHoSo.includes(cot));
  if (cotKhongHopLe) return { loi: `Không hỗ trợ cập nhật cột ${cotKhongHopLe}.` };

  const duLieuChuanHoa = {};
  for (const cot of cacCotHoSo) {
    if (!Object.prototype.hasOwnProperty.call(duLieu, cot)) continue;
    if (typeof duLieu[cot] !== 'string' || duLieu[cot].length > 1000) {
      return { loi: `Giá trị cột ${cot} không hợp lệ hoặc vượt quá 1.000 ký tự.` };
    }
    duLieuChuanHoa[cot] = duLieu[cot].trim();
  }
  if (!duLieuChuanHoa['TÊN CÔNG TY']) return { loi: 'Vui lòng nhập tên công ty.' };

  for (const cot of ['NGÀY NHẬN', 'Ngày Nộp']) {
    if (duLieuChuanHoa[cot] && !thoiDiemNhanHoSo(duLieuChuanHoa[cot])) {
      return { loi: `${cot === 'NGÀY NHẬN' ? 'Ngày nhận' : 'Ngày nộp'} không hợp lệ. Vui lòng nhập ngày theo định dạng ngày/tháng/năm.` };
    }
  }
  return { duLieu: duLieuChuanHoa };
}

function boTruongNoiBo(hoSo) {
  const duLieu = { ...hoSo };
  delete duLieu.tuKhoaChuanHoa;
  delete duLieu.loaiChuanHoa;
  delete duLieu.tinhTrangChuanHoa;
  delete duLieu.ngayNhanDate;
  delete duLieu.createdAt;
  delete duLieu.updatedAt;
  delete duLieu.__v;
  delete duLieu._id;
  return duLieu;
}

router.get('/', requirePermission('view_customers'), async (req, res) => {
  try {
    const soTrangYeuCau = Number.parseInt(req.query.page, 10);
    const gioiHanYeuCau = Number.parseInt(req.query.limit, 10);
    const trang = Number.isFinite(soTrangYeuCau) ? Math.max(1, soTrangYeuCau) : 1;
    const gioiHan = Math.min(100, Math.max(1, Number.isFinite(gioiHanYeuCau) ? gioiHanYeuCau : 50));
    const tuKhoa = chuanHoaTimKiem(String(req.query.q || '').slice(0, 100));
    const loai = chuanHoaTimKiem(req.query.type);
    const tinhTrang = chuanHoaTimKiem(req.query.status);
    const boLoc = {};
    if (tuKhoa) boLoc.tuKhoaChuanHoa = { $regex: escapeRegex(tuKhoa) };
    if (loai) boLoc.loaiChuanHoa = loai;
    if (tinhTrang) boLoc.tinhTrangChuanHoa = tinhTrang;

    const tongSo = await HoSo.countDocuments(boLoc).maxTimeMS(10000);
    const tongSoTrang = Math.max(1, Math.ceil(tongSo / gioiHan));
    const soTrangHienTai = Math.min(trang, tongSoTrang);
    const duLieu = await HoSo.find(boLoc)
      .select('-tuKhoaChuanHoa -loaiChuanHoa -tinhTrangChuanHoa -ngayNhanDate -createdAt -updatedAt -__v -_id')
      .sort({ ngayNhanDate: -1, _id: -1 })
      .skip((soTrangHienTai - 1) * gioiHan)
      .limit(gioiHan)
      .maxTimeMS(10000)
      .lean();
    const thongKe = await HoSo.aggregate([{
      $group: {
        _id: null,
        total: { $sum: 1 },
        missing: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ['$tinhTrangChuanHoa', ''] }, regex: 'thieu' } }, 1, 0] } }
      }
    }]).option({ maxTimeMS: 10000 });
    const cacLoai = await HoSo.distinct('LOẠI').maxTimeMS(10000);
    const cacTinhTrang = await HoSo.distinct('TÌNH TRẠNG HỒ SƠ').maxTimeMS(10000);

    res.set('Cache-Control', 'private, no-store');
    res.json({
      success: true,
      data: duLieu.map(boTruongNoiBo),
      meta: { total: tongSo, page: soTrangHienTai, limit: gioiHan, totalPages: tongSoTrang },
      summary: { total: thongKe[0]?.total || 0, missing: thongKe[0]?.missing || 0 },
      filters: {
        types: cacLoai.map(String).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')),
        statuses: cacTinhTrang.map(String).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'))
      }
    });
  } catch (loi) {
    console.error('Lỗi đọc hồ sơ từ MongoDB:', loi);
    res.status(500).json({ success: false, message: loi.message || 'Không thể đọc dữ liệu hồ sơ từ MongoDB.' });
  }
});

router.get('/:id', requirePermission('view_customers'), async (req, res) => {
  try {
    const maHoSo = String(req.params.id || '').trim();
    if (!maHoSo || maHoSo.length > 100) return res.status(400).json({ success: false, message: 'Mã hồ sơ không hợp lệ.' });
    const hoSo = await HoSo.findOne({ ID: maHoSo })
      .select('-tuKhoaChuanHoa -loaiChuanHoa -tinhTrangChuanHoa -ngayNhanDate -createdAt -updatedAt -__v')
      .maxTimeMS(10000)
      .lean();
    if (!hoSo) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ trong MongoDB.' });

    res.set('Cache-Control', 'private, no-store');
    return res.json({ success: true, data: boTruongNoiBo(hoSo) });
  } catch (loi) {
    console.error('Lỗi đọc chi tiết hồ sơ từ MongoDB:', loi);
    return res.status(500).json({ success: false, message: loi.message || 'Không thể đọc chi tiết hồ sơ.' });
  }
});

router.put('/:id', yeuCauQuyenAdmin, async (req, res) => {
  try {
    const maHoSo = String(req.params.id || '').trim();
    if (!maHoSo || maHoSo.length > 100) return res.status(400).json({ success: false, message: 'Mã hồ sơ không hợp lệ.' });
    const ketQuaChuanHoa = chuanHoaDuLieu(req.body?.data);
    if (ketQuaChuanHoa.loi) return res.status(400).json({ success: false, message: ketQuaChuanHoa.loi });

    const hoSo = await HoSo.findOne({ ID: maHoSo });
    if (!hoSo) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ cần cập nhật trong MongoDB.' });
    Object.entries(ketQuaChuanHoa.duLieu).forEach(([cot, giaTri]) => hoSo.set(cot, giaTri));
    Object.entries(taoTruongTimKiem({ ...hoSo.toObject(), ...ketQuaChuanHoa.duLieu })).forEach(([cot, giaTri]) => hoSo.set(cot, giaTri));
    await hoSo.save();
    return res.json({ success: true, message: 'Đã lưu hồ sơ vào MongoDB.' });
  } catch (loi) {
    console.error('Lỗi lưu hồ sơ vào MongoDB:', loi);
    res.status(500).json({ success: false, message: loi.message || 'Không thể lưu hồ sơ vào MongoDB.' });
  }
});

router.post('/', yeuCauQuyenAdmin, async (req, res) => {
  try {
    const ketQuaChuanHoa = chuanHoaDuLieu(req.body?.data);
    if (ketQuaChuanHoa.loi) return res.status(400).json({ success: false, message: ketQuaChuanHoa.loi });

    const duLieuMoi = { ...ketQuaChuanHoa.duLieu };
    if (!duLieuMoi['NGÀY NHẬN']) {
      const homNay = new Date();
      duLieuMoi['NGÀY NHẬN'] = `${String(homNay.getDate()).padStart(2, '0')}/${String(homNay.getMonth() + 1).padStart(2, '0')}/${homNay.getFullYear()}`;
    }
    const maHoSo = randomUUID();
    const hoSo = await HoSo.create({ ID: maHoSo, ...duLieuMoi, ...taoTruongTimKiem({ ID: maHoSo, ...duLieuMoi }) });
    return res.status(201).json({ success: true, message: 'Đã tạo hồ sơ mới trong MongoDB.', data: { ID: hoSo.ID } });
  } catch (loi) {
    console.error('Lỗi tạo hồ sơ trong MongoDB:', loi);
    res.status(500).json({ success: false, message: loi.message || 'Không thể tạo hồ sơ mới trong MongoDB.' });
  }
});

module.exports = router;
