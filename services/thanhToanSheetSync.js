const { google } = require('googleapis');
const path = require('path');
const SupplierPayment = require('../models/SupplierPayment');
const EmployeePayment = require('../models/EmployeePayment');

const SPREADSHEET_ID = process.env.THANH_TOAN_SHEET_ID || '1o4w9LaC11b9wbwSvaBg1mavJCzz27XNqmnJEdgek6Jg';
const INTERVAL_MS = Number(process.env.THANH_TOAN_SYNC_INTERVAL_MS || 120000);
const IMAGE_BATCH = Number(process.env.THANH_TOAN_IMAGE_BATCH || 30);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CREDENTIALS_FILE = path.join(__dirname, '..', 'credentials.json');

let timer = null;
let running = false;
let lastSync = { at: null, results: [], error: '' };

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function docTab(tab) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không đọc được tab ${tab}: HTTP ${res.status}`);
  const [header, ...rows] = parseCsv(await res.text());
  const index = Object.fromEntries(header.map((name, i) => [name.trim(), i]).filter(([name]) => name));
  return rows.filter(r => r.some(v => v.trim())).map(r => name => (r[index[name]] || '').trim());
}

// Sheet dùng M/D/YYYY; nếu số đầu > 12 thì hiểu là D/M/YYYY. Lưu dạng YYYY-MM-DD.
function chuanHoaNgay(value) {
  const m = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [, a, b, y] = m.map(Number);
  const [month, day] = a > 12 ? [b, a] : [a, b];
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function chuanHoaKy(thang, nam) {
  const m = Number(thang), y = Number(nam);
  return m >= 1 && m <= 12 && y >= 2000 ? `${y}-${String(m).padStart(2, '0')}` : '';
}

function chuanHoaTien(value) {
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

async function getDrive() {
  const scopes = ['https://www.googleapis.com/auth/drive.readonly'];
  const options = process.env.GOOGLE_CREDENTIALS_JSON
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON), scopes }
    : { keyFile: CREDENTIALS_FILE, scopes };
  return google.drive({ version: 'v3', auth: await new google.auth.GoogleAuth(options).getClient() });
}

// Ảnh AppSheet là đường dẫn trong Drive (VD TTNCC_Images/abc.jpg); tìm theo tên file rồi tải về dạng data URL.
async function taiAnhTuDrive(drive, duongDan) {
  const tenFile = path.posix.basename(duongDan).replace(/'/g, "\\'");
  const found = await drive.files.list({ q: `name = '${tenFile}' and trashed = false`, fields: 'files(id,mimeType,size)', pageSize: 1, supportsAllDrives: true, includeItemsFromAllDrives: true });
  const file = found.data.files?.[0];
  if (!file || Number(file.size) > MAX_IMAGE_BYTES) return '';
  const res = await drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  return `data:${file.mimeType || 'image/jpeg'};base64,${Buffer.from(res.data).toString('base64')}`;
}

const CAU_HINH = [
  {
    tab: 'TTNCC', Model: SupplierPayment, doiTuong: 'supplier',
    map: get => ({ supplier: get('NCC'), paymentPeriod: chuanHoaKy(get('Tháng Thanh Toán'), get('Năm Thanh Toán')) })
  },
  {
    tab: 'TTNhanVien', Model: EmployeePayment, doiTuong: 'employee',
    map: get => ({ employee: get('Tên Nhân Viên'), paymentPeriod: chuanHoaKy(get('Tháng'), get('Năm Thanh Toán')) })
  }
];

const TRUONG_SO_SANH = ['supplier', 'employee', 'amount', 'paymentDate', 'paymentPeriod', 'enteredBy', 'paymentMethod', 'note', 'imageName'];

async function dongBoTab({ tab, Model, doiTuong, map }, { apply, drive, giuAnh }) {
  const rows = await docTab(tab);
  const existing = new Map((await Model.find({ maGoogleSheet: { $ne: '' } }).lean()).map(d => [d.maGoogleSheet, d]));
  const themMoi = [], capNhat = [], loi = [];
  const dangCoAnh = new Set();

  rows.forEach((get, i) => {
    const id = get('ID');
    if (!id) return;
    const ma = `${tab}:${id}`;
    dangCoAnh.add(ma);
    const doc = {
      ...map(get),
      amount: chuanHoaTien(get('Số Tiền Thanh Toán')),
      paymentDate: chuanHoaNgay(get('Ngày')),
      paymentMethod: get('Hình Thức Thanh Toán'),
      enteredBy: get('Người Nhập'),
      note: get('Ghi Chú'),
      imageName: get('Hình Ảnh')
    };
    if (!doc[doiTuong] || !doc.paymentDate || !(doc.amount >= 0)) { loi.push(`dòng ${i + 2} (${id})`); return; }
    const cu = existing.get(ma);
    if (!cu) { themMoi.push({ ...doc, maGoogleSheet: ma, createdBy: 'Import Google Sheet' }); return; }
    const doiAnh = cu.imageName !== doc.imageName;
    const thayDoi = TRUONG_SO_SANH.some(k => doc[k] !== undefined && cu[k] !== doc[k]);
    if (thayDoi) capNhat.push({ _id: cu._id, set: doiAnh ? { ...doc, imageData: '' } : doc });
  });

  let daTaiAnh = 0, loiAnh = '';
  if (apply && themMoi.length) await Model.insertMany(themMoi, { ordered: false });
  if (apply && capNhat.length) await Model.bulkWrite(capNhat.map(u => ({ updateOne: { filter: { _id: u._id }, update: { $set: u.set } } })));

  if (apply && giuAnh) {
    const canAnh = await Model.find({ maGoogleSheet: { $in: [...dangCoAnh] }, imageName: { $ne: '' }, imageData: '' }).limit(IMAGE_BATCH);
    for (const item of canAnh) {
      try {
        const data = await taiAnhTuDrive(drive, item.imageName);
        if (data) { item.imageData = data; await item.save(); daTaiAnh++; }
      } catch (error) { loiAnh = error.message; break; }
    }
  }

  return { tab, doc: rows.length, themMoi: themMoi.length, capNhat: capNhat.length, loi: loi.length, dongLoi: loi.slice(0, 20), daTaiAnh, loiAnh };
}

async function syncThanhToan({ apply = true } = {}) {
  if (running) return lastSync;
  running = true;
  try {
    let drive = null;
    try { drive = await getDrive(); } catch (error) { drive = null; }
    const results = [];
    for (const cfg of CAU_HINH) results.push(await dongBoTab(cfg, { apply, drive, giuAnh: Boolean(drive) }));
    lastSync = { at: new Date().toISOString(), results, error: '' };
  } catch (error) {
    lastSync = { ...lastSync, at: new Date().toISOString(), error: error.message };
    throw error;
  } finally {
    running = false;
  }
  return lastSync;
}

function startThanhToanSheetSync() {
  if (timer || process.env.THANH_TOAN_SYNC_ENABLED === 'false') return;
  const chay = () => syncThanhToan().then(r => {
    const co = r.results.filter(x => x.themMoi || x.capNhat || x.daTaiAnh);
    if (co.length) console.log('Đồng bộ Thanh Toán từ Google Sheet:', JSON.stringify(co));
  }).catch(error => console.error('Lỗi đồng bộ Thanh Toán:', error.message));
  chay();
  timer = setInterval(chay, INTERVAL_MS);
}

module.exports = { syncThanhToan, startThanhToanSheetSync, getThanhToanSyncStatus: () => lastSync };
