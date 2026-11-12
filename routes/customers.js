const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const CustomerGroup = require('../models/CustomerGroup');
const CustomerRelationship = require('../models/CustomerRelationship');
const Employee = require('../models/Employee');
const Order = require('../models/Order');
const User = require('../models/User');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/all', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try { res.json({ success: true, data: await Customer.find({ isActive: { $ne: false } }).populate('nhanVienQuanLy', 'name').populate('customerGroup', 'name').sort({ name: 1 }) }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/order-counts', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    const rawIds = req.body?.maKhachHangs;
    if (!Array.isArray(rawIds) || rawIds.length > 100 || rawIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ success: false, message: 'Danh sách khách hàng không hợp lệ.' });
    }
    const maKhachHangs = [...new Set(rawIds.map(String))];
    const role = req.auth?.role;
    if (!(req.auth?.isSuperAdmin || role?.permissions?.includes('view_orders')) || !maKhachHangs.length) {
      return res.json({ success: true, data: [] });
    }

    const khachHang = await Customer.find({ _id: { $in: maKhachHangs }, isActive: { $ne: false } })
      .select('name company tenTruoc')
      .lean();
    const phamViDon = role?.dataScopes?.orders || (['Nhân Viên', 'Chỉ Xem'].includes(role?.name) ? 'own' : 'all');
    const boLocPhamViDon = {};
    if (!req.auth?.isSuperAdmin && phamViDon !== 'all') {
      const nguoiDung = await User.findById(req.auth.userId).populate('employeeId', 'name department').lean();
      if (phamViDon === 'own') {
        const tenNhanVien = String(nguoiDung?.employeeId?.name || '').trim();
        if (tenNhanVien) boLocPhamViDon['Nhân Viên Đăng Ký'] = tenNhanVien;
        else boLocPhamViDon._id = null;
      } else if (phamViDon === 'department') {
        const boPhan = String(nguoiDung?.employeeId?.department || '').trim();
        if (boPhan) boLocPhamViDon['Bộ Phận'] = boPhan;
        else boLocPhamViDon._id = null;
      }
    }

    const dinhDanh = khachHang.map(khach => ({
      id: String(khach._id),
      ten: [...new Set([khach.name, khach.company, ...(khach.tenTruoc || [])].map(value => String(value || '').trim()).filter(Boolean))]
    })).filter(khach => khach.ten.length);
    const tenTheoKhach = new Map();
    dinhDanh.forEach(khach => khach.ten.forEach(ten => {
      if (!tenTheoKhach.has(ten)) tenTheoKhach.set(ten, []);
      tenTheoKhach.get(ten).push(khach.id);
    }));
    const danhSachTen = [...tenTheoKhach.keys()];
    const soDonTheoTen = danhSachTen.length
      ? await Order.aggregate([
        { $match: { archivedAt: null, ...boLocPhamViDon, $or: [{ 'Tên Khách Hàng': { $in: danhSachTen } }, { 'Tên Công Ty ': { $in: danhSachTen } }] } },
        { $project: { tenKhachHang: { $ifNull: ['$Tên Khách Hàng', ''] }, tenCongTy: { $ifNull: ['$Tên Công Ty ', ''] } } },
        { $project: { tenKhach: { $setIntersection: [['$tenKhachHang', '$tenCongTy'], { $literal: danhSachTen }] } } },
        { $unwind: '$tenKhach' },
        { $group: { _id: '$tenKhach', soDonHang: { $sum: 1 } } }
      ]).option({ maxTimeMS: 15000 })
      : [];
    const dem = new Map();
    soDonTheoTen.forEach(item => (tenTheoKhach.get(item._id) || []).forEach(ma => dem.set(ma, (dem.get(ma) || 0) + item.soDonHang)));
    res.json({
      success: true,
      data: khachHang.map(khach => ({ maKhachHang: String(khach._id), soDonHang: dem.get(String(khach._id)) || 0 }))
    });
  } catch (error) {
    console.error('Lỗi đếm đơn theo khách hàng:', error);
    res.status(500).json({ success: false, message: 'Không thể tải số đơn hàng của khách hàng.' });
  }
});

// Paginated + searchable listing for the customer management screen (avoids loading the whole collection)
router.get('/', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const q = String(req.query.q || '').trim();
    const filter = { isActive: { $ne: false } };
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { code: regex }, { phone: regex }, { email: regex }, { mst: regex }, { company: regex }];
    }
    const [items, total] = await Promise.all([
      Customer.find(filter).populate('nhanVienQuanLy', 'name').populate('customerGroup', 'name').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Customer.countDocuments(filter)
    ]);
    res.json({ success: true, data: items, meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Tra cứu khách hàng theo MST
router.get('/search-by-mst', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    const mst = String(req.query.mst || '').trim();
    if (!mst) {
      return res.status(400).json({ success: false, message: 'MST không được để trống' });
    }

    // Tìm khách hàng theo MST
    const customer = await Customer.findOne({ 
      mst: mst,
      isActive: { $ne: false } 
    }).populate('nhanVienQuanLy', 'name').lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    }

    // Trả về thông tin khách hàng (map các tên trường)
    res.json({
      success: true,
      data: {
        _id: customer._id,
        tenKH: customer.name,
        sdt: customer.phone,
        mst: customer.mst,
        congTy: customer.company,
        diaChiCongTy: customer.deliveryAddress,
        diaChiGiaoNhan: customer.deliveryAddress,
        email: customer.email
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy nhóm của một khách hàng
router.get('/:customerId/groups', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.customerId)) {
      return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ' });
    }

    const customer = await Customer.findById(req.params.customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    }

    let groups = [];
    if (customer.customerGroup) {
      const group = await CustomerGroup.findById(customer.customerGroup)
        .populate('customers', 'name code')
        .populate('createdBy', 'name');
      groups = group ? [group] : [];
    }

    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/relationships/options', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    let idKhachHang = String(req.query.customerId || '');
    if (!mongoose.Types.ObjectId.isValid(idKhachHang)) {
      return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ.' });
    }
    idKhachHang = new mongoose.Types.ObjectId(idKhachHang).toString();
    const khachHang = await Customer.exists({ _id: idKhachHang, isActive: { $ne: false } });
    if (!khachHang) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });

    const tuKhoa = String(req.query.q || '').trim().slice(0, 100);
    if (!tuKhoa) return res.json({ success: true, data: [] });
    const bieuThuc = new RegExp(tuKhoa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const danhSach = await Customer.find({
      _id: { $ne: idKhachHang },
      isActive: { $ne: false },
      $or: [{ name: bieuThuc }, { code: bieuThuc }, { phone: bieuThuc }, { email: bieuThuc }, { company: bieuThuc }]
    })
      .select('name code phone')
      .sort({ name: 1 })
      .limit(100)
      .lean();
    const idsUngVien = danhSach.map(khach => khach._id);
    const lienKetDaCo = idsUngVien.length
      ? await CustomerRelationship.find({
        $or: [
          { khachHangA: idKhachHang, khachHangB: { $in: idsUngVien } },
          { khachHangB: idKhachHang, khachHangA: { $in: idsUngVien } }
        ]
      }).select('khachHangA khachHangB').lean()
      : [];
    const idsDaLienKet = new Set(lienKetDaCo.map(lienKet =>
      String(lienKet.khachHangA) === idKhachHang ? String(lienKet.khachHangB) : String(lienKet.khachHangA)
    ));
    res.json({ success: true, data: danhSach.filter(khach => !idsDaLienKet.has(String(khach._id))).slice(0, 20) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:customerId/relationships', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    let idKhachHang = String(req.params.customerId);
    if (!mongoose.Types.ObjectId.isValid(idKhachHang)) {
      return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ.' });
    }
    idKhachHang = new mongoose.Types.ObjectId(idKhachHang).toString();
    const khachHang = await Customer.exists({ _id: idKhachHang, isActive: { $ne: false } });
    if (!khachHang) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });

    const trang = Math.max(1, parseInt(req.query.page, 10) || 1);
    const gioiHan = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const boLoc = { $or: [{ khachHangA: idKhachHang }, { khachHangB: idKhachHang }] };
    const [danhSach, tongSo] = await Promise.all([
      CustomerRelationship.find(boLoc)
        .populate('khachHangA', 'name code phone')
        .populate('khachHangB', 'name code phone')
        .sort({ createdAt: -1, _id: -1 })
        .skip((trang - 1) * gioiHan)
        .limit(gioiHan)
        .lean(),
      CustomerRelationship.countDocuments(boLoc)
    ]);
    const duLieu = danhSach.map(lienKet => ({
      _id: lienKet._id,
      moTa: lienKet.moTa,
      khachHang: String(lienKet.khachHangA?._id) === idKhachHang ? lienKet.khachHangB : lienKet.khachHangA
    })).filter(lienKet => lienKet.khachHang);
    res.json({
      success: true,
      data: duLieu,
      meta: { page: trang, limit: gioiHan, total: tongSo, totalPages: Math.max(1, Math.ceil(tongSo / gioiHan)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/relationships', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    let idKhachHangA = String(req.body.khachHangA || '');
    let idKhachHangB = String(req.body.khachHangB || '');
    const moTa = String(req.body.moTa || '').trim();
    if (!mongoose.Types.ObjectId.isValid(idKhachHangA) || !mongoose.Types.ObjectId.isValid(idKhachHangB)) {
      return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ.' });
    }
    idKhachHangA = new mongoose.Types.ObjectId(idKhachHangA).toString();
    idKhachHangB = new mongoose.Types.ObjectId(idKhachHangB).toString();
    if (idKhachHangA === idKhachHangB) {
      return res.status(400).json({ success: false, message: 'Không thể liên kết khách hàng với chính mình.' });
    }
    if (!moTa || moTa.length > 250) {
      return res.status(400).json({ success: false, message: 'Mô tả quan hệ bắt buộc và tối đa 250 ký tự.' });
    }

    const idsKhachHang = [idKhachHangA, idKhachHangB].sort();
    const khachHangHopLe = await Customer.find({
      _id: { $in: idsKhachHang },
      isActive: { $ne: false }
    }).select('_id').lean();
    if (khachHangHopLe.length !== 2) {
      return res.status(400).json({ success: false, message: 'Khách hàng không tồn tại hoặc đã ngừng hoạt động.' });
    }
    const daTonTai = await CustomerRelationship.exists({
      khachHangA: idsKhachHang[0],
      khachHangB: idsKhachHang[1]
    });
    if (daTonTai) {
      return res.status(409).json({ success: false, message: 'Hai khách hàng đã được liên kết.' });
    }

    const lienKet = await CustomerRelationship.create({
      khachHangA: idsKhachHang[0],
      khachHangB: idsKhachHang[1],
      moTa: moTa
    });
    const duLieu = await lienKet.populate([
      { path: 'khachHangA', select: 'name code phone' },
      { path: 'khachHangB', select: 'name code phone' }
    ]);
    res.status(201).json({ success: true, data: duLieu });
  } catch (loi) {
    if (loi.code === 11000) {
      return res.status(409).json({ success: false, message: 'Hai khách hàng đã được liên kết.' });
    }
    const trangThai = ['ValidationError', 'CastError'].includes(loi.name) ? 400 : 500;
    res.status(trangThai).json({ success: false, message: loi.message });
  }
});

router.delete('/:customerId/relationships/:relationshipId', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    const { customerId: idKhachHang, relationshipId: idLienKet } = req.params;
    if (!mongoose.Types.ObjectId.isValid(idKhachHang) || !mongoose.Types.ObjectId.isValid(idLienKet)) {
      return res.status(400).json({ success: false, message: 'ID không hợp lệ.' });
    }
    const ketQua = await CustomerRelationship.deleteOne({
      _id: idLienKet,
      $or: [{ khachHangA: idKhachHang }, { khachHangB: idKhachHang }]
    });
    if (!ketQua.deletedCount) return res.status(404).json({ success: false, message: 'Không tìm thấy liên kết khách hàng.' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/create', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    const nhanVienQuanLy = String(req.body.nhanVienQuanLy || '');
    if (nhanVienQuanLy && !mongoose.Types.ObjectId.isValid(nhanVienQuanLy)) {
      return res.status(400).json({ success: false, message: 'Nhân viên quản lý không hợp lệ.' });
    }
    if (nhanVienQuanLy && !await Employee.exists({ _id: nhanVienQuanLy, isActive: { $ne: false } })) {
      return res.status(400).json({ success: false, message: 'Nhân viên quản lý không tồn tại hoặc đã ngừng hoạt động.' });
    }

    const customerGroup = String(req.body.customerGroup || '');
    if (customerGroup && !mongoose.Types.ObjectId.isValid(customerGroup)) {
      return res.status(400).json({ success: false, message: 'Nhóm khách hàng không hợp lệ.' });
    }
    if (customerGroup && !await CustomerGroup.exists({ _id: customerGroup, isActive: { $ne: false } })) {
      return res.status(400).json({ success: false, message: 'Nhóm khách hàng không tồn tại hoặc đã ngừng hoạt động.' });
    }

    const newCustomer = await Customer.create({
      ...req.body,
      nhanVienQuanLy: nhanVienQuanLy || null,
      customerGroup: customerGroup || null
    });
    if (customerGroup) {
      await CustomerGroup.updateOne({ _id: customerGroup }, { $addToSet: { customers: newCustomer._id } });
    }
    const populated = await newCustomer.populate('nhanVienQuanLy', 'name').populate('customerGroup', 'name');
    res.status(201).json({ success: true, data: populated });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/update/:id', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    const khachCu = await Customer.findById(req.params.id).select('name');
    if (!khachCu) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    const updates = { ...req.body };
    delete updates.tenTruoc;
    if (Object.prototype.hasOwnProperty.call(updates, 'name')) updates.name = String(updates.name || '').trim();
    let tenTruoc = [];
    if (Object.prototype.hasOwnProperty.call(req.body, 'tenTruoc')) {
      if (!Array.isArray(req.body.tenTruoc) || req.body.tenTruoc.some(ten => typeof ten !== 'string' || ten.length > 200)) {
        return res.status(400).json({ success: false, message: 'Danh sách tên trước đây không hợp lệ.' });
      }
      tenTruoc = req.body.tenTruoc.map(ten => ten.trim()).filter(Boolean);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'nhanVienQuanLy')) {
      const nhanVienQuanLy = String(req.body.nhanVienQuanLy || '');
      if (nhanVienQuanLy && !mongoose.Types.ObjectId.isValid(nhanVienQuanLy)) {
        return res.status(400).json({ success: false, message: 'Nhân viên quản lý không hợp lệ.' });
      }
      if (nhanVienQuanLy && !await Employee.exists({ _id: nhanVienQuanLy, isActive: { $ne: false } })) {
        return res.status(400).json({ success: false, message: 'Nhân viên quản lý không tồn tại hoặc đã ngừng hoạt động.' });
      }
      updates.nhanVienQuanLy = nhanVienQuanLy || null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'customerGroup')) {
      const customerGroup = String(req.body.customerGroup || '');
      if (customerGroup && !mongoose.Types.ObjectId.isValid(customerGroup)) {
        return res.status(400).json({ success: false, message: 'Nhóm khách hàng không hợp lệ.' });
      }
      if (customerGroup && !await CustomerGroup.exists({ _id: customerGroup, isActive: { $ne: false } })) {
        return res.status(400).json({ success: false, message: 'Nhóm khách hàng không tồn tại hoặc đã ngừng hoạt động.' });
      }
      updates.customerGroup = customerGroup || null;
    }
    const tenCu = String(khachCu.name || '').trim();
    const tenMoi = String(updates.name || '').trim();
    const doiTen = tenCu && tenMoi && tenCu.toLocaleLowerCase() !== tenMoi.toLocaleLowerCase();
    const capNhat = { $set: updates };
    if (doiTen) tenTruoc.push(tenCu);
    tenTruoc = [...new Map(tenTruoc.filter(ten => ten.toLocaleLowerCase() !== tenMoi.toLocaleLowerCase()).map(ten => [ten.toLocaleLowerCase(), ten])).values()];
    if (tenTruoc.length) capNhat.$addToSet = { tenTruoc: { $each: tenTruoc } };
    const customer = await Customer.findByIdAndUpdate(req.params.id, capNhat, { new: true, runValidators: true }).populate('nhanVienQuanLy', 'name').populate('customerGroup', 'name');
    if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    if (Object.prototype.hasOwnProperty.call(req.body, 'customerGroup')) {
      await CustomerGroup.updateMany(
        { _id: { $ne: updates.customerGroup }, customers: customer._id },
        { $pull: { customers: customer._id } }
      );
      if (updates.customerGroup) {
        await CustomerGroup.updateOne({ _id: updates.customerGroup }, { $addToSet: { customers: customer._id } });
      }
    }
    res.json({ success: true, data: customer });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/delete/:id', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try { const customer = await Customer.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }); if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' }); res.json({ success: true, data: customer }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ============== CUSTOMER GROUP ENDPOINTS ==============

// Lấy tất cả nhóm khách hàng
router.get('/groups/list/all', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    const groups = await CustomerGroup.find({ isActive: { $ne: false } })
      .populate('customers', 'name code')
      .populate('createdBy', 'name')
      .sort({ name: 1 });
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy nhóm khách hàng với phân trang
router.get('/groups/list', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const q = String(req.query.q || '').trim();
    const filter = { isActive: { $ne: false } };
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { description: regex }];
    }
    const [groups, total] = await Promise.all([
      CustomerGroup.find(filter)
        .populate('createdBy', 'name')
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name description createdBy isActive createdAt updatedAt')
        .lean(),
      CustomerGroup.countDocuments(filter)
    ]);
    res.json({
      success: true,
      data: groups,
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/groups/options', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = { isActive: { $ne: false } };
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.name = regex;
    }
    const groups = await CustomerGroup.find(filter)
      .select('name')
      .sort({ name: 1 })
      .limit(limit)
      .lean();
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/groups/:groupId/customers', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ success: false, message: 'ID nhóm không hợp lệ' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const group = await CustomerGroup.findOne({ _id: req.params.groupId, isActive: { $ne: false } }).select('customers').lean();
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm khách hàng' });
    }
    const filter = { _id: { $in: group.customers || [] }, isActive: { $ne: false } };
    const q = String(req.query.q || '').trim();
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { code: regex }, { phone: regex }, { email: regex }];
    }
    const [customers, total] = await Promise.all([
      Customer.find(filter).select('name code phone email').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Customer.countDocuments(filter)
    ]);
    res.json({
      success: true,
      data: customers,
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy chi tiết nhóm khách hàng
router.get('/groups/:groupId', requireAuth, requirePermission('view_customers'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ success: false, message: 'ID nhóm không hợp lệ' });
    }
    const group = await CustomerGroup.findById(req.params.groupId)
      .populate('customers')
      .populate('createdBy', 'name email');
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm khách hàng' });
    }
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Tạo nhóm khách hàng
router.post('/groups/create', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    const { name, description, customers } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên nhóm không được để trống' });
    }
    if (!req.auth?.userId || !mongoose.Types.ObjectId.isValid(req.auth.userId)) {
      return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' });
    }

    let customerIds = [];
    if (Array.isArray(customers) && customers.length > 0) {
      for (const customerId of customers) {
        if (!mongoose.Types.ObjectId.isValid(customerId)) {
          return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ' });
        }
      }
      const validCustomers = await Customer.find({
        _id: { $in: customers },
        isActive: { $ne: false }
      }).select('_id');
      if (validCustomers.length !== new Set(customers.map(String)).size) {
        return res.status(400).json({ success: false, message: 'Danh sách khách hàng không hợp lệ hoặc có khách hàng đã ngừng hoạt động.' });
      }
      customerIds = validCustomers.map(c => c._id);
    }

    const newGroup = await CustomerGroup.create({
      name: name.trim(),
      description: String(description || '').trim(),
      customers: customerIds,
      createdBy: req.auth.userId
    });

    if (customerIds.length) {
      await CustomerGroup.updateMany({ _id: { $ne: newGroup._id }, customers: { $in: customerIds } }, { $pull: { customers: { $in: customerIds } } });
      await Customer.updateMany({ _id: { $in: customerIds } }, { customerGroup: newGroup._id });
    }
    const populatedGroup = await newGroup.populate('customers', 'name code');
    res.status(201).json({ success: true, data: populatedGroup });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Cập nhật nhóm khách hàng
router.put('/groups/:groupId', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ success: false, message: 'ID nhóm không hợp lệ' });
    }

    const { name, description, customers } = req.body;
    const updates = {};

    if (name !== undefined) {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Tên nhóm không được để trống' });
      }
      updates.name = String(name).trim();
    }

    if (description !== undefined) {
      updates.description = String(description || '').trim();
    }

    if (Array.isArray(customers)) {
      for (const customerId of customers) {
        if (!mongoose.Types.ObjectId.isValid(customerId)) {
          return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ' });
        }
      }
      const validCustomers = await Customer.find({
        _id: { $in: customers },
        isActive: { $ne: false }
      }).select('_id');
      if (validCustomers.length !== new Set(customers.map(String)).size) {
        return res.status(400).json({ success: false, message: 'Danh sách khách hàng không hợp lệ hoặc có khách hàng đã ngừng hoạt động.' });
      }
      updates.customers = validCustomers.map(c => c._id);
    }

    const currentGroup = await CustomerGroup.findById(req.params.groupId).select('customers');
    if (!currentGroup) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm khách hàng' });
    }
    if (Array.isArray(updates.customers)) {
      const idsMoi = updates.customers;
      const idsCu = currentGroup.customers || [];
      await CustomerGroup.updateMany(
        { _id: { $ne: currentGroup._id }, customers: { $in: idsMoi } },
        { $pull: { customers: { $in: idsMoi } } }
      );
      await Customer.updateMany({ _id: { $in: idsCu }, customerGroup: currentGroup._id }, { customerGroup: null });
      await Customer.updateMany({ _id: { $in: idsMoi } }, { customerGroup: currentGroup._id });
    }
    const group = await CustomerGroup.findByIdAndUpdate(req.params.groupId, updates, { new: true, runValidators: true })
      .populate('customers', 'name code')
      .populate('createdBy', 'name');

    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm khách hàng' });
    }
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Thêm khách hàng vào nhóm
router.post('/groups/:groupId/add-customer', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    const { customerId } = req.body;
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ success: false, message: 'ID nhóm không hợp lệ' });
    }

    const customer = await Customer.findOne({ _id: customerId, isActive: { $ne: false } });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    }

    const targetGroup = await CustomerGroup.findOne({ _id: req.params.groupId, isActive: { $ne: false } }).select('_id');
    if (!targetGroup) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm khách hàng' });
    }
    await CustomerGroup.updateMany(
      { _id: { $ne: targetGroup._id }, customers: customerId },
      { $pull: { customers: customerId } }
    );
    const group = await CustomerGroup.findByIdAndUpdate(
      req.params.groupId,
      { $addToSet: { customers: customerId } },
      { new: true }
    ).select('name description isActive');
    await Customer.updateOne({ _id: customerId }, { customerGroup: targetGroup._id });
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Xóa khách hàng khỏi nhóm
router.post('/groups/:groupId/remove-customer', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    const { customerId } = req.body;
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ success: false, message: 'ID khách hàng không hợp lệ' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ success: false, message: 'ID nhóm không hợp lệ' });
    }

    const group = await CustomerGroup.findByIdAndUpdate(
      req.params.groupId,
      { $pull: { customers: customerId } },
      { new: true }
    ).select('name description isActive');

    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm khách hàng' });
    }
    await Customer.updateOne({ _id: customerId, customerGroup: group._id }, { customerGroup: null });
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Xóa nhóm khách hàng (soft delete)
router.delete('/groups/:groupId', requireAuth, requirePermission('manage_customers'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ success: false, message: 'ID nhóm không hợp lệ' });
    }

    const group = await CustomerGroup.findByIdAndUpdate(
      req.params.groupId,
      { isActive: false },
      { new: true }
    );

    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm khách hàng' });
    }
    await Customer.updateMany({ customerGroup: group._id }, { customerGroup: null });
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
