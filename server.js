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
const bcrypt = require('bcryptjs');
const Role = require('./models/Role');
const User = require('./models/User');
const OrderHistory = require('./models/OrderHistory');
const SupportLog = require('./models/SupportLog');
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
app.use(express.json({ limit: '10mb' }));
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

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, message: 'Chưa cấu hình GEMINI_API_KEY trong file .env.' });
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Vui lòng nhập câu hỏi.' });
    if (message.length > 4000) return res.status(400).json({ success: false, message: 'Câu hỏi không được vượt quá 4.000 ký tự.' });
    const context = String(req.body.context || '').slice(0, 12000);
    const prompt = `Bạn là trợ lý AI nội bộ của hệ thống DATAGS. Trả lời bằng tiếng Việt, ngắn gọn, chính xác. Chỉ sử dụng dữ liệu được cung cấp; nếu thiếu dữ liệu hãy nói rõ, không tự bịa.\n\nNếu người dùng yêu cầu giao/tạo việc cho nhân viên, hãy trả lời bình thường và thêm đúng một dòng cuối theo mẫu JSON này (không thêm markdown): __TASK_JSON__{"title":"...","description":"...","owner":"...","due":"YYYY-MM-DD hoặc để trống","priority":"Cao|Trung bình|Thấp"}. Chỉ thêm dòng này khi đủ thông tin; nếu thiếu tên nhân viên hoặc tên việc thì hỏi lại.\nNếu người dùng yêu cầu tạo/xuất hóa đơn cho một đơn hàng, hãy trả lời bình thường và thêm đúng một dòng cuối theo mẫu: __INVOICE_JSON__{"orderId":"...","orderCode":"...","company":"..."}. Chỉ thêm khi xác định được duy nhất đơn hàng từ dữ liệu.\n\nDữ liệu hệ thống:\n${context}\n\nCâu hỏi của người dùng:\n${message}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }, null, 0)
    });
    const result = await response.json();
    if (!response.ok) return res.status(response.status).json({ success: false, message: result.error?.message || 'Gemini không phản hồi.' });
    const answer = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (!answer) return res.status(502).json({ success: false, message: 'Không nhận được nội dung trả lời từ Gemini.' });
    res.json({ success: true, answer });
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
DonHangSchema.index({ MST: 1 });
DonHangSchema.index({ 'Tên Khách Hàng': 1 });
DonHangSchema.index({ 'TÌNH TRẠNG': 1 });
DonHangSchema.index({ 'Ngày Đăng Ký': -1 });
DonHangSchema.index({ 'TÌNH TRẠNG': 1, 'Ngày Đăng Ký': -1 });
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

async function seedAuthData() {
  const all = ['view_orders','manage_orders','view_debts','view_employees','manage_employees','view_notifications','manage_notifications','view_customers','manage_customers','manage_roles','manage_users'];
  const roles = [{ name: 'Admin', description: 'Toàn quyền', permissions: all }, { name: 'Quản Lý', description: 'Quản lý vận hành', permissions: all.slice(0, 9) }, { name: 'Nhân Viên', description: 'Xử lý đơn hàng', permissions: ['view_orders','manage_orders','view_customers'] }, { name: 'Chỉ Xem', description: 'Chỉ xem dữ liệu', permissions: ['view_orders','view_debts','view_employees','view_notifications','view_customers'] }];
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

app.get('/api/orders', requirePermission('view_orders'), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const search = String(req.query.q || '').trim();
    const employee = String(req.query.employee || '').trim();
    const status = String(req.query.status || '').trim();
    const year = String(req.query.year || '').trim();
    const month = String(req.query.month || '').trim();
    const fromDate = String(req.query.fromDate || '').trim();
    const toDate = String(req.query.toDate || '').trim();
    const sortFields = {
      orderCode: 'Mã Đơn Hàng',
      registeredAt: 'Ngày Đăng Ký',
      customer: 'Tên Khách Hàng',
      status: 'TÌNH TRẠNG',
      amount: 'Thành Tiền'
    };
    const sortField = sortFields[req.query.sort] || 'Ngày Đăng Ký';
    const sortDirection = req.query.order === 'asc' ? 1 : -1;
    const filter = {};

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { 'Mã Đơn Hàng': searchRegex },
        { MST: searchRegex },
        { 'Tên Khách Hàng': searchRegex },
        { 'Tên Công Ty ': searchRegex },
        { SĐT: searchRegex },
        { 'Nhân Viên Đăng Ký': searchRegex },
        { 'TÌNH TRẠNG': searchRegex },
        { $expr: { $regexMatch: { input: { $toString: { $ifNull: ['$MST', ''] } }, regex: escapeRegex(search), options: 'i' } } }
      ];
    }

    if (employee && employee !== 'ALL') {
      filter['Nhân Viên Đăng Ký'] = employee;
    }
    if (status && status !== 'ALL') {
      filter['TÌNH TRẠNG'] = status;
    }
    if (year && year !== 'ALL') {
      filter['Ngày Đăng Ký'] = { ...(filter['Ngày Đăng Ký'] || {}), $regex: new RegExp(escapeRegex(year)) };
    }
    if (month && month !== 'ALL') {
      const monthNumber = Number.parseInt(month, 10);
      const monthPattern = String(monthNumber).padStart(2, '0');
      filter['Ngày Đăng Ký'] = { ...(filter['Ngày Đăng Ký'] || {}), $regex: new RegExp(`(?:^|[/.-])(?:0?${monthNumber})(?:[/.-])`) };
    }
    const orderDateField = { $toString: { $ifNull: ['$Ngày Đăng Ký', ''] } };
    const dateParts = { $split: [orderDateField, '/'] };
    const normalizedDateString = {
      $cond: [
        { $regexMatch: { input: orderDateField, regex: '^\\d{1,2}/\\d{1,2}/\\d{4}$' } },
        { $concat: [
          { $arrayElemAt: [dateParts, 2] }, '-',
          { $arrayElemAt: [dateParts, 1] }, '-',
          { $arrayElemAt: [dateParts, 0] }
        ] },
        orderDateField
      ]
    };
    const parsedOrderDate = { $convert: { input: normalizedDateString, to: 'date', onError: null, onNull: null } };
    if (fromDate || toDate) {
      filter.$expr = { $and: [] };
      if (fromDate) filter.$expr.$and.push({ $gte: [parsedOrderDate, new Date(`${fromDate}T00:00:00.000Z`)] });
      if (toDate) filter.$expr.$and.push({ $lte: [parsedOrderDate, new Date(`${toDate}T23:59:59.999Z`)] });
    }

    const skip = (page - 1) * limit;
    const hasFilter = Boolean(search || (employee && employee !== 'ALL') || (status && status !== 'ALL') || (year && year !== 'ALL') || (month && month !== 'ALL') || fromDate || toDate);
    const itemsQuery = sortField === 'Ngày Đăng Ký'
      ? DonHang.aggregate([
        { $match: filter },
        { $addFields: { __orderDateSort: parsedOrderDate } },
        { $sort: { __orderDateSort: sortDirection, _id: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { __orderDateSort: 0 } }
      ]).option({ maxTimeMS: 15000 })
      : DonHang.find(filter).sort({ [sortField]: sortDirection, _id: -1 }).skip(skip).limit(limit).maxTimeMS(15000).lean();
    const [items, total, summary] = await Promise.all([
      itemsQuery,
      hasFilter ? DonHang.countDocuments(filter).maxTimeMS(15000) : DonHang.estimatedDocumentCount(),
      DonHang.aggregate([
        { $match: filter },
        { $group: { _id: null, totalAmount: { $sum: { $convert: { input: '$Thành Tiền', to: 'double', onError: 0, onNull: 0 } } } } }
      ]).option({ maxTimeMS: 15000 })
    ]);

    res.json({
      success: true,
      data: {
        items,
        page,
        limit,
        total,
        totalAmount: summary[0]?.totalAmount || 0,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: skip + items.length < total
      }
    });
  } catch (error) {
    console.error('Lỗi tìm kiếm/phân trang đơn hàng:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/all', async (req, res) => {
  try {
    const orders = await DonHang.find({}).lean();
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Lỗi lấy đơn hàng:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/detail/:id', requirePermission('view_orders'), async (req, res) => {
  try {
    const order = await DonHang.findById(req.params.id).maxTimeMS(15000).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders/create', requireAuth, async (req, res) => {
  try {
    const data = { ...req.body };
    const requestedCode = String(data['Mã Đơn Hàng'] || data.maDonHang || '').trim();
    if (!requestedCode || await DonHang.exists({ 'Mã Đơn Hàng': requestedCode })) data['Mã Đơn Hàng'] = await generateNextOrderCode();
    else data['Mã Đơn Hàng'] = requestedCode;
    if (!String(data.STT || '').trim()) data.STT = await generateUniqueStt();
    delete data._id;
    delete data.__v;
    const order = await DonHang.create(data);
    pushOrderToSheet(order._id).catch(error => console.error('Google Sheet order create sync error:', error.message));
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.put('/api/orders/update/:id', requireAuth, async (req, res) => {
  try {
    const existingOrder = await DonHang.findById(req.params.id).lean();
    if (!existingOrder) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    const ignoredFields = new Set(['_id', '__v', 'updatedAt', 'createdAt', 'Lịch Sử Đơn Hàng']);
    const changes = Object.keys(req.body).filter(field => !ignoredFields.has(field) && JSON.stringify(existingOrder[field] ?? null) !== JSON.stringify(req.body[field] ?? null)).map(field => ({
      field,
      from: String(existingOrder[field] ?? ''),
      to: String(req.body[field] ?? '')
    }));
    const historyEntry = changes.length ? { orderId: existingOrder._id, changedBy: req.auth?.username || 'Hệ thống', changedAt: new Date(), changes } : null;
    const updateData = { ...req.body };
    delete updateData['Lịch Sử Đơn Hàng'];
    const updateOperation = { $set: updateData };
    if (historyEntry) await OrderHistory.create(historyEntry);
    const updatedOrder = await DonHang.findByIdAndUpdate(req.params.id, updateOperation, { new: true });
    pushOrderToSheet(req.params.id).catch(error => console.error('Google Sheet order update sync error:', error.message));
    res.json({ success: true, data: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/orders/delete/:id', requireAuth, async (req, res) => {
  try {
    await DonHang.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Đã xóa thành công' });
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
app.get('/api/sanpham/all', async (req, res) => {
  try {
    const products = await SanPham.find({});
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu SANPHAM:', error);
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