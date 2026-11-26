const path = require('path');
const { google } = require('googleapis');
const Order = require('../models/Order');
const SupplierPayment = require('../models/SupplierPayment');
const EmployeePayment = require('../models/EmployeePayment');
const ChuyenPhatNhanh = require('../models/ChuyenPhatNhanh');
const HoSo = require('../models/HoSo');
const AuditLog = require('../models/AuditLog');

const LECH_GIO_VIET_NAM_MS = 7 * 60 * 60 * 1000;
const GIO_DONG_BO_HANG_NGAY = 20;
const KICH_THUOC_LO_GHI = 500;
const GIOI_HAN_KY_TU_O = 45000;
const TEP_XAC_THUC = process.env.GOOGLE_CREDENTIALS_FILE || path.join(__dirname, '..', 'credentials.json');

const MA_SHEET_DON_HANG = process.env.GOOGLE_SHEET_ID || '1-Xn6eGSTqD6yiCEsCcNIDiJ5L6_EzQIUF6HCw5v9y7c';
const TEN_TAB_DON_HANG = process.env.GOOGLE_SHEET_NAME || 'GS-DONHANG';
const MA_SHEET_THANH_TOAN = process.env.THANH_TOAN_SHEET_ID || '1o4w9LaC11b9wbwSvaBg1mavJCzz27XNqmnJEdgek6Jg';
const MA_SHEET_GIAO_NHAN = process.env.GOOGLE_GIAO_NHAN_SHEET_ID
  || process.env.GOOGLE_HOSO_SHEET_ID
  || '1OnNu_mKs4YevULzGXwF00x9-peHGaXk94QNNizu2Ug0';
const TEN_TAB_GIAO_NHAN = process.env.GOOGLE_GIAO_NHAN_SHEET_NAME || 'ChuyenPhatNhanh';
const MA_SHEET_HO_SO = process.env.GOOGLE_HOSO_SHEET_ID || '1OnNu_mKs4YevULzGXwF00x9-peHGaXk94QNNizu2Ug0';
const TEN_TAB_HO_SO = process.env.GOOGLE_HOSO_SHEET_NAME || 'Hoso';

const CAC_COT_GIU_SO_KHONG = new Set([
  'STT',
  'Mã Đơn Hàng',
  'MST',
  'ID',
  'SỐ ĐIỆN THOẠI',
  'SDT NGƯỜI GỪI'
]);

const CAC_COT_TEP_DON_HANG = new Set([
  'FILE ĐÍNH KÈM',
  'Hợp Đồng / GDK',
  'Xác Nhận/ BBBG',
  'GPKD',
  'CCCD',
  'File tong',
  'Ảnh UNC'
]);

let boHenDongBo = null;
let dangChay = false;
let trangThaiTong = {
  status: 'idle',
  at: null,
  nextRunAt: null,
  error: '',
  direction: 'mongo-to-sheet',
  schedule: '20:00 (UTC+7)',
  tables: {
    donHang: { status: 'idle', at: null, error: '' },
    thanhToan: { status: 'idle', at: null, error: '' },
    giaoNhan: { status: 'idle', at: null, error: '' },
    hoSo: { status: 'idle', at: null, error: '' }
  }
};

function daBatXuatSheet() {
  return process.env.GOOGLE_SHEET_EXPORT_ENABLED !== 'false';
}

function tinhThoiGianChoDen20Gio(thoiDiem = new Date()) {
  const gioVietNam = new Date(thoiDiem.getTime() + LECH_GIO_VIET_NAM_MS);
  const mocHomNay = Date.UTC(
    gioVietNam.getUTCFullYear(),
    gioVietNam.getUTCMonth(),
    gioVietNam.getUTCDate(),
    GIO_DONG_BO_HANG_NGAY,
    0,
    0,
    0
  );
  const mocTiepTheo = mocHomNay <= gioVietNam.getTime()
    ? Date.UTC(
      gioVietNam.getUTCFullYear(),
      gioVietNam.getUTCMonth(),
      gioVietNam.getUTCDate() + 1,
      GIO_DONG_BO_HANG_NGAY,
      0,
      0,
      0
    )
    : mocHomNay;
  return Math.max(0, mocTiepTheo - gioVietNam.getTime());
}

async function layKhachHangSheets() {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
  const tuyChon = process.env.GOOGLE_CREDENTIALS_JSON
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON), scopes }
    : { keyFile: TEP_XAC_THUC, scopes };
  const xacThuc = new google.auth.GoogleAuth(tuyChon);
  return google.sheets({ version: 'v4', auth: await xacThuc.getClient() });
}

function tenCotExcel(chiSo) {
  let ketQua = '';
  for (let gt = chiSo + 1; gt > 0; gt = Math.floor((gt - 1) / 26)) {
    ketQua = String.fromCharCode(65 + ((gt - 1) % 26)) + ketQua;
  }
  return ketQua;
}

function laChuoiTepHoacQuaDai(giaTri) {
  if (typeof giaTri !== 'string') return false;
  const chuoi = giaTri.trim();
  return /^data:/i.test(chuoi) || chuoi.length > GIOI_HAN_KY_TU_O;
}

function dinhDangGhiO(giaTri, tenCot) {
  if (giaTri === null || giaTri === undefined) return '';
  const chuoi = String(giaTri);
  if (CAC_COT_GIU_SO_KHONG.has(String(tenCot || '').trim()) && /^\d+$/.test(chuoi)) {
    return `'${chuoi}`;
  }
  return giaTri;
}

function chuanHoaChuoiSoSanh(giaTri) {
  return String(giaTri ?? '').replace(/^'+/, '').trim();
}

function soSanhMacDinh(giaTriMoi, giaTriCu) {
  return chuanHoaChuoiSoSanh(giaTriMoi) === chuanHoaChuoiSoSanh(giaTriCu);
}

function chuanHoaNgaySoSanh(giaTri) {
  const chuoi = String(giaTri ?? '').trim();
  if (!chuoi) return '';
  const iso = chuoi.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const local = chuoi.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!local) return chuoi;
  const [, a, b, nam] = local.map(Number);
  const [thang, ngay] = a > 12 ? [b, a] : [a, b];
  if (thang < 1 || thang > 12 || ngay < 1 || ngay > 31) return chuoi;
  return `${nam}-${String(thang).padStart(2, '0')}-${String(ngay).padStart(2, '0')}`;
}

async function damBaoDuDong(sheets, spreadsheetId, sheetName, tongDongCan) {
  const thongTin = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount)))'
  });
  const trangTinh = thongTin.data.sheets?.find(s => s.properties?.title === sheetName)
    || thongTin.data.sheets?.[0];
  const soDongHienTai = Number(trangTinh?.properties?.gridProperties?.rowCount || 0);
  if (!trangTinh?.properties || tongDongCan <= soDongHienTai) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        appendDimension: {
          sheetId: trangTinh.properties.sheetId,
          dimension: 'ROWS',
          length: tongDongCan - soDongHienTai
        }
      }]
    }
  });
}

async function ghiBangLenSheet({
  sheets,
  spreadsheetId,
  sheetName,
  danhSachBanGhi,
  layKhoaDongSheet,
  layKhoaBanGhi,
  layGiaTriO,
  soSanhGiaTriO = soSanhMacDinh,
  kiemTraCotBatBuoc
}) {
  const phanHoi = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:ZZ`
  });
  const tatCaDong = phanHoi.data.values || [];
  const headers = (tatCaDong[0] || []).map(cot => String(cot || '').trim());
  const rows = tatCaDong.slice(1);
  if (typeof kiemTraCotBatBuoc === 'function') kiemTraCotBatBuoc(headers);
  if (!headers.length) throw new Error(`Sheet ${sheetName} chưa có dòng tiêu đề.`);

  const dongTheoKhoa = new Map();
  rows.forEach((dong, chiSo) => {
    const khoa = layKhoaDongSheet(dong, headers);
    if (khoa && !dongTheoKhoa.has(khoa)) dongTheoKhoa.set(khoa, chiSo + 2);
  });

  const chiSoDongCuoi = rows.reduce(
    (cuoi, dong, chiSo) => (dong.some(gt => String(gt ?? '').trim()) ? chiSo : cuoi),
    -1
  );
  let dongTiepTheo = chiSoDongCuoi + 3;
  let dongCaoNhatCanGhi = rows.length + 1;

  const cacCapNhat = [];
  let updated = 0;
  let appended = 0;
  let skippedUnchanged = 0;
  const cotCuoi = tenCotExcel(headers.length - 1);

  for (const banGhi of danhSachBanGhi) {
    const khoa = layKhoaBanGhi(banGhi);
    if (!khoa) continue;

    const soDong = dongTheoKhoa.get(khoa);
    if (soDong) {
      const dongHienTai = rows[soDong - 2] || [];
      const dongMoi = headers.map((cot, chiSo) => {
        const gt = layGiaTriO(banGhi, cot, chiSo);
        return gt !== undefined ? gt : (dongHienTai[chiSo] ?? '');
      });
      const coThayDoi = dongMoi.some((gt, chiSo) => !soSanhGiaTriO(gt, dongHienTai[chiSo], headers[chiSo]));
      if (coThayDoi) {
        const dongGhi = dongMoi.map((gt, chiSo) => dinhDangGhiO(gt, headers[chiSo]));
        cacCapNhat.push({ range: `${sheetName}!A${soDong}:${cotCuoi}${soDong}`, values: [dongGhi] });
        updated += 1;
      } else {
        skippedUnchanged += 1;
      }
    } else {
      const dongMoi = headers.map((cot, chiSo) => dinhDangGhiO(layGiaTriO(banGhi, cot, chiSo) ?? '', cot));
      const soDongMoi = dongTiepTheo;
      dongTiepTheo += 1;
      dongTheoKhoa.set(khoa, soDongMoi);
      cacCapNhat.push({ range: `${sheetName}!A${soDongMoi}:${cotCuoi}${soDongMoi}`, values: [dongMoi] });
      dongCaoNhatCanGhi = Math.max(dongCaoNhatCanGhi, soDongMoi);
      appended += 1;
    }
  }

  if (appended > 0) {
    await damBaoDuDong(sheets, spreadsheetId, sheetName, dongCaoNhatCanGhi);
  }

  for (let viTri = 0; viTri < cacCapNhat.length; viTri += KICH_THUOC_LO_GHI) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: cacCapNhat.slice(viTri, viTri + KICH_THUOC_LO_GHI)
      }
    });
  }

  return { sheetName, total: danhSachBanGhi.length, updated, appended, skippedUnchanged };
}

function chuanHoaGiaTriDonHang(don, tenCot) {
  if (!tenCot || CAC_COT_TEP_DON_HANG.has(tenCot)) return undefined;
  const giaTri = tenCot === 'Thực Đóng Cuối Cùng' ? don['THỰC CÔNG NỢ CTY'] : don[tenCot];
  if (giaTri === null || giaTri === undefined || giaTri === '') return undefined;
  if (tenCot === 'MST') {
    const chuoi = String(giaTri).replace(/^'+/, '').trim();
    const so = chuoi.replace(/\D/g, '');
    return so.length === 9 ? `0${so}` : chuoi;
  }
  if (giaTri instanceof Date) return giaTri.toISOString();
  if (typeof giaTri === 'object') {
    const json = JSON.stringify(giaTri);
    return laChuoiTepHoacQuaDai(json) ? undefined : json;
  }
  const chuoi = String(giaTri);
  return laChuoiTepHoacQuaDai(chuoi) ? undefined : chuoi;
}

async function dayDonHangLenSheet(sheets) {
  const phanHoiHeader = await sheets.spreadsheets.values.get({
    spreadsheetId: MA_SHEET_DON_HANG,
    range: `${TEN_TAB_DON_HANG}!1:1`
  });
  const headers = (phanHoiHeader.data.values?.[0] || []).map(cot => String(cot || '').trim());
  const projection = { _id: 1, STT: 1, 'Mã Đơn Hàng': 1, 'THỰC CÔNG NỢ CTY': 1 };
  headers.forEach(cot => {
    if (cot && !CAC_COT_TEP_DON_HANG.has(cot) && cot !== 'Thực Đóng Cuối Cùng') {
      projection[cot] = 1;
    }
  });

  const tatCaDon = await Order.find({}).select(projection).lean();
  const danhSachDonHopLe = tatCaDon.filter(don => {
    const maDon = String(don['Mã Đơn Hàng'] || '').trim();
    return maDon && !/^KL/i.test(maDon);
  });

  const timKhoaDon = (don) => {
    const stt = String(don.STT || '').trim();
    if (stt) return `STT:${stt}`;
    const maDon = String(don['Mã Đơn Hàng'] || '').trim();
    return maDon ? `CODE:${maDon}` : '';
  };

  // Đọc một lần để map cả STT lẫn Mã Đơn Hàng cho các đơn cũ chưa có STT
  const phanHoi = await sheets.spreadsheets.values.get({
    spreadsheetId: MA_SHEET_DON_HANG,
    range: `${TEN_TAB_DON_HANG}!A:ZZ`
  });
  const tatCaDong = phanHoi.data.values || [];
  const tieuDe = (tatCaDong[0] || []).map(cot => String(cot || '').trim());
  const rows = tatCaDong.slice(1);
  const cotMaDon = tieuDe.indexOf('Mã Đơn Hàng');
  const cotStt = tieuDe.indexOf('STT');
  if (cotMaDon < 0) throw new Error(`Sheet ${TEN_TAB_DON_HANG} thiếu cột Mã Đơn Hàng.`);
  if (cotStt < 0) throw new Error(`Sheet ${TEN_TAB_DON_HANG} thiếu cột STT.`);

  const dongTheoStt = new Map();
  const dongTheoMaDon = new Map();
  rows.forEach((dong, chiSo) => {
    const stt = String(dong[cotStt] || '').trim();
    const maDon = String(dong[cotMaDon] || '').trim();
    if (stt && !dongTheoStt.has(stt)) dongTheoStt.set(stt, chiSo + 2);
    if (maDon && !dongTheoMaDon.has(maDon)) dongTheoMaDon.set(maDon, chiSo + 2);
  });

  const chiSoDongCuoi = rows.reduce(
    (cuoi, dong, chiSo) => (dong.some(gt => String(gt ?? '').trim()) ? chiSo : cuoi),
    -1
  );
  let dongTiepTheo = chiSoDongCuoi + 3;
  let dongCaoNhatCanGhi = rows.length + 1;
  const cacCapNhat = [];
  const cotCuoi = tenCotExcel(tieuDe.length - 1);
  let updated = 0;
  let appended = 0;
  let skippedUnchanged = 0;
  const khoaDaXuLy = new Set();

  for (const don of danhSachDonHopLe) {
    const khoa = timKhoaDon(don);
    if (!khoa || khoaDaXuLy.has(khoa)) continue;
    khoaDaXuLy.add(khoa);

    const stt = String(don.STT || '').trim();
    const maDon = String(don['Mã Đơn Hàng'] || '').trim();
    const soDong = (stt ? dongTheoStt.get(stt) : null) || dongTheoMaDon.get(maDon);

    if (soDong) {
      const dongHienTai = rows[soDong - 2] || [];
      const dongMoi = tieuDe.map((cot, chiSo) => {
        const gt = chuanHoaGiaTriDonHang(don, cot);
        return gt !== undefined ? gt : (dongHienTai[chiSo] ?? '');
      });
      const coThayDoi = dongMoi.some((gt, chiSo) => !soSanhMacDinh(gt, dongHienTai[chiSo]));
      if (coThayDoi) {
        const dongGhi = dongMoi.map((gt, chiSo) => dinhDangGhiO(gt, tieuDe[chiSo]));
        cacCapNhat.push({ range: `${TEN_TAB_DON_HANG}!A${soDong}:${cotCuoi}${soDong}`, values: [dongGhi] });
        updated += 1;
      } else {
        skippedUnchanged += 1;
      }
    } else {
      const dongMoi = tieuDe.map(cot => dinhDangGhiO(chuanHoaGiaTriDonHang(don, cot) ?? '', cot));
      const soDongMoi = dongTiepTheo;
      dongTiepTheo += 1;
      if (stt) dongTheoStt.set(stt, soDongMoi);
      if (maDon) dongTheoMaDon.set(maDon, soDongMoi);
      cacCapNhat.push({ range: `${TEN_TAB_DON_HANG}!A${soDongMoi}:${cotCuoi}${soDongMoi}`, values: [dongMoi] });
      dongCaoNhatCanGhi = Math.max(dongCaoNhatCanGhi, soDongMoi);
      appended += 1;
    }
  }

  if (appended > 0) {
    await damBaoDuDong(sheets, MA_SHEET_DON_HANG, TEN_TAB_DON_HANG, dongCaoNhatCanGhi);
  }
  for (let viTri = 0; viTri < cacCapNhat.length; viTri += KICH_THUOC_LO_GHI) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: MA_SHEET_DON_HANG,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: cacCapNhat.slice(viTri, viTri + KICH_THUOC_LO_GHI)
      }
    });
  }

  return {
    sheetName: TEN_TAB_DON_HANG,
    total: danhSachDonHopLe.length,
    updated,
    appended,
    skippedUnchanged
  };
}

function layIdThanhToan(doc, tenTab) {
  const maSheet = String(doc.maGoogleSheet || '').trim();
  const tienTo = `${tenTab}:`;
  if (maSheet.startsWith(tienTo)) return maSheet.slice(tienTo.length).trim();
  if (maSheet) return maSheet;
  return String(doc._id || '').trim();
}

function tachKyThanhToan(ky) {
  const khop = String(ky || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!khop) return { nam: '', thang: '' };
  return { nam: khop[1], thang: String(Number(khop[2])) };
}

function soSanhOThanhToan(giaTriMoi, giaTriCu, tenCot) {
  if (tenCot === 'Ngày') {
    return chuanHoaNgaySoSanh(giaTriMoi) === chuanHoaNgaySoSanh(giaTriCu);
  }
  if (tenCot === 'Số Tiền Thanh Toán') {
    const soMoi = Number(String(giaTriMoi ?? '').replace(/[^\d.-]/g, ''));
    const soCu = Number(String(giaTriCu ?? '').replace(/[^\d.-]/g, ''));
    if (Number.isFinite(soMoi) && Number.isFinite(soCu)) return soMoi === soCu;
  }
  if (['Tháng Thanh Toán', 'Tháng', 'Năm Thanh Toán'].includes(tenCot)) {
    const soMoi = Number(giaTriMoi);
    const soCu = Number(giaTriCu);
    if (Number.isFinite(soMoi) && Number.isFinite(soCu) && String(giaTriMoi).trim() !== '' && String(giaTriCu).trim() !== '') {
      return soMoi === soCu;
    }
  }
  return soSanhMacDinh(giaTriMoi, giaTriCu);
}

async function dayThanhToanLenSheet(sheets) {
  const [dsNcc, dsNhanVien] = await Promise.all([
    SupplierPayment.find({}).select('-imageData').lean(),
    EmployeePayment.find({}).select('-imageData').lean()
  ]);

  const ketQuaNcc = await ghiBangLenSheet({
    sheets,
    spreadsheetId: MA_SHEET_THANH_TOAN,
    sheetName: 'TTNCC',
    danhSachBanGhi: dsNcc,
    kiemTraCotBatBuoc: headers => {
      if (!headers.includes('ID') || !headers.includes('NCC')) {
        throw new Error('Sheet TTNCC thiếu cột ID hoặc NCC.');
      }
    },
    layKhoaDongSheet: (dong, headers) => String(dong[headers.indexOf('ID')] || '').trim(),
    layKhoaBanGhi: doc => layIdThanhToan(doc, 'TTNCC'),
    layGiaTriO: (doc, cot) => {
      const { nam, thang } = tachKyThanhToan(doc.paymentPeriod);
      const banDo = {
        ID: layIdThanhToan(doc, 'TTNCC'),
        NCC: doc.supplier || '',
        'Tháng Thanh Toán': thang,
        'Năm Thanh Toán': nam,
        'Số Tiền Thanh Toán': doc.amount ?? '',
        'Ngày': doc.paymentDate || '',
        'Hình Thức Thanh Toán': doc.paymentMethod || '',
        'Người Nhập': doc.enteredBy || doc.createdBy || '',
        'Ghi Chú': doc.note || '',
        'Hình Ảnh': laChuoiTepHoacQuaDai(doc.imageName) ? '' : (doc.imageName || '')
      };
      return Object.prototype.hasOwnProperty.call(banDo, cot) ? banDo[cot] : undefined;
    },
    soSanhGiaTriO: soSanhOThanhToan
  });

  const ketQuaNhanVien = await ghiBangLenSheet({
    sheets,
    spreadsheetId: MA_SHEET_THANH_TOAN,
    sheetName: 'TTNhanVien',
    danhSachBanGhi: dsNhanVien,
    kiemTraCotBatBuoc: headers => {
      if (!headers.includes('ID') || !headers.includes('Tên Nhân Viên')) {
        throw new Error('Sheet TTNhanVien thiếu cột ID hoặc Tên Nhân Viên.');
      }
    },
    layKhoaDongSheet: (dong, headers) => String(dong[headers.indexOf('ID')] || '').trim(),
    layKhoaBanGhi: doc => layIdThanhToan(doc, 'TTNhanVien'),
    layGiaTriO: (doc, cot) => {
      const { nam, thang } = tachKyThanhToan(doc.paymentPeriod);
      const banDo = {
        ID: layIdThanhToan(doc, 'TTNhanVien'),
        'Tên Nhân Viên': doc.employee || '',
        'Tháng': thang,
        'Năm Thanh Toán': nam,
        'Số Tiền Thanh Toán': doc.amount ?? '',
        'Ngày': doc.paymentDate || '',
        'Hình Thức Thanh Toán': doc.paymentMethod || '',
        'Người Nhập': doc.enteredBy || doc.createdBy || '',
        'Ghi Chú': doc.note || '',
        'Hình Ảnh': laChuoiTepHoacQuaDai(doc.imageName) ? '' : (doc.imageName || '')
      };
      return Object.prototype.hasOwnProperty.call(banDo, cot) ? banDo[cot] : undefined;
    },
    soSanhGiaTriO: soSanhOThanhToan
  });

  return {
    tabs: [ketQuaNcc, ketQuaNhanVien],
    total: ketQuaNcc.total + ketQuaNhanVien.total,
    updated: ketQuaNcc.updated + ketQuaNhanVien.updated,
    appended: ketQuaNcc.appended + ketQuaNhanVien.appended,
    skippedUnchanged: ketQuaNcc.skippedUnchanged + ketQuaNhanVien.skippedUnchanged
  };
}

async function dayGiaoNhanLenSheet(sheets) {
  const dsGiaoNhan = await ChuyenPhatNhanh.find({})
    .select('-tuKhoaTimKiem -tenNhanVienTimKiem -nhanVienThucHienTimKiem -ngayGuiDate -ngayThucHienDate -__v')
    .lean();

  return ghiBangLenSheet({
    sheets,
    spreadsheetId: MA_SHEET_GIAO_NHAN,
    sheetName: TEN_TAB_GIAO_NHAN,
    danhSachBanGhi: dsGiaoNhan,
    kiemTraCotBatBuoc: headers => {
      if (!headers.includes('ID') || !headers.includes('TÊN CÔNG TY')) {
        throw new Error(`Sheet ${TEN_TAB_GIAO_NHAN} thiếu cột ID hoặc TÊN CÔNG TY.`);
      }
    },
    layKhoaDongSheet: (dong, headers) => String(dong[headers.indexOf('ID')] || '').trim(),
    layKhoaBanGhi: doc => String(doc.maSheet || doc.ID || '').trim(),
    layGiaTriO: (doc, cot) => {
      if (cot === 'ID') return String(doc.maSheet || doc.ID || '').trim();
      const giaTri = doc[cot];
      if (giaTri === null || giaTri === undefined) return undefined;
      if (giaTri instanceof Date) return giaTri.toISOString();
      if (typeof giaTri === 'object') {
        const json = JSON.stringify(giaTri);
        return laChuoiTepHoacQuaDai(json) ? undefined : json;
      }
      const chuoi = String(giaTri);
      return laChuoiTepHoacQuaDai(chuoi) ? undefined : chuoi;
    }
  });
}

async function dayHoSoLenSheet(sheets) {
  const dsHoSo = await HoSo.find({})
    .select('-tuKhoaChuanHoa -loaiChuanHoa -tinhTrangChuanHoa -ngayNhanDate -__v -createdAt -updatedAt')
    .lean();

  return ghiBangLenSheet({
    sheets,
    spreadsheetId: MA_SHEET_HO_SO,
    sheetName: TEN_TAB_HO_SO,
    danhSachBanGhi: dsHoSo,
    kiemTraCotBatBuoc: headers => {
      if (!headers.includes('ID') || !headers.includes('TÊN CÔNG TY')) {
        throw new Error(`Sheet ${TEN_TAB_HO_SO} thiếu cột ID hoặc TÊN CÔNG TY.`);
      }
    },
    layKhoaDongSheet: (dong, headers) => String(dong[headers.indexOf('ID')] || '').trim(),
    layKhoaBanGhi: doc => String(doc.ID || '').trim(),
    layGiaTriO: (doc, cot) => {
      const giaTri = doc[cot];
      if (giaTri === null || giaTri === undefined) return undefined;
      if (giaTri instanceof Date) return giaTri.toISOString();
      if (typeof giaTri === 'object') {
        const json = JSON.stringify(giaTri);
        return laChuoiTepHoacQuaDai(json) ? undefined : json;
      }
      const chuoi = String(giaTri);
      return laChuoiTepHoacQuaDai(chuoi) ? undefined : chuoi;
    }
  });
}

async function dongBoTatCaLenGoogleSheet({ bang } = {}) {
  if (!daBatXuatSheet()) return { skipped: true, reason: 'mongo-to-sheet-disabled' };
  if (dangChay) return { ...trangThaiTong, skipped: true };

  const danhSachBang = {
    donHang: dayDonHangLenSheet,
    thanhToan: dayThanhToanLenSheet,
    giaoNhan: dayGiaoNhanLenSheet,
    hoSo: dayHoSoLenSheet
  };
  const cacBangCanChay = bang
    ? (danhSachBang[bang] ? [bang] : [])
    : Object.keys(danhSachBang);
  if (!cacBangCanChay.length) {
    throw new Error(`Tên bảng đồng bộ không hợp lệ: ${bang}`);
  }

  dangChay = true;
  trangThaiTong = { ...trangThaiTong, status: 'running', error: '' };

  try {
    const sheets = await layKhachHangSheets();
    const ketQuaTungBang = {};
    const danhSachLoi = [];

    for (const tenBang of cacBangCanChay) {
      const thoiDiem = new Date().toISOString();
      try {
        const ketQua = await danhSachBang[tenBang](sheets);
        ketQuaTungBang[tenBang] = { status: 'success', at: thoiDiem, error: '', ...ketQua };
        trangThaiTong.tables[tenBang] = ketQuaTungBang[tenBang];
      } catch (loi) {
        const chiTietLoi = { status: 'error', at: thoiDiem, error: loi.message };
        ketQuaTungBang[tenBang] = chiTietLoi;
        trangThaiTong.tables[tenBang] = chiTietLoi;
        danhSachLoi.push(`${tenBang}: ${loi.message}`);
      }
    }

    trangThaiTong = {
      ...trangThaiTong,
      status: danhSachLoi.length ? 'partial-error' : 'success',
      at: new Date().toISOString(),
      error: danhSachLoi.join('; ')
    };

    return {
      status: trangThaiTong.status,
      at: trangThaiTong.at,
      direction: trangThaiTong.direction,
      tables: ketQuaTungBang,
      error: trangThaiTong.error
    };
  } catch (loi) {
    trangThaiTong = {
      ...trangThaiTong,
      status: 'error',
      at: new Date().toISOString(),
      error: loi.message
    };
    throw loi;
  } finally {
    dangChay = false;
  }
}

function batLichDongBoLenGoogleSheet() {
  if (!daBatXuatSheet() || boHenDongBo) return;

  const henLanTiepTheo = () => {
    const thoiGianCho = tinhThoiGianChoDen20Gio();
    trangThaiTong.nextRunAt = new Date(Date.now() + thoiGianCho).toISOString();
    boHenDongBo = setTimeout(async () => {
      boHenDongBo = null;
      try {
        const ketQua = await dongBoTatCaLenGoogleSheet();
        console.log('Đồng bộ MongoDB -> Google Sheet (20:00):', JSON.stringify(ketQua));
        if (!ketQua?.skipped) {
          const tongThayDoi = Object.values(ketQua?.tables || {}).reduce(
            (sum, t) => sum + (Number(t?.updated) || 0) + (Number(t?.appended) || 0),
            0
          );
          try {
            await AuditLog.create({
              actorUsername: 'Hệ thống (20:00)',
              module: 'cong-cu:ghi-nhan-cap-nhat',
              action: 'cap-nhat',
              recordId: 'tat-ca',
              after: { soLuong: tongThayDoi, status: ketQua?.status || 'success' }
            });
          } catch (loiLog) {
            console.error('Không thể ghi lịch sử đồng bộ tự động 20:00:', loiLog.message);
          }
        }
      } catch (loi) {
        console.error('Lỗi đồng bộ MongoDB -> Google Sheet (20:00):', loi.message);
      }
      henLanTiepTheo();
    }, thoiGianCho);
  };

  henLanTiepTheo();
}

function layTrangThaiDongBoLenSheet() {
  return {
    ...trangThaiTong,
    running: dangChay,
    tables: { ...trangThaiTong.tables }
  };
}

module.exports = {
  tinhThoiGianChoDen20Gio,
  dongBoTatCaLenGoogleSheet,
  batLichDongBoLenGoogleSheet,
  layTrangThaiDongBoLenSheet,
  dayDonHangLenSheet,
  dayThanhToanLenSheet,
  dayGiaoNhanLenSheet,
  dayHoSoLenSheet
};
