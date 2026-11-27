const express = require('express');
const CongNoKlCuCauHinh = require('../models/CongNoKlCuCauHinh');
const CongNoKlCuGiaoDich = require('../models/CongNoKlCuGiaoDich');
const { yeuCauCongCu } = require('../middleware/auth');
const { luuTepNang, docTepNang } = require('../services/fileStorageService');
const { ghiSauCapNhat } = require('../services/nhatKyCongCu');

const router = express.Router();
const MA_CONG_CU = 'theo-doi-cong-no-kl-cu';
const MA_CAU_HINH = 'khanh-linh-cu';
const GIOI_HAN_MAC_DINH = 50;
const GIOI_HAN_TOI_DA = 100;
const SO_TRANG_TOI_DA = 10000;
const SO_TIEN_TOI_DA = 1e13;
const MAX_ANH_BYTES = 10 * 1024 * 1024;

function ngayHopLe(giaTri, batBuoc) {
  const chuoi = String(giaTri ?? '').trim();
  if (!chuoi && !batBuoc) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chuoi)) return undefined;
  const ngay = new Date(`${chuoi}T00:00:00.000Z`);
  return Number.isNaN(ngay.getTime()) || ngay.toISOString().slice(0, 10) !== chuoi ? undefined : ngay;
}

function soNguyenHopLe(giaTri, min, max) {
  if (giaTri === '' || giaTri === null || giaTri === undefined) return NaN;
  const so = Number(giaTri);
  return Number.isSafeInteger(so) && so >= min && so <= max ? so : NaN;
}

function kiemTraAnhDataUrl(dataUrl) {
  const chuoi = String(dataUrl || '').trim();
  if (!chuoi) return { hopLe: true, rong: true };
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(chuoi);
  if (!match) {
    return { hopLe: false, loi: 'Ảnh chụp chứng từ không hợp lệ (chỉ hỗ trợ JPG, PNG, WEBP, GIF).' };
  }
  const bytes = Buffer.from(match[2], 'base64').length;
  if (bytes <= 0 || bytes > MAX_ANH_BYTES) {
    return { hopLe: false, loi: 'Ảnh chụp chứng từ không được vượt quá 10MB.' };
  }
  return { hopLe: true, rong: false, dataUrl: chuoi };
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function kiemTraDuLieuGiaoDich(body = {}) {
  const ngayChuyen = ngayHopLe(body.ngayChuyen, true);
  const nguoiChuyen = String(body.nguoiChuyen || '').trim().replace(/\s+/g, ' ');
  const soTien = soNguyenHopLe(body.soTien, 1, SO_TIEN_TOI_DA);
  const ghiChu = String(body.ghiChu || '').trim();
  const tenAnhChungTu = String(body.tenAnhChungTu || '').trim().slice(0, 150);

  if (!ngayChuyen) return { loi: 'Ngày chuyển khoản không hợp lệ.' };
  if (!nguoiChuyen) return { loi: 'Vui lòng nhập tên người chuyển khoản.' };
  if (nguoiChuyen.length > 100) return { loi: 'Tên người chuyển không được vượt quá 100 ký tự.' };
  if (Number.isNaN(soTien)) return { loi: 'Số tiền chuyển phải là số nguyên lớn hơn 0.' };
  if (ghiChu.length > 500) return { loi: 'Ghi chú không được vượt quá 500 ký tự.' };

  const ketQuaAnh = kiemTraAnhDataUrl(body.anhChungTuDataUrl);
  if (!ketQuaAnh.hopLe) return { loi: ketQuaAnh.loi };

  return {
    ngayChuyen,
    nguoiChuyen,
    soTien,
    ghiChu,
    tenAnhChungTu,
    anhChungTuDataUrl: ketQuaAnh.rong ? '' : ketQuaAnh.dataUrl
  };
}

function dinhDangMuc(item, duNoTruoc = null, duNoSau = null) {
  return {
    _id: item._id,
    ngayChuyen: item.ngayChuyen,
    nguoiChuyen: item.nguoiChuyen,
    soTien: item.soTien,
    ghiChu: item.ghiChu || '',
    coAnhChungTu: Boolean(item.anhChungTu),
    tenAnhChungTu: item.tenAnhChungTu || '',
    duNoTruoc,
    duNoSau,
    nguoiTao: item.nguoiTao || '',
    nguoiCapNhat: item.nguoiCapNhat || '',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

router.use(yeuCauCongCu(MA_CONG_CU));

router.get('/', async (req, res) => {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limitReq = req.query.limit === undefined ? GIOI_HAN_MAC_DINH : Number(req.query.limit);
  const sort = req.query.sort === 'asc' ? 'asc' : 'desc';
  const tuKhoa = String(req.query.q || '').trim().slice(0, 100);

  if (!Number.isSafeInteger(page) || page < 1 || page > SO_TRANG_TOI_DA) {
    return res.status(400).json({ success: false, message: 'Số trang không hợp lệ.' });
  }
  if (!Number.isSafeInteger(limitReq) || limitReq < 1) {
    return res.status(400).json({ success: false, message: 'Số bản ghi mỗi trang không hợp lệ.' });
  }

  const limit = Math.min(limitReq, GIOI_HAN_TOI_DA);
  const huong = sort === 'asc' ? 1 : -1;
  const boLoc = tuKhoa
    ? {
        $or: [
          { nguoiChuyen: { $regex: escapeRegex(tuKhoa), $options: 'i' } },
          { ghiChu: { $regex: escapeRegex(tuKhoa), $options: 'i' } }
        ]
      }
    : {};

  try {
    const [cauHinhRaw, tongHopRaw, danhSachRaw] = await Promise.all([
      CongNoKlCuCauHinh.findOne({ ma: MA_CAU_HINH })
        .select('tenCongTy soNoBanDau ngayChotNo ghiChu nguoiCapNhat updatedAt')
        .lean(),
      CongNoKlCuGiaoDich.aggregate([
        { $group: { _id: null, tongDaChuyen: { $sum: '$soTien' }, soDotChuyen: { $sum: 1 } } }
      ]),
      CongNoKlCuGiaoDich.find(boLoc)
        .select('ngayChuyen nguoiChuyen soTien ghiChu anhChungTu tenAnhChungTu nguoiTao nguoiCapNhat createdAt updatedAt')
        .sort({ ngayChuyen: huong, createdAt: huong, _id: huong })
        .skip((page - 1) * limit)
        .limit(limit + 1)
        .lean()
    ]);

    const cauHinh = cauHinhRaw || {
      tenCongTy: 'Công Ty KHÁNH LINH',
      soNoBanDau: 0,
      ngayChotNo: null,
      ghiChu: '',
      nguoiCapNhat: '',
      updatedAt: null
    };

    const soNoBanDau = Number(cauHinh.soNoBanDau || 0);
    const tongDaChuyen = Number(tongHopRaw?.[0]?.tongDaChuyen || 0);
    const soDotChuyen = Number(tongHopRaw?.[0]?.soDotChuyen || 0);
    const conNoHienTai = soNoBanDau - tongDaChuyen;
    const phanTramDaTra = soNoBanDau > 0
      ? Math.min(100, Math.round((tongDaChuyen / soNoBanDau) * 1000) / 10)
      : 0;

    const hasMore = danhSachRaw.length > limit;
    const trangItems = danhSachRaw.slice(0, limit);

    let items;
    if (tuKhoa || !trangItems.length) {
      items = trangItems.map(item => dinhDangMuc(item, null, null));
    } else {
      const mucSomNhat = sort === 'asc' ? trangItems[0] : trangItems[trangItems.length - 1];
      const tongTruocRaw = await CongNoKlCuGiaoDich.aggregate([
        {
          $match: {
            $or: [
              { ngayChuyen: { $lt: mucSomNhat.ngayChuyen } },
              { ngayChuyen: mucSomNhat.ngayChuyen, createdAt: { $lt: mucSomNhat.createdAt } },
              { ngayChuyen: mucSomNhat.ngayChuyen, createdAt: mucSomNhat.createdAt, _id: { $lt: mucSomNhat._id } }
            ]
          }
        },
        { $group: { _id: null, tongTruoc: { $sum: '$soTien' } } }
      ]);

      let daChuyenLuyKe = Number(tongTruocRaw?.[0]?.tongTruoc || 0);
      const theoChieuTang = sort === 'asc' ? [...trangItems] : [...trangItems].reverse();
      const mapDuNo = new Map();
      for (const muc of theoChieuTang) {
        const duNoTruoc = soNoBanDau - daChuyenLuyKe;
        const duNoSau = duNoTruoc - Number(muc.soTien || 0);
        daChuyenLuyKe += Number(muc.soTien || 0);
        mapDuNo.set(String(muc._id), { duNoTruoc, duNoSau });
      }

      items = trangItems.map(item => {
        const duNo = mapDuNo.get(String(item._id)) || { duNoTruoc: null, duNoSau: null };
        return dinhDangMuc(item, duNo.duNoTruoc, duNo.duNoSau);
      });
    }

    return res.json({
      success: true,
      data: {
        cauHinh,
        tongQuan: {
          soNoBanDau,
          tongDaChuyen,
          conNoHienTai,
          soDotChuyen,
          phanTramDaTra
        },
        items,
        page,
        limit,
        hasMore,
        sort
      }
    });
  } catch (error) {
    console.error('Không thể tải dữ liệu công nợ KL cũ:', error.message);
    return res.status(500).json({ success: false, message: 'Không thể tải dữ liệu theo dõi công nợ KL cũ.' });
  }
});

router.put('/cau-hinh', async (req, res) => {
  const soNoBanDau = soNguyenHopLe(req.body?.soNoBanDau, 0, SO_TIEN_TOI_DA);
  const tenCongTy = String(req.body?.tenCongTy || 'Công Ty KHÁNH LINH').trim().replace(/\s+/g, ' ');
  const ngayChotNo = ngayHopLe(req.body?.ngayChotNo, false);
  const ghiChu = String(req.body?.ghiChu || '').trim();

  if (Number.isNaN(soNoBanDau)) {
    return res.status(400).json({ success: false, message: 'Số nợ ban đầu phải là số nguyên không âm.' });
  }
  if (!tenCongTy || tenCongTy.length > 150) {
    return res.status(400).json({ success: false, message: 'Tên công ty phải từ 1 đến 150 ký tự.' });
  }
  if (ngayChotNo === undefined) {
    return res.status(400).json({ success: false, message: 'Ngày chốt nợ không hợp lệ.' });
  }
  if (ghiChu.length > 500) {
    return res.status(400).json({ success: false, message: 'Ghi chú không được vượt quá 500 ký tự.' });
  }

  try {
    const cauHinh = await CongNoKlCuCauHinh.findOneAndUpdate(
      { ma: MA_CAU_HINH },
      {
        $set: {
          tenCongTy,
          soNoBanDau,
          ngayChotNo,
          ghiChu,
          nguoiCapNhat: req.auth?.username || ''
        }
      },
      { upsert: true, new: true }
    );
    await ghiSauCapNhat(req, res, MA_CONG_CU, 'cap-nhat', 'Cấu hình nợ gốc KL');
    return res.json({ success: true, data: cauHinh });
  } catch (error) {
    console.error('Không thể cập nhật cấu hình nợ KL cũ:', error.message);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật số nợ ban đầu.' });
  }
});

router.post('/giao-dich', async (req, res) => {
  const duLieu = kiemTraDuLieuGiaoDich(req.body);
  if (duLieu.loi) return res.status(400).json({ success: false, message: duLieu.loi });

  try {
    let anhChungTu = '';
    if (duLieu.anhChungTuDataUrl) {
      anhChungTu = await luuTepNang({
        dataUrl: duLieu.anhChungTuDataUrl,
        fileName: duLieu.tenAnhChungTu || 'chung-tu-kl',
        prefix: 'cong-no-kl-cu'
      });
    }

    const item = await CongNoKlCuGiaoDich.create({
      ngayChuyen: duLieu.ngayChuyen,
      nguoiChuyen: duLieu.nguoiChuyen,
      soTien: duLieu.soTien,
      ghiChu: duLieu.ghiChu,
      anhChungTu,
      tenAnhChungTu: anhChungTu ? (duLieu.tenAnhChungTu || 'chung-tu-kl') : '',
      nguoiTao: req.auth?.username || '',
      nguoiCapNhat: req.auth?.username || ''
    });

    await ghiSauCapNhat(req, res, MA_CONG_CU, 'tao', `${item.nguoiChuyen} - ${item.soTien}`);
    return res.status(201).json({ success: true, data: dinhDangMuc(item, null, null) });
  } catch (error) {
    console.error('Không thể lưu giao dịch công nợ KL cũ:', error.message);
    return res.status(500).json({ success: false, message: 'Không thể lưu đợt chuyển khoản.' });
  }
});

router.put('/giao-dich/:id', async (req, res) => {
  const duLieu = kiemTraDuLieuGiaoDich(req.body);
  if (duLieu.loi) return res.status(400).json({ success: false, message: duLieu.loi });

  try {
    const item = await CongNoKlCuGiaoDich.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy đợt chuyển khoản.' });

    let anhChungTu = item.anhChungTu || '';
    let tenAnhChungTu = item.tenAnhChungTu || '';

    if (duLieu.anhChungTuDataUrl) {
      anhChungTu = await luuTepNang({
        dataUrl: duLieu.anhChungTuDataUrl,
        fileName: duLieu.tenAnhChungTu || 'chung-tu-kl',
        prefix: 'cong-no-kl-cu'
      });
      tenAnhChungTu = duLieu.tenAnhChungTu || 'chung-tu-kl';
    } else if (req.body?.xoaAnh === true) {
      anhChungTu = '';
      tenAnhChungTu = '';
    }

    item.ngayChuyen = duLieu.ngayChuyen;
    item.nguoiChuyen = duLieu.nguoiChuyen;
    item.soTien = duLieu.soTien;
    item.ghiChu = duLieu.ghiChu;
    item.anhChungTu = anhChungTu;
    item.tenAnhChungTu = tenAnhChungTu;
    item.nguoiCapNhat = req.auth?.username || '';
    await item.save();

    await ghiSauCapNhat(req, res, MA_CONG_CU, 'cap-nhat', `${item.nguoiChuyen} - ${item.soTien}`);
    return res.json({ success: true, data: dinhDangMuc(item, null, null) });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Mã đợt chuyển khoản không hợp lệ.' });
    }
    console.error('Không thể cập nhật giao dịch công nợ KL cũ:', error.message);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật đợt chuyển khoản.' });
  }
});

router.delete('/giao-dich/:id', async (req, res) => {
  try {
    const item = await CongNoKlCuGiaoDich.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy đợt chuyển khoản.' });
    const moTa = `${item.nguoiChuyen} - ${item.soTien}`;
    await item.deleteOne();
    await ghiSauCapNhat(req, res, MA_CONG_CU, 'xoa', moTa);
    return res.json({ success: true });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Mã đợt chuyển khoản không hợp lệ.' });
    }
    console.error('Không thể xóa giao dịch công nợ KL cũ:', error.message);
    return res.status(500).json({ success: false, message: 'Không thể xóa đợt chuyển khoản.' });
  }
});

router.get('/giao-dich/:id/anh', async (req, res) => {
  try {
    const item = await CongNoKlCuGiaoDich.findById(req.params.id)
      .select('anhChungTu tenAnhChungTu')
      .lean();
    if (!item || !item.anhChungTu) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh chụp chuyển khoản.' });
    }
    const tep = await docTepNang(item.anhChungTu);
    if (!tep || !tep.dataUrl) {
      return res.status(404).json({ success: false, message: 'Không thể đọc ảnh chụp chuyển khoản.' });
    }
    return res.json({
      success: true,
      data: {
        dataUrl: tep.dataUrl,
        mimeType: tep.mimeType,
        fileName: item.tenAnhChungTu || tep.fileName || 'chung-tu-kl'
      }
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Mã đợt chuyển khoản không hợp lệ.' });
    }
    console.error('Không thể tải ảnh chứng từ KL cũ:', error.message);
    return res.status(500).json({ success: false, message: 'Không thể tải ảnh chụp chuyển khoản.' });
  }
});

module.exports = router;
