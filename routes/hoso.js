const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const { google } = require('googleapis');
const Role = require('../models/Role');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();
const maBangTinh = process.env.GOOGLE_HOSO_SHEET_ID || '1OnNu_mKs4YevULzGXwF00x9-peHGaXk94QNNizu2Ug0';
const maTrangTinh = process.env.GOOGLE_HOSO_SHEET_GID || '14303315';
const tenTrangTinh = process.env.GOOGLE_HOSO_SHEET_NAME || 'Hoso';
const tepThongTinXacThuc = process.env.GOOGLE_CREDENTIALS_FILE || path.join(__dirname, '..', 'credentials.json');
const cacCotDuocCapNhat = [
  'NGÀY NHẬN', 'TÊN NHÂN VIÊN NHẬN', 'MST', 'TÊN CÔNG TY', 'LOẠI', 'NCC',
  'HĐ/ Phiếu ĐK', 'Giấy XN/ BBBG', 'ĐKKD', 'CMND', 'GCN DK THUẾ', 'Giấy ủy quyền',
  'Giấy DK cũ', 'PDK (HDDT)', 'BBCK', 'Giấy QĐ', 'TÌNH TRẠNG HỒ SƠ',
  'NGƯỜI GỬI', 'SDT NGƯỜI GỪI', 'ĐỊA CHỈ', 'GHI CHÚ', 'Nơi Nộp', 'Ngày Nộp'
];
const thoiGianCacheMs = 60 * 1000;
let dongDuLieuCache = null;
let thoiDiemCache = 0;
let yeuCauSheet = null;

function tenCotBangTinh(chiSo) {
  let tenCot = '';
  for (let giaTri = chiSo + 1; giaTri > 0; giaTri = Math.floor((giaTri - 1) / 26)) {
    tenCot = String.fromCharCode(65 + ((giaTri - 1) % 26)) + tenCot;
  }
  return tenCot;
}

function phamViTrangTinh(tenCotCuoi, hangBatDau, hangKetThuc) {
  const tenAnToan = tenTrangTinh.replace(/'/g, "''");
  return `'${tenAnToan}'!A${hangBatDau}:${tenCotCuoi}${hangKetThuc}`;
}

async function layGoogleSheets() {
  const tuyChonXacThuc = process.env.GOOGLE_CREDENTIALS_JSON
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON), scopes: ['https://www.googleapis.com/auth/spreadsheets'] }
    : { keyFile: tepThongTinXacThuc, scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  const xacThuc = new google.auth.GoogleAuth(tuyChonXacThuc);
  return google.sheets({ version: 'v4', auth: await xacThuc.getClient() });
}

async function yeuCauQuyenAdmin(req, res, next) {
  if (req.auth?.isSuperAdmin) return next();
  try {
    const vaiTro = await Role.findById(req.auth?.roleId).select('name').lean();
    if (vaiTro?.name !== 'Admin') return res.status(403).json({ success: false, message: 'Chỉ Admin mới được lưu hồ sơ vào Google Sheet.' });
    return next();
  } catch (loi) {
    console.error('Lỗi kiểm tra quyền cập nhật hồ sơ:', loi);
    return res.status(500).json({ success: false, message: 'Không thể kiểm tra quyền cập nhật hồ sơ.' });
  }
}

function phanTichCsv(noiDung) {
  const cacDong = [];
  let dong = [];
  let truong = '';
  let dangTrongNgoacKep = false;

  for (let chiSo = 0; chiSo < noiDung.length; chiSo += 1) {
    const kyTu = noiDung[chiSo];
    if (kyTu === '"') {
      if (dangTrongNgoacKep && noiDung[chiSo + 1] === '"') {
        truong += '"';
        chiSo += 1;
      } else {
        dangTrongNgoacKep = !dangTrongNgoacKep;
      }
    } else if (kyTu === ',' && !dangTrongNgoacKep) {
      dong.push(truong);
      truong = '';
    } else if ((kyTu === '\n' || kyTu === '\r') && !dangTrongNgoacKep) {
      if (kyTu === '\r' && noiDung[chiSo + 1] === '\n') chiSo += 1;
      dong.push(truong);
      if (dong.some(giaTri => giaTri.trim())) cacDong.push(dong);
      dong = [];
      truong = '';
    } else {
      truong += kyTu;
    }
  }

  if (truong || dong.length) {
    dong.push(truong);
    if (dong.some(giaTri => giaTri.trim())) cacDong.push(dong);
  }
  return cacDong;
}

function chuanHoaTimKiem(giaTri) {
  return String(giaTri || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function thoiDiemNhanHoSo(giaTri) {
  const ngay = String(giaTri || '').trim();
  const khop = ngay.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!khop) return 0;

  const [, ngayText, thangText, namText] = khop;
  const ngaySo = Number(ngayText);
  const thangSo = Number(thangText);
  const namSo = Number(namText);
  const thoiDiem = Date.UTC(namSo, thangSo - 1, ngaySo);
  const ngayHopLe = new Date(thoiDiem);
  if (ngayHopLe.getUTCFullYear() !== namSo || ngayHopLe.getUTCMonth() !== thangSo - 1 || ngayHopLe.getUTCDate() !== ngaySo) return 0;
  return thoiDiem;
}

async function taiDongSheet() {
  if (dongDuLieuCache && Date.now() - thoiDiemCache < thoiGianCacheMs) return dongDuLieuCache;
  if (yeuCauSheet) return yeuCauSheet;

  yeuCauSheet = (async () => {
    const duongDan = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(maBangTinh)}/export`);
    duongDan.searchParams.set('format', 'csv');
    duongDan.searchParams.set('gid', maTrangTinh);
    const phanHoi = await fetch(duongDan, {
      headers: { Accept: 'text/csv' },
      signal: AbortSignal.timeout(15000)
    });
    if (!phanHoi.ok) throw new Error(`Google Sheets trả về lỗi HTTP ${phanHoi.status}.`);

    const noiDung = (await phanHoi.text()).replace(/^\uFEFF/, '');
    const [tieuDe, ...cacDong] = phanTichCsv(noiDung);
    if (!tieuDe || !tieuDe.includes('TÊN CÔNG TY') || !tieuDe.includes('TÌNH TRẠNG HỒ SƠ')) {
      throw new Error('Sheet Hoso không có cấu trúc cột mong đợi hoặc chưa được chia sẻ quyền đọc.');
    }

    const cacBanGhi = cacDong.map(dong => Object.fromEntries(tieuDe.map((cot, chiSo) => [cot, dong[chiSo] || ''])));
    dongDuLieuCache = cacBanGhi;
    thoiDiemCache = Date.now();
    return cacBanGhi;
  })();

  try {
    return await yeuCauSheet;
  } finally {
    yeuCauSheet = null;
  }
}

router.get('/', requirePermission('view_customers'), async (req, res) => {
  try {
    const cacBanGhi = await taiDongSheet();
    const trangYeuCau = Number.parseInt(req.query.page, 10);
    const gioiHanYeuCau = Number.parseInt(req.query.limit, 10);
    const trang = Number.isFinite(trangYeuCau) ? Math.max(1, trangYeuCau) : 1;
    const gioiHan = Math.min(100, Math.max(1, Number.isFinite(gioiHanYeuCau) ? gioiHanYeuCau : 50));
    const tuKhoa = chuanHoaTimKiem(String(req.query.q || '').slice(0, 100));
    const loai = chuanHoaTimKiem(req.query.type);
    const tinhTrang = chuanHoaTimKiem(req.query.status);

    const dongDaLoc = cacBanGhi.filter(banGhi => {
      const khopTuKhoa = !tuKhoa || chuanHoaTimKiem(Object.values(banGhi).join(' ')).includes(tuKhoa);
      const khopLoai = !loai || chuanHoaTimKiem(banGhi['LOẠI']) === loai;
      const khopTinhTrang = !tinhTrang || chuanHoaTimKiem(banGhi['TÌNH TRẠNG HỒ SƠ']) === tinhTrang;
      return khopTuKhoa && khopLoai && khopTinhTrang;
    }).sort((a, b) => thoiDiemNhanHoSo(b['NGÀY NHẬN']) - thoiDiemNhanHoSo(a['NGÀY NHẬN']));
    const tongSoTrang = Math.max(1, Math.ceil(dongDaLoc.length / gioiHan));
    const soTrang = Math.min(trang, tongSoTrang);
    const duLieu = dongDaLoc.slice((soTrang - 1) * gioiHan, soTrang * gioiHan);
    const soHoSoThieu = cacBanGhi.filter(banGhi => chuanHoaTimKiem(banGhi['TÌNH TRẠNG HỒ SƠ']).includes('thieu')).length;
    const boLoc = {
      types: [...new Set(cacBanGhi.map(banGhi => banGhi['LOẠI']).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
      statuses: [...new Set(cacBanGhi.map(banGhi => banGhi['TÌNH TRẠNG HỒ SƠ']).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
    };

    res.set('Cache-Control', 'private, no-store');
    res.json({
      success: true,
      data: duLieu,
      meta: { total: dongDaLoc.length, page: soTrang, limit: gioiHan, totalPages: tongSoTrang },
      summary: { total: cacBanGhi.length, missing: soHoSoThieu },
      filters: boLoc
    });
  } catch (loi) {
    console.error('Lỗi đọc Google Sheet Hoso:', loi);
    res.status(502).json({ success: false, message: loi.message || 'Không thể đọc dữ liệu Sheet Hoso.' });
  }
});

router.put('/:id', yeuCauQuyenAdmin, async (req, res) => {
  try {
    const maHoSo = String(req.params.id || '').trim();
    const duLieu = req.body?.data;
    if (!maHoSo || maHoSo.length > 100 || !duLieu || typeof duLieu !== 'object' || Array.isArray(duLieu)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu hồ sơ không hợp lệ.' });
    }

    const truongKhongHopLe = Object.keys(duLieu).find(cot => !cacCotDuocCapNhat.includes(cot));
    if (truongKhongHopLe) return res.status(400).json({ success: false, message: `Không hỗ trợ cập nhật cột ${truongKhongHopLe}.` });

    const duLieuCapNhat = {};
    for (const cot of cacCotDuocCapNhat) {
      if (!Object.prototype.hasOwnProperty.call(duLieu, cot)) continue;
      if (typeof duLieu[cot] !== 'string' || duLieu[cot].length > 1000) {
        return res.status(400).json({ success: false, message: `Giá trị cột ${cot} không hợp lệ hoặc vượt quá 1.000 ký tự.` });
      }
      duLieuCapNhat[cot] = duLieu[cot].trim();
    }
    if (!duLieuCapNhat['TÊN CÔNG TY']) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên công ty.' });

    const ngayNhan = duLieuCapNhat['NGÀY NHẬN'];
    if (ngayNhan && !thoiDiemNhanHoSo(ngayNhan)) {
      return res.status(400).json({ success: false, message: 'Ngày nhận không hợp lệ. Vui lòng nhập ngày theo định dạng ngày/tháng/năm.' });
    }
    const ngayNop = duLieuCapNhat['Ngày Nộp'];
    if (ngayNop && !thoiDiemNhanHoSo(ngayNop)) {
      return res.status(400).json({ success: false, message: 'Ngày nộp không hợp lệ. Vui lòng nhập ngày theo định dạng ngày/tháng/năm.' });
    }

    const sheets = await layGoogleSheets();
    const phanHoi = await sheets.spreadsheets.values.get({
      spreadsheetId: maBangTinh,
      range: `'${tenTrangTinh.replace(/'/g, "''")}'!A:ZZ`
    });
    const [tieuDe, ...cacDong] = phanHoi.data.values || [];
    if (!tieuDe?.includes('ID')) return res.status(502).json({ success: false, message: 'Không tìm thấy cột ID trong sheet Hoso.' });
    const cotConThieu = cacCotDuocCapNhat.find(cot => !tieuDe.includes(cot));
    if (cotConThieu) return res.status(502).json({ success: false, message: `Sheet Hoso thiếu cột ${cotConThieu}.` });

    const chiSoId = tieuDe.indexOf('ID');
    const cacViTriDong = cacDong.reduce((viTri, dong, chiSo) => {
      if (String(dong[chiSoId] || '').trim() === maHoSo) viTri.push(chiSo);
      return viTri;
    }, []);
    if (!cacViTriDong.length) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ cần cập nhật trong sheet Hoso.' });
    if (cacViTriDong.length > 1) return res.status(409).json({ success: false, message: 'Mã hồ sơ bị trùng trong sheet Hoso; không thể xác định dòng cần cập nhật.' });

    const viTriDong = cacViTriDong[0];
    const dongHienTai = cacDong[viTriDong];
    const dongMoi = tieuDe.map((cot, chiSo) => {
      if (!Object.prototype.hasOwnProperty.call(duLieuCapNhat, cot)) return dongHienTai[chiSo] || '';
      return duLieuCapNhat[cot];
    });
    const hang = viTriDong + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: maBangTinh,
      range: phamViTrangTinh(tenCotBangTinh(tieuDe.length - 1), hang, hang),
      valueInputOption: 'RAW',
      requestBody: { values: [dongMoi] }
    });

    dongDuLieuCache = null;
    thoiDiemCache = 0;
    return res.json({ success: true, message: 'Đã lưu hồ sơ vào bảng Hoso.' });
  } catch (loi) {
    console.error('Lỗi lưu hồ sơ vào Google Sheet:', loi);
    return res.status(502).json({ success: false, message: loi.message || 'Không thể lưu hồ sơ vào Google Sheet.' });
  }
});

router.post('/', yeuCauQuyenAdmin, async (req, res) => {
  try {
    const duLieu = req.body?.data;
    if (!duLieu || typeof duLieu !== 'object' || Array.isArray(duLieu)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu hồ sơ không hợp lệ.' });
    }

    const truongKhongHopLe = Object.keys(duLieu).find(cot => !cacCotDuocCapNhat.includes(cot));
    if (truongKhongHopLe) return res.status(400).json({ success: false, message: `Không hỗ trợ lưu cột ${truongKhongHopLe}.` });

    const duLieuMoi = {};
    for (const cot of cacCotDuocCapNhat) {
      if (!Object.prototype.hasOwnProperty.call(duLieu, cot)) continue;
      if (typeof duLieu[cot] !== 'string' || duLieu[cot].length > 1000) {
        return res.status(400).json({ success: false, message: `Giá trị cột ${cot} không hợp lệ hoặc vượt quá 1.000 ký tự.` });
      }
      duLieuMoi[cot] = duLieu[cot].trim();
    }
    if (!duLieuMoi['TÊN CÔNG TY']) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên công ty.' });

    const ngayNhan = duLieuMoi['NGÀY NHẬN'];
    if (ngayNhan && !thoiDiemNhanHoSo(ngayNhan)) {
      return res.status(400).json({ success: false, message: 'Ngày nhận không hợp lệ. Vui lòng nhập ngày theo định dạng ngày/tháng/năm.' });
    }
    const ngayNop = duLieuMoi['Ngày Nộp'];
    if (ngayNop && !thoiDiemNhanHoSo(ngayNop)) {
      return res.status(400).json({ success: false, message: 'Ngày nộp không hợp lệ. Vui lòng nhập ngày theo định dạng ngày/tháng/năm.' });
    }
    if (!duLieuMoi['NGÀY NHẬN']) {
      const homNay = new Date();
      duLieuMoi['NGÀY NHẬN'] = `${String(homNay.getDate()).padStart(2, '0')}/${String(homNay.getMonth() + 1).padStart(2, '0')}/${homNay.getFullYear()}`;
    }

    const sheets = await layGoogleSheets();
    const phanHoi = await sheets.spreadsheets.values.get({
      spreadsheetId: maBangTinh,
      range: `'${tenTrangTinh.replace(/'/g, "''")}'!A:ZZ`
    });
    const [tieuDe, ...cacDong] = phanHoi.data.values || [];
    if (!tieuDe?.includes('ID')) return res.status(502).json({ success: false, message: 'Không tìm thấy cột ID trong sheet Hoso.' });
    const cotConThieu = cacCotDuocCapNhat.find(cot => !tieuDe.includes(cot));
    if (cotConThieu) return res.status(502).json({ success: false, message: `Sheet Hoso thiếu cột ${cotConThieu}.` });

    let maHoSo = randomUUID();
    const chiSoId = tieuDe.indexOf('ID');
    while (cacDong.some(dong => String(dong[chiSoId] || '').trim() === maHoSo)) maHoSo = randomUUID();
    const dongMoi = tieuDe.map(cot => cot === 'ID' ? maHoSo : duLieuMoi[cot] || '');
    const cotCuoi = tenCotBangTinh(tieuDe.length - 1);
    await sheets.spreadsheets.values.append({
      spreadsheetId: maBangTinh,
      range: `'${tenTrangTinh.replace(/'/g, "''")}'!A:${cotCuoi}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [dongMoi] }
    });

    dongDuLieuCache = null;
    thoiDiemCache = 0;
    return res.status(201).json({ success: true, message: 'Đã tạo hồ sơ mới vào bảng Hoso.', data: { ID: maHoSo } });
  } catch (loi) {
    console.error('Lỗi tạo hồ sơ mới trong Google Sheet:', loi);
    res.status(502).json({ success: false, message: loi.message || 'Không thể tạo hồ sơ mới trong Google Sheet.' });
  }
});

module.exports = router;
module.exports.phanTichCsv = phanTichCsv;
