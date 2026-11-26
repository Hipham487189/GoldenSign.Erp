const express = require('express');
const Role = require('../models/Role');
const HoSo = require('../models/HoSo');
const {
  cacCotHoSo,
  chuanHoaTimKiem,
  thoiDiemNhanHoSo,
  taoTruongTimKiem,
  escapeRegex,
  taoMaHoSo,
  BUOC_QUY_TRINH,
  NGUOI_XU_LY_HO_SO,
  NGUOI_NHAN_DAU_TIEN,
  khoiTaoQuyTrinhHoSo,
  laNguoiGiuBuocHienTai
} = require('../services/hoso');
const { requirePermission } = require('../middleware/auth');
const { luuTepNang, docTepNang } = require('../services/fileStorageService');

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
  duLieu.coTepDinhKem = Boolean(duLieu.tepDinhKem);
  delete duLieu.tepDinhKem;
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

async function xuLyTepDinhKemHoSo(dinhKem, maHoSo) {
  if (!dinhKem || typeof dinhKem !== 'object' || !dinhKem.duLieu) return {};
  const duLieu = String(dinhKem.duLieu || '').trim();
  const khop = /^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/s.exec(duLieu);
  if (!khop) {
    const loi = new Error('Tệp đính kèm hồ sơ không hợp lệ.');
    loi.statusCode = 400;
    throw loi;
  }
  const kichThuoc = Buffer.byteLength(khop[2], 'base64');
  if (kichThuoc > 8 * 1024 * 1024) {
    const loi = new Error('Tệp đính kèm hồ sơ không được vượt quá 8MB.');
    loi.statusCode = 400;
    throw loi;
  }
  const tenTepDinhKem = String(dinhKem.ten || `hoso-${maHoSo}`).trim().slice(0, 200);
  const tepDinhKem = await luuTepNang({
    dataUrl: duLieu,
    fileName: tenTepDinhKem || `hoso-${maHoSo}`,
    prefix: 'hoso'
  });
  return { tepDinhKem, tenTepDinhKem };
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
    const chang = String(req.query.stage || '').trim();
    const boLoc = {};
    if (tuKhoa) boLoc.tuKhoaChuanHoa = { $regex: escapeRegex(tuKhoa) };
    if (loai) boLoc.loaiChuanHoa = loai;
    if (tinhTrang) boLoc.tinhTrangChuanHoa = tinhTrang;
    if (BUOC_QUY_TRINH.includes(chang)) {
      if (chang === 'khach_hang') {
        boLoc.$or = [{ 'quyTrinhHoSo.buocHienTai': 'khach_hang' }, { 'quyTrinhHoSo.buocHienTai': { $exists: false } }, { 'quyTrinhHoSo.buocHienTai': '' }];
      } else {
        boLoc['quyTrinhHoSo.buocHienTai'] = chang;
      }
    }

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
        missing: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ['$tinhTrangChuanHoa', ''] }, regex: 'thieu' } }, 1, 0] } },
        khach_hang: { $sum: { $cond: [{ $in: [{ $ifNull: ['$quyTrinhHoSo.buocHienTai', 'khach_hang'] }, ['khach_hang', '']] }, 1, 0] } },
        hi_nhan: { $sum: { $cond: [{ $eq: ['$quyTrinhHoSo.buocHienTai', 'hi_nhan'] }, 1, 0] } },
        xu_ly_noi_bo: { $sum: { $cond: [{ $eq: ['$quyTrinhHoSo.buocHienTai', 'xu_ly_noi_bo'] }, 1, 0] } },
        nop_ncc: { $sum: { $cond: [{ $eq: ['$quyTrinhHoSo.buocHienTai', 'nop_ncc'] }, 1, 0] } }
      }
    }]).option({ maxTimeMS: 10000 });
    const cacLoai = await HoSo.distinct('LOẠI').maxTimeMS(10000);
    const cacTinhTrang = await HoSo.distinct('TÌNH TRẠNG HỒ SƠ').maxTimeMS(10000);

    res.set('Cache-Control', 'private, no-store');
    res.json({
      success: true,
      data: duLieu.map(boTruongNoiBo),
      meta: { total: tongSo, page: soTrangHienTai, limit: gioiHan, totalPages: tongSoTrang },
      summary: {
        total: thongKe[0]?.total || 0,
        missing: thongKe[0]?.missing || 0,
        stages: {
          khach_hang: thongKe[0]?.khach_hang || 0,
          hi_nhan: thongKe[0]?.hi_nhan || 0,
          xu_ly_noi_bo: thongKe[0]?.xu_ly_noi_bo || 0,
          nop_ncc: thongKe[0]?.nop_ncc || 0
        }
      },
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

router.get('/:id/file', requirePermission('view_customers'), async (req, res) => {
  try {
    const maHoSo = String(req.params.id || '').trim();
    if (!maHoSo || maHoSo.length > 100) return res.status(400).json({ success: false, message: 'Mã hồ sơ không hợp lệ.' });
    const hoSo = await HoSo.findOne({ ID: maHoSo }).select('tepDinhKem tenTepDinhKem').maxTimeMS(10000).lean();
    if (!hoSo || !hoSo.tepDinhKem) return res.status(404).json({ success: false, message: 'Hồ sơ chưa có tệp đính kèm.' });
    const tep = await docTepNang(hoSo.tepDinhKem);
    if (!tep?.dataUrl) return res.status(404).json({ success: false, message: 'Không tìm thấy nội dung tệp đính kèm.' });
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data: { ten: hoSo.tenTepDinhKem || tep.fileName || 'tep-dinh-kem', duLieu: tep.dataUrl } });
  } catch (loi) {
    console.error('Lỗi đọc tệp đính kèm hồ sơ:', loi);
    return res.status(500).json({ success: false, message: loi.message || 'Không thể đọc tệp đính kèm hồ sơ.' });
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
    let hoSo;
    const goiYNhan = chuanHoaTimKiem(duLieuMoi['TÊN NHÂN VIÊN NHẬN'] || '').split(/\s+/).pop();
    const nguoiNhanMacDinh = NGUOI_NHAN_DAU_TIEN.find(t => chuanHoaTimKiem(t) === goiYNhan) || 'Hi';
    const nguoiNhanDauTien = req.body?.nguoiNhanDauTien || nguoiNhanMacDinh;
    const quyTrinhHoSo = khoiTaoQuyTrinhHoSo(req.auth?.username || 'Hệ thống', nguoiNhanDauTien);
    for (let lan = 0; lan < 3; lan += 1) {
      const maHoSo = await taoMaHoSo();
      const thongTinTep = await xuLyTepDinhKemHoSo(req.body?.dinhKem, maHoSo);
      try {
        hoSo = await HoSo.create({ ID: maHoSo, ...duLieuMoi, ...thongTinTep, quyTrinhHoSo, ...taoTruongTimKiem({ ID: maHoSo, ...duLieuMoi }) });
        break;
      } catch (loi) {
        if (loi.code !== 11000 || lan === 2) throw loi;
      }
    }
    return res.status(201).json({ success: true, message: `Đã tạo hồ sơ ${hoSo.ID} trong MongoDB.`, data: { ID: hoSo.ID } });
  } catch (loi) {
    console.error('Lỗi tạo hồ sơ trong MongoDB:', loi);
    res.status(loi.statusCode || (loi.code === 11000 ? 409 : 500)).json({
      success: false,
      message: loi.statusCode ? loi.message : (loi.code === 11000 ? 'Mã hồ sơ đã tồn tại, vui lòng thử lại.' : (loi.message || 'Không thể tạo hồ sơ mới trong MongoDB.'))
    });
  }
});

router.patch('/:id/quy-trinh', requirePermission('view_customers'), async (req, res) => {
  try {
    const maHoSo = String(req.params.id || '').trim();
    if (!maHoSo || maHoSo.length > 100) return res.status(400).json({ success: false, message: 'Mã hồ sơ không hợp lệ.' });

    const hoSo = await HoSo.findOne({ ID: maHoSo });
    if (!hoSo) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ trong MongoDB.' });

    const quyTrinh = hoSo.get('quyTrinhHoSo') && typeof hoSo.get('quyTrinhHoSo') === 'object'
      ? { ...hoSo.get('quyTrinhHoSo') }
      : { buocHienTai: 'khach_hang', nguoiGiu: 'Khách Hàng', nguoiXuLy: '', nccNop: '', lichSu: [] };
    if (!BUOC_QUY_TRINH.includes(quyTrinh.buocHienTai)) quyTrinh.buocHienTai = 'khach_hang';
    if (!quyTrinh.nguoiGiu) quyTrinh.nguoiGiu = 'Khách Hàng';
    const lichSu = Array.isArray(quyTrinh.lichSu) ? [...quyTrinh.lichSu] : [];

    const hanhDong = String(req.body?.hanhDong || 'chuyen').trim();
    const ghiChu = String(req.body?.ghiChu || '').trim().slice(0, 300);
    const nguoiThaoTac = String(req.auth?.userRecord?.employeeId?.name || req.auth?.username || 'Hệ thống').trim();
    const buocCu = quyTrinh.buocHienTai;
    const bayGio = new Date();

    if (hanhDong === 'lui') {
      if (req.auth?.userRecord?.roleId?.name !== 'Admin' && !req.auth?.isSuperAdmin) {
        return res.status(403).json({ success: false, message: 'Chỉ Admin mới được lùi bước quy trình hồ sơ.' });
      }
      const mucHienTai = [...lichSu].reverse().find(m => m.denBuoc === buocCu && m.nguoiNhan === quyTrinh.nguoiGiu && !String(m.ghiChu || '').includes('Admin điều chỉnh lùi bước'));
      if (buocCu === 'xu_ly_noi_bo' && mucHienTai?.tuBuoc === 'xu_ly_noi_bo') {
        const nguoiTruoc = NGUOI_XU_LY_HO_SO.find(ten => ten !== quyTrinh.nguoiGiu) || 'Thắng';
        quyTrinh.buocHienTai = 'xu_ly_noi_bo';
        quyTrinh.nguoiGiu = nguoiTruoc;
        quyTrinh.nguoiXuLy = nguoiTruoc;
        quyTrinh.capNhatLuc = bayGio;
        lichSu.push({ tuBuoc: 'xu_ly_noi_bo', denBuoc: 'xu_ly_noi_bo', nguoiNhan: nguoiTruoc, thoiGian: bayGio, nguoiThaoTac, ghiChu: ghiChu || 'Admin điều chỉnh lùi bước' });
        quyTrinh.lichSu = lichSu.slice(-50);
        hoSo.set('quyTrinhHoSo', quyTrinh);
        hoSo.markModified('quyTrinhHoSo');
        await hoSo.save();
        return res.json({ success: true, message: `Đã chuyển hồ sơ về bước ${nguoiTruoc}.`, data: boTruongNoiBo(hoSo.toObject()) });
      }
      const viTri = BUOC_QUY_TRINH.indexOf(buocCu);
      if (viTri <= 0) return res.status(400).json({ success: false, message: 'Hồ sơ đang ở bước đầu tiên, không thể lùi thêm.' });
      let buocMoi = BUOC_QUY_TRINH[viTri - 1];
      if (buocCu === 'xu_ly_noi_bo' && quyTrinh.quaHi === false) buocMoi = 'khach_hang';
      if (buocCu === 'nop_ncc' && !quyTrinh.nguoiXuLy && quyTrinh.quaHi !== false) buocMoi = 'hi_nhan';
      const nguoiNhanMoi = buocMoi === 'khach_hang' ? 'Khách Hàng' : buocMoi === 'hi_nhan' ? 'Hi' : (quyTrinh.nguoiXuLy || 'Thắng');
      quyTrinh.buocHienTai = buocMoi;
      quyTrinh.nguoiGiu = nguoiNhanMoi;
      if (buocMoi !== 'nop_ncc') quyTrinh.nccNop = '';
      if (buocMoi === 'khach_hang' || buocMoi === 'hi_nhan') quyTrinh.nguoiXuLy = '';
      quyTrinh.capNhatLuc = bayGio;
      lichSu.push({ tuBuoc: buocCu, denBuoc: buocMoi, nguoiNhan: nguoiNhanMoi, thoiGian: bayGio, nguoiThaoTac, ghiChu: ghiChu || 'Admin điều chỉnh lùi bước' });
      quyTrinh.lichSu = lichSu.slice(-50);
      hoSo.set('quyTrinhHoSo', quyTrinh);
      hoSo.markModified('quyTrinhHoSo');
      await hoSo.save();
      return res.json({ success: true, message: `Đã chuyển hồ sơ về bước ${nguoiNhanMoi}.`, data: boTruongNoiBo(hoSo.toObject()) });
    }

    if (!laNguoiGiuBuocHienTai(req.auth?.userRecord, quyTrinh)) {
      return res.status(403).json({
        success: false,
        message: `Hồ sơ hiện đang ở ${quyTrinh.nguoiGiu}; chỉ ${quyTrinh.nguoiGiu} hoặc Admin mới có quyền chuyển bước.`
      });
    }

    if (buocCu === 'khach_hang') {
      const nguoiNhan = NGUOI_NHAN_DAU_TIEN.find(ten => chuanHoaTimKiem(ten) === chuanHoaTimKiem(req.body?.nguoiNhan || 'Hi'));
      if (!nguoiNhan) {
        return res.status(400).json({ success: false, message: 'Người nhận đầu tiên phải là Hi, Thắng hoặc Nguyên.' });
      }
      const quaHi = nguoiNhan === 'Hi';
      const buocMoi = quaHi ? 'hi_nhan' : 'xu_ly_noi_bo';
      quyTrinh.buocHienTai = buocMoi;
      quyTrinh.nguoiGiu = nguoiNhan;
      quyTrinh.nguoiXuLy = quaHi ? '' : nguoiNhan;
      quyTrinh.nccNop = '';
      quyTrinh.quaHi = quaHi;
      quyTrinh.capNhatLuc = bayGio;
      lichSu.push({ tuBuoc: buocCu, denBuoc: buocMoi, nguoiNhan, thoiGian: bayGio, nguoiThaoTac, ghiChu });
    } else if (buocCu === 'hi_nhan') {
      const nccNopThang = String(req.body?.nccNop || '').trim().slice(0, 100);
      if (nccNopThang) {
        quyTrinh.buocHienTai = 'nop_ncc';
        quyTrinh.nguoiGiu = nccNopThang;
        quyTrinh.nccNop = nccNopThang;
        quyTrinh.quaHi = true;
        quyTrinh.capNhatLuc = bayGio;
        lichSu.push({ tuBuoc: buocCu, denBuoc: 'nop_ncc', nguoiNhan: nccNopThang, thoiGian: bayGio, nguoiThaoTac, ghiChu });
        hoSo.set('Nơi Nộp', nccNopThang);
        if (!String(hoSo.get('Ngày Nộp') || '').trim()) {
          hoSo.set('Ngày Nộp', `${String(bayGio.getDate()).padStart(2, '0')}/${String(bayGio.getMonth() + 1).padStart(2, '0')}/${bayGio.getFullYear()}`);
        }
      } else {
        const nguoiNhan = NGUOI_XU_LY_HO_SO.find(ten => chuanHoaTimKiem(ten) === chuanHoaTimKiem(req.body?.nguoiNhan));
        if (!nguoiNhan) {
          return res.status(400).json({ success: false, message: 'Vui lòng chọn người nhận là Thắng hoặc Nguyên.' });
        }
        quyTrinh.buocHienTai = 'xu_ly_noi_bo';
        quyTrinh.nguoiGiu = nguoiNhan;
        quyTrinh.nguoiXuLy = nguoiNhan;
        quyTrinh.quaHi = true;
        quyTrinh.capNhatLuc = bayGio;
        lichSu.push({ tuBuoc: buocCu, denBuoc: 'xu_ly_noi_bo', nguoiNhan, thoiGian: bayGio, nguoiThaoTac, ghiChu });
      }
    } else if (buocCu === 'xu_ly_noi_bo') {
      const nguoiNhan = String(req.body?.nguoiNhan || '').trim();
      if (nguoiNhan) {
        if (!NGUOI_XU_LY_HO_SO.includes(nguoiNhan)) {
          return res.status(400).json({ success: false, message: 'Chỉ được chuyển nội bộ cho Thắng hoặc Nguyên.' });
        }
        if (nguoiNhan === quyTrinh.nguoiGiu) {
          return res.status(400).json({ success: false, message: `Hồ sơ hiện đang ở ${nguoiNhan}.` });
        }
        quyTrinh.buocHienTai = 'xu_ly_noi_bo';
        quyTrinh.nguoiGiu = nguoiNhan;
        quyTrinh.nguoiXuLy = nguoiNhan;
        quyTrinh.capNhatLuc = bayGio;
        lichSu.push({ tuBuoc: buocCu, denBuoc: 'xu_ly_noi_bo', nguoiNhan, thoiGian: bayGio, nguoiThaoTac, ghiChu });
      } else {
        const nccNop = String(req.body?.nccNop || '').trim().slice(0, 100);
        if (!nccNop) return res.status(400).json({ success: false, message: 'Vui lòng chọn hoặc nhập NCC nộp hồ sơ.' });
        quyTrinh.buocHienTai = 'nop_ncc';
        quyTrinh.nguoiGiu = nccNop;
        quyTrinh.nccNop = nccNop;
        quyTrinh.capNhatLuc = bayGio;
        lichSu.push({ tuBuoc: buocCu, denBuoc: 'nop_ncc', nguoiNhan: nccNop, thoiGian: bayGio, nguoiThaoTac, ghiChu });
        hoSo.set('Nơi Nộp', nccNop);
        if (!String(hoSo.get('Ngày Nộp') || '').trim()) {
          hoSo.set('Ngày Nộp', `${String(bayGio.getDate()).padStart(2, '0')}/${String(bayGio.getMonth() + 1).padStart(2, '0')}/${bayGio.getFullYear()}`);
        }
      }
    } else {
      return res.status(400).json({ success: false, message: 'Hồ sơ đã hoàn tất quy trình nộp sang NCC.' });
    }

    quyTrinh.lichSu = lichSu.slice(-50);
    hoSo.set('quyTrinhHoSo', quyTrinh);
    hoSo.markModified('quyTrinhHoSo');
    await hoSo.save();
    return res.json({ success: true, message: `Đã chuyển hồ sơ sang ${quyTrinh.nguoiGiu}.`, data: boTruongNoiBo(hoSo.toObject()) });
  } catch (loi) {
    console.error('Lỗi chuyển quy trình hồ sơ:', loi);
    return res.status(500).json({ success: false, message: loi.message || 'Không thể chuyển quy trình hồ sơ.' });
  }
});

module.exports = router;
