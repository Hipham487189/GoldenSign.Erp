const express = require('express');
const mongoose = require('mongoose');
const ChuyenPhatNhanh = require('../models/ChuyenPhatNhanh');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { requirePermission } = require('../middleware/auth');
const { dongBoChuyenPhatNhanh, layTinhTrangDongBo, chuanHoaNgay, taoBanGhi, taoMaGiaoNhan } = require('../services/chuyenPhatNhanhSheetSync');
const { ghiSauCapNhat } = require('../services/nhatKyCongCu');

const router = express.Router();
const escapeRegex = giaTri => String(giaTri).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

async function layBoLocPhamVi(req) {
  const user = await User.findById(req.auth.userId)
    .select('roleId employeeId')
    .populate('roleId', 'name dataScopes')
    .populate('employeeId', 'name')
    .lean();
  if (!user?.roleId) throw new Error('Tài khoản chưa được phân quyền.');
  const laPhamViCaNhan = user.roleId.dataScopes?.orders === 'own'
    || ['Nhân Viên', 'Chỉ Xem'].includes(user.roleId.name);
  if (!laPhamViCaNhan) return {};
  const tenNhanVien = String(user.employeeId?.name || '').trim();
  if (!tenNhanVien) return { _id: { $exists: false } };
  const tenTimKiem = tenNhanVien.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').replace(/đ/g, 'd');
  return {
    $or: [
      { tenNhanVienTimKiem: tenTimKiem },
      { nhanVienThucHienTimKiem: tenTimKiem }
    ]
  };
}

function taoBoLoc(boLocPhamVi, query) {
  const dieuKien = [boLocPhamVi];
  const tuKhoa = String(query.q || '').trim().slice(0, 100)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').replace(/đ/g, 'd');
  if (tuKhoa) dieuKien.push({ tuKhoaTimKiem: new RegExp(`^${escapeRegex(tuKhoa)}`) });
  const tinhTrang = String(query.status || '').trim().slice(0, 80);
  if (tinhTrang) dieuKien.push({ 'TÌNH TRẠNG': tinhTrang });
  return dieuKien.length === 1 ? dieuKien[0] : { $and: dieuKien };
}

router.get('/', requirePermission('view_orders'), async (req, res) => {
  try {
    const pageRaw = Number.parseInt(req.query.page, 10) || 1;
    const page = Math.min(100000, Math.max(1, pageRaw));
    const limitRaw = Number.parseInt(req.query.limit, 10) || 50;
    const limit = [20, 50, 100].includes(limitRaw) ? limitRaw : 50;
    const boLocPhamVi = await layBoLocPhamVi(req);
    const dieuKien = taoBoLoc(boLocPhamVi, req.query);
    const items = await ChuyenPhatNhanh.find(dieuKien)
      .select({
        maSheet: 1,
        ngayGuiDate: 1,
        ngayThucHienDate: 1,
        'ID': 1,
        'NGÀY GỬI': 1,
        'TÊN NHÂN VIÊN': 1,
        'Nhân Viên Thực Hiện': 1,
        'MST': 1,
        'TÊN CÔNG TY': 1,
        'LOẠI': 1,
        'NCC': 1,
        'LOẠI CÔNG VIỆC': 1,
        'MỤC ĐÍCH CPN': 1,
        'TÊN KHÁCH HÀNG': 1,
        'SỐ ĐIỆN THOẠI': 1,
        'ĐỊA CHỈ NGƯỜI NHẬN': 1,
        'NGÀY THỰC HIỆN': 1,
        'CHI PHÍ': 1,
        'ĐƠN VỊ CPN': 1,
        'SỐ  BILL': 1,
        'ĐÍNH KÈM': 1,
        'TÌNH TRẠNG': 1,
        'GHI CHÚ NHU CẦU KHÁCH HÀNG': 1,
        'GHI CHÚ\nCPN': 1,
        'THANH TOÁN\nCHI PHÍ NV': 1,
        'QUỐC AN\nCHECK FILE': 1
      })
      .sort({ ngayGuiDate: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .lean();
    const hasMore = items.length > limit;
    if (hasMore) items.pop();
    res.json({ success: true, items, page, limit, hasMore });
  } catch (loi) {
    const status = loi.message === 'Tài khoản chưa được phân quyền.' ? 403 : 500;
    res.status(status).json({ success: false, message: loi.message });
  }
});

const quyenCapNhatKhachHang = [
  requirePermission('view_orders'),
  requirePermission('view_customers'),
  requirePermission('manage_customers')
];

const cotThongTinKhachHang = { phone: 'SỐ ĐIỆN THOẠI', deliveryAddress: 'ĐỊA CHỈ NGƯỜI NHẬN' };
const cotDanhDauKhachHang = { phone: 'soDienThoai', deliveryAddress: 'diaChi' };
const bieuThucChuoi = cot => ({ $trim: { input: { $convert: { input: `$${cot}`, to: 'string', onNull: '' } } } });

function taoBuocPhieuDaCapNhat(duongDan) {
  return [
    { $set: { _maPhieuDaCapNhat: [
      { $ifNull: [`$${duongDan}.soDienThoai.maPhieu`, null] },
      { $ifNull: [`$${duongDan}.diaChi.maPhieu`, null] }
    ] } },
    { $lookup: {
      from: ChuyenPhatNhanh.collection.name, localField: '_maPhieuDaCapNhat',
      foreignField: '_id', as: '_phieuDaCapNhat'
    } }
  ];
}

function taoQuyTrinhNhom(boLocPhamVi, boLocTen, trang, gioiHan) {
  const giaTri = cot => ({ $cond: [{ $ne: [`$${cot}`, ''] }, { giaTri: `$${cot}`, maPhieu: '$_id' }, null] });
  const quyTrinh = [
    { $match: boLocPhamVi },
    { $project: {
      ten: bieuThucChuoi('TÊN KHÁCH HÀNG'),
      phone: bieuThucChuoi(cotThongTinKhachHang.phone),
      deliveryAddress: bieuThucChuoi(cotThongTinKhachHang.deliveryAddress)
    } },
    { $match: { ten: { $ne: '', ...boLocTen } } },
    { $group: {
      _id: '$ten', soPhieu: { $sum: 1 },
      phoneMin: { $min: giaTri('phone') }, phoneMax: { $max: giaTri('phone') },
      deliveryAddressMin: { $min: giaTri('deliveryAddress') }, deliveryAddressMax: { $max: giaTri('deliveryAddress') }
    } },
    { $sort: { _id: 1 } }
  ];
  quyTrinh.push({
    $lookup: {
      from: Customer.collection.name, let: { ten: '$_id' },
      pipeline: [
        { $match: { isActive: { $ne: false }, $expr: { $eq: ['$name', '$$ten'] } } },
        { $project: { code: 1, name: 1, phone: 1, deliveryAddress: 1, capNhatTuGiaoNhan: 1 } },
        { $limit: 2 }
      ],
      as: 'khachHang'
    }
  });
  if (gioiHan) {
    const chuaCapNhat = [
      { 'khachHang.1': { $exists: true } },
      { 'khachHang.0.capNhatTuGiaoNhan.lucCapNhat': { $exists: false } }
    ];
    if (Object.keys(boLocPhamVi).length) {
      quyTrinh.push({ $set: { _khachDuyNhat: { $arrayElemAt: ['$khachHang', 0] } } });
      quyTrinh.push(...taoBuocPhieuDaCapNhat('_khachDuyNhat.capNhatTuGiaoNhan'));
      chuaCapNhat.push({ _phieuDaCapNhat: { $not: { $elemMatch: boLocPhamVi } } });
    }
    quyTrinh.push({ $match: { $or: chuaCapNhat } }, { $skip: (trang - 1) * gioiHan }, { $limit: gioiHan + 1 });
  }
  quyTrinh.push({ $project: { 'khachHang.capNhatTuGiaoNhan': 0, _khachDuyNhat: 0, _maPhieuDaCapNhat: 0, _phieuDaCapNhat: 0 } });
  return quyTrinh;
}

router.get('/khach-hang-da-cap-nhat', ...quyenCapNhatKhachHang, async (req, res) => {
  try {
    const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const soLuong = Number.parseInt(req.query.limit, 10) || 50;
    const limit = [20, 50, 100].includes(soLuong) ? soLuong : 50;
    const tuKhoa = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const boLocPhamVi = await layBoLocPhamVi(req);
    const boLoc = { isActive: { $ne: false }, 'capNhatTuGiaoNhan.lucCapNhat': { $exists: true } };
    if (tuKhoa) {
      const bieuThuc = new RegExp(escapeRegex(tuKhoa), 'i');
      boLoc.$or = [{ name: bieuThuc }, { code: bieuThuc }];
    }
    const quyTrinh = [
      { $match: boLoc },
      { $sort: { 'capNhatTuGiaoNhan.lucCapNhat': -1, _id: -1 } }
    ];
    if (Object.keys(boLocPhamVi).length) {
      quyTrinh.push(...taoBuocPhieuDaCapNhat('capNhatTuGiaoNhan'));
      quyTrinh.push({ $match: { _phieuDaCapNhat: { $elemMatch: boLocPhamVi } } });
    }
    quyTrinh.push(
      { $skip: (page - 1) * limit }, { $limit: limit + 1 },
      { $project: { code: 1, name: 1, phone: 1, deliveryAddress: 1, lucCapNhat: '$capNhatTuGiaoNhan.lucCapNhat' } }
    );
    const items = await Customer.aggregate(quyTrinh).allowDiskUse(true).option({ maxTimeMS: 15000 });
    const hasMore = items.length > limit;
    if (hasMore) items.pop();
    res.json({ success: true, items, page, limit, hasMore });
  } catch (loi) {
    console.error('Lỗi tải khách hàng đã cập nhật:', loi.message);
    res.status(loi.message === 'Tài khoản chưa được phân quyền.' ? 403 : 500)
      .json({ success: false, message: 'Không thể tải khách hàng đã cập nhật.' });
  }
});

router.get('/nhom-cap-nhat-khach-hang', ...quyenCapNhatKhachHang, async (req, res) => {
  try {
    const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const soLuong = Number.parseInt(req.query.limit, 10) || 50;
    const limit = [20, 50, 100].includes(soLuong) ? soLuong : 50;
    const tuKhoa = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const boLocTen = tuKhoa ? { $regex: escapeRegex(tuKhoa), $options: 'i' } : {};
    const boLocPhamVi = await layBoLocPhamVi(req);
    const items = await ChuyenPhatNhanh.aggregate(taoQuyTrinhNhom(boLocPhamVi, boLocTen, page, limit))
      .collation({ locale: 'simple' }).allowDiskUse(true).option({ maxTimeMS: 15000 });
    const hasMore = items.length > limit;
    if (hasMore) items.pop();
    res.json({ success: true, items, page, limit, hasMore });
  } catch (loi) {
    console.error('Lỗi tổng hợp gợi ý khách hàng:', loi.message);
    res.status(loi.message === 'Tài khoản chưa được phân quyền.' ? 403 : 500)
      .json({ success: false, message: 'Không thể tổng hợp gợi ý khách hàng.' });
  }
});

router.get('/gia-tri-khach-hang', ...quyenCapNhatKhachHang, async (req, res) => {
  const ten = typeof req.query.ten === 'string' ? req.query.ten.trim() : '';
  const truong = req.query.truong;
  if (!ten || ten.length > 1000 || typeof truong !== 'string' || !Object.prototype.hasOwnProperty.call(cotThongTinKhachHang, truong)) {
    return res.status(400).json({ success: false, message: 'Tên khách hàng hoặc trường thông tin không hợp lệ.' });
  }
  try {
    const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = 20;
    const boLocPhamVi = await layBoLocPhamVi(req);
    const items = await ChuyenPhatNhanh.aggregate([
      { $match: boLocPhamVi },
      { $project: { ten: bieuThucChuoi('TÊN KHÁCH HÀNG'), giaTri: bieuThucChuoi(cotThongTinKhachHang[truong]) } },
      { $match: { ten, giaTri: { $ne: '' } } },
      { $group: { _id: '$giaTri', maPhieu: { $first: '$_id' }, soPhieu: { $sum: 1 } } },
      { $sort: { _id: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit + 1 }
    ]).collation({ locale: 'simple' }).allowDiskUse(true).option({ maxTimeMS: 15000 });
    const hasMore = items.length > limit;
    if (hasMore) items.pop();
    res.json({ success: true, items, page, hasMore });
  } catch (loi) {
    console.error('Lỗi tải giá trị khách hàng từ giao nhận:', loi.message);
    res.status(loi.message === 'Tài khoản chưa được phân quyền.' ? 403 : 500)
      .json({ success: false, message: 'Không thể tải thông tin từ các phiếu.' });
  }
});

router.get('/phieu-cap-nhat-khach-hang', ...quyenCapNhatKhachHang, async (req, res) => {
  try {
    const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const soLuong = Number.parseInt(req.query.limit, 10) || 50;
    const limit = [20, 50, 100].includes(soLuong) ? soLuong : 50;
    const boLocPhamVi = await layBoLocPhamVi(req);
    const items = await ChuyenPhatNhanh.find(taoBoLoc(boLocPhamVi, req.query))
      .select({ maSheet: 1, ID: 1, 'NGÀY GỬI': 1, 'TÊN KHÁCH HÀNG': 1, 'SỐ ĐIỆN THOẠI': 1, 'ĐỊA CHỈ NGƯỜI NHẬN': 1 })
      .sort({ ngayGuiDate: -1, _id: -1 }).skip((page - 1) * limit).limit(limit + 1).lean();
    const hasMore = items.length > limit;
    if (hasMore) items.pop();
    res.json({ success: true, items, page, limit, hasMore });
  } catch (loi) {
    console.error('Lỗi tải phiếu để cập nhật khách hàng:', loi.message);
    res.status(loi.message === 'Tài khoản chưa được phân quyền.' ? 403 : 500)
      .json({ success: false, message: 'Không thể tải phiếu giao nhận.' });
  }
});

router.get('/khach-hang-goi-y', ...quyenCapNhatKhachHang, async (req, res) => {
  const tuKhoa = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (tuKhoa.length < 2) return res.status(400).json({ success: false, message: 'Nhập ít nhất 2 ký tự để tìm khách hàng.' });
  try {
    const bieuThuc = new RegExp(escapeRegex(tuKhoa), 'i');
    const data = await Customer.find({
      isActive: { $ne: false },
      $or: [{ name: bieuThuc }, { code: bieuThuc }]
    }).select('code name phone deliveryAddress').sort({ name: 1, _id: 1 }).limit(20).lean();
    res.json({ success: true, data });
  } catch (loi) {
    console.error('Lỗi tìm khách hàng cho giao nhận:', loi.message);
    res.status(500).json({ success: false, message: 'Không thể tìm khách hàng.' });
  }
});

router.post('/cap-nhat-thong-tin-khach-hang', ...quyenCapNhatKhachHang, async (req, res) => {
  const danhSach = req.body?.danhSach;
  const laMaHopLe = ma => typeof ma === 'string' && /^[a-f\d]{24}$/i.test(ma) && mongoose.isValidObjectId(ma);
  const hopLe = muc => muc && laMaHopLe(muc.maKhachHang)
    && Array.isArray(muc.truong) && muc.truong.length > 0
    && muc.truong.length === new Set(muc.truong).size
    && muc.truong.every(truong => ['phone', 'deliveryAddress'].includes(truong))
    && muc.truong.every(truong => laMaHopLe(muc.maPhieuTheoTruong?.[truong] || muc.maGiaoNhan))
    && (!muc.nhom || (typeof muc.nhom.ten === 'string' && muc.nhom.ten.trim() === muc.nhom.ten
      && muc.nhom.ten.length > 0 && muc.nhom.ten.length <= 1000
      && muc.truong.every(truong => typeof muc.nhom[truong]?.min === 'string' && typeof muc.nhom[truong]?.max === 'string')))
    && muc.daXem && ['phone', 'deliveryAddress'].every(truong =>
      typeof muc.daXem[truong]?.nguon === 'string' && typeof muc.daXem[truong]?.cu === 'string');
  if (req.body?.xacNhan !== true || !Array.isArray(danhSach) || !danhSach.length || danhSach.length > 20
    || !danhSach.every(hopLe)
    || new Set(danhSach.map(muc => String(muc.maKhachHang))).size !== danhSach.length) {
    return res.status(400).json({ success: false, message: 'Cần xác nhận từ 1 đến 20 khách hàng hợp lệ, không chọn trùng khách hàng.' });
  }

  try {
    const boLocPhamVi = await layBoLocPhamVi(req);
    const tenNhom = [...new Set(danhSach.filter(muc => muc.nhom).map(muc => muc.nhom.ten))];
    const maPhieu = [...new Set(danhSach.flatMap(muc => muc.truong.map(truong => muc.maPhieuTheoTruong?.[truong] || muc.maGiaoNhan)))];
    const [phieu, khach, nhom] = await Promise.all([
      ChuyenPhatNhanh.find({ $and: [boLocPhamVi, { _id: { $in: maPhieu } }] })
        .select({ 'TÊN KHÁCH HÀNG': 1, 'SỐ ĐIỆN THOẠI': 1, 'ĐỊA CHỈ NGƯỜI NHẬN': 1 }).lean(),
      Customer.find({ _id: { $in: danhSach.map(muc => muc.maKhachHang) }, isActive: { $ne: false } })
        .select('phone deliveryAddress').lean(),
      tenNhom.length ? ChuyenPhatNhanh.aggregate(taoQuyTrinhNhom(boLocPhamVi, { $in: tenNhom }))
        .collation({ locale: 'simple' }).allowDiskUse(true).option({ maxTimeMS: 15000 }) : []
    ]);
    const phieuTheoMa = new Map(phieu.map(item => [String(item._id), item]));
    const khachTheoMa = new Map(khach.map(item => [String(item._id), item]));
    const nhomTheoTen = new Map(nhom.map(item => [item._id, item]));
    const giaTri = value => String(value ?? '').trim();
    const ketQua = await Promise.all(danhSach.map(async muc => {
      const khachHang = khachTheoMa.get(String(muc.maKhachHang));
      const khongCapNhat = message => ({ maKhachHang: muc.maKhachHang, success: false, message });
      if (!khachHang) return khongCapNhat('Khách hàng không còn hoạt động.');
      const nhomHienTai = muc.nhom && nhomTheoTen.get(muc.nhom.ten);
      if (muc.nhom && (!nhomHienTai || nhomHienTai.khachHang.length !== 1
        || String(nhomHienTai.khachHang[0]._id) !== String(muc.maKhachHang))) {
        return khongCapNhat('Khách hàng khớp tên đã thay đổi; vui lòng kiểm tra lại.');
      }
      const boLoc = { _id: khachHang._id, isActive: { $ne: false } };
      if (muc.nhom) boLoc.name = muc.nhom.ten;
      const capNhat = {};
      const danhDau = {};
      for (const truong of muc.truong) {
        const giaoNhan = phieuTheoMa.get(String(muc.maPhieuTheoTruong?.[truong] || muc.maGiaoNhan));
        if (!giaoNhan || (muc.nhom && giaTri(giaoNhan['TÊN KHÁCH HÀNG']) !== muc.nhom.ten)) {
          return khongCapNhat('Phiếu ngoài phạm vi hoặc không còn thuộc nhóm tên đã chọn.');
        }
        if (muc.nhom && (giaTri(nhomHienTai[`${truong}Min`]?.giaTri) !== muc.nhom[truong].min
          || giaTri(nhomHienTai[`${truong}Max`]?.giaTri) !== muc.nhom[truong].max)) {
          return khongCapNhat('Thông tin trong nhóm phiếu đã thay đổi; vui lòng kiểm tra lại.');
        }
        const nguon = giaTri(giaoNhan[cotThongTinKhachHang[truong]]);
        const cu = giaTri(khachHang[truong]);
        if (nguon !== muc.daXem[truong].nguon || cu !== muc.daXem[truong].cu) {
          return khongCapNhat('Thông tin đã thay đổi; vui lòng chọn lại và kiểm tra.');
        }
        if (!nguon || cu) return khongCapNhat('Chỉ bổ sung thông tin có nguồn và ô khách hàng còn trống.');
        boLoc[truong] = khachHang[truong] == null ? null : khachHang[truong];
        capNhat[truong] = nguon;
        danhDau[`capNhatTuGiaoNhan.${cotDanhDauKhachHang[truong]}.maPhieu`] = giaoNhan._id;
      }
      try {
        const daCapNhat = await Customer.updateOne(boLoc, { $set: {
          ...capNhat, ...danhDau, 'capNhatTuGiaoNhan.lucCapNhat': new Date()
        } }, { runValidators: true, collation: { locale: 'simple' } });
        return daCapNhat.matchedCount
          ? { maKhachHang: muc.maKhachHang, success: true, message: 'Đã bổ sung thông tin.' }
          : khongCapNhat('Thông tin khách hàng đã thay đổi; vui lòng chọn lại và kiểm tra.');
      } catch (loi) {
        console.error('Lỗi cập nhật thông tin khách hàng từ giao nhận:', loi.message);
        return khongCapNhat('Không thể cập nhật khách hàng này.');
      }
    }));
    const soDaCapNhat = ketQua.filter(muc => muc.success).length;
    if (soDaCapNhat) await ghiSauCapNhat(req, res, 'cap-nhat-khach-hang', 'cap-nhat', '', soDaCapNhat);
    res.json({ success: true, data: ketQua });
  } catch (loi) {
    console.error('Lỗi chuẩn bị cập nhật khách hàng từ giao nhận:', loi.message);
    res.status(loi.message === 'Tài khoản chưa được phân quyền.' ? 403 : 500)
      .json({ success: false, message: 'Không thể chuẩn bị cập nhật khách hàng.' });
  }
});

router.post('/', requirePermission('manage_orders'), async (req, res) => {
  try {
    const nguoiDung = await User.findById(req.auth.userId)
      .select('roleId employeeId')
      .populate('roleId', 'name dataScopes')
      .populate('employeeId', 'name')
      .lean();
    if (!nguoiDung?.roleId) return res.status(403).json({ success: false, message: 'Tài khoản chưa được phân quyền.' });

    const laPhamViCaNhan = nguoiDung.roleId.dataScopes?.orders === 'own'
      || ['Nhân Viên', 'Chỉ Xem'].includes(nguoiDung.roleId.name);
    const tenNhanVien = String(nguoiDung.employeeId?.name || '').trim();
    if (laPhamViCaNhan && !tenNhanVien) return res.status(403).json({ success: false, message: 'Tài khoản chưa được liên kết với nhân viên.' });

    const cacCot = [
      'NGÀY GỬI', 'TÊN NHÂN VIÊN', 'Nhân Viên Thực Hiện', 'MST', 'TÊN CÔNG TY',
      'LOẠI', 'NCC', 'LOẠI CÔNG VIỆC', 'MỤC ĐÍCH CPN', 'TÊN KHÁCH HÀNG',
      'SỐ ĐIỆN THOẠI', 'ĐỊA CHỈ NGƯỜI NHẬN', 'NGÀY THỰC HIỆN', 'CHI PHÍ',
      'ĐƠN VỊ CPN', 'SỐ  BILL', 'ĐÍNH KÈM', 'TÌNH TRẠNG',
      'GHI CHÚ NHU CẦU KHÁCH HÀNG', 'GHI CHÚ\nCPN', 'THANH TOÁN\nCHI PHÍ NV',
      'QUỐC AN\nCHECK FILE'
    ];
    const layGiaTri = (cot, gioiHan = 1000) => {
      const giaTri = req.body[cot];
      return typeof giaTri === 'string' || typeof giaTri === 'number'
        ? String(giaTri).trim().slice(0, gioiHan)
        : '';
    };
    const duLieu = Object.fromEntries(cacCot.map(cot => [cot, layGiaTri(cot, cot === 'ĐÍNH KÈM' ? 2000 : 1000)]));
    duLieu['TÊN NHÂN VIÊN'] = laPhamViCaNhan
      ? tenNhanVien
      : (duLieu['TÊN NHÂN VIÊN'] || tenNhanVien);

    if (!chuanHoaNgay(duLieu['NGÀY GỬI'])) return res.status(400).json({ success: false, message: 'Ngày gửi không hợp lệ.' });
    if (duLieu['NGÀY THỰC HIỆN'] && !chuanHoaNgay(duLieu['NGÀY THỰC HIỆN'])) return res.status(400).json({ success: false, message: 'Ngày thực hiện không hợp lệ.' });
    if (!duLieu['TÊN KHÁCH HÀNG'] && !duLieu['TÊN CÔNG TY']) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên khách hàng hoặc tên công ty.' });
    if (!duLieu['ĐỊA CHỈ NGƯỜI NHẬN']) return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ người nhận.' });

    const tieuDe = ['ID', ...cacCot];
    let giaoNhan;
    for (let lan = 0; lan < 3; lan += 1) {
      duLieu.ID = await taoMaGiaoNhan();
      const banGhi = taoBanGhi(tieuDe, tieuDe.map(cot => duLieu[cot] || ''));
      try {
        giaoNhan = await ChuyenPhatNhanh.create({ ...banGhi, nguonTaoGiaoNhan: 'web' });
        break;
      } catch (loi) {
        if (loi.code !== 11000 || lan === 2) throw loi;
      }
    }
    res.status(201).json({ success: true, data: giaoNhan });
  } catch (loi) {
    console.error('Lỗi tạo giao nhận:', loi.message);
    res.status(loi.statusCode || (loi.code === 11000 ? 409 : 500)).json({
      success: false,
      message: loi.statusCode ? loi.message : (loi.code === 11000 ? 'Mã giao nhận đã tồn tại, vui lòng thử lại.' : 'Không thể tạo giao nhận.')
    });
  }
});

router.get('/options', requirePermission('view_orders'), async (req, res) => {
  try {
    const boLocPhamVi = await layBoLocPhamVi(req);
    const statuses = await ChuyenPhatNhanh.aggregate([
      { $match: { ...boLocPhamVi, 'TÌNH TRẠNG': { $nin: ['', null] } } },
      { $group: { _id: '$TÌNH TRẠNG' } },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);
    res.json({ success: true, statuses: statuses.map(item => item._id) });
  } catch (loi) {
    const status = loi.message === 'Tài khoản chưa được phân quyền.' ? 403 : 500;
    res.status(status).json({ success: false, message: loi.message });
  }
});

router.get('/sync-status', requirePermission('view_orders'), (req, res) => {
  res.json({ success: true, data: layTinhTrangDongBo() });
});

router.post('/sync', requirePermission('manage_orders'), async (req, res) => {
  try {
    res.json({ success: true, data: await dongBoChuyenPhatNhanh() });
  } catch (loi) {
    res.status(502).json({ success: false, message: loi.message });
  }
});

module.exports = router;
