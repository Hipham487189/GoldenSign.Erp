const path = require('path');
const { google } = require('googleapis');
const mongoose = require('mongoose');
const ChuyenPhatNhanh = require('../models/ChuyenPhatNhanh');
const { ngayHienTaiVietNam } = require('./ngayThongKe');

const MA_BANG_TINH = process.env.GOOGLE_GIAO_NHAN_SHEET_ID
  || process.env.GOOGLE_HOSO_SHEET_ID
  || '1OnNu_mKs4YevULzGXwF00x9-peHGaXk94QNNizu2Ug0';
const TEN_TRANG_TINH = process.env.GOOGLE_GIAO_NHAN_SHEET_NAME || 'ChuyenPhatNhanh';
const TEP_XAC_THUC = process.env.GOOGLE_CREDENTIALS_FILE || path.join(__dirname, '..', 'credentials.json');
const SO_DONG_MOI_LO = 500;
const LECH_GIO_VIET_NAM_MS = 7 * 60 * 60 * 1000;
const GIO_DONG_BO_HANG_NGAY = 7;

let boHenDongBo = null;
let dangDongBo = false;
let daBatLichDongBo = false;
let tinhTrangDongBo = { status: 'idle', at: null, error: '', created: 0, updated: 0 };

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
  const gioVietNam = new Date(thoiDiem.getTime() + LECH_GIO_VIET_NAM_MS);
  const mocHomNay = Date.UTC(
    gioVietNam.getUTCFullYear(),
    gioVietNam.getUTCMonth(),
    gioVietNam.getUTCDate(),
    GIO_DONG_BO_HANG_NGAY
  );
  const mocTiepTheo = mocHomNay < gioVietNam.getTime()
    ? Date.UTC(gioVietNam.getUTCFullYear(), gioVietNam.getUTCMonth(), gioVietNam.getUTCDate() + 1, GIO_DONG_BO_HANG_NGAY)
    : mocHomNay;
  return Math.max(0, mocTiepTheo - gioVietNam.getTime());
}

async function layBangTinh() {
  const tuyChonXacThuc = process.env.GOOGLE_CREDENTIALS_JSON
    ? {
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    }
    : {
      keyFile: TEP_XAC_THUC,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    };
  const xacThuc = new google.auth.GoogleAuth(tuyChonXacThuc);
  return google.sheets({ version: 'v4', auth: await xacThuc.getClient() });
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
  if (dangDongBo) return { ...tinhTrangDongBo, skipped: true };
  dangDongBo = true;
  try {
    const bangTinh = await layBangTinh();
    const phanHoi = await bangTinh.spreadsheets.values.get({
      spreadsheetId: MA_BANG_TINH,
      range: `${TEN_TRANG_TINH}!A:W`
    });
    const cacDong = phanHoi.data.values || [];
    const tieuDe = (cacDong[0] || []).map(cot => String(cot || '').trim());
    if (!tieuDe.includes('ID') || !tieuDe.includes('NGÀY GỬI') || !tieuDe.includes('TÊN CÔNG TY')) {
      throw new Error(`Sheet ${TEN_TRANG_TINH} thiếu cột ID, NGÀY GỬI hoặc TÊN CÔNG TY.`);
    }

    const cacThaoTac = [];
    const maDaGap = new Set();
    cacDong.slice(1).forEach(dong => {
      const banGhi = taoBanGhi(tieuDe, dong);
      if (!banGhi.maSheet || maDaGap.has(banGhi.maSheet)) return;
      maDaGap.add(banGhi.maSheet);
      cacThaoTac.push({
        updateOne: {
          filter: { maSheet: banGhi.maSheet, nguonTaoGiaoNhan: { $ne: 'web' } },
          update: { $set: banGhi },
          upsert: true
        }
      });
    });

    let created = 0;
    let updated = 0;
    for (let batDau = 0; batDau < cacThaoTac.length; batDau += SO_DONG_MOI_LO) {
      let ketQua;
      try {
        ketQua = await ChuyenPhatNhanh.bulkWrite(cacThaoTac.slice(batDau, batDau + SO_DONG_MOI_LO), { ordered: false });
      } catch (loi) {
        if (loi.code === 11000 || loi.writeErrors?.some(item => item.code === 11000)) {
          throw new Error('Có mã giao nhận trên Sheet trùng bản ghi tạo trên web; vui lòng kiểm tra trước khi đồng bộ lại.');
        }
        throw loi;
      }
      created += ketQua.upsertedCount || 0;
      updated += ketQua.modifiedCount || 0;
    }
    tinhTrangDongBo = { status: 'success', at: new Date().toISOString(), error: '', created, updated, total: cacThaoTac.length };
    return { ...tinhTrangDongBo };
  } catch (loi) {
    tinhTrangDongBo = { ...tinhTrangDongBo, status: 'error', at: new Date().toISOString(), error: loi.message };
    throw loi;
  } finally {
    dangDongBo = false;
  }
}

function batDongBoChuyenPhatNhanh() {
  if (daBatLichDongBo || process.env.GIAO_NHAN_SYNC_ENABLED === 'false') return;
  daBatLichDongBo = true;

  const henLanTiepTheo = () => {
    const thoiGianCho = tinhThoiGianChoLanDongBo();
    boHenDongBo = setTimeout(async () => {
      boHenDongBo = null;
      try {
        const ketQua = await dongBoChuyenPhatNhanh();
        if (ketQua.created || ketQua.updated) console.log('Đồng bộ Giao Nhận từ Google Sheet:', JSON.stringify(ketQua));
      } catch (loi) {
        console.error('Lỗi đồng bộ Giao Nhận:', loi.message);
      }
      henLanTiepTheo();
    }, thoiGianCho);
  };

  henLanTiepTheo();
}

module.exports = {
  dongBoChuyenPhatNhanh,
  batDongBoChuyenPhatNhanh,
  layTinhTrangDongBo: () => ({ ...tinhTrangDongBo, running: dangDongBo }),
  chuanHoaNgay,
  tinhThoiGianChoLanDongBo,
  taoMaGiaoNhan,
  taoBanGhi
};
