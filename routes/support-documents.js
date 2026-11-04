const express = require('express');
const Role = require('../models/Role');
const TaiLieuHoTro = require('../models/TaiLieuHoTro');
const ChuDeTaiLieu = require('../models/ChuDeTaiLieu');
const GIOI_HAN_CHU_DE = 200;

const boDinhTuyen = express.Router();
const GIOI_HAN_TRANG = 50;
const GIOI_HAN_NOI_DUNG = 8000000;

async function yeuCauAdmin(req, res, next) {
  try {
    const vaiTro = await Role.findById(req.auth?.userRecord?.roleId).select('name').lean();
    if (vaiTro?.name !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Chỉ Admin được quản lý tài liệu hỗ trợ.' });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Không thể kiểm tra quyền quản lý tài liệu.' });
  }
}

function layDuLieuTaiLieu(duLieu = {}) {
  const tieuDe = String(duLieu.tieuDe || '').trim();
  const chuDe = String(duLieu.chuDe || '').trim();
  const noiDung = String(duLieu.noiDung || '');
  if (!tieuDe) return { loi: 'Vui lòng nhập tiêu đề tài liệu.' };
  if (tieuDe.length > 160) return { loi: 'Tiêu đề không được vượt quá 160 ký tự.' };
  if (!chuDe) return { loi: 'Vui lòng chọn chủ đề cho tài liệu.' };
  if (chuDe.length > 80) return { loi: 'Chủ đề không được vượt quá 80 ký tự.' };
  if (!noiDung.trim()) return { loi: 'Vui lòng nhập nội dung tài liệu.' };
  if (noiDung.length > GIOI_HAN_NOI_DUNG) return { loi: 'Nội dung không được vượt quá 8.000.000 ký tự (hãy giảm số lượng ảnh).' };
  return { tieuDe, chuDe, noiDung };
}

boDinhTuyen.get('/topics', async (req, res) => {
  try {
    const danhSach = await ChuDeTaiLieu.find().select('_id ten').sort({ ten: 1 }).limit(GIOI_HAN_CHU_DE).lean();
    res.json({ success: true, data: danhSach });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Không thể tải danh sách chủ đề.' });
  }
});

boDinhTuyen.post('/topics', yeuCauAdmin, async (req, res) => {
  const ten = String(req.body?.ten || '').trim();
  if (!ten) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên chủ đề.' });
  if (ten.length > 80) return res.status(400).json({ success: false, message: 'Tên chủ đề không được vượt quá 80 ký tự.' });
  try {
    if (await ChuDeTaiLieu.countDocuments() >= GIOI_HAN_CHU_DE) {
      return res.status(400).json({ success: false, message: `Tối đa ${GIOI_HAN_CHU_DE} chủ đề.` });
    }
    const chuDe = await ChuDeTaiLieu.create({ ten, nguoiTao: req.auth?.username || '' });
    return res.status(201).json({ success: true, data: chuDe });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'Chủ đề này đã tồn tại.' });
    return res.status(500).json({ success: false, message: 'Không thể tạo chủ đề.' });
  }
});

boDinhTuyen.delete('/topics/:id', yeuCauAdmin, async (req, res) => {
  try {
    const chuDe = await ChuDeTaiLieu.findById(req.params.id);
    if (!chuDe) return res.status(404).json({ success: false, message: 'Không tìm thấy chủ đề.' });
    if (await TaiLieuHoTro.exists({ chuDe: chuDe.ten })) {
      return res.status(409).json({ success: false, message: 'Chủ đề còn tài liệu, hãy xóa hoặc chuyển tài liệu trước.' });
    }
    await chuDe.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Mã chủ đề không hợp lệ.' });
    return res.status(500).json({ success: false, message: 'Không thể xóa chủ đề.' });
  }
});

boDinhTuyen.get('/documents', async (req, res) => {
  try {
    const soTrangYeuCau = Number.parseInt(req.query.page, 10) || 1;
    const gioiHan = Math.min(GIOI_HAN_TRANG, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
    const dieuKien = {};
    const tuKhoa = String(req.query.q || '').trim().slice(0, 100);
    if (tuKhoa) {
      const tuKhoaAnToan = tuKhoa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      dieuKien.$or = [
        { tieuDe: { $regex: tuKhoaAnToan, $options: 'i' } },
        { chuDe: { $regex: tuKhoaAnToan, $options: 'i' } }
      ];
    }
    const tongSo = await TaiLieuHoTro.countDocuments(dieuKien);
    const tongSoTrang = Math.max(1, Math.ceil(tongSo / gioiHan));
    const soTrang = Number.isSafeInteger(soTrangYeuCau) ? Math.min(tongSoTrang, Math.max(1, soTrangYeuCau)) : 1;
    const danhSach = await TaiLieuHoTro.find(dieuKien)
      .select('_id tieuDe chuDe nguoiCapNhat updatedAt')
      .sort({ chuDe: 1, tieuDe: 1, _id: 1 })
      .skip((soTrang - 1) * gioiHan)
      .limit(gioiHan)
      .lean();
    res.json({
      success: true,
      data: { items: danhSach, page: soTrang, limit: gioiHan, total: tongSo, totalPages: tongSoTrang }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Không thể tải danh sách tài liệu hỗ trợ.' });
  }
});

boDinhTuyen.get('/documents/:id', async (req, res) => {
  try {
    const taiLieu = await TaiLieuHoTro.findById(req.params.id).lean();
    if (!taiLieu) return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu.' });
    return res.json({ success: true, data: taiLieu });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Mã tài liệu không hợp lệ.' });
    return res.status(500).json({ success: false, message: 'Không thể tải tài liệu hỗ trợ.' });
  }
});

boDinhTuyen.post('/documents', yeuCauAdmin, async (req, res) => {
  const duLieu = layDuLieuTaiLieu(req.body);
  if (duLieu.loi) return res.status(400).json({ success: false, message: duLieu.loi });
  try {
    if (!await ChuDeTaiLieu.exists({ ten: duLieu.chuDe })) {
      return res.status(400).json({ success: false, message: 'Chủ đề không tồn tại, hãy tạo chủ đề trước.' });
    }
    const taiLieu = await TaiLieuHoTro.create({
      tieuDe: duLieu.tieuDe,
      chuDe: duLieu.chuDe,
      noiDung: duLieu.noiDung,
      nguoiTao: req.auth?.username || '',
      nguoiCapNhat: req.auth?.username || ''
    });
    return res.status(201).json({ success: true, data: taiLieu });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Không thể tạo tài liệu hỗ trợ.' });
  }
});

boDinhTuyen.put('/documents/:id', yeuCauAdmin, async (req, res) => {
  const duLieu = layDuLieuTaiLieu(req.body);
  if (duLieu.loi) return res.status(400).json({ success: false, message: duLieu.loi });
  try {
    const hienTai = await TaiLieuHoTro.findById(req.params.id).select('chuDe').lean();
    if (!hienTai) return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu.' });
    if (hienTai.chuDe !== duLieu.chuDe && !await ChuDeTaiLieu.exists({ ten: duLieu.chuDe })) {
      return res.status(400).json({ success: false, message: 'Chủ đề không tồn tại, hãy tạo chủ đề trước.' });
    }
    const taiLieu = await TaiLieuHoTro.findByIdAndUpdate(req.params.id, {
      tieuDe: duLieu.tieuDe,
      chuDe: duLieu.chuDe,
      noiDung: duLieu.noiDung,
      nguoiCapNhat: req.auth?.username || ''
    }, { new: true, runValidators: true });
    if (!taiLieu) return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu.' });
    return res.json({ success: true, data: taiLieu });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Mã tài liệu không hợp lệ.' });
    return res.status(500).json({ success: false, message: 'Không thể cập nhật tài liệu hỗ trợ.' });
  }
});

boDinhTuyen.delete('/documents/:id', yeuCauAdmin, async (req, res) => {
  try {
    const taiLieu = await TaiLieuHoTro.findByIdAndDelete(req.params.id);
    if (!taiLieu) return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu.' });
    return res.json({ success: true });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Mã tài liệu không hợp lệ.' });
    return res.status(500).json({ success: false, message: 'Không thể xóa tài liệu hỗ trợ.' });
  }
});

module.exports = boDinhTuyen;
