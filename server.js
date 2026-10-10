const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const notificationRoutes = require('./routes/notifications');
const employeeRoutes = require('./routes/employees');
const customerRoutes = require('./routes/customers');
const chatRoutes = require('./routes/chat');
const authRoutes = require('./routes/auth');
const supportRoutes = require('./routes/support');
const bcrypt = require('bcryptjs');
const Role = require('./models/Role');
const User = require('./models/User');
const OrderHistory = require('./models/OrderHistory');
const SupportLog = require('./models/SupportLog');
const SupplierPayment = require('./models/SupplierPayment');
const SupplierDebtAdjustment = require('./models/SupplierDebtAdjustment');
const SupplierDebtSnapshot = require('./models/SupplierDebtSnapshot');
const EmployeePayment = require('./models/EmployeePayment');
const { requireAuth, requirePermission } = require('./middleware/auth');
require('dotenv').config();
const { syncBidirectional, getSyncStatus, startGoogleSheetSync, pushOrderToSheet } = require('./services/googleSheetSync');

const app = express();
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
  const loginResponse = await axios.post('https://apiehd.smartsign.com.vn/api/Authenticate/Signin', {
    UserName: process.env.SMARTSIGN_USER,
    Password: process.env.SMARTSIGN_PASS
  });
  const tokenData = loginResponse.data.AuthorizationToken || loginResponse.data;
  const token = tokenData.AccessToken || tokenData.token;
  if (!token) throw new Error('Không lấy được Access Token từ SmartSign');
  let expiresAt = Date.now() + 10 * 60 * 1000;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (payload.exp) expiresAt = payload.exp * 1000;
  } catch (_) { /* Use the short fallback cache duration. */ }
  smartSignTokenCache = { token, expiresAt };
  return token;
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'DATAGS_modern_youth_lux_smooth (1).html'));
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', requireAuth);
app.use('/api/sanpham', requireAuth);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/employees', requireAuth, employeeRoutes);
app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/chat', requireAuth, chatRoutes);
app.use('/api/support', requireAuth, supportRoutes);

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, message: 'Chưa cấu hình GEMINI_API_KEY trong file .env.' });
    const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'])];
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Vui lòng nhập câu hỏi.' });
    if (message.length > 4000) return res.status(400).json({ success: false, message: 'Câu hỏi không được vượt quá 4.000 ký tự.' });
    const context = String(req.body.context || '').slice(0, 12000);
    const prompt = `Bạn là trợ lý AI nội bộ của hệ thống DATAGS. Trả lời bằng tiếng Việt, ngắn gọn, chính xác. Chỉ sử dụng dữ liệu được cung cấp; nếu thiếu dữ liệu hãy nói rõ, không tự bịa.\n\nNếu người dùng yêu cầu giao/tạo việc cho nhân viên, hãy trả lời bình thường và thêm đúng một dòng cuối theo mẫu JSON này (không thêm markdown): __TASK_JSON__{"title":"...","description":"...","owner":"...","due":"YYYY-MM-DD hoặc để trống","priority":"Cao|Trung bình|Thấp"}. Chỉ thêm dòng này khi đủ thông tin; nếu thiếu tên nhân viên hoặc tên việc thì hỏi lại.\nNếu người dùng yêu cầu tạo/xuất hóa đơn cho một đơn hàng, hãy trả lời bình thường và thêm đúng một dòng cuối theo mẫu: __INVOICE_JSON__{"orderId":"...","orderCode":"...","company":"..."}. Chỉ thêm khi xác định được duy nhất đơn hàng từ dữ liệu.\n\nDữ liệu hệ thống:\n${context}\n\nCâu hỏi của người dùng:\n${message}`;
    let lastError = null;
    for (const model of models) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1200 } })
      });
      const result = await response.json();
      if (response.ok) {
        const answer = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
        if (answer) return res.json({ success: true, answer, model });
        lastError = new Error('Không nhận được nội dung trả lời từ Gemini.');
        continue;
      }
      lastError = new Error(result.error?.message || `Model ${model} không phản hồi.`);
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    }
    return res.status(503).json({ success: false, message: 'Các model AI miễn phí đang quá tải. Vui lòng thử lại sau ít phút.', detail: lastError?.message || '' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Không thể kết nối AI.' });
  }
});

// =========================================================
// 1. KẾT NỐI MONGODB ATLAS
// =========================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Admin:Bingo487189@cluster0.exe69sa.mongodb.net/DATAGS?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Đã kết nối thành công tới MongoDB Database: DATAGS');
    await seedAuthData();
    setTimeout(() => startGoogleSheetSync(), 15000);
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

async function generateNextOrderCode() {
  const orders = await DonHang.find({ 'Mã Đơn Hàng': /^DH\d+$/ }).select('Mã Đơn Hàng').lean();
  const maxNumber = orders.reduce((max, order) => {
    const number = Number(String(order['Mã Đơn Hàng']).slice(2));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `DH${String(maxNumber + 1).padStart(7, '0')}`;
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
  const roles = [{ name: 'Admin', description: 'Toàn quyền', permissions: all, dataScopes: { orders: 'all' } }, { name: 'Quản Lý', description: 'Quản lý vận hành', permissions: all.slice(0, 9), dataScopes: { orders: 'all' } }, { name: 'Nhân Viên', description: 'Xử lý đơn hàng', permissions: ['view_orders','manage_orders','view_customers'], dataScopes: { orders: 'own' } }, { name: 'Chỉ Xem', description: 'Chỉ xem dữ liệu', permissions: ['view_orders','view_debts','view_employees','view_notifications','view_customers'], dataScopes: { orders: 'own' } }];
  for (const role of roles) await Role.findOneAndUpdate({ name: role.name }, role, { upsert: true, new: true });
  const adminRole = await Role.findOne({ name: 'Admin' });
  if (adminRole && !(await User.findOne({ username: process.env.ADMIN_USERNAME || 'admin' }))) await User.create({ username: process.env.ADMIN_USERNAME || 'admin', passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 12), roleId: adminRole._id });
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
app.post('/api/invoice/push-smartsign', async (req, res) => {
  try {
    const { orderId, invoiceData } = req.body;
    if (!invoiceData || !orderId) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu hóa đơn hoặc mã đơn hàng để xuất hóa đơn.' });
    }
    const existingOrder = orderId ? await DonHang.findById(orderId).lean() : null;
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng để xuất hóa đơn.' });
    }
    const existingMbMat = String(existingOrder?.['SmartSign MBMat'] || '');
    const hasNewMbMatFormat = /^\d{10}-\d{6}(?:-\d+)?$/.test(existingMbMat);
    const hasAlreadyCreatedInvoice = Boolean(existingOrder?.['SmartSign InvoiceCreated'] === true || existingOrder?.['Xuất Hóa Đơn'] === true || existingOrder?.['Trạng Thái Hóa Đơn'] || existingMbMat);
    const accessToken = await getSmartSignToken();
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

    res.json({ 
      success: true,
      verified: true,
      message: 'Đã xuất hóa đơn sang SmartSign thành công!',
      data: pushResponse.data,
      mbMat
    });

  } catch (error) {
    console.error('Lỗi khi kết nối SmartSign:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi SmartSign: ' + (error.response?.data?.error || error.response?.data?.message || JSON.stringify(error.response?.data) || error.message) 
    });
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

function parseQueryDate(value, endOfDay = false) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getAccessUser(req) {
  return User.findById(req.auth?.userId).populate('roleId').populate('employeeId').lean();
}

function orderScope(user) {
  if (!user || user.roleId?.name === 'Admin' || user.roleId?.permissions?.includes('view_all_orders')) return 'all';
  return user.roleId?.dataScopes?.orders || (['Nhân Viên', 'Chỉ Xem'].includes(user.roleId?.name) ? 'own' : 'all');
}

function canViewFinancialOrderFields(user) {
  return user?.roleId?.name === 'Admin' || user?.roleId?.permissions?.some(permission => ['view_debts', 'manage_financials', 'manage_orders_financial'].includes(permission));
}

function sanitizeOrderForUser(order, user) {
  const safe = { ...order };
  const hiddenColumns = user?.hiddenColumns?.orders || user?.roleId?.hiddenColumns?.orders || [];
  hiddenColumns.forEach(field => delete safe[field]);
  if (!canViewFinancialOrderFields(user)) {
    ['Thực Thu', 'KH Thanh Toán', 'Còn lại', 'Thực Đóng Công Ty', 'THỰC CÔNG NỢ CTY', 'Lợi Nhuận Dự Kiến', 'Số Tiền UNC', 'Nội Dung UNC', 'Ảnh UNC', 'Tên File UNC'].forEach(field => delete safe[field]);
  }
  return safe;
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

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { 'Mã Đơn Hàng': searchRegex },
      { 'Tên Khách Hàng': searchRegex },
      { 'Tên Công Ty ': searchRegex },
      { SĐT: searchRegex },
      { 'Nhân Viên Đăng Ký': searchRegex },
      { 'TÌNH TRẠNG': searchRegex },
      { $expr: { $regexMatch: { input: { $toString: { $ifNull: ['$MST', ''] } }, regex: escapeRegex(search), options: 'i' } } }
    ];
  }
  if (employee && employee !== 'ALL') filter['Nhân Viên Đăng Ký'] = employee;
  if (status === 'NOT_ACTIVATED') filter['TÌNH TRẠNG'] = { $not: /kích hoạt/i };
  else if (status && status !== 'ALL') filter['TÌNH TRẠNG'] = status;
  if (paymentStatus && paymentStatus !== 'ALL') filter['Hình Thức Thanh Toán'] = paymentStatus;
  if (options.activatedOnly) filter['TÌNH TRẠNG'] = /kích hoạt/i;
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
      { $max: [0, orderMoneyExpression('Còn lại')] },
      { $max: [0, { $subtract: [orderMoneyExpression('Thành Tiền'), paidExpression] }] }
    ]
  };
}

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
    const hasFilter = Object.keys(filter).length > 0;
    const includeSummary = req.query.includeSummary === '1';
    const includeCount = req.query.includeCount !== '0' || includeSummary;
    const activatedFilter = { ...filter, 'TÌNH TRẠNG': /kích hoạt/i };
    const itemsQuery = DonHang.find(filter).sort({ [sortField]: sortDirection, _id: -1 }).skip(skip).limit(limit).maxTimeMS(15000).lean();
    const [items, total, summary, activatedCount] = await Promise.all([
      itemsQuery,
      includeCount ? (hasFilter ? DonHang.countDocuments(filter).maxTimeMS(15000) : DonHang.estimatedDocumentCount()) : Promise.resolve(null),
      includeSummary ? DonHang.aggregate([
        { $match: filter },
        { $group: { _id: null, totalAmount: { $sum: { $convert: { input: '$Thành Tiền', to: 'double', onError: 0, onNull: 0 } } } } }
      ]).option({ maxTimeMS: 15000 }) : Promise.resolve([]),
      includeCount ? DonHang.countDocuments(activatedFilter).maxTimeMS(15000) : Promise.resolve(null)
    ]);

    res.json({
      success: true,
      data: {
        items: items.map(order => sanitizeOrderForUser(order, accessUser)),
        page,
        limit,
        total,
        activatedCount,
        totalAmount: includeSummary ? (summary[0]?.totalAmount || 0) : null,
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
  const now = new Date();
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
        { $group: { _id: { ncc: { $ifNull: ['$NCC', 'Khác'] }, bucket: period === 'year' ? { $dateToString: { format: '%Y-%m', date: '$registeredAtDate' } } : { $dateToString: { format: '%Y-%m-%d', date: '$registeredAtDate' } } }, total: { $sum: money } } },
        { $sort: { '_id.ncc': 1, '_id.bucket': 1 } }
      ]).option({ maxTimeMS: 15000 })
    ]);
    const series = {};
    nccSeries.forEach(item => {
      const ncc = String(item._id.ncc || 'Khác').trim() || 'Khác';
      if (!series[ncc]) series[ncc] = {};
      series[ncc][item._id.bucket] = item.total || 0;
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
    res.json({ success: true, data: { items, page, limit, total, totalDebt: summary[0]?.totalDebt || 0, totalPages: Math.ceil(total / limit) || 1, hasMore: skip + items.length < total } });
  } catch (error) {
    console.error('Lỗi tải công nợ đơn hàng:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/ncc-debts', requirePermission('view_debts'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const filter = buildOrderFilter(req.query, { activatedOnly: true, scopeUser: accessUser });
    const paidExpression = { $convert: { input: '$Đã Thanh Toán NCC', to: 'double', onError: 0, onNull: 0 } };
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
      { $lookup: { from: 'SANPHAM', let: { ncc: '$NCC', packageName: { $ifNull: ['$Gói ', ''] } }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$NCC', '$$ncc'] }, { $or: [{ $eq: ['$TÊN SẢN PHẨM', '$$packageName'] }, { $eq: ['$Tên Sản Phẩm', '$$packageName'] }, { $eq: ['$Gói ', '$$packageName'] }] }] } } }, { $project: { cost: { $convert: { input: { $ifNull: ['$THỰC ĐÓNG CÔNG TY', '$Thực Đóng Công Ty'] }, to: 'double', onError: 0, onNull: 0 } } } }], as: 'productCost' } },
      { $addFields: { supplierCost: directCostExpression, supplierPaid: paidExpression, revenue: orderMoneyExpression('Thành Tiền'), tokenHold: tokenHoldExpression } },
      { $addFields: { remaining: { $max: [0, { $subtract: ['$supplierCost', '$supplierPaid'] }] } } },
      { $group: { _id: { $ifNull: ['$NCC', 'Khác'] }, count: { $sum: 1 }, cost: { $sum: '$supplierCost' }, tokenHold: { $sum: '$tokenHold' }, paid: { $sum: '$supplierPaid' }, remaining: { $sum: '$remaining' }, revenue: { $sum: '$revenue' }, newCount: { $sum: { $cond: [isNewRegistrationExpression, 1, 0] } } } },
      { $project: { _id: 0, ncc: '$_id', count: 1, cost: 1, tokenHold: 1, totalAmount: { $subtract: ['$cost', '$tokenHold'] }, paid: 1, remaining: 1, revenue: 1, newCount: 1 } },
      { $sort: { cost: -1, ncc: 1 } }
    ];
    const rows = await DonHang.aggregate(pipeline).option({ maxTimeMS: 20000 });
    const periodKey = getNccDebtPeriodKey(req.query);
    const adjustments = await SupplierDebtAdjustment.find({ periodKey }).lean();
    const adjustmentsBySupplier = new Map(adjustments.map(item => [item.supplier, item]));
    rows.forEach(row => {
      const adjustment = adjustmentsBySupplier.get(row.ncc || 'Khác');
      row.dossierFee = Number(adjustment?.dossierFee || 0);
      row.dsQui = Number(adjustment?.dsQui || 0);
      row.remaining = Math.max(0, Number(row.cost || 0) - Number(row.tokenHold || 0) - row.dossierFee - row.dsQui);
    });
    res.json({ success: true, data: { rows } });
  } catch (error) {
    console.error('Lỗi tính công nợ NCC:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/api/orders/ncc-debts/adjustments', requireAuth, requirePermission('manage_orders'), async (req, res) => {
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

app.post('/api/orders/ncc-debts/snapshots', requireAuth, requirePermission('manage_orders'), async (req, res) => {
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
    const filter = buildOrderFilter(req.query, { activatedOnly: true, scopeUser: accessUser });
    filter.NCC = ncc;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const skip = (page - 1) * limit;
    const directCostExpression = { $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: ['$THỰC CÔNG NỢ CTY', { $ifNull: ['$THỰC CÔNG NỢ CÔNG TY', '$Thực Đóng Công Ty'] }] } }, find: ',', replacement: '' } }, to: 'double', onError: 0, onNull: 0 } };
    const isNewRegistrationExpression = { $regexMatch: { input: { $toString: { $ifNull: ['$Hình Thức', ''] } }, regex: 'đăng ký mới', options: 'i' } };
    const supplierNameExpression = { $replaceAll: { input: { $toUpper: { $trim: { input: { $toString: { $ifNull: ['$NCC', ''] } } } } }, find: ' ', replacement: '' } };
    const tokenHoldExpression = { $cond: [isNewRegistrationExpression, { $switch: { branches: [
      { case: { $eq: [supplierNameExpression, 'VINA-GS'] }, then: 250000 },
      { case: { $eq: [supplierNameExpression, 'ONE-CA'] }, then: 169000 }
    ], default: 0 } }, 0] };
    const [items, total] = await Promise.all([
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
    res.json({ success: true, data: { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1, hasMore: skip + items.length < total } });
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
    const headers = ['Mã Đơn Hàng', 'Ngày Đăng Ký', 'Nhân Viên Đăng Ký', 'Tên Khách Hàng', 'SĐT', 'Tên Công Ty', 'MST', 'NCC', 'Gói Cước', 'Thành Tiền', 'Đã Thanh Toán', 'Còn Nợ', 'Tình Trạng'];
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="DonHang_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write(`\uFEFF${headers.map(csvValue).join(',')}\n`);
    const cursor = DonHang.find(filter).sort({ registeredAtDate: -1, _id: -1 }).lean().cursor();
    for await (const order of cursor) {
      const total = Number(order['Thành Tiền']) || 0;
      const paid = Number(order['KH Thanh Toán'] ?? order['Thực Thu']) || 0;
      const debt = order['Còn lại'] !== undefined ? Number(order['Còn lại']) || 0 : Math.max(0, total - paid);
      res.write([
        order['Mã Đơn Hàng'], order['Ngày Đăng Ký'], order['Nhân Viên Đăng Ký'], order['Tên Khách Hàng'], order.SĐT,
        order['Tên Công Ty '], order.MST, order.NCC, order['Gói '], total, paid, debt, order['TÌNH TRẠNG']
      ].map(csvValue).join(',') + '\n');
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
    const headers = ['Mã Đơn Hàng', 'Ngày Đăng Ký', 'Nhân Viên Đăng Ký', 'Tên Khách Hàng', 'SĐT', 'Tên Công Ty', 'MST', 'NCC', 'Gói Cước', 'Thành Tiền', 'Đã Thanh Toán', 'Còn Nợ', 'Tình Trạng'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="CongNo_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write(`\uFEFF${headers.map(csvValue).join(',')}\n`);
    const cursor = DonHang.find(filter).sort({ registeredAtDate: -1, _id: -1 }).lean().cursor();
    for await (const order of cursor) {
      const total = Number(order['Thành Tiền']) || 0;
      const paid = Number(order['KH Thanh Toán'] ?? order['Thực Thu']) || 0;
      const debt = order['Còn lại'] !== undefined ? Number(order['Còn lại']) || 0 : Math.max(0, total - paid);
      res.write([order['Mã Đơn Hàng'], order['Ngày Đăng Ký'], order['Nhân Viên Đăng Ký'], order['Tên Khách Hàng'], order.SĐT, order['Tên Công Ty '], order.MST, order.NCC, order['Gói '], total, paid, debt, order['TÌNH TRẠNG']].map(csvValue).join(',') + '\n');
    }
    res.end();
  } catch (error) {
    console.error('Lỗi export công nợ:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: error.message });
    else res.end();
  }
});

app.get('/api/orders/filter-options', requirePermission('view_orders'), async (req, res) => {
  try {
    const [years, employees, paymentMethods] = await Promise.all([DonHang.aggregate([
      { $project: { dateText: { $toString: { $ifNull: ['$Ngày Đăng Ký', ''] } } } },
      { $project: { year: { $cond: [
        { $regexMatch: { input: '$dateText', regex: '^\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4}$' } },
        { $arrayElemAt: [{ $split: ['$dateText', '/'] }, 2] },
        { $arrayElemAt: [{ $split: ['$dateText', '-'] }, 0] }
      ] } } },
      { $match: { year: { $regex: '^\\d{4}$' } } },
      { $group: { _id: '$year' } },
      { $sort: { _id: -1 } }
    ]).option({ maxTimeMS: 15000 }), DonHang.aggregate([
      { $match: { 'Nhân Viên Đăng Ký': { $exists: true, $nin: ['', null] } } },
      { $group: { _id: '$Nhân Viên Đăng Ký' } },
      { $sort: { _id: 1 } }
    ]).option({ maxTimeMS: 15000 }), DonHang.aggregate([
      { $match: { 'Hình Thức Thanh Toán': { $exists: true, $nin: ['', null] } } },
      { $group: { _id: '$Hình Thức Thanh Toán' } },
      { $sort: { _id: 1 } }
    ]).option({ maxTimeMS: 15000 })]);
    res.json({ success: true, data: { years: years.map(item => item._id).filter(year => Number(year) >= 2000 && Number(year) <= 2100), employees: employees.map(item => String(item._id).trim()).filter(Boolean), paymentMethods: paymentMethods.map(item => String(item._id).trim()).filter(Boolean) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/all', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const filter = buildOrderFilter({}, { scopeUser: accessUser });
    const orders = await DonHang.find(filter).limit(200).lean();
    res.json({ success: true, data: orders.map(order => sanitizeOrderForUser(order, accessUser)) });
  } catch (error) {
    console.error('Lỗi lấy đơn hàng:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/detail/:id', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const scopeFilter = buildOrderFilter({}, { scopeUser: accessUser });
    scopeFilter._id = req.params.id;
    const order = await DonHang.findOne(scopeFilter).maxTimeMS(15000).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    res.json({ success: true, data: sanitizeOrderForUser(order, accessUser) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/supplier-payments', requireAuth, requirePermission('view_debts'), async (req, res) => {
  try {
    const payments = await SupplierPayment.find({}).sort({ paymentDate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/employee-payments', requireAuth, requirePermission('view_debts'), async (req, res) => {
  try {
    const payments = await EmployeePayment.find({}).sort({ paymentDate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/employee-payments', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const employee = String(req.body.employee || '').trim();
    const paymentDate = String(req.body.paymentDate || '').trim();
    const amount = Number(req.body.amount);
    if (!employee || !paymentDate || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Vui lòng nhập nhân viên, ngày và số tiền hợp lệ.' });
    const imageData = String(req.body.imageData || '');
    if (imageData.length > 8 * 1024 * 1024) return res.status(400).json({ success: false, message: 'Hình ảnh thanh toán không được vượt quá 8MB.' });
    const payment = await EmployeePayment.create({
      employee,
      paymentDate,
      amount,
      enteredBy: String(req.body.enteredBy || req.auth?.username || '').trim(),
      paymentMethod: String(req.body.paymentMethod || '').trim(),
      imageData,
      imageName: String(req.body.imageName || '').trim(),
      note: String(req.body.note || '').trim(),
      createdBy: req.auth?.username || 'Hệ thống'
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/supplier-payments/orders', requireAuth, requirePermission('view_debts'), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const supplier = String(req.query.supplier || '').trim();
    const mst = String(req.query.mst || '').replace(/\D/g, '');
    const baseMatch = { 'TÌNH TRẠNG': /kích hoạt/i };
    if (supplier && supplier !== 'ALL') baseMatch.NCC = supplier;
    if (mst) baseMatch.MST = new RegExp(escapeRegex(mst));
    const directCostExpression = { $convert: { input: '$THỰC CÔNG NỢ CTY', to: 'double', onError: 0, onNull: 0 } };
    const paidExpression = { $convert: { input: '$Đã Thanh Toán NCC', to: 'double', onError: 0, onNull: 0 } };
    const pipeline = [
      { $match: baseMatch },
      { $lookup: { from: 'SANPHAM', let: { ncc: '$NCC', packageName: { $ifNull: ['$Gói ', ''] } }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$NCC', '$$ncc'] }, { $or: [{ $eq: ['$TÊN SẢN PHẨM', '$$packageName'] }, { $eq: ['$Tên Sản Phẩm', '$$packageName'] }, { $eq: ['$Gói ', '$$packageName'] }] }] } } }, { $project: { cost: { $convert: { input: { $ifNull: ['$THỰC ĐÓNG CÔNG TY', '$Thực Đóng Công Ty'] }, to: 'double', onError: 0, onNull: 0 } } } }], as: 'productCost' } },
      { $addFields: { supplierCost: { $cond: [{ $gt: [directCostExpression, 0] }, directCostExpression, { $ifNull: [{ $arrayElemAt: ['$productCost.cost', 0] }, 0] }] }, supplierPaid: paidExpression } },
      { $addFields: { remaining: { $max: [0, { $subtract: ['$supplierCost', '$supplierPaid'] }] } } },
      { $match: { $expr: { $gt: ['$remaining', 0] } } },
      { $sort: { registeredAtDate: 1, _id: 1 } },
      { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { productCost: 0 } }], meta: [{ $count: 'total' }] } }
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

app.post('/api/supplier-payments/allocate', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const supplier = String(req.body.supplier || '').trim();
    const amount = Number(req.body.amount);
    const paymentDate = String(req.body.paymentDate || '').trim();
    const note = String(req.body.note || '').trim();
    if (!supplier || !Number.isFinite(amount) || amount <= 0 || !paymentDate) return res.status(400).json({ success: false, message: 'Thiếu NCC, số tiền hoặc ngày thanh toán hợp lệ.' });
    const orders = await DonHang.find({ NCC: supplier, 'TÌNH TRẠNG': /kích hoạt/i }).sort({ registeredAtDate: 1, _id: 1 }).lean();
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
    const payment = await SupplierPayment.create({ supplier, paymentDate, amount: allocated, note, createdBy: req.auth?.username || 'Hệ thống' });
    res.status(201).json({ success: true, data: { payment, allocated, remainingAmount, updatedOrders } });
  } catch (error) {
    console.error('Lỗi phân bổ thanh toán NCC:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/supplier-payments', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const supplier = String(req.body.supplier || '').trim();
    const paymentDate = String(req.body.paymentDate || '').trim();
    const amount = Number(req.body.amount);
    if (!supplier || !paymentDate || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Vui lòng nhập NCC, ngày và số tiền hợp lệ.' });
    const imageData = String(req.body.imageData || '');
    if (imageData.length > 8 * 1024 * 1024) return res.status(400).json({ success: false, message: 'Hình ảnh thanh toán không được vượt quá 8MB.' });
    const payment = await SupplierPayment.create({
      supplier,
      paymentDate,
      amount,
      employee: String(req.body.employee || '').trim(),
      enteredBy: String(req.body.enteredBy || req.auth?.username || '').trim(),
      paymentMethod: String(req.body.paymentMethod || '').trim(),
      imageData,
      imageName: String(req.body.imageName || '').trim(),
      note: String(req.body.note || '').trim(),
      createdBy: req.auth?.username || 'Hệ thống'
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.delete('/api/supplier-payments/:id', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const payment = await SupplierPayment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu thanh toán.' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders/create', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    if (!accessUser || !accessUser.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const data = { ...req.body };
    const financialFields = ['Thành Tiền', 'Thực Thu', 'KH Thanh Toán', 'Còn lại', 'Thực Đóng Công Ty', 'THỰC CÔNG NỢ CTY', 'Lợi Nhuận Dự Kiến'];
    if (!canViewFinancialOrderFields(accessUser) && financialFields.some(field => Object.prototype.hasOwnProperty.call(data, field))) return res.status(403).json({ success: false, message: 'Bạn không có quyền nhập dữ liệu tài chính.' });
    if (orderScope(accessUser) === 'own') data['Nhân Viên Đăng Ký'] = accessUser.employeeId?.name || accessUser.username;
    if (data['Ngày Đăng Ký']) {
      data['Ngày Đăng Ký'] = normalizeRegistrationDate(data['Ngày Đăng Ký']);
      data.registeredAtDate = parseRegistrationDate(data['Ngày Đăng Ký']);
    }
    const requestedCode = String(data['Mã Đơn Hàng'] || data.maDonHang || '').trim();
    if (!requestedCode || await DonHang.exists({ 'Mã Đơn Hàng': requestedCode })) data['Mã Đơn Hàng'] = await generateNextOrderCode();
    else data['Mã Đơn Hàng'] = requestedCode;
    if (!String(data.STT || '').trim()) data.STT = await generateUniqueStt();
    data.priceSnapshot = { 'Thành Tiền': data['Thành Tiền'] ?? null, 'Thực Đóng Công Ty': data['Thực Đóng Công Ty'] ?? data['THỰC CÔNG NỢ CTY'] ?? null, NCC: data.NCC || '', 'Gói ': data['Gói '] || '', capturedAt: new Date() };
    data['TÌNH TRẠNG'] = data['TÌNH TRẠNG'] || 'MỚI';
    delete data._id;
    delete data.__v;
    const order = await DonHang.create(data);
    await writeOrderAudit(order._id, req, 'CREATE', [{ field: '*', from: '', to: 'Đơn hàng được tạo' }]);
    pushOrderToSheet(order._id).catch(error => console.error('Google Sheet order create sync error:', error.message));
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.put('/api/orders/update/:id', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    if (!accessUser || !accessUser.isActive) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động.' });
    const existingOrder = await DonHang.findById(req.params.id).lean();
    if (!existingOrder) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    if (orderScope(accessUser) === 'own' && String(existingOrder['Nhân Viên Đăng Ký'] || '').trim() !== String(accessUser.employeeId?.name || accessUser.username).trim()) return res.status(403).json({ success: false, message: 'Bạn chỉ được sửa đơn hàng của mình.' });
    if (existingOrder.lockedAt && accessUser.roleId?.name !== 'Admin' && !accessUser.roleId?.permissions?.includes('manage_financials')) return res.status(423).json({ success: false, message: 'Đơn hàng đã khóa, cần quyền quản lý để chỉnh sửa.' });
    const ignoredFields = new Set(['_id', '__v', 'updatedAt', 'createdAt', 'Lịch Sử Đơn Hàng']);
    const financialFields = ['Thành Tiền', 'Thực Thu', 'KH Thanh Toán', 'Còn lại', 'Thực Đóng Công Ty', 'THỰC CÔNG NỢ CTY', 'Lợi Nhuận Dự Kiến'];
    if (!canViewFinancialOrderFields(accessUser) && financialFields.some(field => Object.prototype.hasOwnProperty.call(req.body, field))) return res.status(403).json({ success: false, message: 'Bạn không có quyền thay đổi dữ liệu tài chính.' });
    if (existingOrder['TÌNH TRẠNG'] !== req.body['TÌNH TRẠNG'] && /kích hoạt|thanh toán|hoàn tất/i.test(String(existingOrder['TÌNH TRẠNG'] || '')) && accessUser.roleId?.name !== 'Admin') return res.status(423).json({ success: false, message: 'Trạng thái đơn đã khóa, cần quyền quản lý để thay đổi.' });
    const changes = Object.keys(req.body).filter(field => !ignoredFields.has(field) && JSON.stringify(existingOrder[field] ?? null) !== JSON.stringify(req.body[field] ?? null)).map(field => ({
      field,
      from: String(existingOrder[field] ?? ''),
      to: String(req.body[field] ?? '')
    }));
    const historyEntry = changes.length ? { orderId: existingOrder._id, changedBy: req.auth?.username || 'Hệ thống', changedAt: new Date(), action: 'UPDATE', module: 'orders', ip: req.ip || '', changes } : null;
    const updateData = { ...req.body };
    if (updateData['Ngày Đăng Ký']) {
      updateData['Ngày Đăng Ký'] = normalizeRegistrationDate(updateData['Ngày Đăng Ký']);
      updateData.registeredAtDate = parseRegistrationDate(updateData['Ngày Đăng Ký']);
    }
    delete updateData['Lịch Sử Đơn Hàng'];
    ['priceSnapshot', 'lockedAt', 'lockedReason', 'archivedAt', 'archivedBy'].forEach(field => delete updateData[field]);
    const updateOperation = { $set: updateData };
    if (historyEntry) await OrderHistory.create(historyEntry);
    const updatedOrder = await DonHang.findByIdAndUpdate(req.params.id, updateOperation, { new: true });
    pushOrderToSheet(req.params.id).catch(error => console.error('Google Sheet order update sync error:', error.message));
    res.json({ success: true, data: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/orders/delete/:id', requireAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const accessUser = await getAccessUser(req);
    const existingOrder = await DonHang.findById(req.params.id).lean();
    if (!existingOrder) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    if (orderScope(accessUser) === 'own' && String(existingOrder['Nhân Viên Đăng Ký'] || '').trim() !== String(accessUser.employeeId?.name || accessUser.username).trim()) return res.status(403).json({ success: false, message: 'Bạn chỉ được lưu trữ đơn hàng của mình.' });
    if (existingOrder.lockedAt || /kích hoạt|thanh toán|hoàn tất/i.test(String(existingOrder['TÌNH TRẠNG'] || ''))) return res.status(423).json({ success: false, message: 'Đơn hàng đã khóa, không thể xóa.' });
    await DonHang.findByIdAndUpdate(req.params.id, { $set: { archivedAt: new Date(), archivedBy: req.auth?.username || 'Hệ thống', 'TÌNH TRẠNG': 'ĐÃ HỦY' } });
    await writeOrderAudit(existingOrder._id, req, 'ARCHIVE', [{ field: 'archivedAt', from: '', to: new Date().toISOString() }], 'Lưu trữ thay vì xóa vật lý');
    res.json({ success: true, message: 'Đã lưu trữ đơn hàng' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/sync/google-sheet/status', requireAuth, (req, res) => {
  res.json({ success: true, data: getSyncStatus() });
});

app.post('/api/sync/google-sheet', requireAuth, async (req, res) => {
  try {
    const result = await syncBidirectional();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// =========================================================
// 5. CÁC ROUTE API DÀNH CHO SANPHAM
// =========================================================
app.get('/api/sanpham/all', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const products = await SanPham.find({}).lean();
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu SANPHAM:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lightweight NCC counts for the grouped product management overview (no full docs)
app.get('/api/sanpham/ncc-summary', requireAuth, requirePermission('view_orders'), async (req, res) => {
  try {
    const summary = await SanPham.aggregate([
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
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const q = String(req.query.q || '').trim();
    const ncc = String(req.query.ncc || '').trim();
    const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = {};
    if (ncc) filter['NCC'] = new RegExp(`^${escapeRegex(ncc)}$`, 'i');
    if (q) {
      const regex = new RegExp(escapeRegex(q), 'i');
      filter.$or = [
        { 'NCC': regex }, { 'TÊN SẢN PHẨM': regex }, { 'MÃ SẢN PHẨM': regex },
        { 'Gói ': regex }, { 'Gói': regex }, { 'LOẠI SẢN PHẨM': regex }
      ];
    }
    const [items, total] = await Promise.all([
      SanPham.find(filter).sort({ 'MÃ SẢN PHẨM': 1 }).skip((page - 1) * limit).limit(limit).lean(),
      SanPham.countDocuments(filter)
    ]);
    res.json({ success: true, data: items, meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
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

app.get('/api/invoice/status', requireAuth, async (req, res) => {
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

app.post('/api/invoice/pdf-draft', requireAuth, async (req, res) => {
  try {
    const accessToken = await getSmartSignToken();

    const pdfResponse = await axios.post('https://apiehd.smartsign.com.vn/api/HDon/GetPDFDraft', req.body.invoicePayload, {
      headers: { Authorization: `Token ${accessToken}`, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer'
    });
    res.set('Content-Type', pdfResponse.headers['content-type'] || 'application/pdf');
    res.send(Buffer.from(pdfResponse.data));
  } catch (error) {
    console.error('Lỗi tạo PDF mẫu SmartSign:', error.response?.data || error.message);
    const message = error.response?.data ? Buffer.from(error.response.data).toString('utf8') : error.message;
    res.status(error.response?.status || 500).json({ success: false, message });
  }
});

app.get('/api/invoice/pdf', requireAuth, async (req, res) => {
  try {
    const mbMat = String(req.query.MBMat || '').trim();
    if (!mbMat) return res.status(400).json({ success: false, message: 'Thiếu mã MBMat/GuideId để tải PDF' });
    const accessToken = await getSmartSignToken();
    const pdfResponse = await axios.get('https://apiehd.smartsign.com.vn/api/HDon/GetPDF', { params: { MBMat: mbMat }, headers: { Authorization: `Token ${accessToken}` }, responseType: 'arraybuffer' });
    res.set('Content-Type', pdfResponse.headers['content-type'] || 'application/pdf');
    res.send(Buffer.from(pdfResponse.data));
  } catch (error) {
    console.error('Lỗi tải PDF SmartSign:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ success: false, message: error.response?.data?.error || error.message });
  }
});

app.get('/api/orders/:id/history', requireAuth, async (req, res) => {
  try {
    const order = await DonHang.findById(req.params.id).select('_id').lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    const history = await OrderHistory.find({ orderId: req.params.id }).sort({ changedAt: 1 }).lean();
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/support-logs', requireAuth, async (req, res) => {
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

app.post('/api/support-logs', requireAuth, async (req, res) => {
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

app.post('/api/support-logs/:id/activity', requireAuth, async (req, res) => {
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

app.post('/api/orders/:id/history/action', requireAuth, async (req, res) => {
  try {
    const order = await DonHang.findById(req.params.id).select('_id').lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    const action = String(req.body.action || '').trim();
    const field = req.body.field === 'Hỗ trợ Online' ? 'Hỗ trợ Online' : 'Thao tác';
    const maxActionLength = field === 'Hỗ trợ Online' ? 2000 : 120;
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