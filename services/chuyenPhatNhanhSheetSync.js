const mongoose = require('mongoose');
const ChuyenPhatNhanh = require('../models/ChuyenPhatNhanh');
const { ngayHienTaiVietNam } = require('./ngayThongKe');
const {
  tinhThoiGianChoDen20Gio,
  dongBoTatCaLenGoogleSheet,
  layTrangThaiDongBoLenSheet
} = require('./dongBoLenGoogleSheet');

const GIO_DONG_BO_HANG_NGAY = 20;

function chuanHoaTimKiem(giaTri) {
  return String(giaTri || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('vi')
    .replace(/đ/g, 'd');
}

function chuanHoaNgay(giaTri) {
  const chuoi = String(giaTri || '').trim();
  const iso = chuoi.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const ngayThang = chuoi.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  let nam, thang, ngay;
  if (iso) [, nam, thang, ngay] = iso;
  else if (ngayThang) [, ngay, thang, nam] = ngayThang;
  else return null;

  const ketQua = new Date(Date.UTC(Number(nam), Number(thang) - 1, Number(ngay)));
  if (ketQua.getUTCFullYear() !== Number(nam)
      || ketQua.getUTCMonth() !== Number(thang) - 1
      || ketQua.getUTCDate() !== Number(ngay)) return null;
  return ketQua;
}

function tinhThoiGianChoLanDongBo(thoiDiem = new Date()) {
  return tinhThoiGianChoDen20Gio(thoiDiem);
}

function taoBanGhi(tieuDe, dong) {
  const duLieu = {};
  tieuDe.forEach((cot, chiSo) => {
    const tenCot = String(cot || '').trim();
    if (tenCot) duLieu[tenCot] = String(dong[chiSo] ?? '').trim();
  });
  const maSheet = String(duLieu.ID || '').trim();
  const tenNhanVien = duLieu['TÊN NHÂN VIÊN'] || '';
  const nhanVienThucHien = duLieu['Nhân Viên Thực Hiện'] || '';
  const ngayGui = duLieu['NGÀY GỬI'] || '';
  const ngayThucHien = duLieu['NGÀY THỰC HIỆN'] || '';
  const tuKhoaTimKiem = [
    maSheet,
    tenNhanVien,
    nhanVienThucHien,
    duLieu.MST,
    duLieu['TÊN CÔNG TY'],
    duLieu['TÊN KHÁCH HÀNG'],
    duLieu['SỐ ĐIỆN THOẠI'],
    duLieu['ĐỊA CHỈ NGƯỜI NHẬN'],
    duLieu['SỐ  BILL']
  ].map(chuanHoaTimKiem).filter(Boolean)
    .flatMap(tuKhoa => [tuKhoa, ...tuKhoa.split(/\s+/).filter(Boolean)]);

  return {
    ...duLieu,
    maSheet,
    ngayGuiDate: chuanHoaNgay(ngayGui),
    ngayThucHienDate: chuanHoaNgay(ngayThucHien),
    tenNhanVienTimKiem: chuanHoaTimKiem(tenNhanVien),
    nhanVienThucHienTimKiem: chuanHoaTimKiem(nhanVienThucHien),
    tuKhoaTimKiem
  };
}

async function taoMaGiaoNhan(ngay = new Date()) {
  const nam = ngayHienTaiVietNam(ngay).getUTCFullYear();
  const tienTo = `GN${nam}-`;
  const cuoi = await ChuyenPhatNhanh.findOne({ maSheet: new RegExp(`^${tienTo}\\d{5}$`) })
    .select('maSheet').sort({ maSheet: -1 }).lean();
  const soCaoNhat = cuoi ? Number(cuoi.maSheet.slice(-5)) : 0;
  const boDem = mongoose.connection.collection('giao_nhan_code_counters');
  try {
    await boDem.updateOne({ _id: nam }, { $max: { value: soCaoNhat } }, { upsert: true });
  } catch (loi) {
    if (loi.code !== 11000) throw loi;
    await boDem.updateOne({ _id: nam }, { $max: { value: soCaoNhat } });
  }
  const ketQua = await boDem.findOneAndUpdate({ _id: nam }, { $inc: { value: 1 } }, { returnDocument: 'after' });
  const banGhi = ketQua?.value && typeof ketQua.value === 'object' ? ketQua.value : ketQua;
  const soThuTu = Number(banGhi?.value);
  if (!Number.isInteger(soThuTu) || soThuTu < 1 || soThuTu > 99999) {
    const loi = new Error('Không thể cấp mã giao nhận: đã hết số thứ tự trong năm hoặc bộ đếm không hợp lệ.');
    loi.statusCode = 409;
    throw loi;
  }
  return `${tienTo}${String(soThuTu).padStart(5, '0')}`;
}

async function dongBoChuyenPhatNhanh() {
  const ketQua = await dongBoTatCaLenGoogleSheet({ bang: 'giaoNhan' });
  if (ketQua.skipped) return ketQua;
  const chiTiet = ketQua.tables?.giaoNhan;
  if (chiTiet?.status === 'error') throw new Error(chiTiet.error || 'Lỗi đồng bộ Giao Nhận lên Google Sheet.');
  return chiTiet || ketQua;
}

function batDongBoChuyenPhatNhanh() {
  // Đã ngừng đồng bộ từ Google Sheets về MongoDB; đồng bộ ngược lên Sheet chạy lúc 20:00 qua dongBoLenGoogleSheet.js
}

function layTinhTrangDongBo() {
  const trangThai = layTrangThaiDongBoLenSheet();
  return {
    ...(trangThai.tables?.giaoNhan || { status: 'idle', at: null, error: '' }),
    running: trangThai.running,
    nextRunAt: trangThai.nextRunAt,
    direction: trangThai.direction,
    schedule: trangThai.schedule
  };
}

module.exports = {
  GIO_DONG_BO_HANG_NGAY,
  dongBoChuyenPhatNhanh,
  batDongBoChuyenPhatNhanh,
  layTinhTrangDongBo,
  chuanHoaNgay,
  tinhThoiGianChoLanDongBo,
  taoMaGiaoNhan,
  taoBanGhi
};
