const express = require('express');
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const notificationRoutes = require('./routes/notifications');
const employeeRoutes = require('./routes/employees');
const customerRoutes = require('./routes/customers');
const taskRoutes = require('./routes/tasks');
const routesSoGhiChu = require('./routes/notes');
const chatRoutes = require('./routes/chat');
const authRoutes = require('./routes/auth');
const supportRoutes = require('./routes/support');
const routesTaiLieuHoTro = require('./routes/support-documents');
const customerDebtRoutes = require('./routes/customer-debts');
const bcrypt = require('bcryptjs');
const Role = require('./models/Role');
const User = require('./models/User');
const Customer = require('./models/Customer');
const Employee = require('./models/Employee');
const HoSo = require('./models/HoSo');
const ChuyenPhatNhanh = require('./models/ChuyenPhatNhanh');
const AuditLog = require('./models/AuditLog');
const OrderHistory = require('./models/OrderHistory');
const SupportLog = require('./models/SupportLog');
const SupplierPayment = require('./models/SupplierPayment');
const SupplierDebtAdjustment = require('./models/SupplierDebtAdjustment');
const SupplierDebtSnapshot = require('./models/SupplierDebtSnapshot');
const EmployeePayment = require('./models/EmployeePayment');
const { requireAuth, requireAdmin, requirePermission, requireApiPermission, yeuCauCongCu } = require('./middleware/auth');
const { phamViDuLieu, quyenCot, quyenSuaCot, quyenMa } = require('./services/permissionRegistry');
const { boSungNguCanhThongMinh, xayDungPromptTroLy, tachHanhDongTuPhanHoi } = require('./services/aiTroLyNghiepVu');
const { normalizeCaseFileMst, getCaseFileMstQueryValues, isValidCaseFileDate, buildCaseFilePreview, buildCaseFileUpdateOperations } = require('./services/orderCaseFileImport');
const { extractSmartSignInvoice, smartSignStatusLabel } = require('./services/smartSignInvoiceStatus');
const { buildOrderHistoryChanges, filterMeaningfulOrderHistoryChanges } = require('./services/orderHistoryDiff');
const { phanNhomLichSuDonHang, chuanHoaLichSuGiaoNhan, chuanHoaLichSuHoSo, locLichSuTheoNhom, NHOM_LICH_SU } = require('./services/phanLoaiLichSuDonHang');
const { tinhQuyTrinhDonHang } = require('./services/quyTrinhDonHang');
const { docThongTinUncBangAi, goiGeminiInteraction, MAC_DINH_MODELS } = require('./services/docUncAi');
const { chuanHoaTimKiem } = require('./services/hoso');
const { taoBoLocThanhToanNcc } = require('./services/locThanhToanNcc');
const { TRANG_THAI_KICH_HOAT, tinhTongChiTiet, kiemTraNgay } = require('./services/chiTietDonHang');
const { chuanBiDonNhieuSanPham } = require('./services/taoDonNhieuSanPham');
const { kiemTraDuLieuNhapSanPham, SO_DONG_TOI_DA } = require('./services/nhapSanPhamExcel');
const { taoBoLocSanPhamHetHan, taoBoLocSanPhamConApDung } = require('./services/sanPhamHetHan');
const { chuanBiSuaChiTiet } = require('./services/suaChiTietSanPham');
const { luuKetQuaUncDonHangCu } = require('./services/duyetUncDonHangCu');
const { daBatTinhNang } = require('./services/tinhNangDonNhieuSanPham');
const { cacTrangThai } = require('./public/js/chi-tiet-san-pham-tao-don');
const { dieuKienDonCoSanPhamKichHoat, taoCacBuocDongNcc } = require('./services/tongHopNccNhieuSanPham');
const { ngayHienTaiVietNam } = require('./services/ngayThongKe');
const { batLichDongBoLenGoogleSheet, dongBoTatCaLenGoogleSheet, layTrangThaiDongBoLenSheet } = require('./services/dongBoLenGoogleSheet');
const { ghiSauCapNhat } = require('./services/nhatKyCongCu');
const { luuTepNang, docTepNang, laThamChieuTep } = require('./services/fileStorageService');

const TRUONG_TEP_DON_HANG = ['Hợp Đồng / GDK', 'Xác Nhận/ BBBG', 'GPKD', 'CCCD', 'File tong', 'FILE ĐÍNH KÈM'];

async function nenVaLuuCacTepDonHang(data, maDonHint = '') {
  if (!data || typeof data !== 'object') return;
  for (const field of TRUONG_TEP_DON_HANG) {
    const val = data[field];
    if (typeof val !== 'string') continue;
    const trimmed = val.trim();
    if (!trimmed || trimmed === '__HAS_ATTACHMENT__' || laThamChieuTep(trimmed)) continue;
    if (trimmed.startsWith('data:')) {
      const safeField = field.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
      data[field] = await luuTepNang({
        dataUrl: trimmed,
        fileName: `${maDonHint || 'don-hang'}-${safeField}`,
        prefix: 'order'
      });
    }
  }
}

const app = express();
const hoTroNhieuSanPham = daBatTinhNang(process.env.DON_NHIEU_SAN_PHAM_ENABLED);
let smartSignTokenCache = { token: '', expiresAt: 0 };

async function createSmartSignMbMat(mst) {
  const normalizedMst = String(mst || '').replace(/\D/g, '').padStart(10, '0');
  const dateCode = new Date().toLocaleDateString('en-GB').replace(/\//g, '').slice(0, 6);
  const base = `${normalizedMst}-${dateCode}`;
  const used = await DonHang.find({ 'SmartSign MBMat': new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-\\d+)?$`) }).select('SmartSign MBMat').lean();
  if (!used.some(item => item['SmartSign MBMat'] === base)) return base;
  let suffix = 2;
  const usedCodes = new Set(used.map(item => item['SmartSign MBMat']));
  while (usedCodes.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

async function getSmartSignToken() {
  if (smartSignTokenCache.token && smartSignTokenCache.expiresAt > Date.now() + 60000) return smartSignTokenCache.token;
  const username = String(process.env.SMARTSIGN_USER || '').trim();
  const password = process.env.SMARTSIGN_PASS || '';
  if (!username || !password) throw new Error('Thiếu cấu hình SMARTSIGN_USER hoặc SMARTSIGN_PASS trên máy chủ.');
  const loginResponse = await axios.post('https://apiehd.smartsign.com.vn/api/Authenticate/Signin', {
    UserName: username,
    Password: password
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
  const responseData = loginResponse.data;
  const tokenData = responseData?.AuthorizationToken ?? responseData?.authorizationToken ?? responseData?.data ?? responseData;
  const token = typeof tokenData === 'string' ? tokenData : tokenData?.AccessToken || tokenData?.accessToken || tokenData?.token;
  if (!token) throw new Error('SmartSign không trả Access Token. Kiểm tra tài khoản và mật khẩu tích hợp.');
  let expiresAt = Date.now() + 10 * 60 * 1000;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (payload.exp) expiresAt = payload.exp * 1000;
  } catch (_) { /* Use the short fallback cache duration. */ }
  smartSignTokenCache = { token, expiresAt };
  return token;
}

const danhSachCorsOrigin = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
app.use(danhSachCorsOrigin.length ? cors({ origin: danhSachCorsOrigin }) : cors());
const boPhanTichJsonMacDinh = express.json({ limit: '20mb' });
const boPhanTichJsonTaoDon = express.json({ limit: '36mb' });
app.use((req, res, next) => {
  const boPhanTichJson = ['/api/orders/create', '/api/orders/create-voi-khach-hang'].includes(req.path) ? boPhanTichJsonTaoDon : boPhanTichJsonMacDinh;
  boPhanTichJson(req, res, next);
});
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'DATAGS_modern_youth_lux_smooth (1).html'));
});

app.get('/add-order', (req, res) => {
  res.sendFile(path.join(__dirname, 'add-order.html'));
});

const phienBanUngDung = require('./package.json').version || '1.0.0';

app.get('/api/version', (req, res) => {
  res.json({ version: phienBanUngDung });
});

app.use('/api/auth', authRoutes);
app.use('/api/login-image', require('./routes/login-image'));
app.get('/api/support-share/:id', supportRoutes.taiTepCongKhai);
app.use('/api', requireApiPermission);
app.use('/api/orders', requireAuth);
app.use('/api/sanpham', requireAuth);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/employees', requireAuth, employeeRoutes);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/giao-nhan', requireAuth, require('./routes/giao-nhan'));
app.use('/api/notes', requireAuth, routesSoGhiChu);
app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/hoso', requireAuth, require('./routes/hoso'));
app.use('/api/chat', requireAuth, chatRoutes);
app.use('/api/support', requireAuth, supportRoutes);
app.use('/api/support-documents', requireAuth, routesTaiLieuHoTro);
app.use('/api/cong-no', requireAuth, customerDebtRoutes);
app.use('/api/nhap-so-lieu', requireAuth, require('./routes/expense-rates'));
app.use('/api/cong-no-kl-cu', requireAuth, require('./routes/cong-no-kl-cu'));
app.use('/api/nhat-ky-cong-cu', requireAuth, require('./routes/nhat-ky-cong-cu'));

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, message: 'Chưa cấu hình GEMINI_API_KEY trong file .env.' });
    const models = [...new Set([process.env.GEMINI_MODEL, ...MAC_DINH_MODELS].filter(Boolean))];
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Vui lòng nhập câu hỏi.' });
    if (message.length > 4000) return res.status(400).json({ success: false, message: 'Câu hỏi không được vượt quá 4.000 ký tự.' });
    const rawContext = String(req.body.context || '').slice(0, 12000);
    let parsedContext = {};
    try { parsedContext = rawContext ? JSON.parse(rawContext) : {}; } catch (_) { parsedContext = { raw: rawContext }; }

    const role = req.auth?.userRecord?.roleId;
    const isAdmin = Boolean(req.auth?.isSuperAdmin || role?.name === 'Admin');
    const canViewCustomers = isAdmin || quyenMa(role, 'view_customers') || quyenMa(role, 'customers:view');
    const canViewFinancials = isAdmin || quyenMa(role, 'manage_financials') || quyenMa(role, 'view_internal_finance');
    const smartContext = await boSungNguCanhThongMinh({
      message,
      Customer,
      SanPham: mongoose.models.SANPHAM || SanPham,
      canViewCustomers,
      canViewFinancials
    });
    const mergedContext = JSON.stringify({ ...parsedContext, ...smartContext }).slice(0, 16000);

    const history = Array.isArray(req.body.history) ? req.body.history.slice(-10) : [];
    const prompt = xayDungPromptTroLy({
      message,
      context: mergedContext,
      history,
      userInfo: {
        username: req.auth?.username || '',
        role: role?.name || '',
        employeeName: req.auth?.userRecord?.employeeId?.name || ''
      }
    });
    const { text: rawAnswer, model } = await goiGeminiInteraction({
      apiKey,
      models,
      input: prompt
    });
    const { answer, action } = tachHanhDongTuPhanHoi(rawAnswer);
    return res.json({ success: true, answer, action, model });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Không thể kết nối AI.' });
  }
});

// =========================================================
// 1. KẾT NỐI MONGODB ATLAS
// =========================================================
const MONGO_URI = process.env.ATLAS_MONGO_URI || process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('Thiếu cấu hình kết nối MongoDB (ATLAS_MONGO_URI hoặc MONGO_URI).');
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'DATAGS';

mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME })
  .then(async () => {
    console.log('✅ Đã kết nối thành công tới MongoDB Database: DATAGS');
    await seedAuthData();
    batLichDongBoLenGoogleSheet();
  })
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err.message));


// =========================================================
// 2. KHAI BÁO MONGOOSE SCHEMAS & MODELS
// =========================================================
const DonHangSchema = new mongoose.Schema({}, { strict: false });
DonHangSchema.index({ 'Mã Đơn Hàng': 1 });
DonHangSchema.index({ STT: 1 }, { unique: true, partialFilterExpression: { STT: { $type: 'string', $gt: '' } } });
DonHangSchema.index({ MST: 1 });
DonHangSchema.index({ 'Tên Khách Hàng': 1 });
DonHangSchema.index({ 'TÌNH TRẠNG': 1 });
DonHangSchema.index({ 'Ngày Đăng Ký': -1 });
DonHangSchema.index({ registeredAtDate: -1 });
DonHangSchema.index({ 'TÌNH TRẠNG': 1, registeredAtDate: -1 });
DonHangSchema.index({ 'Nhân Viên Đăng Ký': 1, registeredAtDate: -1 });
DonHangSchema.index({ NCC: 1, 'TÌNH TRẠNG': 1, registeredAtDate: -1 });
const DonHang = mongoose.model('GS-DONHANG', DonHangSchema, 'GS-DONHANG');

const SanPhamSchema = new mongoose.Schema({}, { strict: false });
const SanPham = mongoose.model('SANPHAM', SanPhamSchema, 'SANPHAM');

async function generateUniqueStt() {
  let stt = '';
  do {
    stt = crypto.randomBytes(4).toString('hex').toUpperCase();
  } while (await DonHang.exists({ STT: stt }));
  return stt;
}

async function laySoMaDonCaoNhatTrongNam(nam) {
  const namHaiSo = String(nam).slice(-2);
  const cacThang = Array.from({ length: 12 }, (_, chiSo) => ({
    'Mã Đơn Hàng': new RegExp(`^DH-?${String(chiSo + 1).padStart(2, '0')}${namHaiSo}-\\d{5}$`)
  }));
  const ketQua = await DonHang.aggregate([
    { $match: { $or: cacThang } },
    { $project: { soThuTu: { $toInt: { $substrBytes: ['$Mã Đơn Hàng', { $subtract: [{ $strLenBytes: '$Mã Đơn Hàng' }, 5] }, 5] } } } },
    { $group: { _id: null, caoNhat: { $max: '$soThuTu' } } }
  ]).option({ maxTimeMS: 15000 });
  return Number(ketQua[0]?.caoNhat) || 0;
}

function dinhDangMaDonHang(ngay, soThuTu) {
  if (!Number.isInteger(soThuTu) || soThuTu < 1 || soThuTu > 99999) {
    const loi = new Error('Đã hết số thứ tự mã đơn hàng trong năm.');
    loi.statusCode = 409;
    throw loi;
  }
  const thang = String(ngay.getMonth() + 1).padStart(2, '0');
  const nam = String(ngay.getFullYear()).slice(-2);
  return `DH${thang}${nam}-${String(soThuTu).padStart(5, '0')}`;
}

async function xemMaDonHangTiepTheo(ngay = new Date()) {
  const nam = ngay.getFullYear();
  const [soDonCaoNhat, boDem] = await Promise.all([
    laySoMaDonCaoNhatTrongNam(nam),
    mongoose.connection.collection('order_code_counters').findOne({ _id: nam })
  ]);
  return dinhDangMaDonHang(ngay, Math.max(soDonCaoNhat, Number(boDem?.value) || 0) + 1);
}

async function taoMaDonHangTiepTheo(ngay = new Date()) {
  const nam = ngay.getFullYear();
  const soDonCaoNhat = await laySoMaDonCaoNhatTrongNam(nam);
  const boDem = mongoose.connection.collection('order_code_counters');
  await boDem.updateOne({ _id: nam }, { $setOnInsert: { value: soDonCaoNhat } }, { upsert: true });
  await boDem.updateOne({ _id: nam }, { $max: { value: soDonCaoNhat } });
  const ketQua = await boDem.findOneAndUpdate(
    { _id: nam },
    { $inc: { value: 1 } },
    { returnDocument: 'after' }
  );
  const banGhi = ketQua?.value && typeof ketQua.value === 'object' ? ketQua.value : ketQua;
  const soThuTu = Number(banGhi?.value);
  return dinhDangMaDonHang(ngay, soThuTu);
}

function normalizeRegistrationDate(value) {
  const text = String(value || '').trim();
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
  const localMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (localMatch) return `${localMatch[1].padStart(2, '0')}/${localMatch[2].padStart(2, '0')}/${localMatch[3]}`;
  return value;
}

function parseRegistrationDate(value) {
  const normalized = normalizeRegistrationDate(value);
  const match = String(normalized || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function seedAuthData() {
  const all = ['view_orders','manage_orders','view_debts','view_employees','manage_employees','view_notifications','manage_notifications','view_customers','manage_customers','manage_roles','manage_users'];
  const roles = [{ name: 'Admin', description: 'Toàn quyền', permissions: all, dataScopes: { orders: 'all' } }, { name: 'Nhập Liệu', description: 'Nhập và xử lý đơn hàng cho các nhân viên', permissions: ['view_orders','manage_orders','view_customers'], dataScopes: { orders: 'all' } }, { name: 'Quản Lý', description: 'Quản lý vận hành', permissions: all.slice(0, 9).filter(permission => permission !== 'view_debts'), dataScopes: { orders: 'all' } }, { name: 'Nhân Viên', description: 'Xử lý đơn hàng', permissions: ['view_orders','manage_orders','view_customers'], dataScopes: { orders: 'own' } }, { name: 'Chỉ Xem', description: 'Chỉ xem dữ liệu', permissions: ['view_orders','view_employees','view_notifications','view_customers'], dataScopes: { orders: 'own' } }];
  for (const role of roles) await Role.findOneAndUpdate({ name: role.name }, { $setOnInsert: role }, { upsert: true, new: true });
  const adminRole = await Role.findOne({ name: 'Admin' });
  if (adminRole && !(await User.findOne({ username: process.env.ADMIN_USERNAME || 'admin' }))) {
    if (!process.env.ADMIN_PASSWORD) throw new Error('Thiếu cấu hình ADMIN_PASSWORD để tạo tài khoản Admin đầu tiên.');
    await User.create({ username: process.env.ADMIN_USERNAME || 'admin', passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12), roleId: adminRole._id });
  }
}

function normalizeInvoiceData(invoiceData = {}) {
  const safeString = (value, fallback = '') => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  };
  const safeNumber = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const rawAmount = Math.max(0, safeNumber(invoiceData.thanhTienSauThue ?? invoiceData.thanhTien ?? 0, 0));
  const productType = safeString(invoiceData.loaiSanPham || invoiceData.productType || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isCks = productType.includes('CKS') || productType.includes('CHU KY SO');
  const isNoTax = productType.includes('HDDT') || productType.includes('HOA DON DIEN TU') || productType.includes('KHONG CHIU THUE') || productType.includes('KCT');
  const amountBeforeTax = isCks ? Math.round(rawAmount / 1.08 || 0) : rawAmount;
  const taxAmount = isCks ? rawAmount - amountBeforeTax : 0;
  return {
    rawAmount,
    amountBeforeTax,
    taxAmount,
    isCks,
    isNoTax,
    productType,
    normalizedMst: safeString(invoiceData.mst || '').replace(/\D/g, '').padStart(10, '0')
  };
}

function buildSmartSignInvoicePayload(invoiceData) {
  const { rawAmount, amountBeforeTax, taxAmount, isCks, isNoTax, normalizedMst } = normalizeInvoiceData(invoiceData);
  const safeString = (value, fallback = '') => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  };
  const mbMat = safeString(invoiceData.mbMat || '', 'DRAFT-' + Date.now());
  const nowIsoString = new Date().toISOString().slice(0, 19);
  const taxRate = isCks ? 8 : (isNoTax ? 'KCT' : 0);
  const productName = safeString(invoiceData.tenSanPham || 'Dịch vụ', 'Dịch vụ');
  const companyName = safeString(invoiceData.tenCongTy || invoiceData.tenKhachHang || 'Công ty', 'Công ty');
  const customerName = safeString(invoiceData.tenKhachHang || '', 'Khách hàng');
  const orderAddress = safeString(invoiceData.diaChi || '', '');
  const invoiceQty = Math.max(1, Number(String(invoiceData.soLuong || 1).replace(/[^0-9.]/g, '')) || 1);

  return {
    TTChung: {
      MSTCNhanh: '',
      KHMSHDon: 1,
      KHHDon: 'C26TAA',
      SHDon: 0,
      NLap: nowIsoString,
      DVTTe: 'VND',
      TGia: '1',
      HTTToan: invoiceData.hinhThucThanhToan || 'TM/CK',
      MBMat: mbMat,
      MNBo: mbMat,
      MTCuu: null,
      PTTToan: '',
      NgayChungTu: nowIsoString
    },
    NMua: {
      Ten: companyName,
      MST: normalizedMst,
      DChi: orderAddress,
      SDThoai: safeString(invoiceData.sdt || '', ''),
      DCTDTu: safeString(invoiceData.email || '', ''),
      HVTNMHang: customerName,
      STKNHang: null,
      TNHang: null,
      CMND: safeString(invoiceData.cccd || '', '')
    },
    DSHHDVu: {
      HHDVu: [{
        TChat: 1,
        THHDVu: productName,
        DVTinh: safeString(invoiceData.donViTinh || 'Gói', 'Gói'),
        SLuong: String(invoiceQty),
        DGia: String(amountBeforeTax),
        TLCKhau: 0,
        STCKhau: '0.0',
        ThTien: String(amountBeforeTax),
        TSuat: taxRate,
        MHHDVu: safeString(invoiceData.maSanPham || 'SP01', 'SP01')
      }]
    },
    TToan: {
      TgTTTKCThue: isCks ? '0' : String(rawAmount),
      TgTSKCThue: '0',
      TgTTTThue0: isNoTax ? String(rawAmount) : '0',
      TgTSTCThue0: isNoTax ? String(rawAmount) : '0',
      TgTTTThue5: '0',
      TgTThue5: '0',
      TgTSTCThue5: '0',
      TgTTTThue8: isCks ? String(amountBeforeTax) : '0',
      TgTThue8: isCks ? String(taxAmount) : '0',
      TgTSTCThue8: isCks ? String(rawAmount) : '0',
      TgTTTThue10: '0',
      TgTThue10: '0',
      TgTSTCThue10: '0',
      TSuat: String(taxRate),
      TgTCThue: String(amountBeforeTax),
      TgTThue: String(taxAmount),
      TTCKTMai: '0',
      TgTTTBSo: String(rawAmount),
      TgTTTBChu: 'Không đồng'
    }
  };
}

async function verifySmartSignInvoiceExists(accessToken, mbMat) {
  try {
    const invoiceResponse = await axios.get('https://apiehd.smartsign.com.vn/api/HDon/GetInvoiceInfo', {
      params: { MBMat: mbMat },
      headers: { Authorization: `Token ${accessToken}` }
    });
    const payload = invoiceResponse?.data;
    if (!payload) return false;
    const candidateValues = [
      payload?.MBMat,
      payload?.SHDon,
      payload?.TTHDon,
      payload?.MTCuu,
      payload?.data?.MBMat,
      payload?.data?.SHDon,
      payload?.data?.TTHDon,
      payload?.data?.MTCuu,
      payload?.HDon,
      payload?.Invoice
    ];
    const hasRecord = candidateValues.some(value => value !== undefined && value !== null && value !== '');
    if (Array.isArray(payload?.HDon) && payload.HDon.length) return true;
    if (Array.isArray(payload?.data) && payload.data.length) return true;
    return hasRecord;
  } catch (error) {
    console.warn('Không xác thực được hóa đơn trên SmartSign:', error.response?.data || error.message);
    return false;
  }
}

// =========================================================
// =========================================================
// 3. API TÍCH HỢP SMARTSIGN (XUẤT HÓA ĐƠN)
// =========================================================
app.post('/api/invoice/push-smartsign', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  let smartSignStage = 'đăng nhập';
  try {
    const { orderId, invoiceData } = req.body;
    if (!invoiceData || !orderId || !mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu hóa đơn hoặc mã đơn hàng để xuất hóa đơn.' });
    }
    const accessUser = await getAccessUser(req);
    if (!accessUser?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const existingOrder = await DonHang.findOne({
      ...buildOrderFilter({}, { scopeUser: accessUser }),
      _id: orderId
    }).lean();
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng để xuất hóa đơn.' });
    }
    const existingMbMat = String(existingOrder?.['SmartSign MBMat'] || '');
    const hasNewMbMatFormat = /^\d{10}-\d{6}(?:-\d+)?$/.test(existingMbMat);
    const hasAlreadyCreatedInvoice = Boolean(existingOrder?.['SmartSign InvoiceCreated'] === true || existingOrder?.['Xuất Hóa Đơn'] === true || existingOrder?.['Trạng Thái Hóa Đơn'] || existingMbMat);
    const accessToken = await getSmartSignToken();
    smartSignStage = 'kiểm tra hóa đơn';
    const remoteInvoiceStillExists = hasAlreadyCreatedInvoice && hasNewMbMatFormat
      ? await verifySmartSignInvoiceExists(accessToken, existingMbMat)
      : false;
    if (remoteInvoiceStillExists) {
      return res.status(409).json({
        success: false,
        alreadyCreated: true,
        mbMat: existingOrder['SmartSign MBMat'],
        message: `Đơn hàng đã có hóa đơn SmartSign với mã ${existingOrder['SmartSign MBMat'] || 'đã lưu'}. Không tạo lại để tránh trùng.`
      });
    }
    const invoiceTemplate = buildSmartSignInvoicePayload(invoiceData);
    const mbMat = String(invoiceTemplate.TTChung.MBMat || '').trim();
    console.log("Đăng nhập thành công, đang đẩy dữ liệu hóa đơn sang SmartSign...");

    const payload = invoiceTemplate;
    smartSignStage = 'tạo hóa đơn';

    const pushResponse = await axios.post('https://apiehd.smartsign.com.vn/api/HDon/CreateInvoice', payload, {
      headers: {
        'Authorization': `Token ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const verified = await verifySmartSignInvoiceExists(accessToken, mbMat);
    if (!verified) {
      throw new Error('SmartSign trả về phản hồi nhưng hóa đơn chưa xuất hiện trên hệ thống, không cập nhật trạng thái thành công.');
    }

    await DonHang.findByIdAndUpdate(orderId, {
      'Xuất Hóa Đơn': true,
      'Trạng Thái Hóa Đơn': 'Đã tạo trên SmartSign',
      'SmartSign InvoiceCreated': true,
      'SmartSign MBMat': mbMat,
      ...(existingMbMat && existingMbMat !== mbMat ? { 'SmartSign Legacy MBMat': existingMbMat } : {})
    });
    try {
      await writeOrderAudit(existingOrder._id, req, 'CREATE_INVOICE', [{
        field: 'Hóa đơn',
        from: String(existingOrder['Trạng Thái Hóa Đơn'] || 'Chưa xuất'),
        to: `Đã tạo trên SmartSign (${mbMat})`
      }], 'Tạo hóa đơn SmartSign');
    } catch (historyError) {
      console.error('Không ghi được lịch sử tạo hóa đơn:', historyError.message);
    }

    res.json({ 
      success: true,
      verified: true,
      message: 'Đã xuất hóa đơn sang SmartSign thành công!',
      data: pushResponse.data,
      mbMat
    });

  } catch (error) {
    const providerStatus = Number(error.response?.status || 0);
    console.error('Lỗi SmartSign:', { stage: smartSignStage, status: providerStatus || null, message: error.message });
    if (error.message?.includes('SMARTSIGN_USER') || error.message?.includes('SMARTSIGN_PASS')) {
      return res.status(503).json({ success: false, message: error.message });
    }
    if (providerStatus === 401 || providerStatus === 403) {
      return res.status(502).json({ success: false, message: 'SmartSign từ chối đăng nhập. Kiểm tra tài khoản/mật khẩu SMARTSIGN_USER và SMARTSIGN_PASS trên máy chủ.' });
    }
    if (providerStatus >= 500) {
      return res.status(502).json({ success: false, message: `SmartSign đang lỗi máy chủ ở bước ${smartSignStage} (HTTP ${providerStatus}). Vui lòng kiểm tra cấu hình tài khoản hoặc liên hệ SmartSign.` });
    }
    const providerMessage = error.response?.data?.message || error.response?.data?.error;
    const safeMessage = typeof providerMessage === 'string' && providerMessage.length < 300
      ? providerMessage
      : (!providerStatus && !error.isAxiosError && error.message
        ? error.message
        : `Không thể ${smartSignStage} SmartSign${providerStatus ? ` (HTTP ${providerStatus})` : ''}.`);
    res.status(502).json({ success: false, message: safeMessage });
  }
});


// =========================================================
// 4. CÁC ROUTE API DÀNH CHO GS-DONHANG
// =========================================================
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const orderSortFields = {
  orderCode: 'Mã Đơn Hàng',
  registeredAt: 'registeredAtDate',
  customer: 'Tên Khách Hàng',
  status: 'TÌNH TRẠNG',
  amount: 'Thành Tiền'
};
const activatedOrderStatus = TRANG_THAI_KICH_HOAT;

function parseQueryDate(value, endOfDay = false) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getAccessUser(req) {
  return req.auth?.userRecord || User.findById(req.auth?.userId).populate('roleId').populate('employeeId').lean();
}

function orderScope(user) {
  if (!user) return 'none';
  if (user.roleId?.permissions?.includes('view_all_orders')) return 'all';
  const phamVi = phamViDuLieu(user.roleId, 'orders');
  if (user.roleId?.accessControl?.version === 1 || phamVi !== 'none') return phamVi;
  return ['Nhân Viên', 'Chỉ Xem'].includes(user.roleId?.name) ? 'own' : 'all';
}

function canViewFinancialOrderFields(user) {
  return user?.roleId?.name === 'Admin'
    || user?.roleId?.permissions?.some(permission => ['manage_financials', 'manage_orders_financial', 'view_internal_finance'].includes(permission))
    || user?.roleId?.accessControl?.resources?.internalFinance?.actions?.includes('view');
}

function layCotTheoNguoiDung(user, bang) {
  return {
    [bang]: [...new Set([
      ...(user?.hiddenColumns?.[bang] || []),
      ...(user?.roleId?.hiddenColumns?.[bang] || [])
    ])]
  };
}

function layCotDonTheoNguoiDung(user) {
  return layCotTheoNguoiDung(user, 'orders');
}

function locChiTietSanPhamTheoQuyen(order, user) {
  const safe = { ...order };
  if (Array.isArray(safe.chiTietSanPham)) safe.laDonNhieuSanPham = true;
  delete safe.phieuUnc;
  const cotUser = layCotDonTheoNguoiDung(user);
  const cotAn = cotUser.orders;
  const duocXemChiTiet = quyenCot(user?.roleId, 'orders', 'chiTietSanPham', cotUser)
    || ['maDong', 'maSanPham', 'tenSanPham', 'loaiSanPham', 'ncc', 'hinhThuc', 'trangThai', 'donViTinh', 'soLuong',
      'giaBan', 'giaDongCongTy', 'giaNoNcc', 'phaiThuKhach', 'thanhToanKhach', 'thanhToanNcc']
      .some(truong => quyenCot(user?.roleId, 'orders', `chiTietSanPham.${truong}`, cotUser));
  if (!duocXemChiTiet) {
    delete safe.chiTietSanPham;
    return safe;
  }
  if (!Object.prototype.hasOwnProperty.call(safe, 'chiTietSanPham')) return safe;
  if (!Array.isArray(safe.chiTietSanPham)) {
    delete safe.chiTietSanPham;
    return safe;
  }
  const truongThongTin = [
    ['maDong', []],
    ['maSanPham', ['Gói ', 'Loại Sản Phẩm']],
    ['tenSanPham', ['Gói ']],
    ['loaiSanPham', ['Loại Sản Phẩm']],
    ['ncc', ['NCC']],
    ['hinhThuc', ['Hình Thức']],
    ['trangThai', ['TÌNH TRẠNG']],
    ['donViTinh', ['Đơn Vị Tính']],
    ['soLuong', ['Số Lượng']]
  ];
  safe.chiTietSanPham = safe.chiTietSanPham.map(dong => {
    if (!dong || typeof dong !== 'object' || Array.isArray(dong)) return {};
    const ketQua = {};
    truongThongTin.forEach(([truong, cotLienQuan]) => {
      if (quyenCot(user?.roleId, 'orders', `chiTietSanPham.${truong}`, cotUser)
          && !cotLienQuan.some(cot => cotAn.includes(cot))
          && Object.prototype.hasOwnProperty.call(dong, truong)) ketQua[truong] = dong[truong];
    });
    ['giaBan', 'giaDongCongTy', 'giaNoNcc', 'phaiThuKhach', 'thanhToanKhach', 'thanhToanNcc'].forEach(truong => {
      if (quyenCot(user?.roleId, 'orders', `chiTietSanPham.${truong}`, cotUser)
          && Object.prototype.hasOwnProperty.call(dong, truong)) ketQua[truong] = dong[truong];
    });
    return ketQua;
  });
  return safe;
}

function sanitizeOrderForUser(order, user) {
  const safe = locChiTietSanPhamTheoQuyen(order, user);
  const cotUser = layCotDonTheoNguoiDung(user);
  Object.keys(safe).forEach(field => {
    if (!['_id', '__v', 'createdAt', 'updatedAt'].includes(field)
        && !quyenCot(user?.roleId, 'orders', field, cotUser)) delete safe[field];
  });
  return safe;
}

function giaTriTruongBangNhau(cu, moi) {
  if (cu === moi) return true;
  const cuRong = cu === undefined || cu === null || cu === '';
  const moiRong = moi === undefined || moi === null || moi === '';
  if (cuRong && moiRong) return true;
  const cuSo = cuRong ? 0 : (typeof cu === 'number' ? cu : (typeof cu === 'string' && cu.trim() !== '' ? Number(cu) : NaN));
  const moiSo = moiRong ? 0 : (typeof moi === 'number' ? moi : (typeof moi === 'string' && moi.trim() !== '' ? Number(moi) : NaN));
  if (Number.isFinite(cuSo) && Number.isFinite(moiSo)) return cuSo === moiSo;
  if (typeof cu === 'string' && typeof moi === 'string') return cu.trim() === moi.trim();
  return JSON.stringify(cu ?? null) === JSON.stringify(moi ?? null);
}

function truongDonKhongDuocSua(user, data, truongBoQua = [], donHienTai = null) {
  const truongCam = [];
  Object.keys(data || {}).forEach(truong => {
    if (truong === 'chiTietSanPham' && Array.isArray(data[truong])) {
      if (!truongBoQua.includes(truong) && !quyenSuaCot(user?.roleId, 'orders', truong)) truongCam.push(truong);
      data[truong].forEach((dong, index) => {
        if (!dong || typeof dong !== 'object' || Array.isArray(dong)) {
          truongCam.push(`${truong}.${index}`);
          return;
        }
        Object.keys(dong).forEach(cot => {
          if (truongBoQua.includes(`${truong}.${cot}`)) return;
          if (!quyenSuaCot(user?.roleId, 'orders', `${truong}.${cot}`)) truongCam.push(`${truong}.${cot}`);
        });
      });
      return;
    }
    if (truongBoQua.includes(truong)) return;
    if (donHienTai && giaTriTruongBangNhau(donHienTai[truong], data[truong])) return;
    if (!quyenSuaCot(user?.roleId, 'orders', truong)) truongCam.push(truong);
  });
  return [...new Set(truongCam)];
}

function cotXuatDon(user) {
  const quyen = field => quyenCot(user?.roleId, 'orders', field, layCotDonTheoNguoiDung(user));
  const cot = [
    { header: 'Mã Đơn Hàng', value: order => order['Mã Đơn Hàng'], allowed: quyen('Mã Đơn Hàng') },
    { header: 'Ngày Đăng Ký', value: order => order['Ngày Đăng Ký'], allowed: quyen('Ngày Đăng Ký') },
    { header: 'Nhân Viên Đăng Ký', value: order => order['Nhân Viên Đăng Ký'], allowed: quyen('Nhân Viên Đăng Ký') },
    { header: 'Tên Khách Hàng', value: order => order['Tên Khách Hàng'], allowed: quyen('Tên Khách Hàng') },
    { header: 'SĐT', value: order => order.SĐT, allowed: quyen('SĐT') },
    { header: 'Tên Công Ty', value: order => order['Tên Công Ty '], allowed: quyen('Tên Công Ty ') },
    { header: 'MST', value: order => order.MST, allowed: quyen('MST') },
    { header: 'NCC', value: order => order.NCC, allowed: quyen('NCC') },
    { header: 'Gói Cước', value: order => order['Gói '], allowed: quyen('Gói ') },
    { header: 'Thành Tiền', value: order => Number(order['Thành Tiền']) || 0, allowed: quyen('Thành Tiền') },
    { header: 'Đã Thanh Toán', value: order => quyen('KH Thanh Toán') && order['KH Thanh Toán'] != null ? Number(order['KH Thanh Toán']) || 0 : quyen('Thực Thu') ? Number(order['Thực Thu']) || 0 : 0, allowed: quyen('KH Thanh Toán') || quyen('Thực Thu') },
    { header: 'Còn Nợ', value: order => quyen('Còn lại') && order['Còn lại'] != null ? Number(order['Còn lại']) || 0 : quyen('Thành Tiền') && (quyen('KH Thanh Toán') || quyen('Thực Thu')) ? (Number(order['Thành Tiền']) || 0) - (quyen('KH Thanh Toán') && order['KH Thanh Toán'] != null ? Number(order['KH Thanh Toán']) || 0 : Number(order['Thực Thu']) || 0) : '', allowed: quyen('Còn lại') || (quyen('Thành Tiền') && (quyen('KH Thanh Toán') || quyen('Thực Thu'))) },
    { header: 'Tình Trạng', value: order => order['TÌNH TRẠNG'], allowed: quyen('TÌNH TRẠNG') }
  ];
  return cot.filter(item => item.allowed);
}

function lichSuDuocXem(change, user) {
  const field = String(change?.field || '');
  if (['Thao tác', 'Hỗ trợ Online', 'QR chuyển khoản', 'Thanh toán', 'Hóa đơn'].includes(field)) return true;
  if (field.startsWith('chiTietSanPham.')) {
    const truong = field.split('.').pop();
    return quyenCot(user?.roleId, 'orders', `chiTietSanPham.${truong}`, layCotDonTheoNguoiDung(user));
  }
  return quyenCot(user?.roleId, 'orders', field, layCotDonTheoNguoiDung(user));
}

function sanitizeProductForUser(product, user) {
  const safe = { ...product };
  const cotUser = layCotTheoNguoiDung(user, 'products');
  Object.keys(safe).forEach(field => {
    if (!['_id', '__v', 'createdAt', 'updatedAt'].includes(field)
        && !quyenCot(user?.roleId, 'products', field, cotUser)) delete safe[field];
  });
  return safe;
}

function truongSanPhamKhongDuocSua(user, product) {
  const cotUser = layCotTheoNguoiDung(user, 'products');
  return Object.keys(product || {}).filter(field => !quyenSuaCot(user?.roleId, 'products', field)
    || !quyenCot(user?.roleId, 'products', field, cotUser));
}

function cotXuatSanPham(user) {
  const giaTri = (product, fields) => fields.map(field => product[field]).find(value => value !== undefined && value !== null) ?? '';
  const cot = [
    { header: 'Mã Sản Phẩm', key: 'maSanPham', fields: ['MÃ SẢN PHẨM', 'Mã SP'] },
    { header: 'Tên Sản Phẩm / Gói Cước', key: 'tenSanPham', fields: ['TÊN SẢN PHẨM', 'Tên Sản Phẩm', 'Gói ', 'Gói'] },
    { header: 'Loại Sản Phẩm', key: 'loaiSanPham', fields: ['LOẠI SẢN PHẨM', 'Loại Sản Phẩm'] },
    { header: 'NCC', key: 'ncc', fields: ['NCC'] },
    { header: 'Hình Thức', key: 'hinhThuc', fields: ['Hình Thức', 'HÌnh Thức'] },
    { header: 'Giá Sau Thuế (VNĐ)', key: 'giaSauThue', fields: ['GIÁ SAU THUẾ', 'SAU THUẾ', 'Giá Sau Thuế', 'Gia Sau Thue', 'GIÁ', 'Giá'] },
    { header: 'Thực Đóng Công Ty (VNĐ)', key: 'thucDongCongTy', fields: ['THỰC ĐÓNG CÔNG TY', 'Thực Đóng Công Ty', 'Thực Đóng Cty'] },
    { header: 'Thực Công Nợ Cty (VNĐ)', key: 'thucCongNoCty', fields: ['THỰC CÔNG NỢ CTY', 'THỰC CÔNG NỢ CTY (VNĐ)'] },
    { header: 'VAT (%)', key: 'vat', fields: ['VAT'] },
    { header: 'Ngày áp dụng', key: 'ngayApDung', fields: ['Ngày áp dụng', 'Ngày Áp Dụng', 'NGÀY ÁP DỤNG'] },
    { header: 'Ngày kết thúc', key: 'ngayKetThuc', fields: ['Ngày kết thúc', 'Ngày Kết Thúc', 'NGÀY KẾT THÚC'] }
  ];
  const cotUser = layCotTheoNguoiDung(user, 'products');
  return cot.filter(item => item.fields.some(field => quyenCot(user?.roleId, 'products', field, cotUser)))
    .map(item => ({ ...item, value: product => giaTri(product, item.fields) }));
}

async function writeOrderAudit(orderId, req, action, changes = [], reason = '') {
  await OrderHistory.create({ orderId, changedBy: req.auth?.username || 'Hệ thống', changedAt: new Date(), action, module: 'orders', reason: String(reason || ''), ip: req.ip || '', changes });
}

function buildOrderFilter(query = {}, options = {}) {
  const search = String(query.q || query.search || '').trim().slice(0, 120);
  const employee = String(query.employee || '').trim();
  const status = String(query.status || '').trim();
  const paymentStatus = String(query.paymentStatus || '').trim();
  const year = String(query.year || '').trim();
  const month = String(query.month || '').trim();
  const filter = {};
  const andConditions = [];
  filter.archivedAt = null;

  if (options.scopeUser && orderScope(options.scopeUser) === 'none') filter._id = null;

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), 'i');
    // MST có thể được lưu dạng số (mất số 0 đầu), nên bỏ số 0 đầu khi so khớp
    const leadingZeroMst = search.match(/^0+(\d{8,}(?:-\d{1,3})?)$/);
    const mstRegex = leadingZeroMst ? new RegExp(`^0*${escapeRegex(leadingZeroMst[1])}`) : searchRegex;
    filter.$or = [
      { 'Mã Đơn Hàng': searchRegex },
      { 'Tên Khách Hàng': searchRegex },
      { 'Tên Công Ty ': searchRegex },
      { SĐT: searchRegex },
      { 'Nhân Viên Đăng Ký': searchRegex },
      { 'TÌNH TRẠNG': searchRegex },
      { $expr: { $regexMatch: { input: { $toString: { $ifNull: ['$MST', ''] } }, regex: mstRegex.source, options: 'i' } } }
    ];
  }
  if (employee && employee !== 'ALL') filter['Nhân Viên Đăng Ký'] = employee;
  if (status === 'NOT_ACTIVATED') filter['TÌNH TRẠNG'] = { $not: /kích hoạt/i };
  else if (status && status !== 'ALL') filter['TÌNH TRẠNG'] = status;
  if (paymentStatus && paymentStatus !== 'ALL') filter['Hình Thức Thanh Toán'] = new RegExp(`^\\s*${escapeRegex(String(paymentStatus).trim())}\\s*$`, 'i');
  if (options.activatedOnly) filter['TÌNH TRẠNG'] = activatedOrderStatus;
  if (options.scopeUser && orderScope(options.scopeUser) === 'own') {
    const employeeName = String(options.scopeUser.employeeId?.name || '').trim();
    if (employeeName) filter['Nhân Viên Đăng Ký'] = employeeName;
    else filter._id = null;
  }
  if (options.scopeUser && orderScope(options.scopeUser) === 'department') {
    const department = String(options.scopeUser.employeeId?.department || '').trim();
    if (department) filter['Bộ Phận'] = department;
    else filter._id = null;
  }

  const yearNumber = Number.parseInt(year, 10);
  const monthNumber = Number.parseInt(month, 10);
  if (year !== 'ALL' && Number.isInteger(yearNumber) && yearNumber >= 2000 && yearNumber <= 2100) {
    const hasMonth = month !== 'ALL' && Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12;
    const startMonth = hasMonth ? monthNumber - 1 : 0;
    const end = hasMonth ? new Date(Date.UTC(yearNumber, startMonth + 1, 1)) : new Date(Date.UTC(yearNumber + 1, 0, 1));
    andConditions.push({ registeredAtDate: { $gte: new Date(Date.UTC(yearNumber, startMonth, 1)), $lt: end } });
  } else if (month !== 'ALL' && Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
    andConditions.push({ $expr: { $eq: [{ $month: '$registeredAtDate' }, monthNumber] } });
  }

  const fromDate = parseQueryDate(query.fromDate, false);
  const toDate = parseQueryDate(query.toDate, true);
  if (fromDate || toDate) {
    const range = {};
    if (fromDate) range.$gte = fromDate;
    if (toDate) range.$lte = toDate;
    andConditions.push({ registeredAtDate: range });
  }
  if (andConditions.length) filter.$and = andConditions;
  return filter;
}

function orderMoneyExpression(field) {
  return { $convert: { input: `$${field}`, to: 'double', onError: 0, onNull: 0 } };
}

function getNccDebtPeriodKey(query = {}) {
  return ['year', 'month', 'fromDate', 'toDate'].map(field => String(query[field] || 'ALL').trim() || 'ALL').join('|');
}

function orderDebtExpression() {
  const paidExpression = { $convert: { input: { $ifNull: ['$KH Thanh Toán', '$Thực Thu'] }, to: 'double', onError: 0, onNull: 0 } };
  return {
    $cond: [
      { $ne: [{ $type: '$Còn lại' }, 'missing'] },
      orderMoneyExpression('Còn lại'),
      { $subtract: [orderMoneyExpression('Thành Tiền'), paidExpression] }
    ]
  };
}

app.get('/api/customers/:id/registrations', requirePermission('view_customers'), requirePermission('view_orders'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Mã khách hàng không hợp lệ.' });
    const accessUser = await getAccessUser(req);
    if (!accessUser || !accessUser.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const customer = await Customer.findOne({ _id: req.params.id, isActive: { $ne: false } }).select('name tenTruoc company mst phone').lean();
    if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });

    const tenKhach = [...new Set([customer.name, customer.company, ...(customer.tenTruoc || [])].map(value => String(value || '').trim()).filter(Boolean))];
    const dieuKienKhachHang = tenKhach.flatMap(ten => [
      { 'Tên Khách Hàng': new RegExp(`^${escapeRegex(ten)}$`, 'i') },
      { 'Tên Công Ty ': new RegExp(`^${escapeRegex(ten)}$`, 'i') }
    ]);
    const mst = String(customer.mst || '').replace(/\D/g, '').replace(/^0+/, '');
    if (mst) {
      dieuKienKhachHang.push({
        $expr: {
          $regexMatch: {
            input: { $convert: { input: '$MST', to: 'string', onError: '', onNull: '' } },
            regex: `^\\D*0*${mst.split('').join('\\D*')}\\D*$`,
            options: 'i'
          }
        }
      });
    }
    const sdt = String(customer.phone || '').replace(/\D/g, '');
    if (sdt.length >= 7) {
      const regexSdt = `^\\D*${sdt.split('').join('\\D*')}\\D*$`;
      for (const truong of ['Số Điện Thoại', 'SĐT']) {
        dieuKienKhachHang.push({
          $expr: {
            $regexMatch: {
              input: { $convert: { input: `$${truong}`, to: 'string', onError: '', onNull: '' } },
              regex: regexSdt,
              options: 'i'
            }
          }
        });
      }
    }
    const dieuKienKhach = dieuKienKhachHang.length ? { $or: dieuKienKhachHang } : { _id: null };
    const boLocQuyen = buildOrderFilter({}, { scopeUser: accessUser });
    if (req.query.activatedOnly === '1') boLocQuyen['TÌNH TRẠNG'] = activatedOrderStatus;
    const filter = {
      $and: [
        ...Object.entries(boLocQuyen).map(([field, value]) => ({ [field]: value })),
        dieuKienKhach
      ]
    };
    const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const includeStats = req.query.includeStats !== '0';
    const cotAn = accessUser.hiddenColumns?.orders || accessUser.roleId?.hiddenColumns?.orders || [];
    const cotTaiChinh = ['Thành Tiền', 'KH Thanh Toán', 'Thực Thu', 'Còn lại'];
    const coQuyenTaiChinh = canViewFinancialOrderFields(accessUser) && !cotTaiChinh.some(field => cotAn.includes(field));
    const projection = {
      'Ngày Đăng Ký': 1,
      'Mã Đơn Hàng': 1,
      'Gói ': 1,
      NCC: 1,
      'TÌNH TRẠNG': 1
    };
    if (coQuyenTaiChinh) Object.assign(projection, {
      'Thành Tiền': 1,
      'KH Thanh Toán': 1,
      'Thực Thu': 1,
      'Còn lại': 1
    });

    const [orders, totals] = await Promise.all([
      DonHang.find(filter).select(projection).sort({ registeredAtDate: -1, _id: -1 }).skip(offset).limit(limit + 1).maxTimeMS(15000).lean(),
      includeStats ? DonHang.aggregate([
        { $match: filter },
        { $addFields: { debtValue: orderDebtExpression() } },
        { $group: {
          _id: null,
          registrationCount: { $sum: 1 },
          activatedCount: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ['$TÌNH TRẠNG', ''] }, regex: activatedOrderStatus.source, options: 'i' } }, 1, 0] } },
          totalAmount: { $sum: orderMoneyExpression('Thành Tiền') },
          totalDebt: { $sum: '$debtValue' }
        } }
      ]).option({ maxTimeMS: 15000 }) : Promise.resolve([])
    ]);

    const hasMore = orders.length > limit;
    res.json({
      success: true,
      data: {
        items: orders.slice(0, limit).map(order => sanitizeOrderForUser(order, accessUser)),
        page,
        limit,
        hasMore,
        canViewFinancials: coQuyenTaiChinh,
        stats: totals[0] ? {
          registrationCount: totals[0]?.registrationCount || 0,
          activatedCount: totals[0]?.activatedCount || 0,
          totalAmount: coQuyenTaiChinh ? totals[0]?.totalAmount || 0 : null,
          totalDebt: coQuyenTaiChinh ? totals[0]?.totalDebt || 0 : null
        } : null
      }
    });
  } catch (error) {
    console.error('Lỗi tải lịch sử đăng ký khách hàng:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/mst-lookup', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const tuKhoa = String(req.query.q || '').trim().slice(0, 120);
    if (tuKhoa.length < 2) return res.status(400).json({ success: false, message: 'Vui lòng nhập ít nhất 2 ký tự.' });

    const accessUser = await getAccessUser(req);
    if (!accessUser?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });

    const boLocDon = buildOrderFilter({ q: tuKhoa }, { scopeUser: accessUser });
    const truongDon = {
      _id: 1,
      'Mã Đơn Hàng': 1,
      'Ngày Đăng Ký': 1,
      'Tên Khách Hàng': 1,
      MST: 1,
      'Tên Công Ty ': 1,
      'Địa Chỉ Công Ty': 1,
      SĐT: 1,
      NCC: 1,
      'Gói ': 1,
      'Thành Tiền': 1,
      'KH Thanh Toán': 1,
      'Thực Thu': 1,
      'Còn lại': 1,
      'TÌNH TRẠNG': 1,
      'Hình Thức Thanh Toán': 1
    };
    const orders = (await DonHang.find(boLocDon)
      .select(truongDon)
      .sort({ registeredAtDate: -1, _id: -1 })
      .limit(100)
      .maxTimeMS(15000)
      .lean()).map(order => sanitizeOrderForUser(order, accessUser));

    const coQuyenXemHoSoKhach = accessUser.roleId?.name === 'Admin' || accessUser.roleId?.permissions?.includes('view_customers');
    let customers = [];
    let hoso = [];
    if (coQuyenXemHoSoKhach) {
      const regex = new RegExp(escapeRegex(tuKhoa), 'i');
      customers = await Customer.find({
        isActive: { $ne: false },
        $or: [{ name: regex }, { code: regex }, { phone: regex }, { email: regex }, { mst: regex }, { company: regex }]
      })
        .select('code type name phone email mst company deliveryAddress bankAccount notes')
        .sort({ name: 1 })
        .limit(20)
        .maxTimeMS(10000)
        .lean();
      const tuKhoaChuanHoa = chuanHoaTimKiem(tuKhoa);
      hoso = await HoSo.find({ tuKhoaChuanHoa: { $regex: escapeRegex(tuKhoaChuanHoa) } })
        .select({
          ID: 1, MST: 1, 'NGÀY NHẬN': 1, 'TÊN NHÂN VIÊN NHẬN': 1, 'TÊN CÔNG TY': 1, 'TÌNH TRẠNG HỒ SƠ': 1
        })
        .sort({ ngayNhanDate: -1, _id: -1 })
        .limit(20)
        .maxTimeMS(10000)
        .lean();
    }

    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, data: { orders, customers, hoso } });
  } catch (error) {
    console.error('Lỗi tra cứu MST trong MongoDB:', error);
    res.status(500).json({ success: false, message: 'Không thể tra cứu MST trong MongoDB. Vui lòng thử lại.' });
  }
});

app.get('/api/orders', requirePermission('view_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    if (!accessUser || !accessUser.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const sortField = orderSortFields[req.query.sort] || 'registeredAtDate';
    const sortDirection = req.query.order === 'asc' ? 1 : -1;
    const filter = buildOrderFilter(req.query, { scopeUser: accessUser });

    const skip = (page - 1) * limit;
    const filterKeys = Object.keys(filter).filter(key => key !== 'archivedAt');
    const hasFilter = filterKeys.length > 0;
    const includeSummary = req.query.includeSummary === '1';
    const includeCount = req.query.includeCount !== '0' || includeSummary;
    const activatedFilter = { ...filter, 'TÌNH TRẠNG': /kích hoạt/i };
    const bangDonProjection = {
      'Hợp Đồng / GDK': 0,
      'Xác Nhận/ BBBG': 0,
      GPKD: 0,
      CCCD: 0,
      'File tong': 0,
      'FILE ĐÍNH KÈM': 0,
      'Ảnh UNC': 0,
      'phieuUnc.tepDinhKem': 0,
      'Lịch Sử Đơn Hàng': 0,
      'SmartSign PDF Payload': 0
    };
    const itemsQuery = DonHang.find(filter).select(bangDonProjection).sort({ [sortField]: sortDirection, _id: -1 }).skip(skip).limit(limit).maxTimeMS(15000).lean();
    const [items, statsFacet] = await Promise.all([
      itemsQuery,
      includeSummary
        ? DonHang.aggregate([
            { $match: filter },
            { $group: {
              _id: null,
              total: { $sum: 1 },
              activatedCount: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ['$TÌNH TRẠNG', ''] }, regex: 'kích hoạt', options: 'i' } }, 1, 0] } },
              totalAmount: { $sum: { $convert: { input: '$Thành Tiền', to: 'double', onError: 0, onNull: 0 } } }
            } }
          ]).option({ maxTimeMS: 15000 })
        : includeCount
          ? Promise.all([
              hasFilter ? DonHang.countDocuments(filter).maxTimeMS(15000) : DonHang.estimatedDocumentCount(),
              DonHang.countDocuments(activatedFilter).maxTimeMS(15000)
            ]).then(([t, a]) => [{ total: t, activatedCount: a, totalAmount: null }])
          : Promise.resolve([])
    ]);
    const total = statsFacet[0]?.total ?? null;
    const activatedCount = statsFacet[0]?.activatedCount ?? null;
    const summaryAmount = includeSummary ? (statsFacet[0]?.totalAmount || 0) : null;

    res.json({
      success: true,
      data: {
        items: items.map(order => sanitizeOrderForUser(order, accessUser)),
        page,
        limit,
        total,
        activatedCount,
        totalAmount: summaryAmount,
        totalPages: total === null ? null : (Math.ceil(total / limit) || 1),
        hasMore: total === null ? items.length === limit : skip + items.length < total
      }
    });
  } catch (error) {
    console.error('Lỗi tìm kiếm/phân trang đơn hàng:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

function getStatsRange(period) {
  const now = ngayHienTaiVietNam();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  let start;
  if (period === 'day') start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  else if (period === 'week') start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  else if (period === 'quarter') start = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  else if (period === 'year') start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  else start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const duration = end.getTime() - start.getTime();
  return { start, end, previousStart: new Date(start.getTime() - duration), previousEnd: start };
}

app.get('/api/orders/stats', requirePermission('view_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const period = ['day', 'week', 'month', 'quarter', 'year'].includes(req.query.period) ? req.query.period : 'month';
    const range = getStatsRange(period);
    const baseMatch = buildOrderFilter(req.query, { scopeUser: accessUser });
    const baseConditions = Object.entries(baseMatch).map(([key, value]) => ({ [key]: value }));
    const buildMatch = (start, end) => ({
      ...(baseConditions.length ? { $and: baseConditions } : {}),
      registeredAtDate: { $gte: start, $lt: end }
    });
    const money = orderMoneyExpression('Thành Tiền');
    const [current, previous, topCustomers, nccSeries] = await Promise.all([
      DonHang.aggregate([
        { $match: buildMatch(range.start, range.end) },
        { $addFields: { debtValue: orderDebtExpression() } },
        { $group: { _id: null, orderCount: { $sum: 1 }, totalRevenue: { $sum: money }, totalDebt: { $sum: '$debtValue' }, activatedCount: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ['$TÌNH TRẠNG', ''] }, regex: 'kích hoạt', options: 'i' } }, 1, 0] } } } }
      ]).option({ maxTimeMS: 15000 }),
      DonHang.aggregate([
        { $match: buildMatch(range.previousStart, range.previousEnd) },
        { $group: { _id: null, orderCount: { $sum: 1 }, totalRevenue: { $sum: money } } }
      ]).option({ maxTimeMS: 15000 }),
      DonHang.aggregate([
        { $match: buildMatch(range.start, range.end) },
        { $group: { _id: { $ifNull: ['$Tên Khách Hàng', '$Tên Công Ty '] }, totalRev: { $sum: money }, orderCount: { $sum: 1 } } },
        { $sort: { totalRev: -1, _id: 1 } },
        { $limit: 10 },
        { $project: { _id: 0, name: { $ifNull: ['$_id', 'Khách Lẻ'] }, totalRev: 1, orderCount: 1 } }
      ]).option({ maxTimeMS: 15000 }),
      DonHang.aggregate([
        { $match: buildMatch(range.start, range.end) },
        { $project: {
          registeredAtDate: 1,
          dongDoanhThu: { $cond: [
            { $isArray: '$chiTietSanPham' },
            { $map: { input: '$chiTietSanPham', as: 'dong', in: {
              ncc: '$$dong.ncc',
              doanhThu: { $multiply: [
                { $convert: { input: '$$dong.giaBan', to: 'double', onError: 0, onNull: 0 } },
                { $convert: { input: '$$dong.soLuong', to: 'double', onError: 0, onNull: 0 } }
              ] }
            } } },
            [{ ncc: '$NCC', doanhThu: money }]
          ] }
        } },
        { $unwind: '$dongDoanhThu' },
        { $group: { _id: { ncc: { $ifNull: ['$dongDoanhThu.ncc', 'Khác'] }, bucket: period === 'year' ? { $dateToString: { format: '%Y-%m', date: '$registeredAtDate' } } : { $dateToString: { format: '%Y-%m-%d', date: '$registeredAtDate' } } }, total: { $sum: '$dongDoanhThu.doanhThu' } } },
        { $sort: { '_id.ncc': 1, '_id.bucket': 1 } }
      ]).option({ maxTimeMS: 15000 })
    ]);
    const series = {};
    nccSeries.forEach(item => {
      const ncc = String(item._id.ncc || 'Khác').trim() || 'Khác';
      if (!series[ncc]) series[ncc] = {};
      series[ncc][item._id.bucket] = (series[ncc][item._id.bucket] || 0) + (item.total || 0);
    });
    res.json({
      success: true,
      data: {
        period,
        current: current[0] || { orderCount: 0, totalRevenue: 0, totalDebt: 0, activatedCount: 0 },
        previous: previous[0] || { orderCount: 0, totalRevenue: 0 },
        topCustomers: topCustomers.map(item => ({ ...item, name: String(item.name || 'Khách Lẻ') })),
        nccSeries: series
      }
    });
  } catch (error) {
    console.error('Lỗi tính thống kê đơn hàng:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/dashboard', requirePermission('view_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    if (!accessUser || !accessUser.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const hienTai = ngayHienTaiVietNam();
    const batDauNgay = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth(), hienTai.getUTCDate()));
    const ketThucNgay = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth(), hienTai.getUTCDate() + 1));
    const batDauThang = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth(), 1));
    const batDauThangLoiNhuan = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth() - 11, 1));
    const ketThucThangLoiNhuan = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth() + 1, 1));
    const coQuyenTaiChinh = req.auth?.isSuperAdmin || canViewFinancialOrderFields(accessUser);
    const boLoc = buildOrderFilter({}, { scopeUser: accessUser });
    const taoBoLocThoiGian = (tuNgay, denNgay) => ({
      $and: [
        ...Object.entries(boLoc).map(([truong, giaTri]) => ({ [truong]: giaTri })),
        { registeredAtDate: { $gte: tuNgay, $lt: denNgay } }
      ]
    });
    const ketThucThangHienTai = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth() + 1, 1));
    const chiPhiNccExpression = { $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: ['$THỰC CÔNG NỢ CTY', { $ifNull: ['$THỰC CÔNG NỢ CÔNG TY', { $ifNull: ['$Thực Đóng Công Ty', 0] }] }] } }, find: ',', replacement: '' } }, to: 'double', onError: 0, onNull: 0 } };
    const daThuExpression = { $convert: { input: { $ifNull: ['$KH Thanh Toán', '$Thực Thu'] }, to: 'double', onError: 0, onNull: 0 } };
    const regexTinhTrang = regex => ({ $cond: [{ $regexMatch: { input: { $ifNull: ['$TÌNH TRẠNG', ''] }, regex, options: 'i' } }, 1, 0] });
    const pipelineTongHop = (tuNgay, denNgay, khoaNhom) => [
      { $match: taoBoLocThoiGian(tuNgay, denNgay) },
      { $group: {
        _id: khoaNhom,
        soDon: { $sum: 1 },
        doanhThu: { $sum: orderMoneyExpression('Thành Tiền') },
        chiPhi: { $sum: chiPhiNccExpression },
        daThu: { $sum: daThuExpression },
        congNo: { $sum: orderDebtExpression() },
        soDonKichHoat: { $sum: regexTinhTrang('kích hoạt') },
        soDonHoanThanh: { $sum: regexTinhTrang('hoàn thành|hoàn tất') }
      } },
      { $sort: { _id: 1 } }
    ];
    const tuNgayHomQua = new Date(batDauNgay.getTime() - 24 * 60 * 60 * 1000);
    const [hoatDongHomNay, hoatDongHomQua, tongHopThang, tongHopNgay] = await Promise.all([
      DonHang.aggregate(pipelineTongHop(batDauNgay, ketThucNgay, null)).option({ maxTimeMS: 15000 }),
      DonHang.aggregate(pipelineTongHop(tuNgayHomQua, batDauNgay, null)).option({ maxTimeMS: 15000 }),
      DonHang.aggregate(pipelineTongHop(batDauThangLoiNhuan, ketThucThangLoiNhuan, { $dateToString: { format: '%Y-%m', date: '$registeredAtDate' } })).option({ maxTimeMS: 15000 }),
      DonHang.aggregate(pipelineTongHop(batDauThang, ketThucThangHienTai, { $dateToString: { format: '%Y-%m-%d', date: '$registeredAtDate' } })).option({ maxTimeMS: 15000 })
    ]);
    const chuanHoa = (item = {}) => {
      const doanhThu = Number(item.doanhThu || 0);
      const chiPhi = Number(item.chiPhi || 0);
      const ketQua = { soDon: item.soDon || 0, doanhThu, soDonKichHoat: item.soDonKichHoat || 0, soDonHoanThanh: item.soDonHoanThanh || 0 };
      if (coQuyenTaiChinh) Object.assign(ketQua, { chiPhi, loiNhuan: doanhThu - chiPhi, daThu: Number(item.daThu || 0), congNo: Number(item.congNo || 0) });
      return ketQua;
    };
    const tongHopThangMap = new Map(tongHopThang.map(item => [item._id, item]));
    const tongHopNgayMap = new Map(tongHopNgay.map(item => [item._id, item]));
    const maThangNay = batDauThang.toISOString().slice(0, 7);
    const maThangTruoc = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const soNgayTrongThang = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth() + 1, 0)).getUTCDate();
    res.json({
      success: true,
      data: {
        hoatDongNgay: {
          homNay: chuanHoa(hoatDongHomNay[0]),
          homQua: chuanHoa(hoatDongHomQua[0])
        },
        theoNgay: Array.from({ length: soNgayTrongThang }, (_, index) => {
          const ngay = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth(), index + 1)).toISOString().slice(0, 10);
          return { ngay, ...chuanHoa(tongHopNgayMap.get(ngay)) };
        }),
        loiNhuanThang: coQuyenTaiChinh ? {
          thangNay: chuanHoa(tongHopThangMap.get(maThangNay)),
          thangTruoc: chuanHoa(tongHopThangMap.get(maThangTruoc)),
          theoThang: Array.from({ length: 12 }, (_, index) => {
            const thang = new Date(Date.UTC(hienTai.getUTCFullYear(), hienTai.getUTCMonth() - 11 + index, 1)).toISOString().slice(0, 7);
            return { thang, ...chuanHoa(tongHopThangMap.get(thang)) };
          })
        } : null
      }
    });
  } catch (error) {
    console.error('Lỗi tải Dashboard:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/debts', requirePermission('view_debts'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const filter = buildOrderFilter(req.query, { activatedOnly: true, scopeUser: accessUser });
    const skip = (page - 1) * limit;
    const debtExpression = orderDebtExpression();
    const [items, totalResult, summary] = await Promise.all([
      DonHang.find(filter).sort({ registeredAtDate: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      DonHang.countDocuments(filter).maxTimeMS(15000),
      DonHang.aggregate([
        { $match: filter },
        { $project: { debtValue: debtExpression } },
        { $group: { _id: null, totalDebt: { $sum: '$debtValue' } } }
      ]).option({ maxTimeMS: 15000 })
    ]);
    const total = totalResult || 0;
    res.json({ success: true, data: { items: items.map(order => sanitizeOrderForUser(order, accessUser)), page, limit, total, totalDebt: summary[0]?.totalDebt || 0, totalPages: Math.ceil(total / limit) || 1, hasMore: skip + items.length < total } });
  } catch (error) {
    console.error('Lỗi tải công nợ đơn hàng:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

async function chiAdminCongNoNcc(req, res, next) {
  try {
    const user = await getAccessUser(req);
    if (!user?.isActive || user.roleId?.name !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Chỉ Admin được truy cập công nợ nhà cung cấp.' });
    }
    return next();
  } catch (error) {
    console.error('Không thể kiểm tra quyền công nợ nhà cung cấp:', error);
    return res.status(500).json({ success: false, message: 'Không thể kiểm tra quyền công nợ nhà cung cấp.' });
  }
}

app.use('/api/orders/ncc-debts', chiAdminCongNoNcc);

app.get('/api/orders/ncc-debts', requirePermission('view_debts'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const filter = buildOrderFilter({ ...req.query, q: '', search: '' }, { activatedOnly: !hoTroNhieuSanPham, scopeUser: accessUser });
    const tuKhoaNcc = String(req.query.q || req.query.search || '').trim().slice(0, 120);
    const boLocNcc = tuKhoaNcc ? new RegExp(escapeRegex(tuKhoaNcc), 'i') : null;
    if (hoTroNhieuSanPham) filter.$and = [...(filter.$and || []), dieuKienDonCoSanPhamKichHoat()];
    else if (boLocNcc) filter.NCC = boLocNcc;
    let boLocThanhToan;
    try {
      boLocThanhToan = taoBoLocThanhToanNcc(req.query);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    const directCostExpression = { $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: ['$THỰC CÔNG NỢ CTY', { $ifNull: ['$THỰC CÔNG NỢ CÔNG TY', '$Thực Đóng Công Ty'] }] } }, find: ',', replacement: '' } }, to: 'double', onError: 0, onNull: 0 } };
    const isNewRegistrationExpression = { $regexMatch: { input: { $toString: { $ifNull: ['$Hình Thức', ''] } }, regex: 'đăng ký mới', options: 'i' } };
    const supplierNameExpression = { $replaceAll: { input: { $toUpper: { $trim: { input: { $toString: { $ifNull: ['$NCC', ''] } } } } }, find: ' ', replacement: '' } };
    const tokenHoldExpression = { $cond: [
      isNewRegistrationExpression,
      { $switch: { branches: [
        { case: { $eq: [supplierNameExpression, 'VINA-GS'] }, then: 250000 },
        { case: { $eq: [supplierNameExpression, 'ONE-CA'] }, then: 169000 }
      ], default: 0 } },
      0
    ] };
    const pipeline = [
      { $match: filter },
      ...(hoTroNhieuSanPham ? [
        ...taoCacBuocDongNcc(directCostExpression, orderMoneyExpression('Thành Tiền')),
        ...(boLocNcc ? [{ $match: { NCC: boLocNcc } }] : []),
        { $addFields: { tokenHold: { $multiply: [tokenHoldExpression, '$dongNcc.soLuong'] } } }
      ] : [
        { $lookup: { from: 'SANPHAM', let: { ncc: '$NCC', packageName: { $ifNull: ['$Gói ', ''] } }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$NCC', '$$ncc'] }, { $or: [{ $eq: ['$TÊN SẢN PHẨM', '$$packageName'] }, { $eq: ['$Tên Sản Phẩm', '$$packageName'] }, { $eq: ['$Gói ', '$$packageName'] }] }] } } }, { $project: { cost: { $convert: { input: { $ifNull: ['$THỰC ĐÓNG CÔNG TY', '$Thực Đóng Công Ty'] }, to: 'double', onError: 0, onNull: 0 } } } }], as: 'productCost' } },
        { $addFields: { supplierCost: directCostExpression, revenue: orderMoneyExpression('Thành Tiền'), tokenHold: tokenHoldExpression } }
      ]),
      { $group: { _id: { $ifNull: ['$NCC', 'Khác'] }, count: { $sum: 1 }, cost: { $sum: '$supplierCost' }, tokenHold: { $sum: '$tokenHold' }, revenue: { $sum: '$revenue' }, newCount: { $sum: { $cond: [isNewRegistrationExpression, 1, 0] } } } },
      { $project: { _id: 0, ncc: '$_id', count: 1, cost: 1, tokenHold: 1, totalAmount: { $subtract: ['$cost', '$tokenHold'] }, revenue: 1, newCount: 1 } },
      { $sort: { cost: -1, ncc: 1 } }
    ];
    const rows = await DonHang.aggregate(pipeline).option({ maxTimeMS: 20000 });
    const thanhToan = rows.length ? await SupplierPayment.aggregate([
      { $match: { ...boLocThanhToan, supplier: { $in: rows.map(row => row.ncc) } } },
      { $group: { _id: '$supplier', paid: { $sum: '$amount' } } }
    ]).option({ maxTimeMS: 20000 }) : [];
    const thanhToanTheoNcc = new Map(thanhToan.map(item => [item._id, item.paid]));
    const periodKey = getNccDebtPeriodKey(req.query);
    const adjustments = await SupplierDebtAdjustment.find({ periodKey }).lean();
    const adjustmentsBySupplier = new Map(adjustments.map(item => [item.supplier, item]));
    rows.forEach(row => {
      const adjustment = adjustmentsBySupplier.get(row.ncc || 'Khác');
      row.dossierFee = Number(adjustment?.dossierFee || 0);
      row.dsQui = Number(adjustment?.dsQui || 0);
      row.paid = Number(thanhToanTheoNcc.get(row.ncc) || 0);
      row.remaining = Math.max(0, Number(row.cost || 0) - Number(row.tokenHold || 0) - row.dossierFee - row.dsQui - row.paid);
    });
    res.json({ success: true, data: { rows } });
  } catch (error) {
    console.error('Lỗi tính công nợ NCC:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/api/orders/ncc-debts/adjustments', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    const supplier = String(req.body.supplier || '').trim();
    const field = String(req.body.field || '');
    const value = Number(req.body.value);
    if (!supplier || !['dossierFee', 'dsQui'].includes(field) || !Number.isFinite(value) || value < 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập NCC và số tiền hợp lệ.' });
    }
    const periodKey = getNccDebtPeriodKey(req.body);
    const adjustment = await SupplierDebtAdjustment.findOneAndUpdate(
      { supplier, periodKey },
      { $set: { [field]: value, updatedBy: req.auth?.username || 'Hệ thống' } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, data: adjustment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders/ncc-debts/snapshots', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    const rows = (Array.isArray(req.body.rows) ? req.body.rows : []).slice(0, 500).map(item => {
      const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
      return {
        ncc: String(item.ncc || 'Khác').trim().slice(0, 160),
        count: number(item.count),
        newCount: number(item.newCount),
        cost: number(item.cost),
        tokenHold: number(item.tokenHold),
        dossierFee: number(item.dossierFee),
        dsQui: number(item.dsQui),
        paid: number(item.paid),
        remaining: number(item.remaining)
      };
    });
    if (!rows.length) return res.status(400).json({ success: false, message: 'Không có dữ liệu công nợ NCC để lưu.' });
    const rawFilters = req.body.filters || {};
    const filters = Object.fromEntries(['year', 'month', 'fromDate', 'toDate', 'search'].map(field => [field, String(rawFilters[field] || 'ALL').trim().slice(0, 120)]));
    const snapshot = await SupplierDebtSnapshot.create({
      filters,
      rows,
      totalNcc: rows.length,
      totalCost: rows.reduce((sum, item) => sum + item.cost, 0),
      savedBy: String(req.auth?.username || 'Hệ thống').trim()
    });
    res.status(201).json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/ncc-debts/snapshots', requirePermission('view_debts'), async (req, res) => {
  try {
    const snapshots = await SupplierDebtSnapshot.find({}).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data: snapshots });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/ncc-debts/details', requirePermission('view_debts'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const ncc = String(req.query.ncc || '').trim();
    if (!ncc) return res.status(400).json({ success: false, message: 'Thiếu nhà cung cấp.' });
    const filter = buildOrderFilter({ ...req.query, q: '', search: '' }, { activatedOnly: !hoTroNhieuSanPham, scopeUser: accessUser });
    if (hoTroNhieuSanPham) filter.$and = [...(filter.$and || []), dieuKienDonCoSanPhamKichHoat()];
    else filter.NCC = ncc;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(hoTroNhieuSanPham ? 100 : 200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const skip = (page - 1) * limit;
    const directCostExpression = { $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: ['$THỰC CÔNG NỢ CTY', { $ifNull: ['$THỰC CÔNG NỢ CÔNG TY', '$Thực Đóng Công Ty'] }] } }, find: ',', replacement: '' } }, to: 'double', onError: 0, onNull: 0 } };
    const isNewRegistrationExpression = { $regexMatch: { input: { $toString: { $ifNull: ['$Hình Thức', ''] } }, regex: 'đăng ký mới', options: 'i' } };
    const supplierNameExpression = { $replaceAll: { input: { $toUpper: { $trim: { input: { $toString: { $ifNull: ['$NCC', ''] } } } } }, find: ' ', replacement: '' } };
    const tokenHoldExpression = { $cond: [isNewRegistrationExpression, { $switch: { branches: [
      { case: { $eq: [supplierNameExpression, 'VINA-GS'] }, then: 250000 },
      { case: { $eq: [supplierNameExpression, 'ONE-CA'] }, then: 169000 }
    ], default: 0 } }, 0] };
    let items;
    let total;
    if (hoTroNhieuSanPham) {
      const [ketQua] = await DonHang.aggregate([
        { $match: filter },
        ...taoCacBuocDongNcc(directCostExpression, orderMoneyExpression('Thành Tiền')),
        { $match: { NCC: ncc } },
        { $addFields: { tokenHold: { $multiply: [tokenHoldExpression, '$dongNcc.soLuong'] } } },
        { $addFields: { totalAmount: { $subtract: ['$supplierCost', '$tokenHold'] } } },
        { $facet: {
          items: [
            { $sort: { registeredAtDate: -1, _id: -1, 'dongNcc.maDong': 1 } },
            { $skip: skip }, { $limit: limit },
            { $project: { chiTietSanPham: 0 } }
          ],
          total: [{ $count: 'value' }]
        } }
      ]).option({ maxTimeMS: 20000 });
      items = ketQua?.items || [];
      total = ketQua?.total?.[0]?.value || 0;
    } else {
      [items, total] = await Promise.all([
      DonHang.aggregate([
        { $match: filter },
        { $lookup: { from: 'SANPHAM', let: { ncc: '$NCC', packageName: { $ifNull: ['$Gói ', ''] } }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$NCC', '$$ncc'] }, { $or: [{ $eq: ['$TÊN SẢN PHẨM', '$$packageName'] }, { $eq: ['$Tên Sản Phẩm', '$$packageName'] }, { $eq: ['$Gói ', '$$packageName'] }] }] } } }, { $project: { cost: { $convert: { input: { $ifNull: ['$THỰC ĐÓNG CÔNG TY', '$Thực Đóng Công Ty'] }, to: 'double', onError: 0, onNull: 0 } } } }], as: 'productCost' } },
        { $addFields: { supplierCost: directCostExpression, tokenHold: tokenHoldExpression } },
        { $addFields: { totalAmount: { $subtract: ['$supplierCost', '$tokenHold'] } } },
        { $project: { productCost: 0 } },
        { $sort: { registeredAtDate: -1, _id: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]).option({ maxTimeMS: 20000 }),
      DonHang.countDocuments(filter).maxTimeMS(15000)
      ]);
    }
    const gioiHan = hoTroNhieuSanPham ? Math.min(limit, 100) : limit;
    res.json({ success: true, data: { items, page, limit: gioiHan, total, totalPages: Math.ceil(total / gioiHan) || 1, hasMore: skip + items.length < total } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

function csvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

app.get('/api/orders/export', requirePermission('view_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const filter = buildOrderFilter(req.query, { activatedOnly: req.query.debtOnly === '1', scopeUser: accessUser });
    const columns = cotXuatDon(accessUser);
    if (!columns.length) return res.status(403).json({ success: false, message: 'Vai trò chưa được cấp quyền xem cột dữ liệu để xuất.' });
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="DonHang_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write(`\uFEFF${columns.map(column => csvValue(column.header)).join(',')}\n`);
    const cursor = DonHang.find(filter).sort({ registeredAtDate: -1, _id: -1 }).lean().cursor();
    for await (const order of cursor) {
      res.write(columns.map(column => csvValue(column.value(order))).join(',') + '\n');
    }
    res.end();
  } catch (error) {
    console.error('Lỗi export đơn hàng:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: error.message });
    else res.end();
  }
});

app.get('/api/orders/debts/export', requirePermission('view_debts'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const filter = buildOrderFilter(req.query, { activatedOnly: true, scopeUser: accessUser });
    const columns = cotXuatDon(accessUser);
    if (!columns.length) return res.status(403).json({ success: false, message: 'Vai trò chưa được cấp quyền xem cột dữ liệu để xuất.' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="CongNo_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write(`\uFEFF${columns.map(column => csvValue(column.header)).join(',')}\n`);
    const cursor = DonHang.find(filter).sort({ registeredAtDate: -1, _id: -1 }).lean().cursor();
    for await (const order of cursor) {
      res.write(columns.map(column => csvValue(column.value(order))).join(',') + '\n');
    }
    res.end();
  } catch (error) {
    console.error('Lỗi export công nợ:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: error.message });
    else res.end();
  }
});

function chuanHoaTenHinhThucThanhToan(giaTri) {
  const sach = String(giaTri || '').trim().replace(/\s+/g, ' ');
  if (!sach) return '';
  const khoa = sach.toLowerCase();
  if (khoa === 'chuyển trực tiếp wintech' || khoa === 'chuyển wintech') return 'Chuyển Khoản Wintech';
  return sach;
}

function ghepTrungHinhThucThanhToan(danhSach = []) {
  const demChuHoa = chuoi => (String(chuoi || '').match(/[A-ZÀ-Ỹ]/g) || []).length;
  const theoKhoa = new Map();
  for (const muc of danhSach) {
    const sach = chuanHoaTenHinhThucThanhToan(muc);
    if (!sach) continue;
    const khoa = sach.toLowerCase();
    const hienCo = theoKhoa.get(khoa);
    if (!hienCo || demChuHoa(sach) > demChuHoa(hienCo)) theoKhoa.set(khoa, sach);
  }
  const chuaThanhToan = theoKhoa.get('chưa thanh toán') || 'Chưa Thanh Toán';
  theoKhoa.delete('chưa thanh toán');
  return [chuaThanhToan, ...Array.from(theoKhoa.values()).sort((a, b) => a.localeCompare(b, 'vi'))];
}

let orderFilterOptionsCache = { data: null, expiresAt: 0 };
app.get('/api/orders/filter-options', requirePermission('view_orders'), async (req, res) => {
  try {
    if (orderFilterOptionsCache.data && orderFilterOptionsCache.expiresAt > Date.now()) {
      return res.json({ success: true, data: orderFilterOptionsCache.data });
    }
    const [years, employees, paymentMethods] = await Promise.all([DonHang.aggregate([
      { $match: { registeredAtDate: { $type: 'date' } } },
      { $group: { _id: { $year: '$registeredAtDate' } } },
      { $sort: { _id: -1 } }
    ]).option({ maxTimeMS: 15000 }), DonHang.distinct('Nhân Viên Đăng Ký', {
      'Nhân Viên Đăng Ký': { $exists: true, $nin: ['', null] }
    }).maxTimeMS(15000), DonHang.distinct('Hình Thức Thanh Toán', {
      'Hình Thức Thanh Toán': { $exists: true, $nin: ['', null] }
    }).maxTimeMS(15000)]);
    const currentYear = String(new Date().getFullYear());
    const yearList = [...new Set([currentYear, ...years.map(item => String(item._id || '')).filter(year => Number(year) >= 2000 && Number(year) <= 2100)])].sort((a, b) => Number(b) - Number(a));
    const data = {
      years: yearList,
      employees: employees.map(item => String(item || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')),
      paymentMethods: ghepTrungHinhThucThanhToan(['Chưa Thanh Toán', ...paymentMethods])
    };
    orderFilterOptionsCache = { data, expiresAt: Date.now() + 5 * 60 * 1000 };
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders/case-files/preview', requirePermission('manage_orders'), yeuCauCongCu('nhap-ho-so'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length || rows.length > 5000) return res.status(400).json({ success: false, message: 'File phải có từ 1 đến 5.000 dòng dữ liệu.' });
    const inputRows = rows.map(row => row && typeof row === 'object' ? row : { issue: 'Dòng Excel không hợp lệ' });
    const accessUser = await getAccessUser(req);
    if (!accessUser?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });

    const queryValues = getCaseFileMstQueryValues(inputRows.map(row => row.excelMst));
    const orders = queryValues.length ? await DonHang.find({
      ...buildOrderFilter({}, { scopeUser: accessUser }),
      MST: { $in: queryValues }
    }).select({ _id: 1, MST: 1, 'Mã Đơn Hàng': 1, 'Tên Công Ty ': 1, 'Nhân Viên Đăng Ký': 1, 'Ngày Đăng Ký': 1 }).maxTimeMS(20000).lean() : [];

    res.json({ success: true, data: buildCaseFilePreview(inputRows, orders) });
  } catch (error) {
    console.error('Lỗi preview import ngày hồ sơ:', error);
    res.status(500).json({ success: false, message: 'Không thể đối chiếu đơn hàng trong MongoDB.' });
  }
});

app.post('/api/orders/case-files/confirm', requirePermission('manage_orders'), yeuCauCongCu('nhap-ho-so'), async (req, res) => {
  try {
    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    if (!updates.length || updates.length > 5000) return res.status(400).json({ success: false, message: 'Danh sách cập nhật phải có từ 1 đến 5.000 dòng.' });
    if (updates.some(row => !row || typeof row !== 'object')) return res.status(400).json({ success: false, message: 'Có dòng cập nhật không hợp lệ; chưa có dữ liệu nào được thay đổi.' });

    const ids = updates.map(row => String(row.orderId || '').trim());
    if (ids.some(id => !mongoose.Types.ObjectId.isValid(id)) || new Set(ids).size !== ids.length) {
      return res.status(400).json({ success: false, message: 'Mỗi dòng phải có một đơn hàng hợp lệ và không được chọn trùng đơn.' });
    }
    if (updates.some(row => !normalizeCaseFileMst(row.excelMst) || !isValidCaseFileDate(row.ngayHoSo))) {
      return res.status(400).json({ success: false, message: 'MST hoặc Ngày hồ sơ không hợp lệ; chưa có dữ liệu nào được cập nhật.' });
    }

    const accessUser = await getAccessUser(req);
    if (!accessUser?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const scopeFilter = buildOrderFilter({}, { scopeUser: accessUser });
    const selectedOrders = await DonHang.find({ ...scopeFilter, _id: { $in: ids } })
      .select({ _id: 1, MST: 1, lockedAt: 1, 'Mã Đơn Hàng': 1 })
      .lean();
    const ordersById = new Map(selectedOrders.map(order => [String(order._id), order]));
    const canEditLocked = accessUser.roleId?.name === 'Admin' || accessUser.roleId?.permissions?.includes('manage_financials');
    const mismatch = updates.find(row => {
      const order = ordersById.get(String(row.orderId));
      return !order || normalizeCaseFileMst(order.MST) !== normalizeCaseFileMst(row.excelMst) || (order.lockedAt && !canEditLocked);
    });
    if (mismatch) return res.status(409).json({ success: false, message: 'Có đơn hàng không còn hợp lệ, không thuộc phạm vi được cập nhật hoặc đã khóa. Hãy đọc lại file để tạo preview mới.' });

    const operations = buildCaseFileUpdateOperations(updates, id => new mongoose.Types.ObjectId(id));
    let writeErrors = new Map();
    try {
      await DonHang.collection.bulkWrite(operations, { ordered: false });
    } catch (error) {
      if (!Array.isArray(error.writeErrors)) throw error;
      writeErrors = new Map(error.writeErrors.map(item => [item.index, item.errmsg || 'Lỗi cập nhật MongoDB']));
    }

    const savedOrders = await DonHang.find({ _id: { $in: ids } }).select({ _id: 1, 'Ngày hồ sơ': 1 }).lean();
    const savedDates = new Map(savedOrders.map(order => [String(order._id), String(order['Ngày hồ sơ'] || '')]));
    const results = updates.map((row, index) => {
      const writeError = writeErrors.get(index);
      const saved = !writeError && savedDates.get(String(row.orderId)) === row.ngayHoSo;
      return {
        rowNumber: Number(row.rowNumber) || index + 1,
        excelMst: normalizeCaseFileMst(row.excelMst),
        companyName: String(row.companyName || ''),
        ngayHoSo: row.ngayHoSo,
        orderId: String(row.orderId),
        orderCode: String(ordersById.get(String(row.orderId))?.['Mã Đơn Hàng'] || ''),
        status: saved ? 'success' : 'error',
        reason: saved ? 'Đã cập nhật' : (writeError || 'Không cập nhật được ngày hồ sơ')
      };
    });
    const successful = results.filter(row => row.status === 'success').length;
    if (successful) await ghiSauCapNhat(req, res, 'nhap-ho-so', 'cap-nhat', '', successful);
    res.json({ success: true, data: { successful, notUpdated: 0, errors: results.length - successful, results } });
  } catch (error) {
    console.error('Lỗi xác nhận import ngày hồ sơ:', error);
    res.status(500).json({ success: false, message: 'Không thể cập nhật ngày hồ sơ vào MongoDB.' });
  }
});

app.use('/api/orders/unc-nhieu-san-pham', require('./routes/unc-nhieu-san-pham')({
  Order: DonHang, requireAuth, getAccessUser, orderScope, buildOrderFilter,
  daBat: () => hoTroNhieuSanPham && daBatTinhNang(process.env.UNC_NHIEU_SAN_PHAM_ENABLED)
}));

app.post('/api/orders/unc/doc-ai', requireAuth, async (req, res) => {
  try {
    const models = [process.env.GEMINI_MODEL, ...MAC_DINH_MODELS].filter(Boolean);
    const data = await docThongTinUncBangAi({
      dataUrl: req.body?.duLieuTep,
      apiKey: process.env.GEMINI_API_KEY,
      models
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Không thể đọc thông tin từ phiếu UNC.'
    });
  }
});

app.get('/api/orders/unc/danh-sach', requireAuth, async (req, res) => {
  try {
    const nguoiDung = await getAccessUser(req);
    const vaiTro = nguoiDung?.roleId;
    const admin = vaiTro?.name === 'Admin' || req.auth?.isSuperAdmin;
    const xemDonMinh = orderScope(nguoiDung) === 'own' && vaiTro?.permissions?.includes('view_orders');
    if (!nguoiDung?.isActive || (!admin && !vaiTro?.permissions?.includes('view_debts') && !xemDonMinh)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem danh sách UNC.' });
    }
    const trang = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const gioiHan = [20, 50, 100].includes(Number(req.query.limit)) ? Number(req.query.limit) : 50;
    const boLoc = buildOrderFilter({}, { scopeUser: nguoiDung });
    const [ketQua] = await DonHang.aggregate([
      { $match: { $and: [boLoc, { $or: [{ 'Số Tiền UNC': { $gt: 0 } }, { 'phieuUnc.0': { $exists: true } }] }] } },
      { $project: {
        'Mã Đơn Hàng': 1, 'Tên Khách Hàng': 1, 'Tên Công Ty ': 1, NCC: 1,
        phieu: { $concatArrays: [
          { $cond: [{ $gt: [{ $ifNull: ['$Số Tiền UNC', 0] }, 0] }, [{
            loai: 'cu', soTien: '$Số Tiền UNC', ngay: '$Ngày Thanh Toán UNC', ngayGui: '$Ngày Upload UNC',
            trangThai: { $cond: [{ $in: [{ $ifNull: ['$Trạng Thái UNC', ''] }, ['', null]] }, 'Chờ Duyệt', '$Trạng Thái UNC'] }, lyDoTuChoi: '$Ghi Chú Từ Chối UNC',
            tenTep: '$Tên File UNC', ghiChu: '$Nội Dung UNC', tenNganHang: '$Tên Ngân Hàng UNC', maGiaoDich: '$Mã Giao Dịch UNC',
            coTep: { $gt: [{ $strLenCP: { $convert: { input: '$Ảnh UNC', to: 'string', onError: '', onNull: '' } } }, 0] }
          }], []] },
          { $map: { input: { $cond: [{ $isArray: '$phieuUnc' }, '$phieuUnc', []] }, as: 'p', in: {
            loai: 'moi', maPhieu: '$$p.maPhieu', soTien: '$$p.soTien', ngay: '$$p.ngay',
            trangThai: '$$p.trangThai', lyDoTuChoi: '$$p.lyDoTuChoi',
            tenTep: '$$p.tep.ten', ghiChu: '$$p.ghiChu', tenNganHang: '$$p.tenNganHang', maGiaoDich: '$$p.maGiaoDich',
            coTep: { $or: [
              { $ne: [{ $ifNull: ['$$p.tep.duLieu', ''] }, ''] },
              { $ne: [{ $ifNull: ['$$p.tep.maTep', null] }, null] }
            ] }
          } } }
        ] }
      } },
      { $unwind: '$phieu' },
      { $addFields: { ngaySapXep: { $convert: { input: { $ifNull: ['$phieu.ngayGui', '$phieu.ngay'] }, to: 'date', onError: null, onNull: null } } } },
      { $facet: {
        items: [
          { $sort: { ngaySapXep: -1, _id: -1, 'phieu.maPhieu': 1 } },
          { $skip: (trang - 1) * gioiHan }, { $limit: gioiHan },
          { $project: { ngaySapXep: 0 } }
        ],
        tong: [{ $group: { _id: null, soPhieu: { $sum: 1 }, choDuyet: { $sum: { $cond: [{ $eq: ['$phieu.trangThai', 'Chờ Duyệt'] }, 1, 0] } } } }]
      } }
    ]).option({ maxTimeMS: 20000 });
    const soPhieu = ketQua?.tong?.[0]?.soPhieu || 0;
    return res.json({ success: true, data: {
      items: ketQua?.items || [], page: trang, limit: gioiHan, total: soPhieu,
      choDuyet: ketQua?.tong?.[0]?.choDuyet || 0, totalPages: Math.max(1, Math.ceil(soPhieu / gioiHan))
    } });
  } catch (loi) {
    console.error('Lỗi tải danh sách UNC:', loi.message);
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách UNC.' });
  }
});

app.get('/api/orders/unc', requireAuth, async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const role = accessUser?.roleId;
    const isAdmin = role?.name === 'Admin' || req.auth?.isSuperAdmin;
    const canViewOwnOrders = orderScope(accessUser) === 'own' && role?.permissions?.includes('view_orders');
    if (!isAdmin && !role?.permissions?.includes('view_debts') && !canViewOwnOrders) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem danh sách UNC.' });
    }
    const filter = { ...buildOrderFilter({}, { scopeUser: accessUser }), 'Số Tiền UNC': { $gt: 0 } };
    const orders = await DonHang.aggregate([
      { $match: filter },
      { $addFields: { hasUncImage: { $gt: [{ $strLenCP: { $convert: { input: '$Ảnh UNC', to: 'string', onError: '', onNull: '' } } }, 0] } } },
      { $project: { 'Ảnh UNC': 0, 'Lịch Sử Đơn Hàng': 0 } },
      { $sort: { 'Ngày Upload UNC': -1 } },
      { $limit: 500 }
    ]).option({ maxTimeMS: 15000 });
    res.json({ success: true, data: orders.map(order => sanitizeOrderForUser(order, accessUser)) });  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
app.get('/api/orders/check', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const type = req.query.type === 'unpaid' ? 'unpaid' : 'inactive';
    const filter = buildOrderFilter({ year: req.query.year, month: req.query.month, employee: req.query.employee }, { scopeUser: accessUser });
    const customer = String(req.query.customer || '').trim().slice(0, 120);
    if (customer) { const rx = new RegExp(escapeRegex(customer), 'i'); filter.$and = [...(filter.$and || []), { $or: [{ 'Tên Khách Hàng': rx }, { 'Tên Công Ty ': rx }] }]; }
    const pipeline = [{ $match: filter }];
    if (type === 'inactive') pipeline.push({ $match: { 'TÌNH TRẠNG': { $not: /kích hoạt/i } } });
    else pipeline.push(
      { $match: { 'TÌNH TRẠNG': activatedOrderStatus } },
      { $addFields: { debtValue: orderDebtExpression(), actualReceiptValue: orderMoneyExpression('Thực Thu') } },
      { $match: { $or: [{ debtValue: { $gt: 0 } }, { actualReceiptValue: 0 }] } }
    );
    if (req.query.excludeCancelled === '1') pipeline.push({ $match: { 'TÌNH TRẠNG': { $not: /hủy|huỷ/i } } });
    const projection = { 'Mã Đơn Hàng': 1, 'Ngày Đăng Ký': 1, 'MST': 1, 'Tên Khách Hàng': 1, 'Tên Công Ty ': 1, 'Nhân Viên Đăng Ký': 1, 'NCC': 1, 'LOẠI SẢN PHẨM': 1, 'Thành Tiền': 1, 'Thực Thu': 1, 'KH Thanh Toán': 1, 'Còn lại': 1, 'TÌNH TRẠNG': 1, debtValue: 1, laDonNhieuSanPham: { $isArray: '$chiTietSanPham' } };
    const [items, counts] = await Promise.all([
      DonHang.aggregate([...pipeline, { $sort: { registeredAtDate: -1, _id: -1 } }, { $limit: 500 }, { $project: projection }]).option({ maxTimeMS: 20000 }),
      DonHang.aggregate([...pipeline, { $count: 'total' }]).option({ maxTimeMS: 20000 })
    ]);
    res.json({ success: true, data: { type, total: counts[0]?.total || 0, items: items.map(order => sanitizeOrderForUser(order, accessUser)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders/:id/thanh-toan-san-pham', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    if (!hoTroNhieuSanPham) return res.status(503).json({ success: false, message: 'Chức năng đơn nhiều sản phẩm chưa được kích hoạt.' });
    const user = await getAccessUser(req);
    if (!user?.isActive || user.roleId?.name !== 'Admin') return res.status(403).json({ success: false, message: 'Chỉ Admin được ghi nhận thanh toán trực tiếp. Vui lòng sử dụng chức năng UNC.' });
    const { maDong, ngay, soTien, thanhToanCu } = req.body || {};
    if (typeof maDong !== 'string' || !maDong.trim() || maDong.length > 200 || !kiemTraNgay(ngay)
      || !Number.isSafeInteger(soTien) || soTien <= 0 || !Array.isArray(thanhToanCu)) {
      return res.status(400).json({ success: false, message: 'Ngày, số tiền hoặc thông tin dòng thanh toán không hợp lệ.' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ.' });
    const boLoc = { ...buildOrderFilter({}, { scopeUser: user }), _id: req.params.id };
    const don = await DonHang.findOne(boLoc).select({ chiTietSanPham: 1, phieuUnc: 1, lockedAt: 1, 'Thực Thu': 1, 'KH Thanh Toán': 1, 'Còn lại': 1 }).lean();
    if (!don) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    if (don.lockedAt && user.roleId?.name !== 'Admin' && !user.roleId?.permissions?.includes('manage_financials')) return res.status(423).json({ success: false, message: 'Đơn hàng đã khóa, cần quyền quản lý để chỉnh sửa.' });
    const xem = locChiTietSanPhamTheoQuyen(don, user).chiTietSanPham;
    if (!xem || xem.some(dong => !Object.prototype.hasOwnProperty.call(dong, 'maDong') || !Object.prototype.hasOwnProperty.call(dong, 'thanhToanKhach') || !Object.prototype.hasOwnProperty.call(dong, 'phaiThuKhach'))) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền ghi nhận thanh toán theo sản phẩm.' });
    }
    const cacDong = don.chiTietSanPham.filter(dong => dong.maDong === maDong);
    if (cacDong.length !== 1 || JSON.stringify(cacDong[0].thanhToanKhach) !== JSON.stringify(thanhToanCu)) {
      return res.status(409).json({ success: false, message: 'Lịch sử thanh toán đã thay đổi. Vui lòng tải lại đơn trước khi thử lại.' });
    }
    if (!Array.isArray(cacDong[0].thanhToanKhach)) return res.status(409).json({ success: false, message: 'Lịch sử thanh toán không hợp lệ. Vui lòng kiểm tra đơn.' });
    if (don.phieuUnc !== undefined && !Array.isArray(don.phieuUnc)) return res.status(409).json({ success: false, message: 'Danh sách UNC không hợp lệ; vui lòng kiểm tra đơn.' });
    if ((don.phieuUnc || []).some(phieu => phieu.trangThai === 'Chờ Duyệt' && Array.isArray(phieu.phanBo) && phieu.phanBo.some(muc => muc.maDong === maDong))) {
      return res.status(409).json({ success: false, message: 'Sản phẩm có UNC chờ duyệt. Vui lòng xử lý phiếu trước để tránh ghi trùng thanh toán.' });
    }
    let tongCu, tongMoi;
    const chiTiet = don.chiTietSanPham.map(dong => dong.maDong === maDong ? { ...dong, thanhToanKhach: [...dong.thanhToanKhach, { ngay, soTien }] } : dong);
    try { tongCu = tinhTongChiTiet(don.chiTietSanPham).tatCa; tongMoi = tinhTongChiTiet(chiTiet).tatCa; }
    catch (loi) { return res.status(400).json({ success: false, message: loi.message }); }
    if (!Number.isSafeInteger(don['KH Thanh Toán']) || don['KH Thanh Toán'] !== tongCu.khachDaThanhToan) {
      return res.status(409).json({ success: false, message: 'Thanh toán tổng không khớp chi tiết. Vui lòng kiểm tra đơn trước khi ghi nhận.' });
    }
    const phienBan = [boLoc, { chiTietSanPham: don.chiTietSanPham }];
    for (const truong of ['phieuUnc', 'lockedAt', 'Thực Thu', 'KH Thanh Toán', 'Còn lại']) {
      phienBan.push(don[truong] === undefined ? { [truong]: { $exists: false } } : { [truong]: don[truong] });
    }
    const capNhat = { chiTietSanPham: chiTiet, 'KH Thanh Toán': tongMoi.khachDaThanhToan, 'Còn lại': Math.max(0, tongMoi.phaiThuKhach - tongMoi.khachDaThanhToan) };
    const luu = await DonHang.findOneAndUpdate({ $and: phienBan }, { $set: capNhat }, { new: true }).select({ chiTietSanPham: 1, 'KH Thanh Toán': 1, 'Còn lại': 1 }).lean();
    if (!luu) return res.status(409).json({ success: false, message: 'Đơn hoặc phiếu UNC đã thay đổi. Vui lòng tải lại đơn.' });
    try {
      await writeOrderAudit(don._id, req, 'UPDATE', [{ field: `chiTietSanPham.${maDong}.thanhToanKhach`, from: '', to: `${ngay}: ${soTien}` }], 'Ghi nhận trực tiếp thanh toán khách theo sản phẩm');
    } catch (loi) {
      console.error('Đã ghi nhận thanh toán nhưng không ghi được lịch sử:', loi.message);
      return res.status(500).json({ success: false, message: 'Đã ghi nhận thanh toán nhưng không ghi được lịch sử. Vui lòng tải lại và kiểm tra trước khi thử lại.' });
    }
    return res.status(201).json({ success: true, data: sanitizeOrderForUser(luu, user) });
  } catch (loi) {
    console.error('Lỗi ghi nhận thanh toán theo sản phẩm:', loi.message);
    return res.status(500).json({ success: false, message: 'Không xác định được kết quả lưu. Vui lòng tải lại đơn và kiểm tra trước khi thử lại.' });
  }
});

app.patch('/api/orders/:id/thuc-thu-chi-tiet', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    if (!hoTroNhieuSanPham) return res.status(503).json({ success: false, message: 'Chức năng đơn nhiều sản phẩm chưa được kích hoạt.' });
    const user = await getAccessUser(req);
    if (!user?.isActive || !canViewFinancialOrderFields(user)) return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa dữ liệu tài chính.' });
    const cotAn = user.hiddenColumns?.orders || user.roleId?.hiddenColumns?.orders || [];
    if (['chiTietSanPham', 'chiTietSanPham.phaiThuKhach', 'Thực Thu'].some(cot => cotAn.includes(cot))) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa thực thu theo sản phẩm.' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ.' });
    const danhSach = req.body?.chiTiet;
    if (!Array.isArray(danhSach) || danhSach.length < 1 || danhSach.length > 100 || danhSach.some(dong =>
      !dong || typeof dong.maDong !== 'string' || !dong.maDong.trim() || !Number.isSafeInteger(dong.phaiThuKhach) || dong.phaiThuKhach < 0
      || !Number.isSafeInteger(dong.phaiThuCu) || dong.phaiThuCu < 0
    ) || new Set(danhSach.map(dong => dong.maDong)).size !== danhSach.length) {
      return res.status(400).json({ success: false, message: 'Danh sách thực thu không hợp lệ.' });
    }
    const boLoc = { ...buildOrderFilter({}, { scopeUser: user }), _id: req.params.id };
    const don = await DonHang.findOne(boLoc).select({ chiTietSanPham: 1, phieuUnc: 1, lockedAt: 1, 'Thực Thu': 1, 'KH Thanh Toán': 1, 'Còn lại': 1 }).lean();
    if (!don) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    if (don.lockedAt && user.roleId?.name !== 'Admin' && !user.roleId?.permissions?.includes('manage_financials')) return res.status(423).json({ success: false, message: 'Đơn hàng đã khóa, cần quyền quản lý để chỉnh sửa.' });
    if (!Array.isArray(don.chiTietSanPham) || don.chiTietSanPham.length !== danhSach.length) return res.status(409).json({ success: false, message: 'Chi tiết đơn đã thay đổi. Vui lòng tải lại.' });
    const duocXem = locChiTietSanPhamTheoQuyen(don, user).chiTietSanPham;
    if (!duocXem || duocXem.some(dong => !Object.prototype.hasOwnProperty.call(dong, 'phaiThuKhach'))) return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa thực thu theo sản phẩm.' });
    const theoMa = new Map(danhSach.map(dong => [dong.maDong, dong]));
    if (new Set(don.chiTietSanPham.map(dong => dong?.maDong)).size !== danhSach.length || don.chiTietSanPham.some(dong => !dong?.maDong || !theoMa.has(dong.maDong) || dong.phaiThuKhach !== theoMa.get(dong.maDong).phaiThuCu)) return res.status(409).json({ success: false, message: 'Chi tiết đơn đã thay đổi. Vui lòng tải lại.' });
    const chiTiet = don.chiTietSanPham.map(dong => ({ ...dong, phaiThuKhach: theoMa.get(dong.maDong).phaiThuKhach }));
    let tong;
    try { tong = tinhTongChiTiet(chiTiet).tatCa; }
    catch (loi) { return res.status(400).json({ success: false, message: loi.message }); }
    if (!Number.isSafeInteger(don['KH Thanh Toán']) || don['KH Thanh Toán'] !== tong.khachDaThanhToan) {
      return res.status(409).json({ success: false, message: 'Thanh toán tổng không khớp chi tiết. Vui lòng kiểm tra trước khi cập nhật thực thu.' });
    }
    const phienBan = [boLoc, { chiTietSanPham: don.chiTietSanPham }];
    for (const truong of ['phieuUnc', 'lockedAt', 'Thực Thu', 'KH Thanh Toán', 'Còn lại']) {
      phienBan.push(don[truong] === undefined ? { [truong]: { $exists: false } } : { [truong]: don[truong] });
    }
    const capNhat = { chiTietSanPham: chiTiet, 'Thực Thu': tong.phaiThuKhach, 'Còn lại': Math.max(0, tong.phaiThuKhach - tong.khachDaThanhToan) };
    const daLuu = await DonHang.findOneAndUpdate({ $and: phienBan }, { $set: capNhat }, { new: true })
      .select({ 'Thực Thu': 1, 'KH Thanh Toán': 1, 'Còn lại': 1 }).lean();
    if (!daLuu) return res.status(409).json({ success: false, message: 'Đơn hàng đã thay đổi. Vui lòng tải lại và thử lại.' });
    try {
      const thayDoi = don.chiTietSanPham.filter(dong => dong.phaiThuKhach !== theoMa.get(dong.maDong).phaiThuKhach).map(dong => ({
        field: `chiTietSanPham.${dong.maDong}.phaiThuKhach`, from: dong.phaiThuKhach, to: theoMa.get(dong.maDong).phaiThuKhach
      }));
      if (thayDoi.length) await writeOrderAudit(don._id, req, 'UPDATE', thayDoi, 'Cập nhật thực thu theo sản phẩm từ Kiểm tra đơn hàng');
    } catch (loi) {
      console.error('Đã lưu thực thu nhưng không ghi được lịch sử:', loi.message);
      return res.status(500).json({ success: false, message: 'Đã lưu thực thu nhưng không ghi được lịch sử. Vui lòng kiểm tra lại đơn hàng.' });
    }
    return res.json({ success: true, data: sanitizeOrderForUser({ _id: daLuu._id, 'Thực Thu': daLuu['Thực Thu'], 'KH Thanh Toán': daLuu['KH Thanh Toán'], 'Còn lại': daLuu['Còn lại'] }, user) });
  } catch (loi) {
    console.error('Lỗi cập nhật thực thu theo sản phẩm:', loi.message);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật thực thu theo sản phẩm.' });
  }
});

app.patch('/api/orders/:id/trang-thai-san-pham', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    if (!hoTroNhieuSanPham) return res.status(503).json({ success: false, message: 'Chức năng đơn nhiều sản phẩm chưa được kích hoạt.' });
    const user = await getAccessUser(req);
    if (!user?.isActive || !canViewFinancialOrderFields(user)) return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa thông tin sản phẩm.' });
    const { maDong, trangThaiCu, trangThai } = req.body || {};
    if (!mongoose.isValidObjectId(req.params.id) || typeof maDong !== 'string' || !maDong || typeof trangThaiCu !== 'string' || !cacTrangThai.includes(trangThai)) {
      return res.status(400).json({ success: false, message: 'Thông tin trạng thái không hợp lệ.' });
    }
    const boLoc = { $and: [buildOrderFilter({}, { scopeUser: user }), { _id: req.params.id }] };
    const don = await DonHang.findOne(boLoc).select({ chiTietSanPham: 1, lockedAt: 1 }).lean();
    if (!don) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    if (don.lockedAt && user.roleId?.name !== 'Admin' && !user.roleId?.permissions?.includes('manage_financials')) return res.status(423).json({ success: false, message: 'Đơn hàng đã khóa, cần quyền quản lý để chỉnh sửa.' });
    const xem = locChiTietSanPhamTheoQuyen(don, user).chiTietSanPham;
    const truongCan = ['maDong', 'maSanPham', 'tenSanPham', 'loaiSanPham', 'ncc', 'hinhThuc', 'soLuong', 'donViTinh', 'trangThai', 'phaiThuKhach', 'giaBan', 'giaDongCongTy', 'giaNoNcc', 'thanhToanKhach', 'thanhToanNcc'];
    if (!xem || xem.some(dong => truongCan.some(truong => !Object.prototype.hasOwnProperty.call(dong, truong)))) return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa thông tin sản phẩm.' });
    const cacDong = don.chiTietSanPham.filter(dong => dong.maDong === maDong);
    if (cacDong.length !== 1 || cacDong[0].trangThai !== trangThaiCu) return res.status(409).json({ success: false, message: 'Sản phẩm đã thay đổi. Vui lòng tải lại.' });
    const chiTiet = don.chiTietSanPham.map(dong => dong.maDong === maDong ? { ...dong, trangThai } : dong);
    const dieuKienKhoa = don.lockedAt === undefined ? { lockedAt: { $exists: false } } : { lockedAt: don.lockedAt };
    const luu = await DonHang.findOneAndUpdate({ $and: [boLoc, { chiTietSanPham: don.chiTietSanPham }, dieuKienKhoa] }, { $set: { chiTietSanPham: chiTiet } }, { new: true }).select({ _id: 1 }).lean();
    if (!luu) return res.status(409).json({ success: false, message: 'Đơn hàng đã thay đổi. Vui lòng tải lại.' });
    try {
      if (trangThaiCu !== trangThai) await writeOrderAudit(don._id, req, 'UPDATE', [{ field: `chiTietSanPham.${maDong}.trangThai`, from: trangThaiCu, to: trangThai }], 'Cập nhật trạng thái sản phẩm');
    } catch (loi) {
      console.error('Đã lưu trạng thái sản phẩm nhưng không ghi được lịch sử:', loi.message);
      return res.status(500).json({ success: false, message: 'Đã lưu trạng thái nhưng không ghi được lịch sử. Vui lòng tải lại đơn.' });
    }
    return res.json({ success: true, data: { maDong, trangThai } });
  } catch (loi) {
    console.error('Lỗi cập nhật trạng thái sản phẩm:', loi.message);
    return res.status(500).json({ success: false, message: 'Không xác định được kết quả lưu. Vui lòng tải lại đơn và kiểm tra.' });
  }
});

app.patch('/api/orders/:id/chi-tiet-san-pham', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    if (!hoTroNhieuSanPham) return res.status(503).json({ success: false, message: 'Chức năng đơn nhiều sản phẩm chưa được kích hoạt.' });
    const user = await getAccessUser(req);
    if (!user?.isActive || !canViewFinancialOrderFields(user)) return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa thông tin sản phẩm.' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Mã đơn không hợp lệ.' });
    const boLoc = { ...buildOrderFilter({}, { scopeUser: user }), _id: req.params.id };
    const don = await DonHang.findOne(boLoc).select({
      chiTietSanPham: 1, phieuUnc: 1, lockedAt: 1, 'Thành Tiền': 1, 'Thực Thu': 1,
      'KH Thanh Toán': 1, 'Còn lại': 1, 'Thực Đóng Công Ty': 1, 'Thực Đóng NCC': 1, 'THỰC CÔNG NỢ CTY': 1
    }).lean();
    if (!don) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    if (don.lockedAt && user.roleId?.name !== 'Admin' && !user.roleId?.permissions?.includes('manage_financials')) return res.status(423).json({ success: false, message: 'Đơn hàng đã khóa, cần quyền quản lý để chỉnh sửa.' });
    const xem = locChiTietSanPhamTheoQuyen(don, user).chiTietSanPham;
    const truongCan = ['maDong', 'maSanPham', 'tenSanPham', 'loaiSanPham', 'ncc', 'hinhThuc', 'soLuong', 'donViTinh', 'trangThai', 'phaiThuKhach', 'giaBan', 'giaDongCongTy', 'giaNoNcc', 'thanhToanKhach', 'thanhToanNcc'];
    if (!xem || xem.some(dong => truongCan.some(truong => !Object.prototype.hasOwnProperty.call(dong, truong)))) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa các thông tin liên quan đến sản phẩm.' });
    }
    const { cu, moi, chiTiet, tong } = await chuanBiSuaChiTiet(don, req.body, SanPham);
    const phienBan = [boLoc, { chiTietSanPham: don.chiTietSanPham }];
    for (const truong of ['phieuUnc', 'lockedAt', 'Thành Tiền', 'Thực Thu', 'KH Thanh Toán', 'Còn lại', 'Thực Đóng Công Ty', 'Thực Đóng NCC', 'THỰC CÔNG NỢ CTY']) {
      phienBan.push(don[truong] === undefined ? { [truong]: { $exists: false } } : { [truong]: don[truong] });
    }
    const capNhat = { chiTietSanPham: chiTiet, 'Thành Tiền': tong.thanhTien, 'Thực Thu': tong.phaiThuKhach,
      'Còn lại': Math.max(0, tong.phaiThuKhach - tong.khachDaThanhToan), 'Thực Đóng Công Ty': tong.thucDongCongTy,
      'Thực Đóng NCC': tong.thucDongCongTy, 'THỰC CÔNG NỢ CTY': tong.congNoNcc };
    const luu = await DonHang.findOneAndUpdate({ $and: phienBan }, { $set: capNhat }, { new: true }).select({
      chiTietSanPham: 1, 'Thành Tiền': 1, 'Thực Thu': 1, 'KH Thanh Toán': 1, 'Còn lại': 1,
      'Thực Đóng Công Ty': 1, 'Thực Đóng NCC': 1, 'THỰC CÔNG NỢ CTY': 1
    }).lean();
    if (!luu) return res.status(409).json({ success: false, message: 'Đơn hoặc phiếu UNC đã thay đổi. Vui lòng tải lại.' });
    try {
      const thayDoi = ['maSanPham', 'tenSanPham', 'soLuong', 'donViTinh', 'trangThai', 'phaiThuKhach', 'giaBan', 'giaDongCongTy', 'giaNoNcc']
        .filter(key => cu[key] !== moi[key]).map(key => ({ field: `chiTietSanPham.${cu.maDong}.${key}`, from: cu[key], to: moi[key] }));
      if (thayDoi.length) await writeOrderAudit(don._id, req, 'UPDATE', thayDoi, 'Cập nhật chi tiết sản phẩm');
    } catch (loi) {
      console.error('Đã lưu sản phẩm nhưng không ghi được lịch sử:', loi.message);
      return res.status(500).json({ success: false, message: 'Đã lưu sản phẩm nhưng không ghi được lịch sử. Vui lòng tải lại đơn.' });
    }
    return res.json({ success: true, data: sanitizeOrderForUser(luu, user) });
  } catch (loi) {
    if (!loi.statusCode) console.error('Lỗi cập nhật chi tiết sản phẩm:', loi.message);
    return res.status(loi.statusCode || 500).json({ success: false, message: loi.statusCode ? loi.message : 'Không thể cập nhật chi tiết sản phẩm.' });
  }
});

app.get('/api/orders/detail/:id', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ.' });
    }
    const accessUser = await getAccessUser(req);
    const scopeFilter = buildOrderFilter({}, { scopeUser: accessUser });
    scopeFilter._id = new mongoose.Types.ObjectId(req.params.id);
    const truongTepNang = ['Hợp Đồng / GDK', 'Xác Nhận/ BBBG', 'GPKD', 'CCCD', 'File tong', 'FILE ĐÍNH KÈM'];
    const [order] = await DonHang.aggregate([
      { $match: scopeFilter },
      { $limit: 1 },
      { $addFields: Object.fromEntries(truongTepNang.map(field => [
        field,
        { $cond: [
          { $in: [{ $ifNull: [`$${field}`, ''] }, ['', null, false]] },
          '',
          '__HAS_ATTACHMENT__'
        ] }
      ])) },
      { $project: {
        'Ảnh UNC': 0,
        'phieuUnc.tepDinhKem': 0,
        'Lịch Sử Đơn Hàng': 0,
        'SmartSign PDF Payload': 0
      } }
    ]).option({ maxTimeMS: 15000 });
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    const mstValues = order.MST ? getCaseFileMstQueryValues([order.MST]) : [];
    const duocXemHoSo = quyenMa(accessUser?.roleId, 'profiles:view');
    const [phieuGiaoNhan, hoSo] = await Promise.all([
      mstValues.length
        ? ChuyenPhatNhanh.findOne({ MST: { $in: mstValues } })
          .select({ 'TÌNH TRẠNG': 1, quyTrinhGiaoNhan: 1, 'Nhân Viên Thực Hiện': 1 })
          .sort({ ngayGuiDate: -1, _id: -1 })
          .lean()
        : Promise.resolve(null),
      mstValues.length && duocXemHoSo
        ? HoSo.findOne({ MST: { $in: mstValues } })
          .select({ ID: 1, 'TÌNH TRẠNG HỒ SƠ': 1, 'Nơi Nộp': 1, quyTrinhHoSo: 1 })
          .sort({ ngayNhanDate: -1, _id: -1 })
          .lean()
        : Promise.resolve(null)
    ]);
    const quyTrinh = tinhQuyTrinhDonHang(order, phieuGiaoNhan, hoSo);
    res.json({ success: true, data: sanitizeOrderForUser(order, accessUser), quyTrinh });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/detail/:id/attachment', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const truongChoPhep = ['Hợp Đồng / GDK', 'Xác Nhận/ BBBG', 'GPKD', 'CCCD', 'File tong', 'FILE ĐÍNH KÈM'];
    const field = String(req.query.field || '').trim();
    if (!truongChoPhep.includes(field)) {
      return res.status(400).json({ success: false, message: 'Trường tệp đính kèm không hợp lệ.' });
    }
    const accessUser = await getAccessUser(req);
    if (!quyenCot(accessUser?.roleId, 'orders', field, layCotDonTheoNguoiDung(accessUser))) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem tệp đính kèm này.' });
    }
    const scopeFilter = buildOrderFilter({}, { scopeUser: accessUser });
    scopeFilter._id = req.params.id;
    const order = await DonHang.findOne(scopeFilter).select({ [field]: 1 }).maxTimeMS(15000).lean();
    if (!order || !order[field]) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tệp đính kèm.' });
    }
    const tep = await docTepNang(order[field]);
    if (!tep?.dataUrl) {
      return res.status(404).json({ success: false, message: 'Không thể đọc tệp đính kèm.' });
    }
    res.json({ success: true, data: { field, dataUrl: tep.dataUrl } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/unc/:id/file', requireAuth, async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const role = accessUser?.roleId;
    const canViewOwnOrders = orderScope(accessUser) === 'own' && role?.permissions?.includes('view_orders');
    if (role?.name !== 'Admin' && !req.auth?.isSuperAdmin && !role?.permissions?.includes('view_debts') && !canViewOwnOrders) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem tệp UNC.' });
    }

    const filter = { ...buildOrderFilter({}, { scopeUser: accessUser }), _id: req.params.id };
    const order = await DonHang.findOne(filter).select({ 'Ảnh UNC': 1, 'Tên File UNC': 1 }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu UNC.' });
    const tep = order['Ảnh UNC'] ? await docTepNang(order['Ảnh UNC']) : null;
    res.json({ success: true, data: { 'Ảnh UNC': tep?.dataUrl || '', 'Tên File UNC': order['Tên File UNC'] || tep?.fileName || '' } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/api/orders/unc/:id', requireAuth, async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const role = accessUser?.roleId;
    const isAdmin = Boolean(accessUser?.isActive && (role?.name === 'Admin' || req.auth?.isSuperAdmin));
    if (!isAdmin && (!accessUser?.isActive || orderScope(accessUser) !== 'own' || !role?.permissions?.includes('manage_orders'))) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ được cập nhật phiếu UNC của mình.' });
    }

    const filter = { ...buildOrderFilter({}, { scopeUser: accessUser }), _id: req.params.id };
    const order = await DonHang.findOne(filter).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu UNC.' });
    if (Array.isArray(order.chiTietSanPham)) {
      return res.status(409).json({ success: false, message: 'Chưa thể gửi UNC cho đơn nhiều sản phẩm; phân bổ theo dòng chưa sẵn sàng.' });
    }
    if (order['Trạng Thái UNC'] === 'Đã Duyệt') {
      return res.status(423).json({ success: false, message: 'Phiếu UNC đã duyệt, không thể chỉnh sửa.' });
    }

    const amount = Number(req.body['Số Tiền UNC']);
    const paymentDate = String(req.body['Ngày Thanh Toán UNC'] || '').trim();
    const note = String(req.body['Nội Dung UNC'] || '').trim().slice(0, 1000);
    const tenNganHang = String(req.body['Tên Ngân Hàng UNC'] || '').trim().slice(0, 100);
    const maGiaoDich = String(req.body['Mã Giao Dịch UNC'] || '').trim().slice(0, 100);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Số tiền UNC không hợp lệ.' });
    if (!paymentDate) return res.status(400).json({ success: false, message: 'Vui lòng chọn ngày thanh toán.' });

    const update = {
      'Số Tiền UNC': amount,
      'Ngày Thanh Toán UNC': paymentDate,
      'Nội Dung UNC': note,
      'Tên Ngân Hàng UNC': tenNganHang,
      'Mã Giao Dịch UNC': maGiaoDich,
      'Ngày Upload UNC': new Date(),
      'Trạng Thái UNC': 'Chờ Duyệt',
      'Ghi Chú Từ Chối UNC': ''
    };
    if (typeof req.body['Ảnh UNC'] === 'string' && req.body['Ảnh UNC']) {
      try {
        require('./services/quanLyPhieuUncNhieuSanPham').kiemTraTepUnc(req.body['Ảnh UNC']);
      } catch (loi) {
        return res.status(400).json({ success: false, message: loi.message });
      }
      const tenFileUnc = String(req.body['Tên File UNC'] || '').trim().slice(0, 255);
      update['Ảnh UNC'] = await luuTepNang({
        dataUrl: req.body['Ảnh UNC'],
        fileName: tenFileUnc || `unc-${order['Mã Đơn Hàng'] || order._id}`,
        prefix: 'unc'
      });
      update['Tên File UNC'] = tenFileUnc;
    }

    const updatedOrder = await DonHang.findOneAndUpdate(filter, { $set: update }, { new: true });
    await writeOrderAudit(order._id, req, 'UPDATE', [
      { field: 'Trạng Thái UNC', from: order['Trạng Thái UNC'] || 'Chờ Duyệt', to: 'Chờ Duyệt' },
      { field: 'Số Tiền UNC', from: order['Số Tiền UNC'] || 0, to: amount }
    ], isAdmin ? 'Admin gửi/cập nhật phiếu UNC' : 'Nhân viên cập nhật phiếu UNC');
    res.json({ success: true, data: locChiTietSanPhamTheoQuyen(updatedOrder.toObject(), accessUser) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/orders/unc/:id', requireAuth, async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const role = accessUser?.roleId;
    if (orderScope(accessUser) !== 'own' || !role?.permissions?.includes('manage_orders')) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ được xóa phiếu UNC của mình.' });
    }

    const filter = { ...buildOrderFilter({}, { scopeUser: accessUser }), _id: req.params.id };
    const order = await DonHang.findOne(filter).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu UNC.' });
    if (order['Trạng Thái UNC'] === 'Đã Duyệt') {
      return res.status(423).json({ success: false, message: 'Phiếu UNC đã duyệt, không thể xóa.' });
    }

    await DonHang.findOneAndUpdate(filter, {
      $unset: {
        'Số Tiền UNC': '',
        'Ngày Thanh Toán UNC': '',
        'Nội Dung UNC': '',
        'Tên Ngân Hàng UNC': '',
        'Mã Giao Dịch UNC': '',
        'Ảnh UNC': '',
        'Tên File UNC': '',
        'Ngày Upload UNC': '',
        'Trạng Thái UNC': '',
        'Ghi Chú Từ Chối UNC': ''
      }
    });
    await writeOrderAudit(order._id, req, 'UPDATE', [{ field: 'UNC', from: 'Có phiếu UNC', to: 'Đã xóa phiếu UNC' }], 'Nhân viên xóa phiếu UNC');
    res.json({ success: true, message: 'Đã xóa phiếu UNC.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/api/orders/unc/:id/status', requireAuth, async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    if (accessUser?.roleId?.name !== 'Admin' && !req.auth?.isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Chỉ Admin mới được duyệt hoặc từ chối phiếu UNC.' });
    }

    const status = String(req.body['Trạng Thái UNC'] || '').trim();
    const rejectionNote = String(req.body['Ghi Chú Từ Chối UNC'] || '').trim().slice(0, 500);
    if (!['Đã Duyệt', 'Từ Chối'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái UNC không hợp lệ.' });
    }
    if (status === 'Từ Chối' && !rejectionNote) {
      return res.status(400).json({ success: false, message: 'Vui lòng ghi rõ nguyên nhân từ chối.' });
    }

    const order = await DonHang.findById(req.params.id).lean();
    if (!order || !(Number(order['Số Tiền UNC']) > 0)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu UNC.' });
    }
    const updatedOrder = await luuKetQuaUncDonHangCu(DonHang, order, status, rejectionNote);
    if (!updatedOrder) return res.status(409).json({ success: false, message: 'Phiếu UNC hoặc đơn hàng đã thay đổi. Vui lòng tải lại.' });
    const changes = [{ field: 'Trạng Thái UNC', from: order['Trạng Thái UNC'] || 'Chờ Duyệt', to: status }];
    if (status === 'Đã Duyệt') {
      changes.push(
        { field: 'KH Thanh Toán', from: order['KH Thanh Toán'] ?? 0, to: updatedOrder['KH Thanh Toán'] },
        { field: 'Còn lại', from: order['Còn lại'] ?? 0, to: updatedOrder['Còn lại'] }
      );
    }
    await writeOrderAudit(order._id, req, 'UPDATE', changes, status === 'Từ Chối' ? rejectionNote : 'Duyệt UNC và cập nhật số tiền thanh toán');
    res.json({ success: true, data: locChiTietSanPhamTheoQuyen(updatedOrder.toObject(), accessUser) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

function buildPaymentFilter(doiTuong, query) {
  const filter = {};
  const q = String(query.q || '').trim().slice(0, 100);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [doiTuong, 'employee', 'note', 'enteredBy', 'paymentMethod'].map(field => ({ [field]: regex }));
  }
  const supplier = String(query.supplier || '').trim().slice(0, 120);
  if (doiTuong === 'supplier' && supplier) filter.supplier = new RegExp(escapeRegex(supplier), 'i');
  const from = String(query.fromDate || query.from || '').trim();
  const to = String(query.toDate || query.to || '').trim();
  if (from || to) filter.paymentDate = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (/^\d{4}-\d{2}$/.test(String(query.period || ''))) filter.paymentPeriod = query.period;
  if (query.method) filter.paymentMethod = String(query.method);
  if (query.enteredBy) filter.enteredBy = String(query.enteredBy);
  if (query.hasImage === '1') filter.imageName = { $ne: '' };
  return filter;
}

// Chỉ truy vấn trang hiện tại; ảnh chứng từ chỉ được tải qua API riêng khi người dùng yêu cầu.
async function listPaymentsPage(Model, doiTuong, query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const items = await Model.aggregate([
    { $match: buildPaymentFilter(doiTuong, query) },
    { $sort: { paymentDate: -1, _id: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit + 1 },
    { $addFields: { hasImage: { $gt: [{ $strLenCP: { $ifNull: ['$imageData', ''] } }, 0] } } },
    { $project: { imageData: 0 } }
  ]);
  const hasMore = items.length > limit;
  if (hasMore) items.pop();
  return {
    items, page, limit, hasMore
  };
}

async function getPaymentSummary(Model, doiTuong, query) {
  const [summary] = await Model.aggregate([
    { $match: buildPaymentFilter(doiTuong, query) },
    { $group: { _id: null, total: { $sum: 1 }, totalAmount: { $sum: '$amount' } } }
  ]);
  return { total: summary?.total || 0, totalAmount: summary?.totalAmount || 0 };
}

async function getPaymentOptions(Model, query) {
  const field = query.field === 'method' ? 'paymentMethod' : query.field === 'enteredBy' ? 'enteredBy' : '';
  const q = String(query.q || '').trim().slice(0, 100);
  if (!field || !q) return [];
  const matches = await Model.aggregate([
    { $match: { [field]: new RegExp(escapeRegex(q), 'i') } },
    { $group: { _id: `$${field}` } },
    { $sort: { _id: 1 } },
    { $limit: 20 }
  ]);
  return matches.map(item => item._id).filter(Boolean);
}

app.get('/api/supplier-payments', requireAuth, requirePermission('view_internal_finance'), async (req, res) => {
  try {
    res.json({ success: true, ...(await listPaymentsPage(SupplierPayment, 'supplier', req.query)) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/supplier-payments/summary', requireAuth, requirePermission('view_internal_finance'), async (req, res) => {
  try {
    res.json({ success: true, ...(await getPaymentSummary(SupplierPayment, 'supplier', req.query)) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/supplier-payments/options', requireAuth, requirePermission('view_internal_finance'), async (req, res) => {
  try {
    res.json({ success: true, items: await getPaymentOptions(SupplierPayment, req.query) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/employee-payments', requireAuth, requirePermission('view_internal_finance'), async (req, res) => {
  try {
    res.json({ success: true, ...(await listPaymentsPage(EmployeePayment, 'employee', req.query)) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/employee-payments/summary', requireAuth, requirePermission('view_internal_finance'), async (req, res) => {
  try {
    res.json({ success: true, ...(await getPaymentSummary(EmployeePayment, 'employee', req.query)) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/employee-payments/options', requireAuth, requirePermission('view_internal_finance'), async (req, res) => {
  try {
    res.json({ success: true, items: await getPaymentOptions(EmployeePayment, req.query) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/payments/counts', requireAuth, requirePermission('view_internal_finance'), async (req, res) => {
  try {
    const [supplier, employee] = await Promise.all([SupplierPayment.estimatedDocumentCount(), EmployeePayment.estimatedDocumentCount()]);
    res.json({ success: true, supplier, employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
async function sendPaymentImage(Model, req, res) {
  try {
    const payment = await Model.findById(req.params.id, 'imageData').lean();
    const tep = payment?.imageData ? await docTepNang(payment.imageData) : null;
    if (!tep?.buffer) return res.status(404).json({ success: false, message: 'Phiếu chưa có hình ảnh.' });
    res.set('Content-Type', tep.mimeType || 'image/jpeg').send(tep.buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

app.get('/api/supplier-payments/:id/image', requireAuth, requirePermission('view_internal_finance'), (req, res) => sendPaymentImage(SupplierPayment, req, res));
app.get('/api/employee-payments/:id/image', requireAuth, requirePermission('view_internal_finance'), (req, res) => sendPaymentImage(EmployeePayment, req, res));

function getPaymentPeriod(paymentDate, paymentPeriod) {
  const date = String(paymentDate || '').trim();
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return null;
  const period = String(paymentPeriod || '').trim();
  if (period) return /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : null;
  return date.slice(0, 7);
}

function normalizePaymentImportRows(rows, type, username) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
    throw new Error('File phải có từ 1 đến 500 dòng thanh toán.');
  }
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const paymentDate = String(row.paymentDate || '').trim();
    const paymentPeriod = getPaymentPeriod(paymentDate, row.paymentPeriod);
    const amount = Number(row.amount);
    const subject = String((type === 'supplier' ? row.supplier : row.employee) || '').trim();
    if (!subject) throw new Error(`Dòng ${rowNumber}: thiếu ${type === 'supplier' ? 'nhà cung cấp' : 'nhân viên'}.`);
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ? new Date(`${paymentDate}T00:00:00Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== paymentDate) {
      throw new Error(`Dòng ${rowNumber}: ngày thanh toán phải theo dạng YYYY-MM-DD.`);
    }
    if (!paymentPeriod) throw new Error(`Dòng ${rowNumber}: kỳ thanh toán phải theo dạng YYYY-MM.`);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Dòng ${rowNumber}: số tiền phải lớn hơn 0.`);
    return {
      ...(type === 'supplier' ? { supplier: subject, employee: String(row.employee || '').trim().slice(0, 120) } : { employee: subject }),
      paymentDate,
      paymentPeriod,
      amount,
      enteredBy: String(row.enteredBy || username || '').trim().slice(0, 120),
      paymentMethod: String(row.paymentMethod || '').trim().slice(0, 80),
      note: String(row.note || '').trim().slice(0, 2000),
      createdBy: username || 'Hệ thống'
    };
  });
}

app.post('/api/employee-payments', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    const employee = String(req.body.employee || '').trim();
    const paymentDate = String(req.body.paymentDate || '').trim();
    const paymentPeriod = getPaymentPeriod(paymentDate, req.body.paymentPeriod);
    const amount = Number(req.body.amount);
    if (!employee || !paymentDate || !paymentPeriod || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Vui lòng nhập nhân viên, ngày, kỳ và số tiền hợp lệ.' });
    const rawImageData = String(req.body.imageData || '');
    if (rawImageData.length > 8 * 1024 * 1024) return res.status(400).json({ success: false, message: 'Hình ảnh thanh toán không được vượt quá 8MB.' });
    const imageName = String(req.body.imageName || '').trim();
    const imageData = rawImageData ? await luuTepNang({ dataUrl: rawImageData, fileName: imageName || `emp-pay-${Date.now()}`, prefix: 'emp-pay' }) : '';
    const payment = await EmployeePayment.create({
      employee,
      paymentDate,
      paymentPeriod,
      amount,
      enteredBy: String(req.body.enteredBy || req.auth?.username || '').trim(),
      paymentMethod: String(req.body.paymentMethod || '').trim(),
      imageData,
      imageName,
      note: String(req.body.note || '').trim(),
      createdBy: req.auth?.username || 'Hệ thống'
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/employee-payments/import', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    const payments = normalizePaymentImportRows(req.body.rows, 'employee', req.auth?.username);
    const created = await EmployeePayment.insertMany(payments, { ordered: true });
    res.status(201).json({ success: true, data: { imported: created.length } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.delete('/api/employee-payments/:id', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    const payment = await EmployeePayment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu thanh toán nhân viên.' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/supplier-payments/orders', requireAuth, requirePermission('view_internal_finance'), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const supplier = String(req.query.supplier || '').trim();
    const mst = String(req.query.mst || '').replace(/\D/g, '');
    const baseMatch = { 'TÌNH TRẠNG': activatedOrderStatus };
    if (supplier && supplier !== 'ALL') baseMatch.NCC = supplier;
    if (mst) baseMatch.MST = new RegExp(escapeRegex(mst));
    const directCostExpression = { $convert: { input: '$THỰC CÔNG NỢ CTY', to: 'double', onError: 0, onNull: 0 } };
    const paidExpression = { $convert: { input: '$Đã Thanh Toán NCC', to: 'double', onError: 0, onNull: 0 } };
    const pipeline = [
      { $match: baseMatch },
      { $project: { _id: 1, NCC: 1, 'Gói ': 1, registeredAtDate: 1, 'THỰC CÔNG NỢ CTY': 1, 'Đã Thanh Toán NCC': 1 } },
      { $lookup: { from: 'SANPHAM', let: { ncc: '$NCC', packageName: { $ifNull: ['$Gói ', ''] } }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$NCC', '$$ncc'] }, { $or: [{ $eq: ['$TÊN SẢN PHẨM', '$$packageName'] }, { $eq: ['$Tên Sản Phẩm', '$$packageName'] }, { $eq: ['$Gói ', '$$packageName'] }] }] } } }, { $project: { cost: { $convert: { input: { $ifNull: ['$THỰC ĐÓNG CÔNG TY', '$Thực Đóng Công Ty'] }, to: 'double', onError: 0, onNull: 0 } } } }], as: 'productCost' } },
      { $addFields: { supplierCost: { $cond: [{ $gt: [directCostExpression, 0] }, directCostExpression, { $ifNull: [{ $arrayElemAt: ['$productCost.cost', 0] }, 0] }] }, supplierPaid: paidExpression } },
      { $addFields: { remaining: { $max: [0, { $subtract: ['$supplierCost', '$supplierPaid'] }] } } },
      { $match: { $expr: { $gt: ['$remaining', 0] } } },
      { $sort: { registeredAtDate: 1, _id: 1 } },
      { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 0, supplierPaid: 1 } }], meta: [{ $count: 'total' }] } }
    ];
    const result = await DonHang.aggregate(pipeline).option({ maxTimeMS: 20000 });
    const data = result[0] || { items: [], meta: [] };
    const total = data.meta[0]?.total || 0;
    res.json({ success: true, data: { items: data.items, page, limit, total, totalPages: Math.ceil(total / limit) || 1, hasMore: page * limit < total } });
  } catch (error) {
    console.error('Lỗi tải đơn cần thanh toán NCC:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/supplier-payments/allocate', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    const supplier = String(req.body.supplier || '').trim();
    const amount = Number(req.body.amount);
    const paymentDate = String(req.body.paymentDate || '').trim();
    const note = String(req.body.note || '').trim();
    const paymentPeriod = getPaymentPeriod(paymentDate);
    if (!supplier || !Number.isFinite(amount) || amount <= 0 || !paymentPeriod) return res.status(400).json({ success: false, message: 'Thiếu NCC, số tiền hoặc ngày thanh toán hợp lệ.' });
    const orders = await DonHang.find({ NCC: supplier, 'TÌNH TRẠNG': activatedOrderStatus }).sort({ registeredAtDate: 1, _id: 1 }).lean();
    let remainingAmount = amount;
    let allocated = 0;
    let updatedOrders = 0;
    for (const order of orders) {
      if (remainingAmount <= 0) break;
      const supplierCost = Number(order['THỰC CÔNG NỢ CTY'] ?? order['Thực Đóng NCC'] ?? 0) || 0;
      let resolvedSupplierCost = supplierCost;
      if (resolvedSupplierCost <= 0) {
        const product = await SanPham.findOne({ NCC: order.NCC, $or: [{ 'TÊN SẢN PHẨM': order['Gói '] }, { 'Tên Sản Phẩm': order['Gói '] }, { 'Gói ': order['Gói '] }] }).select('THỰC ĐÓNG CÔNG TY Thực Đóng Công Ty').lean();
        resolvedSupplierCost = Number(product?.['THỰC ĐÓNG CÔNG TY'] ?? product?.['Thực Đóng Công Ty'] ?? 0) || 0;
      }
      const supplierPaid = Number(order['Đã Thanh Toán NCC'] || 0) || 0;
      const allocation = Math.min(remainingAmount, Math.max(0, resolvedSupplierCost - supplierPaid));
      if (allocation <= 0) continue;
      await DonHang.updateOne({ _id: order._id }, { $set: { 'Đã Thanh Toán NCC': supplierPaid + allocation, 'Ngày Thanh Toán NCC': paymentDate, 'Ghi Chú Thanh Toán NCC': note } });
      remainingAmount -= allocation;
      allocated += allocation;
      updatedOrders += 1;
    }
    const payment = await SupplierPayment.create({ supplier, paymentDate, paymentPeriod, amount: allocated, note, createdBy: req.auth?.username || 'Hệ thống' });
    res.status(201).json({ success: true, data: { payment, allocated, remainingAmount, updatedOrders } });
  } catch (error) {
    console.error('Lỗi phân bổ thanh toán NCC:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/supplier-payments', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    const supplier = String(req.body.supplier || '').trim();
    const paymentDate = String(req.body.paymentDate || '').trim();
    const paymentPeriod = getPaymentPeriod(paymentDate, req.body.paymentPeriod);
    const amount = Number(req.body.amount);
    if (!supplier || !paymentDate || !paymentPeriod || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Vui lòng nhập NCC, ngày, kỳ và số tiền hợp lệ.' });
    const rawImageData = String(req.body.imageData || '');
    if (rawImageData.length > 8 * 1024 * 1024) return res.status(400).json({ success: false, message: 'Hình ảnh thanh toán không được vượt quá 8MB.' });
    const imageName = String(req.body.imageName || '').trim();
    const imageData = rawImageData ? await luuTepNang({ dataUrl: rawImageData, fileName: imageName || `sup-pay-${Date.now()}`, prefix: 'sup-pay' }) : '';
    const payment = await SupplierPayment.create({
      supplier,
      paymentDate,
      paymentPeriod,
      amount,
      employee: String(req.body.employee || '').trim(),
      enteredBy: String(req.body.enteredBy || req.auth?.username || '').trim(),
      paymentMethod: String(req.body.paymentMethod || '').trim(),
      imageData,
      imageName,
      note: String(req.body.note || '').trim(),
      createdBy: req.auth?.username || 'Hệ thống'
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/supplier-payments/import', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    const payments = normalizePaymentImportRows(req.body.rows, 'supplier', req.auth?.username);
    const created = await SupplierPayment.insertMany(payments, { ordered: true });
    res.status(201).json({ success: true, data: { imported: created.length } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.delete('/api/supplier-payments/:id', requireAuth, requirePermission('manage_internal_finance'), async (req, res) => {
  try {
    const payment = await SupplierPayment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu thanh toán.' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/next-code', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    res.json({ success: true, data: { code: await xemMaDonHangTiepTheo() } });
  } catch (error) {
    console.error('Lỗi tạo mã đơn hàng tiếp theo:', error.message);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Không thể tạo mã đơn hàng tiếp theo.' });
  }
});

async function luuKhachHangTuDonHang(data, customerId) {
  const name = String(data['Tên Khách Hàng'] || '').trim();
  if (!name) return null;

  if (customerId) {
    if (!mongoose.Types.ObjectId.isValid(customerId)) throw new Error('Khách hàng đã chọn không hợp lệ.');
    const selectedCustomer = await Customer.findById(customerId);
    if (selectedCustomer) return selectedCustomer;
  }

  const phone = String(data['SĐT'] || '').trim();
  const email = String(data.Email || '').trim().toLowerCase();
  const mst = String(data.MST || '').trim();
  const deliveryAddress = String(data['Địa Chỉ Giao Nhận'] || '').trim();
  const matchConditions = [];
  if (mst) matchConditions.push({ mst });
  const contactConditions = [];
  if (phone) contactConditions.push({ phone });
  if (email) contactConditions.push({ email });
  if (contactConditions.length) {
    matchConditions.push({
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      $or: contactConditions
    });
  }

  if (matchConditions.length) {
    const existingCustomer = await Customer.findOne({ isActive: { $ne: false }, $or: matchConditions });
    if (existingCustomer) {
      if (!existingCustomer.phone && phone) existingCustomer.phone = phone;
      if (!existingCustomer.email && email) existingCustomer.email = email;
      if (!existingCustomer.deliveryAddress && deliveryAddress) existingCustomer.deliveryAddress = deliveryAddress;
      if (!existingCustomer.mst && mst) existingCustomer.mst = mst;
      if (existingCustomer.isModified()) await existingCustomer.save();
      return existingCustomer;
    }
  }

  return taoKhachHangTuThongTinDon({ name, phone, email, mst, company: String(data['Tên Công Ty '] || '').trim(), deliveryAddress });
}

async function taoKhachHangTuThongTinDon(thongTin) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [latestCode] = await Customer.aggregate([
      { $match: { code: /^KH\d+$/ } },
      { $project: { number: { $convert: { input: { $substrCP: ['$code', 2, 20] }, to: 'long', onError: 0, onNull: 0 } } } },
      { $sort: { number: -1 } },
      { $limit: 1 }
    ]);
    const code = `KH${String(Number(latestCode?.number || 0) + 1).padStart(4, '0')}`;
    try {
      return await Customer.create({
        code,
        type: 'Khách Lẻ',
        ...thongTin,
        bankAccount: ''
      });
    } catch (error) {
      if (error.code !== 11000 || attempt === 2) throw error;
    }
  }
  return null;
}

function duocChonNhanVienQuanLy(user) {
  return user.roleId?.name === 'Admin' || String(user.username || '').toLowerCase() === 'khoinguyen29';
}

app.get('/api/orders/nhan-vien-dang-ky', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const user = await getAccessUser(req);
    if (!user?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const role = user.roleId;
    const phamVi = orderScope(user);
    const duocXemCaNhan = phamVi === 'own' && role?.permissions?.includes('manage_orders');
    if (!duocXemCaNhan && role?.name !== 'Admin' && role?.name !== 'Nhập Liệu' && !role?.permissions?.includes('view_employees')) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền tìm người đăng ký.' });
    }
    if (req.query.q !== undefined && (typeof req.query.q !== 'string' || req.query.q.length > 100)) {
      return res.status(400).json({ success: false, message: 'Từ khóa tìm nhân viên không hợp lệ.' });
    }
    const trang = req.query.page === undefined ? 1 : Number(req.query.page);
    if (typeof req.query.page === 'object' || !Number.isSafeInteger(trang) || trang < 1 || !Number.isSafeInteger((trang - 1) * 20)) {
      return res.status(400).json({ success: false, message: 'Trang nhân viên không hợp lệ.' });
    }
    const q = (req.query.q || '').trim();
    const filter = { isActive: { $ne: false } };
    if (q) filter.name = new RegExp(escapeRegex(q), 'i');
    if (phamVi === 'own') {
      if (!user.employeeId?._id) return res.status(403).json({ success: false, message: 'Tài khoản chưa liên kết với nhân viên. Vui lòng liên hệ quản trị viên.' });
      filter._id = user.employeeId._id;
    }
    const items = await Employee.find(filter).select('name').sort({ name: 1, _id: 1 }).skip((trang - 1) * 20).limit(21).lean();
    return res.json({ success: true, data: { items: items.slice(0, 20), hasMore: items.length > 20 } });
  } catch (loi) {
    console.error('Lỗi tìm người đăng ký:', loi.message);
    return res.status(500).json({ success: false, message: 'Không thể tìm người đăng ký.' });
  }
});

app.get('/api/orders/nhan-vien-quan-ly', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const user = await getAccessUser(req);
    if (!user?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const duocChon = duocChonNhanVienQuanLy(user);
    if (!duocChon && !user.employeeId?._id) return res.status(403).json({ success: false, message: 'Tài khoản chưa liên kết với nhân viên. Vui lòng liên hệ quản trị viên.' });
    const q = String(req.query.q || '').trim().slice(0, 100);
    const filter = { isActive: { $ne: false } };
    if (duocChon && q) filter.name = new RegExp(escapeRegex(q), 'i');
    if (!duocChon) filter._id = user.employeeId._id;
    const items = await Employee.find(filter).select('name').sort({ name: 1, _id: 1 }).limit(21).lean();
    return res.json({ success: true, data: { items: items.slice(0, 20), hasMore: items.length > 20, duocChon } });
  } catch (loi) {
    console.error('Lỗi tải nhân viên quản lý:', loi.message);
    return res.status(500).json({ success: false, message: 'Không thể tải nhân viên quản lý.' });
  }
});

app.post('/api/orders/khach-hang-moi', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const user = await getAccessUser(req);
    if (!user?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const fields = ['name', 'phone', 'email', 'mst', 'company', 'deliveryAddress'];
    if (fields.some(field => typeof req.body?.[field] !== 'string' || req.body[field].length > 500)) {
      return res.status(400).json({ success: false, message: 'Thông tin khách hàng không hợp lệ.' });
    }
    const thongTin = Object.fromEntries(fields.map(field => [field, req.body[field].trim()]));
    if (!thongTin.name) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên khách hàng.' });
    const maNhanVien = req.body.nhanVienQuanLy;
    if (typeof maNhanVien !== 'string' || !mongoose.isValidObjectId(maNhanVien)) return res.status(400).json({ success: false, message: 'Vui lòng chọn nhân viên quản lý hợp lệ.' });
    if (!duocChonNhanVienQuanLy(user) && String(user.employeeId?._id || '') !== maNhanVien) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ được chọn nhân viên liên kết với tài khoản của mình.' });
    }
    if (!await Employee.exists({ _id: maNhanVien, isActive: { $ne: false } })) return res.status(400).json({ success: false, message: 'Nhân viên quản lý không tồn tại hoặc đã ngừng hoạt động.' });
    thongTin.nhanVienQuanLy = maNhanVien;
    if (thongTin.phone) {
      const trung = await Customer.findOne({ isActive: { $ne: false }, name: new RegExp(`^${escapeRegex(thongTin.name)}$`, 'i'), phone: thongTin.phone }).select('_id').lean();
      if (trung) return res.status(409).json({ success: false, message: 'Đã có khách hàng cùng tên và số điện thoại. Vui lòng tìm và chọn khách hàng đó.' });
    }
    const khach = await taoKhachHangTuThongTinDon(thongTin);
    if (!khach) throw new Error('Không thể tạo mã khách hàng.');
    return res.status(201).json({ success: true, data: { _id: khach._id, code: khach.code, name: khach.name } });
  } catch (loi) {
    console.error('Lỗi tạo khách hàng từ đơn:', loi.message);
    if (loi.name === 'ValidationError') return res.status(400).json({ success: false, message: loi.message });
    return res.status(500).json({ success: false, message: 'Không xác định được kết quả tạo khách hàng. Vui lòng kiểm tra danh sách trước khi thử lại.' });
  }
});

const xuLyTaoDon = async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    if (!accessUser || !accessUser.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const data = { ...req.body };
    if (Object.keys(data).some(truong => truong === 'phieuUnc' || truong.startsWith('phieuUnc.'))) return res.status(400).json({ success: false, message: 'Vui lòng sử dụng chức năng quản lý UNC.' });
    const truongChoPhepKhiTaoDon = [
      'customerId', 'Địa Chỉ Công Ty', 'Địa Chỉ Giao Nhận', 'Email', 'Hình Thức Thanh Toán',
      'Hợp Đồng / GDK', 'Xác Nhận/ BBBG', 'GPKD', 'CCCD', 'File tong',
      'Thành Tiền', 'KH Thanh Toán', 'Thực Đóng NCC', 'Thực Đóng Công Ty', 'THỰC CÔNG NỢ CTY',
      'chiTietSanPham', 'chiTietSanPham.maSanPham', 'chiTietSanPham.tenSanPham',
      'chiTietSanPham.loaiSanPham', 'chiTietSanPham.ncc', 'chiTietSanPham.hinhThuc',
      'chiTietSanPham.trangThai', 'chiTietSanPham.donViTinh', 'chiTietSanPham.soLuong',
      'chiTietSanPham.giaBan', 'chiTietSanPham.giaDongCongTy', 'chiTietSanPham.giaNoNcc',
      'chiTietSanPham.phaiThuKhach', 'chiTietSanPham.thanhToanKhach', 'chiTietSanPham.thanhToanNcc'
    ];
    const truongCam = truongDonKhongDuocSua(accessUser, data, truongChoPhepKhiTaoDon);
    if (truongCam.length) return res.status(403).json({ success: false, message: `Không có quyền nhập các trường: ${truongCam.join(', ')}` });
    const coChiTiet = Object.prototype.hasOwnProperty.call(data, 'chiTietSanPham');
    if (Object.keys(data).some(truong => truong.startsWith('chiTietSanPham.'))) return res.status(400).json({ success: false, message: 'Thông tin chi tiết sản phẩm không hợp lệ.' });
    if (coChiTiet && (!hoTroNhieuSanPham || !daBatTinhNang(process.env.TAO_DON_NHIEU_SAN_PHAM_ENABLED))) return res.status(400).json({ success: false, message: 'Chức năng đơn nhiều sản phẩm chưa sẵn sàng.' });
    if (coChiTiet && ['Số Tiền UNC', 'Ngày Thanh Toán UNC', 'Nội Dung UNC', 'Tên Ngân Hàng UNC', 'Mã Giao Dịch UNC', 'Ảnh UNC', 'Tên File UNC', 'Ngày Upload UNC', 'Trạng Thái UNC', 'Ghi Chú Từ Chối UNC'].some(truong => Object.prototype.hasOwnProperty.call(data, truong))) {
      return res.status(400).json({ success: false, message: 'Vui lòng gửi phiếu UNC bằng chức năng quản lý UNC.' });
    }
    data.nguonTaoDon = 'web';
    const customerId = String(data.customerId || '').trim();
    delete data.customerId;
    if (req.path === '/api/orders/create-voi-khach-hang') {
      if (!accessUser.employeeId?.name?.trim() || accessUser.employeeId.isActive === false) {
        return res.status(400).json({ success: false, message: 'Tài khoản chưa liên kết với nhân viên đang hoạt động. Vui lòng liên hệ quản trị viên.' });
      }
      data['Nhân Viên Nhập Liệu'] = accessUser.employeeId.name.trim();
      if (!mongoose.isValidObjectId(customerId)) return res.status(400).json({ success: false, message: 'Vui lòng chọn khách hàng trong danh sách.' });
      const khach = await Customer.findOne({ _id: customerId, isActive: { $ne: false } }).select('name').lean();
      if (!khach) return res.status(409).json({ success: false, message: 'Khách hàng không tồn tại hoặc đã ngừng hoạt động. Vui lòng chọn lại.' });
      data.customerId = khach._id;
      data['Tên Khách Hàng'] = khach.name;
    }
    if (coChiTiet) {
      const { chiTietSanPham, tong } = await chuanBiDonNhieuSanPham(SanPham, data.chiTietSanPham);
      data.chiTietSanPham = chiTietSanPham;
      data['Thành Tiền'] = tong.tatCa.thanhTien;
      data['Thực Thu'] = tong.tatCa.phaiThuKhach;
      data['KH Thanh Toán'] = tong.tatCa.khachDaThanhToan;
      data['Còn lại'] = Math.max(0, tong.tatCa.phaiThuKhach - tong.tatCa.khachDaThanhToan);
      data['Thực Đóng Công Ty'] = tong.tatCa.thucDongCongTy;
      data['THỰC CÔNG NỢ CTY'] = tong.tatCa.congNoNcc;
      data['Thực Đóng NCC'] = tong.tatCa.thucDongCongTy;
    } else if (!quyenSuaCot(accessUser?.roleId, 'orders', 'Thực Đóng Công Ty') && String(data['Gói '] || '').trim() && typeof SanPham !== 'undefined' && typeof SanPham?.findOne === 'function') {
      const tenGoi = String(data['Gói ']).trim();
      const dieuKienGoi = {
        $or: [
          { 'TÊN SẢN PHẨM': tenGoi }, { 'Tên Sản Phẩm': tenGoi },
          { 'Gói ': tenGoi }, { Gói: tenGoi }
        ]
      };
      if (String(data.NCC || '').trim()) dieuKienGoi.NCC = String(data.NCC).trim();
      const goiSanPham = await SanPham.findOne(dieuKienGoi).select({
        'GIÁ SAU THUẾ': 1, 'SAU THUẾ': 1, 'Giá Sau Thuế': 1, 'Gia Sau Thuế': 1, 'Gia Sau Thue': 1,
        'THỰC ĐÓNG CÔNG TY': 1, 'Thực Đóng Công Ty': 1, 'Thực Đóng Cty': 1,
        'THỰC CÔNG NỢ CTY': 1, 'THỰC CÔNG NỢ CTY (VNĐ)': 1
      }).lean();
      if (goiSanPham) {
        const parseTien = val => typeof val === 'number' && Number.isFinite(val) ? val : (Number(String(val ?? '').replace(/[^0-9-]/g, '')) || 0);
        data['Thành Tiền'] = parseTien(goiSanPham['GIÁ SAU THUẾ'] ?? goiSanPham['SAU THUẾ'] ?? goiSanPham['Giá Sau Thuế'] ?? goiSanPham['Gia Sau Thuế'] ?? goiSanPham['Gia Sau Thue'] ?? data['Thành Tiền']);
        const chiPhi = parseTien(goiSanPham['THỰC ĐÓNG CÔNG TY'] ?? goiSanPham['Thực Đóng Công Ty'] ?? goiSanPham['Thực Đóng Cty'] ?? data['Thực Đóng Công Ty']);
        const congNo = parseTien(goiSanPham['THỰC CÔNG NỢ CTY'] ?? goiSanPham['THỰC CÔNG NỢ CTY (VNĐ)'] ?? data['THỰC CÔNG NỢ CTY']);
        data['Thực Đóng NCC'] = chiPhi;
        data['Thực Đóng Công Ty'] = chiPhi;
        data['THỰC CÔNG NỢ CTY'] = congNo;
      }
    }
    if (orderScope(accessUser) === 'own') data['Nhân Viên Đăng Ký'] = accessUser.employeeId?.name || accessUser.username;
    if (data['Ngày Đăng Ký']) {
      data['Ngày Đăng Ký'] = normalizeRegistrationDate(data['Ngày Đăng Ký']);
      data.registeredAtDate = parseRegistrationDate(data['Ngày Đăng Ký']);
    }
    data['Mã Đơn Hàng'] = await taoMaDonHangTiepTheo();
    if (!String(data.STT || '').trim()) data.STT = await generateUniqueStt();
    data.priceSnapshot = { 'Thành Tiền': data['Thành Tiền'] ?? null, 'Thực Đóng Công Ty': data['Thực Đóng Công Ty'] ?? data['THỰC CÔNG NỢ CTY'] ?? null, NCC: data.NCC || '', 'Gói ': data['Gói '] || '', capturedAt: new Date() };
    data['TÌNH TRẠNG'] = data['TÌNH TRẠNG'] || 'MỚI';
    data['Hình Thức Thanh Toán'] = chuanHoaTenHinhThucThanhToan(data['Hình Thức Thanh Toán']) || 'Chưa Thanh Toán';
    delete data._id;
    delete data.__v;
    if (typeof nenVaLuuCacTepDonHang === 'function') await nenVaLuuCacTepDonHang(data, data['Mã Đơn Hàng']);
    if (req.path !== '/api/orders/create-voi-khach-hang') await luuKhachHangTuDonHang(data, customerId);
    const order = await DonHang.create(data);
    await writeOrderAudit(order._id, req, 'CREATE', [{ field: '*', from: '', to: 'Đơn hàng được tạo' }]);
    res.status(201).json({ success: true, data: sanitizeOrderForUser(order.toObject(), accessUser) });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};
app.post('/api/orders/create', requireAuth, requirePermission('manage_orders'), xuLyTaoDon);
app.post('/api/orders/create-voi-khach-hang', requireAuth, requirePermission('manage_orders'), xuLyTaoDon);

app.put('/api/orders/update/:id', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    if (!accessUser || !accessUser.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    if (Object.keys(req.body).some(truong => truong === 'phieuUnc' || truong.startsWith('phieuUnc.'))) return res.status(400).json({ success: false, message: 'Vui lòng sử dụng chức năng quản lý UNC.' });
    if (Object.prototype.hasOwnProperty.call(req.body, 'chiTietSanPham') || Object.keys(req.body).some(truong => truong.startsWith('chiTietSanPham.'))) return res.status(400).json({ success: false, message: 'Chức năng đơn nhiều sản phẩm chưa sẵn sàng.' });
    const existingOrder = await DonHang.findById(req.params.id).lean();
    if (!existingOrder) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    if (orderScope(accessUser) === 'own' && String(existingOrder['Nhân Viên Đăng Ký'] || '').trim() !== String(accessUser.employeeId?.name || accessUser.username).trim()) return res.status(403).json({ success: false, message: 'Bạn chỉ được sửa đơn hàng của mình.' });
    const truongHeThongBoQua = ['_id', '__v', 'createdAt', 'updatedAt', 'Lịch Sử Đơn Hàng', 'historyReason', 'nguonTaoDon', 'trangThaiDonCu'];
    const truongCam = truongDonKhongDuocSua(accessUser, req.body, truongHeThongBoQua, existingOrder);
    if (truongCam.length) return res.status(403).json({ success: false, message: `Không có quyền sửa các trường: ${truongCam.join(', ')}` });
    const tongTheoDong = ['Thành Tiền', 'Thực Thu', 'KH Thanh Toán', 'Còn lại', 'Thực Đóng Công Ty', 'Thực Đóng NCC', 'THỰC CÔNG NỢ CTY'];
    if (Array.isArray(existingOrder.chiTietSanPham) && Object.keys(req.body).some(truong => tongTheoDong.some(tong => truong === tong || truong.startsWith(`${tong}.`)))) {
      return res.status(400).json({ success: false, message: 'Số tiền đơn nhiều sản phẩm được tính theo chi tiết; không thể sửa trực tiếp trên đơn tổng.' });
    }
    const uncFields = ['Số Tiền UNC', 'Ngày Thanh Toán UNC', 'Nội Dung UNC', 'Tên Ngân Hàng UNC', 'Mã Giao Dịch UNC', 'Ảnh UNC', 'Tên File UNC', 'Ngày Upload UNC'];
    if (orderScope(accessUser) === 'own' && uncFields.some(field => Object.prototype.hasOwnProperty.call(req.body, field) && req.body[field] !== existingOrder[field])) {
      return res.status(403).json({ success: false, message: 'Vui lòng cập nhật phiếu UNC trong chức năng quản lý UNC.' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'Trạng Thái UNC') && req.body['Trạng Thái UNC'] !== existingOrder['Trạng Thái UNC']) {
      return res.status(403).json({ success: false, message: 'Vui lòng duyệt hoặc từ chối phiếu UNC trong chức năng quản lý UNC.' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'Ghi Chú Từ Chối UNC') && req.body['Ghi Chú Từ Chối UNC'] !== existingOrder['Ghi Chú Từ Chối UNC']) {
      return res.status(403).json({ success: false, message: 'Không thể cập nhật ghi chú từ chối qua chức năng sửa đơn hàng.' });
    }
    if (existingOrder.lockedAt && accessUser.roleId?.name !== 'Admin' && !accessUser.roleId?.permissions?.includes('manage_financials')) return res.status(423).json({ success: false, message: 'Đơn hàng đã khóa, cần quyền quản lý để chỉnh sửa.' });
    const ignoredFields = new Set(['_id', '__v', 'updatedAt', 'createdAt', 'Lịch Sử Đơn Hàng', 'historyReason', 'nguonTaoDon', 'trangThaiDonCu']);
    const coTrangThai = Object.prototype.hasOwnProperty.call(req.body, 'TÌNH TRẠNG');
    const doiTrangThai = coTrangThai && existingOrder['TÌNH TRẠNG'] !== req.body['TÌNH TRẠNG'];
    if (coTrangThai && Object.prototype.hasOwnProperty.call(req.body, 'trangThaiDonCu') && req.body.trangThaiDonCu !== (existingOrder['TÌNH TRẠNG'] || 'Soạn Hồ Sơ')) return res.status(409).json({ success: false, message: 'Trạng thái đơn đã thay đổi. Vui lòng tải lại.' });
    if (doiTrangThai && /kích hoạt|thanh toán|hoàn tất/i.test(String(existingOrder['TÌNH TRẠNG'] || '')) && accessUser.roleId?.name !== 'Admin') return res.status(423).json({ success: false, message: 'Trạng thái đơn đã khóa, cần quyền quản lý để thay đổi.' });
    if (Object.prototype.hasOwnProperty.call(req.body, 'Hình Thức Thanh Toán')) {
      req.body['Hình Thức Thanh Toán'] = chuanHoaTenHinhThucThanhToan(req.body['Hình Thức Thanh Toán']) || 'Chưa Thanh Toán';
    }
    const changes = buildOrderHistoryChanges(existingOrder, req.body, ignoredFields);
    const historyReason = String(req.body.historyReason || '').trim().slice(0, 400);
    const historyEntry = changes.length || historyReason ? { orderId: existingOrder._id, changedBy: req.auth?.username || 'Hệ thống', changedAt: new Date(), action: 'UPDATE', module: 'orders', ip: req.ip || '', reason: historyReason, changes } : null;
    const updateData = { ...req.body };
    Object.keys(updateData).forEach(truong => {
      if (updateData[truong] === '__HAS_ATTACHMENT__') {
        delete updateData[truong];
        return;
      }
      if (!ignoredFields.has(truong) && !quyenSuaCot(accessUser?.roleId, 'orders', truong)) {
        delete updateData[truong];
      }
    });
    const capNhatConLaiTheoThanhToan = Object.prototype.hasOwnProperty.call(updateData, 'Thực Thu')
      && !Object.prototype.hasOwnProperty.call(updateData, 'KH Thanh Toán');
    if (capNhatConLaiTheoThanhToan) {
      const thucThu = Number(req.body['Thực Thu']);
      const daThanhToan = Number(existingOrder['KH Thanh Toán'] ?? 0);
      if (Number.isFinite(thucThu) && Number.isFinite(daThanhToan)) {
        updateData['Còn lại'] = Math.max(0, thucThu - daThanhToan);
      }
    }
    if (doiTrangThai && Array.isArray(existingOrder.chiTietSanPham)) {
      if (!hoTroNhieuSanPham) return res.status(503).json({ success: false, message: 'Chức năng đơn nhiều sản phẩm chưa được kích hoạt.' });
      if (!cacTrangThai.includes(req.body['TÌNH TRẠNG'])) return res.status(400).json({ success: false, message: 'Trạng thái sản phẩm không hợp lệ.' });
      const xem = locChiTietSanPhamTheoQuyen(existingOrder, accessUser).chiTietSanPham;
      if (!xem || xem.some(dong => !Object.prototype.hasOwnProperty.call(dong, 'trangThai'))) return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa trạng thái sản phẩm.' });
      if (existingOrder.chiTietSanPham.some(dong => !dong || typeof dong !== 'object' || Array.isArray(dong) || typeof dong.maDong !== 'string' || !dong.maDong || typeof dong.trangThai !== 'string') || new Set(existingOrder.chiTietSanPham.map(dong => dong.maDong)).size !== existingOrder.chiTietSanPham.length) {
        return res.status(409).json({ success: false, message: 'Chi tiết sản phẩm không hợp lệ. Vui lòng kiểm tra đơn hàng.' });
      }
      updateData.chiTietSanPham = existingOrder.chiTietSanPham.map(dong => ({ ...dong, trangThai: req.body['TÌNH TRẠNG'] }));
      if (historyEntry) historyEntry.changes.push(...existingOrder.chiTietSanPham.filter(dong => dong.trangThai !== req.body['TÌNH TRẠNG']).map(dong => ({ field: `chiTietSanPham.${dong.maDong}.trangThai`, from: dong.trangThai, to: req.body['TÌNH TRẠNG'] })));
    }
    if (updateData['Ngày Đăng Ký']) {
      updateData['Ngày Đăng Ký'] = normalizeRegistrationDate(updateData['Ngày Đăng Ký']);
      updateData.registeredAtDate = parseRegistrationDate(updateData['Ngày Đăng Ký']);
    }
    delete updateData['Lịch Sử Đơn Hàng'];
    delete updateData.historyReason;
    delete updateData.trangThaiDonCu;
    ['priceSnapshot', 'lockedAt', 'lockedReason', 'archivedAt', 'archivedBy', 'nguonTaoDon'].forEach(field => delete updateData[field]);
    if (typeof nenVaLuuCacTepDonHang === 'function') await nenVaLuuCacTepDonHang(updateData, existingOrder['Mã Đơn Hàng']);
    const updateOperation = { $set: updateData };
    const dongBoTrangThai = doiTrangThai && Array.isArray(existingOrder.chiTietSanPham);
    const ghiLichSuSauKhiLuu = dongBoTrangThai || capNhatConLaiTheoThanhToan;
    if (historyEntry && !ghiLichSuSauKhiLuu) await OrderHistory.create(historyEntry);
    const updatedOrder = dongBoTrangThai
      ? await DonHang.findOneAndUpdate({ $and: [
        buildOrderFilter({}, { scopeUser: accessUser }), { _id: existingOrder._id }, { chiTietSanPham: existingOrder.chiTietSanPham },
        existingOrder['TÌNH TRẠNG'] === undefined ? { 'TÌNH TRẠNG': { $exists: false } } : { 'TÌNH TRẠNG': existingOrder['TÌNH TRẠNG'] },
        existingOrder.lockedAt === undefined ? { lockedAt: { $exists: false } } : { lockedAt: existingOrder.lockedAt }
      ] }, updateOperation, { new: true })
      : capNhatConLaiTheoThanhToan
        ? await DonHang.findOneAndUpdate({ $and: [
          buildOrderFilter({}, { scopeUser: accessUser }), { _id: existingOrder._id },
          ...['KH Thanh Toán', 'Thực Thu', 'Còn lại', 'lockedAt'].map(truong => existingOrder[truong] === undefined
            ? { [truong]: { $exists: false } } : { [truong]: existingOrder[truong] })
        ] }, updateOperation, { new: true })
      : await DonHang.findByIdAndUpdate(req.params.id, updateOperation, { new: true });
    if (!updatedOrder) return res.status(409).json({ success: false, message: 'Đơn hàng đã thay đổi. Vui lòng tải lại và thử lại.' });
    if (historyEntry && ghiLichSuSauKhiLuu) {
      try { await OrderHistory.create(historyEntry); }
      catch (loi) {
        const thongBao = dongBoTrangThai
          ? 'Đã lưu trạng thái nhưng không ghi được lịch sử. Vui lòng tải lại đơn.'
          : 'Đã lưu đơn hàng nhưng không ghi được lịch sử. Vui lòng tải lại đơn.';
        console.error(thongBao, loi.message);
        return res.status(500).json({ success: false, message: thongBao });
      }
    }
    res.json({ success: true, data: sanitizeOrderForUser(updatedOrder.toObject(), accessUser) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

function laDonDaKichHoatHoacHoanTat(order) {
  if (!order) return false;
  if (order.lockedAt) return true;
  const kiemTraTrangThai = (giaTri) => {
    const s = String(giaTri || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd');
    if (!s) return false;
    if (/^(?!.*chua\s+kich\s+hoat).*kich\s+hoat/.test(s)) return true;
    if (/hoan\s+(tat|thanh)/.test(s)) return true;
    if (/thanh\s+toan/.test(s)) return true;
    return false;
  };
  if (kiemTraTrangThai(order['TÌNH TRẠNG'])) return true;
  if (Array.isArray(order.chiTietSanPham) && order.chiTietSanPham.some(dong => kiemTraTrangThai(dong.trangThai))) return true;
  return false;
}

app.delete('/api/orders/delete/:id', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const existingOrder = await DonHang.findById(req.params.id).lean();
    if (!existingOrder) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    if (orderScope(accessUser) === 'own' && String(existingOrder['Nhân Viên Đăng Ký'] || '').trim() !== String(accessUser.employeeId?.name || accessUser.username).trim()) return res.status(403).json({ success: false, message: 'Bạn chỉ được lưu trữ đơn hàng của mình.' });
    if (existingOrder.lockedAt || laDonDaKichHoatHoacHoanTat(existingOrder)) return res.status(423).json({ success: false, message: 'Đơn hàng đã kích hoạt hoặc hoàn tất, không thể xóa.' });
    await DonHang.findByIdAndUpdate(req.params.id, { $set: { archivedAt: new Date(), archivedBy: req.auth?.username || 'Hệ thống', 'TÌNH TRẠNG': 'ĐÃ HỦY' } });
    await writeOrderAudit(existingOrder._id, req, 'ARCHIVE', [{ field: 'archivedAt', from: '', to: new Date().toISOString() }], 'Lưu trữ thay vì xóa vật lý');
    res.json({ success: true, message: 'Đã lưu trữ đơn hàng' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/sync/google-sheet/status', requireAuth, (req, res) => {
  res.json({ success: true, data: layTrangThaiDongBoLenSheet() });
});

app.get('/api/sync/google-sheet/history', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const filter = { module: 'cong-cu:ghi-nhan-cap-nhat', action: 'cap-nhat' };
    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .select('actorUsername recordId after createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter)
    ]);
    res.json({
      success: true,
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Không thể tải lịch sử cập nhật Google Sheet.' });
  }
});

app.post('/api/sync/google-sheet', requireAuth, requireAdmin, async (req, res) => {
  try {
    const bang = req.body?.bang ? String(req.body.bang).trim() : undefined;
    const result = await dongBoTatCaLenGoogleSheet({ bang });
    if (!result?.skipped) {
      const tongThayDoi = Object.values(result?.tables || {}).reduce(
        (sum, t) => sum + (Number(t?.updated) || 0) + (Number(t?.appended) || 0),
        0
      );
      await ghiSauCapNhat(req, res, 'ghi-nhan-cap-nhat', 'cap-nhat', bang || 'tat-ca', tongThayDoi);
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// =========================================================
// 5. CÁC ROUTE API DÀNH CHO SANPHAM
// =========================================================
function buildProductNccFilter(ncc) {
  const normalizedNcc = String(ncc || '').trim();
  if (normalizedNcc.toUpperCase() === 'KHÁC') {
    return { $or: [{ NCC: null }, { NCC: /^\s*$/ }, { NCC: /^\s*KHÁC\s*$/i }] };
  }
  const escapedNcc = normalizedNcc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { NCC: new RegExp(`^\\s*${escapedNcc}\\s*$`, 'i') };
}

function buildProductFilter(q, ncc) {
  const conditions = [];
  if (ncc) conditions.push(buildProductNccFilter(ncc));
  if (q) {
    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'i');
    conditions.push({ $or: [
      { NCC: regex }, { 'TÊN SẢN PHẨM': regex }, { 'Tên Sản Phẩm': regex },
      { 'MÃ SẢN PHẨM': regex }, { 'Gói ': regex }, { Gói: regex },
      { 'LOẠI SẢN PHẨM': regex }, { 'Loại Sản Phẩm': regex }
    ] });
  }
  return conditions.length > 1 ? { $and: conditions } : (conditions[0] || {});
}

app.get('/api/sanpham/order-package-search', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    if (typeof req.query.q !== 'string' || req.query.q.trim().length < 2 || req.query.q.trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Từ khóa tìm gói phải có từ 2 đến 100 ký tự.' });
    }
    const tuKhoa = req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bieuThuc = new RegExp(tuKhoa, 'i');
    const trang = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const gioiHan = 20;
    const products = await SanPham.find({
      $and: [
        { $or: [
          { 'TÊN SẢN PHẨM': bieuThuc }, { 'Tên Sản Phẩm': bieuThuc },
          { 'Gói ': bieuThuc }, { Gói: bieuThuc }
        ] },
        taoBoLocSanPhamConApDung()
      ]
    }).select({
      'TÊN SẢN PHẨM': 1, 'Tên Sản Phẩm': 1, 'Gói ': 1, Gói: 1,
      'LOẠI SẢN PHẨM': 1, 'Loại Sản Phẩm': 1, NCC: 1, 'HÌnh Thức': 1, 'Hình Thức': 1,
      'GIÁ SAU THUẾ': 1, 'SAU THUẾ': 1, 'Giá Sau Thuế': 1, 'Gia Sau Thuế': 1, 'Gia Sau Thue': 1,
      'THỰC ĐÓNG CÔNG TY': 1, 'Thực Đóng Công Ty': 1, 'Thực Đóng Cty': 1,
      'THỰC CÔNG NỢ CTY': 1, 'THỰC CÔNG NỢ CTY (VNĐ)': 1
    }).sort({ 'TÊN SẢN PHẨM': 1, 'Tên Sản Phẩm': 1, _id: 1 })
      .skip((trang - 1) * gioiHan).limit(gioiHan + 1).maxTimeMS(10000).lean();
    const hasMore = products.length > gioiHan;
    if (hasMore) products.pop();
    res.json({ success: true, data: { products, page: trang, limit: gioiHan, hasMore } });
  } catch (error) {
    console.error('Lỗi tìm gói dịch vụ cho đơn hàng:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tìm gói dịch vụ.' });
  }
});

app.get('/api/sanpham/order-options', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const loaiSanPham = String(req.query.loaiSP || '').trim().slice(0, 100);
    const nhaCungCap = String(req.query.ncc || '').trim().slice(0, 100);
    const hinhThuc = String(req.query.hinhThuc || '').trim().slice(0, 100);
    const dieuKien = [];
    const bieuThucGiaTri = truong => truong.reduceRight((ketQua, tenTruong) => {
      const giaTri = { $trim: { input: { $convert: { input: { $ifNull: [`$${tenTruong}`, ''] }, to: 'string', onError: '', onNull: '' } } } };
      return { $cond: [{ $ne: [giaTri, ''] }, giaTri, ketQua] };
    }, 'Khác');
    const locTheoGiaTri = (truong, giaTri) => ({
      $expr: {
        $regexMatch: {
          input: bieuThucGiaTri(truong),
          regex: `^${giaTri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          options: 'i'
        }
      }
    });

    if (loaiSanPham) dieuKien.push(locTheoGiaTri(['LOẠI SẢN PHẨM', 'Loại Sản Phẩm'], loaiSanPham));
    if (nhaCungCap) dieuKien.push(locTheoGiaTri(['NCC'], nhaCungCap));
    if (hinhThuc) dieuKien.push(locTheoGiaTri(['HÌnh Thức', 'Hình Thức'], hinhThuc));

    // Chỉ lấy sản phẩm đang áp dụng
    dieuKien.push(taoBoLocSanPhamConApDung());
    const boLoc = dieuKien.length > 1 ? { $and: dieuKien } : (dieuKien[0] || {});
    const truongGiaTri = !loaiSanPham
      ? ['LOẠI SẢN PHẨM', 'Loại Sản Phẩm']
      : !nhaCungCap
        ? ['NCC']
        : !hinhThuc
          ? ['HÌnh Thức', 'Hình Thức']
          : null;

    if (truongGiaTri) {
      const coPhanTrang = req.query.page !== undefined && req.query.limit !== undefined;
      const trang = coPhanTrang ? Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1)) : 1;
      const gioiHan = coPhanTrang ? Math.min(20, Math.max(1, Number.parseInt(req.query.limit, 10) || 20)) : 100;
      const giaTri = await SanPham.aggregate([
        { $match: boLoc },
        { $project: { giaTri: bieuThucGiaTri(truongGiaTri) } },
        { $group: { _id: '$giaTri' } },
        { $sort: { _id: 1 } },
        { $skip: (trang - 1) * gioiHan },
        { $limit: gioiHan + 1 }
      ]).option({ maxTimeMS: 10000 });

      const values = giaTri.slice(0, gioiHan).map(item => String(item._id || '').trim()).filter(Boolean);
      return res.json({ success: true, data: { values, hasMore: giaTri.length > gioiHan, ...(coPhanTrang ? { page: trang, limit: gioiHan } : {}) } });
    }

    const page = Math.min(10000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const truongSanPham = {
      'TÊN SẢN PHẨM': 1, 'Tên Sản Phẩm': 1, 'Gói ': 1, Gói: 1,
      'GIÁ SAU THUẾ': 1, 'SAU THUẾ': 1, 'Giá Sau Thuế': 1, 'Gia Sau Thuế': 1, 'Gia Sau Thue': 1,
      'THỰC ĐÓNG CÔNG TY': 1, 'Thực Đóng Công Ty': 1, 'Thực Đóng Cty': 1,
      'THỰC CÔNG NỢ CTY': 1, 'THỰC CÔNG NỢ CTY (VNĐ)': 1
    };
    const products = await SanPham.find(boLoc)
      .select(truongSanPham)
      .sort({ 'TÊN SẢN PHẨM': 1, 'Tên Sản Phẩm': 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .maxTimeMS(10000)
      .lean();
    const hasMore = products.length > limit;
    if (hasMore) products.pop();
    res.json({ success: true, data: { products, page, limit, hasMore } });
  } catch (error) {
    console.error('Lỗi tải tùy chọn sản phẩm cho đơn hàng:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách sản phẩm cho đơn hàng.' });
  }
});

// Lightweight NCC counts for the grouped product management overview (no full docs)
app.get('/api/sanpham/ncc-summary', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    if (status && !['active', 'expired'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái sản phẩm không hợp lệ.' });
    }
    const filter = status === 'expired'
      ? taoBoLocSanPhamHetHan()
      : status === 'active'
        ? taoBoLocSanPhamConApDung()
        : {};
    const summary = await SanPham.aggregate([
      { $match: filter },
      { $group: { _id: { $trim: { input: { $toUpper: { $ifNull: ['$NCC', 'KHÁC'] } } } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    res.json({ success: true, data: summary.map(item => ({ ncc: item._id || 'KHÁC', count: item.count })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Paginated + searchable product listing for the management table (avoids loading the whole catalog)
app.get('/api/sanpham', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const q = String(req.query.q || '').trim();
    const ncc = String(req.query.ncc || '').trim();
    const status = String(req.query.status || '').trim();
    if (status && !['active', 'expired'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái sản phẩm không hợp lệ.' });
    }
    const boLocCoBan = buildProductFilter(q, ncc);
    const filter = status === 'expired'
      ? { $and: [boLocCoBan, taoBoLocSanPhamHetHan()] }
      : status === 'active'
        ? { $and: [boLocCoBan, taoBoLocSanPhamConApDung()] }
      : boLocCoBan;
    const [items, total] = await Promise.all([
      SanPham.find(filter).sort({ 'MÃ SẢN PHẨM': 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      SanPham.countDocuments(filter)
    ]);
    const accessUser = await getAccessUser(req);
    res.json({ success: true, data: items.map(item => sanitizeProductForUser(item, accessUser)), meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/sanpham/export', requireAuth, requirePermission('view_orders'), async (req, res) => {
  let cursor;
  try {
    const accessUser = await getAccessUser(req);
    const columns = cotXuatSanPham(accessUser);
    if (!columns.length) return res.status(403).json({ success: false, message: 'Vai trò chưa được cấp quyền xem cột sản phẩm để xuất.' });
    const q = String(req.query.q || '').trim();
    const ncc = String(req.query.ncc || '').trim();
    const truongXuat = Object.fromEntries([...new Set(columns.flatMap(column => column.fields))].map(field => [field, 1]));
    cursor = SanPham.find(buildProductFilter(q, ncc))
      .select(truongXuat)
      .sort({ 'MÃ SẢN PHẨM': 1, _id: 1 })
      .lean()
      .cursor({ batchSize: 500 });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Danh_Sach_Goi_Cuoc_San_Pham.xlsx"');
    res.setHeader('Cache-Control', 'no-store');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
    const worksheet = workbook.addWorksheet('DanhSachSanPham');
    worksheet.columns = columns.map(column => ({
      header: column.header, key: column.key,
      width: column.header.length > 25 ? 26 : 20,
      ...(column.key.includes('gia') || column.key.includes('thuc') ? { style: { numFmt: '#,##0' } } : {})
    }));
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF147D70' } };

    for await (const sanPham of cursor) {
      worksheet.addRow(Object.fromEntries(columns.map(column => [column.key, column.value(sanPham)]))).commit();
    }
    await workbook.commit();
  } catch (error) {
    console.error('Lỗi xuất danh sách sản phẩm:', error.message);
    if (cursor) await cursor.close().catch(cursorError => console.error('Lỗi đóng truy vấn xuất sản phẩm:', cursorError.message));
    if (res.headersSent) return res.destroy(error);
    res.status(500).json({ success: false, message: 'Không thể xuất danh sách sản phẩm.' });
  }
});

app.post('/api/sanpham/create', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const truongCam = truongSanPhamKhongDuocSua(accessUser, req.body);
    if (truongCam.length) return res.status(403).json({ success: false, message: `Không có quyền nhập các trường sản phẩm: ${truongCam.join(', ')}` });
    const sanPhamMoi = await SanPham.create(req.body);
    res.status(201).json({ success: true, data: sanitizeProductForUser(sanPhamMoi.toObject(), accessUser) });
  } catch (error) {
    console.error('Lỗi tạo sản phẩm:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/sanpham/import/validate', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const ketQua = kiemTraDuLieuNhapSanPham(req.body?.headers, req.body?.rows);
    if (ketQua.loi.length) {
      return res.status(400).json({
        success: false,
        message: `File Excel có ${ketQua.loi.length} lỗi. Hãy sửa hết lỗi rồi nhập lại.`,
        errors: ketQua.loi
      });
    }
    res.json({ success: true, data: { products: ketQua.sanPham, count: ketQua.sanPham.length } });
  } catch (error) {
    console.error('Lỗi kiểm tra file Excel sản phẩm:', error.message);
    res.status(400).json({ success: false, message: 'Không thể kiểm tra file Excel sản phẩm.' });
  }
});

app.post('/api/sanpham/import', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const danhSachSanPham = req.body?.products;
    if (!Array.isArray(danhSachSanPham) || danhSachSanPham.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách sản phẩm trống.' });
    }
    if (danhSachSanPham.length > SO_DONG_TOI_DA) {
      return res.status(400).json({ success: false, message: `Mỗi lần chỉ được nhập tối đa ${SO_DONG_TOI_DA} sản phẩm.` });
    }
    const accessUser = await getAccessUser(req);
    const truongCam = [...new Set(danhSachSanPham.flatMap(sanPham => truongSanPhamKhongDuocSua(accessUser, sanPham)))];
    if (truongCam.length) return res.status(403).json({ success: false, message: `Không có quyền nhập các trường sản phẩm: ${truongCam.join(', ')}` });
    const tieuDe = [...new Set(danhSachSanPham.flatMap(sanPham => sanPham && typeof sanPham === 'object' && !Array.isArray(sanPham) ? Object.keys(sanPham) : []))];
    const cacDong = danhSachSanPham.map(sanPham => tieuDe.map(tenTruong => sanPham?.[tenTruong]));
    const ketQua = kiemTraDuLieuNhapSanPham(tieuDe, cacDong);
    if (ketQua.loi.length) {
      return res.status(400).json({
        success: false,
        message: `Dữ liệu sản phẩm có ${ketQua.loi.length} lỗi, chưa nhập dữ liệu.`,
        errors: ketQua.loi
      });
    }

    await SanPham.insertMany(ketQua.sanPham, { ordered: true });
    res.json({ success: true, message: `Đã nhập thành công ${ketQua.sanPham.length} sản phẩm.` });
  } catch (error) {
    console.error('Lỗi nhập sản phẩm từ Excel:', error.message);
    res.status(500).json({ success: false, message: `Không thể nhập sản phẩm: ${error.message}` });
  }
});

function ngaySanPhamHopLe(giaTri) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giaTri)) return false;
  const [nam, thang, ngay] = giaTri.split('-').map(Number);
  const ngayUTC = new Date(Date.UTC(nam, thang - 1, ngay));
  return ngayUTC.getUTCFullYear() === nam && ngayUTC.getUTCMonth() === thang - 1 && ngayUTC.getUTCDate() === ngay;
}

app.patch('/api/sanpham/selected-dates', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const truongCam = truongSanPhamKhongDuocSua(accessUser, { 'Ngày áp dụng': req.body?.applyDate, 'Ngày kết thúc': req.body?.endDate });
    if (truongCam.length) return res.status(403).json({ success: false, message: `Không có quyền cập nhật các trường sản phẩm: ${truongCam.join(', ')}` });
    const maSanPhamDaChon = req.body?.ids;
    const ngayApDung = String(req.body?.applyDate || '').trim();
    const ngayKetThuc = String(req.body?.endDate || '').trim();
    if (!Array.isArray(maSanPhamDaChon) || maSanPhamDaChon.length === 0 || maSanPhamDaChon.length > 1000) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn từ 1 đến 1000 sản phẩm.' });
    }
    if (maSanPhamDaChon.some(maSanPham => !mongoose.Types.ObjectId.isValid(maSanPham))) {
      return res.status(400).json({ success: false, message: 'Danh sách sản phẩm không hợp lệ.' });
    }
    if (!ngaySanPhamHopLe(ngayApDung) || !ngaySanPhamHopLe(ngayKetThuc)) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập ngày áp dụng và ngày kết thúc hợp lệ.' });
    }
    if (ngayApDung > ngayKetThuc) {
      return res.status(400).json({ success: false, message: 'Ngày áp dụng phải trước hoặc bằng ngày kết thúc.' });
    }

    const ketQua = await SanPham.updateMany(
      { _id: { $in: [...new Set(maSanPhamDaChon)].map(maSanPham => new mongoose.Types.ObjectId(maSanPham)) } },
      { $set: { 'Ngày áp dụng': ngayApDung, 'Ngày kết thúc': ngayKetThuc } }
    );
    res.json({
      success: true,
      message: `Đã cập nhật ngày cho ${ketQua.modifiedCount} sản phẩm.`,
      data: { modifiedCount: ketQua.modifiedCount }
    });
  } catch (error) {
    console.error('Lỗi cập nhật ngày sản phẩm đã chọn:', error.message);
    res.status(500).json({ success: false, message: 'Không thể cập nhật ngày cho sản phẩm đã chọn.' });
  }
});

app.patch('/api/sanpham/group-dates', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const truongCam = truongSanPhamKhongDuocSua(accessUser, { 'Ngày áp dụng': req.body?.applyDate, 'Ngày kết thúc': req.body?.endDate });
    if (truongCam.length) return res.status(403).json({ success: false, message: `Không có quyền cập nhật các trường sản phẩm: ${truongCam.join(', ')}` });
    const ncc = String(req.body.ncc || '').trim();
    const applyDate = String(req.body.applyDate || '').trim();
    const endDate = String(req.body.endDate || '').trim();
    if (!ncc) return res.status(400).json({ success: false, message: 'Vui lòng chọn nhóm NCC.' });
    if (!ngaySanPhamHopLe(applyDate) || !ngaySanPhamHopLe(endDate)) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập ngày áp dụng và ngày kết thúc hợp lệ.' });
    }
    if (applyDate > endDate) {
      return res.status(400).json({ success: false, message: 'Ngày áp dụng phải trước hoặc bằng ngày kết thúc.' });
    }

    const result = await SanPham.updateMany(
      buildProductNccFilter(ncc),
      { $set: { 'Ngày áp dụng': applyDate, 'Ngày kết thúc': endDate } }
    );
    res.json({
      success: true,
      message: `Đã cập nhật ngày cho ${result.modifiedCount} sản phẩm.`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Lỗi cập nhật ngày nhóm sản phẩm:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});


// =========================================================
// 6. KHỞI CHẠY SERVER
// =========================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server Node.js đang chạy tại: http://localhost:${PORT}`);
});

app.get('/api/invoice/status', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const mbMat = String(req.query.MBMat || '').trim();
    if (!mbMat) return res.status(400).json({ success: false, message: 'Thiếu mã MBMat/GuideId để tra cứu hóa đơn' });

    const accessToken = await getSmartSignToken();

    const invoiceResponse = await axios.get('https://apiehd.smartsign.com.vn/api/HDon/GetInvoiceInfo', {
      params: { MBMat: mbMat },
      headers: { Authorization: `Token ${accessToken}` }
    });
    res.json({ success: true, data: invoiceResponse.data });
  } catch (error) {
    console.error('Lỗi tra cứu trạng thái SmartSign:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ success: false, message: error.response?.data?.error || error.message, data: error.response?.data || null });
  }
});

app.post('/api/invoice/sync-statuses', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const orderIds = Array.isArray(req.body.orderIds) ? [...new Set(req.body.orderIds.map(id => String(id || '').trim()).filter(Boolean))] : [];
    if (!orderIds.length || orderIds.length > 50 || orderIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ success: false, message: 'Danh sách đơn kiểm tra phải có từ 1 đến 50 mã hợp lệ.' });
    }
    const accessUser = await getAccessUser(req);
    if (!accessUser?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const scopeFilter = buildOrderFilter({}, { scopeUser: accessUser });
    const orders = await DonHang.find({ ...scopeFilter, _id: { $in: orderIds } })
      .select({ _id: 1, 'Mã Đơn Hàng': 1, 'SmartSign MBMat': 1, 'SmartSign PDF Available': 1 })
      .lean();
    const ordersById = new Map(orders.map(order => [String(order._id), order]));
    const checks = orderIds.map(orderId => ({ orderId, order: ordersById.get(orderId) }));
    let accessToken = '';
    if (checks.some(check => check.order?.['SmartSign MBMat'])) accessToken = await getSmartSignToken();
    const results = [];

    for (let index = 0; index < checks.length; index += 5) {
      const batch = checks.slice(index, index + 5);
      results.push(...await Promise.all(batch.map(async ({ orderId, order }) => {
        if (!order) return { orderId, status: 'error', message: 'Không tìm thấy đơn hàng trong phạm vi tài khoản.' };
        const mbMat = String(order['SmartSign MBMat'] || '').trim();
        if (!mbMat) return { orderId, status: 'skipped', message: 'Đơn hàng chưa có mã SmartSign.' };
        try {
          const response = await axios.get('https://apiehd.smartsign.com.vn/api/HDon/GetInvoiceInfo', {
            params: { MBMat: mbMat },
            headers: { Authorization: `Token ${accessToken}` },
            timeout: 20000
          });
          const invoice = extractSmartSignInvoice(response.data);
          const statusCode = Number(invoice.TTHDon);
          if (!Number.isFinite(statusCode)) return { orderId, status: 'error', message: 'SmartSign chưa trả mã trạng thái hóa đơn.' };
          const label = smartSignStatusLabel(statusCode);
          let pdfAvailable = Boolean(order['SmartSign PDF Available']);
          if (!pdfAvailable && statusCode >= 1) {
            try {
              await axios.get('https://apiehd.smartsign.com.vn/api/HDon/GetPDF', {
                params: { MBMat: mbMat },
                headers: { Authorization: `Token ${accessToken}` },
                responseType: 'arraybuffer',
                timeout: 20000
              });
              pdfAvailable = true;
            } catch (_) { /* The PDF icon stays hidden until SmartSign serves a file. */ }
          }
          const update = {
            'Trạng Thái Hóa Đơn': label,
            'SmartSign TTHDon': statusCode,
            'SmartSign MBMat': mbMat,
            'SmartSign MTCuu': invoice.MTCuu || '',
            'SmartSign SHDon': invoice.SHDon ?? '',
            'Xuất Hóa Đơn': true,
            'SmartSign InvoiceCreated': true,
            ...(pdfAvailable ? { 'SmartSign PDF Available': true } : {})
          };
          await DonHang.updateOne({ _id: new mongoose.Types.ObjectId(orderId) }, { $set: update });
          return { orderId, status: 'success', statusCode, label, mbMat, pdfAvailable };
        } catch (error) {
          return { orderId, status: 'error', message: `Không kiểm tra được SmartSign${error.response?.status ? ` (HTTP ${error.response.status})` : ''}.` };
        }
      })));
    }
    res.json({ success: true, data: results });
  } catch (error) {
    const providerStatus = Number(error.response?.status || 0);
    console.error('Lỗi batch trạng thái SmartSign:', { status: providerStatus || null, message: error.message });
    res.status(providerStatus === 401 || providerStatus === 403 ? 502 : 500).json({ success: false, message: providerStatus ? 'Không đăng nhập được SmartSign để kiểm tra trạng thái.' : 'Không thể đồng bộ trạng thái hóa đơn.' });
  }
});

app.post('/api/invoice/pdf-draft', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const invoicePayload = req.body.invoicePayload;
    const orderId = String(req.body.orderId || '').trim();
    if (!invoicePayload?.TTChung?.MBMat) return res.status(400).json({ success: false, message: 'Thiếu dữ liệu hóa đơn để tạo PDF.' });
    let order = null;
    if (orderId) {
      if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ.' });
      const accessUser = await getAccessUser(req);
      if (!accessUser?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
      order = await DonHang.findOne({ $and: [buildOrderFilter({}, { scopeUser: accessUser }), { _id: orderId }] }).select({ _id: 1, 'SmartSign MBMat': 1 }).lean();
      if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
      if (String(order['SmartSign MBMat'] || '') !== String(invoicePayload.TTChung.MBMat)) return res.status(409).json({ success: false, message: 'Mã hóa đơn không khớp với đơn hàng.' });
    }
    const accessToken = await getSmartSignToken();

    const pdfResponse = await axios.post('https://apiehd.smartsign.com.vn/api/HDon/GetPDFDraft', invoicePayload, {
      headers: { Authorization: `Token ${accessToken}`, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer'
    });
    const pdfBuffer = Buffer.from(pdfResponse.data);
    if (order) {
      let pdfFileRef = '';
      try {
        pdfFileRef = await luuTepNang({
          buffer: pdfBuffer,
          mimeType: 'application/pdf',
          fileName: `${invoicePayload.TTChung.MBMat}-draft.pdf`,
          prefix: 'hoadon'
        });
      } catch (err) {
        console.warn('Không thể lưu nén PDF mẫu SmartSign:', err.message);
      }
      await DonHang.updateOne({ _id: order._id, 'SmartSign MBMat': invoicePayload.TTChung.MBMat }, {
        $set: {
          'SmartSign PDF Available': true,
          'SmartSign PDF Payload': invoicePayload,
          ...(pdfFileRef ? { 'SmartSign PDF FileRef': pdfFileRef } : {})
        }
      });
    }
    res.set('Content-Type', pdfResponse.headers['content-type'] || 'application/pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Lỗi tạo PDF mẫu SmartSign:', error.response?.data || error.message);
    const message = error.response?.data ? Buffer.from(error.response.data).toString('utf8') : error.message;
    res.status(error.response?.status || 500).json({ success: false, message });
  }
});

app.get('/api/invoice/pdf', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const mbMat = String(req.query.MBMat || '').trim();
    const orderId = String(req.query.orderId || '').trim();
    if (!mbMat && !orderId) return res.status(400).json({ success: false, message: 'Thiếu mã đơn hàng hoặc MBMat để tải PDF.' });
    let order = null;
    if (orderId) {
      if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ.' });
      const accessUser = await getAccessUser(req);
      if (!accessUser?.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
      order = await DonHang.findOne({ $and: [buildOrderFilter({}, { scopeUser: accessUser }), { _id: orderId }] }).select({ _id: 1, 'Mã Đơn Hàng': 1, 'SmartSign MBMat': 1, 'SmartSign PDF Available': 1, 'SmartSign PDF Payload': 1, 'SmartSign PDF FileRef': 1 }).lean();
      if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
      if (mbMat && String(order['SmartSign MBMat'] || '') !== mbMat) return res.status(409).json({ success: false, message: 'MBMat không khớp với đơn hàng.' });
    }
    if (order?.['SmartSign PDF FileRef'] && req.query.refresh !== '1') {
      try {
        const cachedPdf = await docTepNang(order['SmartSign PDF FileRef']);
        if (cachedPdf?.buffer?.length) {
          res.set('Content-Type', 'application/pdf');
          res.set('X-SmartSign-PDF-Source', 'cached');
          return res.send(cachedPdf.buffer);
        }
      } catch (err) {
        console.warn('Không đọc được PDF hóa đơn đã lưu, tải lại từ SmartSign:', err.message);
      }
    }
    const resolvedMbMat = mbMat || String(order?.['SmartSign MBMat'] || '').trim();
    if (!resolvedMbMat) return res.status(404).json({ success: false, message: 'Đơn hàng chưa có mã SmartSign.' });
    const accessToken = await getSmartSignToken();
    let pdfResponse;
    let pdfSource = 'official';
    try {
      pdfResponse = await axios.get('https://apiehd.smartsign.com.vn/api/HDon/GetPDF', { params: { MBMat: resolvedMbMat }, headers: { Authorization: `Token ${accessToken}` }, responseType: 'arraybuffer', timeout: 20000 });
    } catch (officialError) {
      if (!order?.['SmartSign PDF Payload'] || [401, 403].includes(Number(officialError.response?.status))) throw officialError;
      pdfSource = 'draft';
      pdfResponse = await axios.post('https://apiehd.smartsign.com.vn/api/HDon/GetPDFDraft', order['SmartSign PDF Payload'], {
        headers: { Authorization: `Token ${accessToken}`, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
        timeout: 20000
      });
    }
    const pdfBuffer = Buffer.from(pdfResponse.data);
    if (order) {
      let pdfFileRef = '';
      try {
        pdfFileRef = await luuTepNang({
          buffer: pdfBuffer,
          mimeType: 'application/pdf',
          fileName: `${order['Mã Đơn Hàng'] || resolvedMbMat}-hoadon.pdf`,
          prefix: 'hoadon'
        });
      } catch (err) {
        console.warn('Không thể lưu nén PDF hóa đơn:', err.message);
      }
      await DonHang.updateOne({ _id: order._id }, { $set: { 'SmartSign PDF Available': true, ...(pdfFileRef ? { 'SmartSign PDF FileRef': pdfFileRef } : {}) } });
    }
    res.set('Content-Type', pdfResponse.headers['content-type'] || 'application/pdf');
    res.set('X-SmartSign-PDF-Source', pdfSource);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Lỗi tải PDF SmartSign:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ success: false, message: error.response?.data?.error || error.message });
  }
});

app.get('/api/orders/:id/history', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const order = await DonHang.findOne({
      $and: [buildOrderFilter({}, { scopeUser: accessUser }), { _id: req.params.id }]
    }).select({ _id: 1, MST: 1, 'Mã Đơn Hàng': 1 }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });

    const mstValues = order.MST ? getCaseFileMstQueryValues([order.MST]) : [];
    const duocXemHoSo = quyenMa(accessUser?.roleId, 'profiles:view');

    const [historyDesc, phieuGiaoNhan, dsHoSo] = await Promise.all([
      OrderHistory.find({ orderId: req.params.id }).sort({ changedAt: -1, _id: -1 }).limit(200).lean(),
      mstValues.length
        ? ChuyenPhatNhanh.find({ MST: { $in: mstValues } })
          .select({
            maSheet: 1, ID: 1, MST: 1, 'TÌNH TRẠNG': 1, 'NGÀY GỬI': 1, 'NGÀY THỰC HIỆN': 1,
            'Nhân Viên Thực Hiện': 1, 'ĐƠN VỊ CPN': 1, 'SỐ  BILL': 1, quyTrinhGiaoNhan: 1,
            ngayGuiDate: 1, ngayThucHienDate: 1, createdAt: 1, updatedAt: 1
          })
          .sort({ ngayGuiDate: -1, _id: -1 })
          .limit(20)
          .lean()
        : Promise.resolve([]),
      mstValues.length && duocXemHoSo
        ? HoSo.find({ MST: { $in: mstValues } })
          .select({
            ID: 1, MST: 1, 'TÌNH TRẠNG HỒ SƠ': 1, 'LOẠI': 1, 'Nơi Nộp': 1, 'Ngày Nộp': 1,
            quyTrinhHoSo: 1, createdAt: 1, updatedAt: 1
          })
          .sort({ ngayNhanDate: -1, _id: -1 })
          .limit(20)
          .lean()
        : Promise.resolve([])
    ]);

    const meaningfulHistory = historyDesc.slice().reverse().map(entry => {
      const changes = filterMeaningfulOrderHistoryChanges(entry.changes || []).filter(change => lichSuDuocXem(change, accessUser));
      const reason = accessUser?.roleId?.name === 'Admin' ? String(entry.reason || '').trim() : '';
      if (reason) changes.push({ field: 'Thao tác', from: '', to: reason });
      return { ...entry, changes };
    }).filter(entry => entry.changes.length > 0);

    const { items, counts } = phanNhomLichSuDonHang(
      meaningfulHistory,
      chuanHoaLichSuGiaoNhan(phieuGiaoNhan),
      chuanHoaLichSuHoSo(dsHoSo)
    );

    const category = NHOM_LICH_SU.includes(req.query.category) ? req.query.category : 'tong';
    const data = locLichSuTheoNhom(items, category);
    res.json({ success: true, data, counts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/support-logs', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const mst = String(req.query.mst || '').replace(/\D/g, '');
    if (!mst) return res.status(400).json({ success: false, message: 'Thiếu MST để tra cứu lịch sử hỗ trợ.' });
    const logs = await SupportLog.find({ mst }).sort({ createdAt: 1 }).lean();
    const allCodes = await SupportLog.find({ supportCode: /^HT\d+$/ }).select('supportCode').lean();
    let nextNumber = allCodes.reduce((max, item) => Math.max(max, Number(String(item.supportCode).replace(/\D/g, '')) || 0), 0) + 1;
    for (const log of logs) {
      if (log.supportCode) continue;
      log.supportCode = `HT${String(nextNumber++).padStart(4, '0')}`;
      await SupportLog.updateOne({ _id: log._id }, { $set: { supportCode: log.supportCode } });
    }
    logs.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/support-logs', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const mst = String(req.body.mst || '').replace(/\D/g, '');
    const request = String(req.body.request || '').trim();
    const resolution = String(req.body.resolution || '').trim();
    if (!mst || !request) return res.status(400).json({ success: false, message: 'MST và nội dung yêu cầu là bắt buộc.' });
    if (request.length > 600 || resolution.length > 600) return res.status(400).json({ success: false, message: 'Nội dung hỗ trợ không được vượt quá 600 ký tự.' });
    // Chặn trùng khi người dùng bấm Lưu 2 lần liên tiếp cho cùng nội dung
    const duplicateWindowStart = new Date(Date.now() - 15000);
    const existingDuplicate = await SupportLog.findOne({ mst, request, createdAt: { $gte: duplicateWindowStart } }).sort({ createdAt: -1 }).lean();
    if (existingDuplicate) return res.status(201).json({ success: true, data: existingDuplicate, duplicate: true });
    const supportCodes = await SupportLog.find({ supportCode: /^HT\d+$/ }).select('supportCode').lean();
    const latestNumber = supportCodes.reduce((max, item) => Math.max(max, Number(String(item.supportCode).replace(/\D/g, '')) || 0), 0);
    const supportCode = `HT${String(latestNumber + 1).padStart(4, '0')}`;
    const log = await SupportLog.create({
      supportCode,
      mst,
      company: String(req.body.company || '').trim().slice(0, 200),
      customerName: String(req.body.customerName || '').trim().slice(0, 200),
      customerPhone: String(req.body.customerPhone || '').trim().slice(0, 40),
      channel: String(req.body.channel || '').trim().slice(0, 80),
      type: String(req.body.type || 'Hỗ trợ kỹ thuật').trim().slice(0, 100),
      assignee: String(req.body.assignee || '').trim().slice(0, 200),
      request,
      resolution,
      status: String(req.body.status || 'Chưa xử lý').trim().slice(0, 100),
      deadline: String(req.body.deadline || '').trim().slice(0, 40),
      followUp: String(req.body.followUp || '').trim().slice(0, 180),
      createdBy: req.auth?.username || 'Hệ thống'
    });
    res.status(201).json({ success: true, data: log });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/support-logs/:id/activity', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung hỗ trợ.' });
    if (content.length > 1000) return res.status(400).json({ success: false, message: 'Nội dung hỗ trợ không được vượt quá 1.000 ký tự.' });
    const employee = String(req.body.employee || req.auth?.name || req.auth?.username || 'Hệ thống').trim();
    const activity = { employee, createdAt: new Date(), content };
    const nextStatus = ['Đang Hỗ trợ', 'Hoàn thành'].includes(req.body.status) ? req.body.status : 'Đang Hỗ trợ';
    const log = await SupportLog.findByIdAndUpdate(req.params.id, { $push: { activityHistory: activity }, $set: { status: nextStatus } }, { new: true }).lean();
    if (!log) return res.status(404).json({ success: false, message: 'Không tìm thấy lịch sử hỗ trợ.' });
    res.status(201).json({ success: true, data: activity });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders/:id/history/action', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const order = await DonHang.findOne({
      $and: [buildOrderFilter({}, { scopeUser: accessUser }), { _id: req.params.id }]
    }).select('_id').lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    const action = String(req.body.action || '').trim();
    const allowedFields = new Set(['Thao tác', 'Hỗ trợ Online', 'QR chuyển khoản', 'Thanh toán', 'Hóa đơn']);
    const field = allowedFields.has(req.body.field) ? req.body.field : 'Thao tác';
    const maxActionLength = field === 'Hỗ trợ Online' ? 2000 : 400;
    if (!action || action.length > maxActionLength) return res.status(400).json({ success: false, message: 'Nội dung thao tác không hợp lệ hoặc quá dài' });
    const history = await OrderHistory.create({
      orderId: order._id,
      changedBy: req.auth?.username || 'Hệ thống',
      changedAt: new Date(),
      changes: [{ field, from: '', to: action }]
    });
    res.status(201).json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});