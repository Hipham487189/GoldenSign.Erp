const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class PhanTu {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.value = '';
    this.listeners = {};
  }
  append(...phanTu) { this.children.push(...phanTu); }
  replaceChildren(...phanTu) { this.children = phanTu; }
  setAttribute(ten, giaTri) { this[ten] = giaTri; }
  addEventListener(ten, ham) { this.listeners[ten] = ham; }
  querySelectorAll(ten) {
    return this.children.flatMap(con => [...(ten === 'input' && con.type === 'number' ? [con] : []), ...con.querySelectorAll(ten)]);
  }
}

async function kiemTraGiaoDien() {
  const form = new PhanTu();
  const nut = new PhanTu();
  const dropzone = new PhanTu();
  const modal = new PhanTu();
  modal.querySelector = ten => ({
    '.payment-upload-form': form,
    '.modal-footer .btn-primary': nut,
    '.payment-upload-lich-su': form.children[0]?.children.find(item => item.className === 'payment-upload-lich-su')
  })[ten];
  modal.querySelectorAll = () => form.children[0].querySelectorAll('input');
  const tienUnc = new PhanTu();
  const ngay = { value: '2026-02-01' };
  const ghiChu = { value: '' };
  const tenTep = { textContent: '' };
  const don = {
    _id: 'don-1',
    chiTietSanPham: [{ maDong: 'a', tenSanPham: 'Gói A' }, { maDong: 'b', tenSanPham: 'Gói B' }]
  };
  let canhBao = '';
  let noiDungGui;
  let soPhieu = 0;
  let tep;
  const context = {
    window: {}, filteredOrders: [don], allOrders: [],
    API_URL: '/api/orders',
    closePaymentUploadModal() {}, escapeHtml: String, showPaymentUploadFile() {}, showAppToast() {}, applyFilters() {},
    alert: value => { canhBao = value; },
    fetch: async (url, options) => {
      if (options?.method === 'POST') noiDungGui = JSON.parse(options.body);
      return { ok: true, json: async () => ({ success: true, data: { items: [], hasMore: false, tongPhieu: soPhieu } }) };
    },
    document: {
      body: { insertAdjacentHTML() {} },
      getElementById: id => ({ paymentUploadModal: modal, paymentUploadAmount: tienUnc, paymentUploadDate: ngay, paymentUploadNote: ghiChu, paymentUploadFileName: tenTep, paymentUploadFile: { files: tep ? [tep] : [] } })[id],
      querySelector: () => dropzone,
      createElement: () => new PhanTu()
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'unc-upload.js'), 'utf8'), context);
  context.window.openPaymentUploadModal('don-1');
  assert.equal(nut.disabled, true);
  assert.equal(modal.dataset.nhieuSanPham, 'true');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nut.disabled, false);
  const khuVuc = form.children[0];
  const [dongA, dongB] = khuVuc.querySelectorAll('input');
  const ketQua = khuVuc.children[3];
  tienUnc.value = '800000';
  await context.window.submitPaymentUpload('don-1');
  assert.match(canhBao, /chọn ít nhất một dòng/);
  assert.equal(noiDungGui, undefined);
  dongA.value = '300000';
  dongB.value = '200000';
  dongB.listeners.input();
  assert.match(ketQua.textContent, /500\.000/);
  assert.match(ketQua.textContent, /300\.000/);
  dongB.value = '600000';
  dongB.listeners.input();
  assert.match(ketQua.textContent, /vượt/);
  dongB.value = '1.5';
  dongB.listeners.input();
  assert.match(ketQua.textContent, /số nguyên/);
  await context.window.submitPaymentUpload('don-1');
  assert.match(canhBao, /không hợp lệ/i);
  assert.equal(noiDungGui, undefined);
  dongB.value = '200000';
  await context.window.submitPaymentUpload('don-1');
  assert.deepEqual(noiDungGui.phanBo, [{ maDong: 'a', soTien: 300000 }, { maDong: 'b', soTien: 200000 }]);
  assert.equal(noiDungGui.soTien, 800000);
  nut.disabled = false;
  tep = { size: 3 * 1024 * 1024 + 1 };
  await context.window.submitPaymentUpload('don-1');
  assert.match(canhBao, /3MB/);
  tep = null;
  soPhieu = 5;
  context.window.openPaymentUploadModal('don-1');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nut.disabled, true);
}

async function kiemTraChanApiCu() {
  const ma = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const batDau = ma.indexOf("app.patch('/api/orders/unc/:id',");
  const ketThuc = ma.indexOf('\n});', batDau);
  assert.ok(batDau >= 0 && ketThuc > batDau);
  let xuLy;
  let daGhi = false;
  let don = { chiTietSanPham: [{ maDong: 'a' }] };
  const context = {
    app: { patch: (...args) => { xuLy = args[args.length - 1]; } },
    requireAuth() {},
    getAccessUser: async () => ({ roleId: { permissions: ['manage_orders'] } }),
    orderScope: () => 'own', buildOrderFilter: () => ({}),
    require: ten => require(ten === './services/quanLyPhieuUncNhieuSanPham' ? '../services/quanLyPhieuUncNhieuSanPham' : ten),
    DonHang: {
      findOne: () => ({ lean: async () => don }),
      findOneAndUpdate: async () => { daGhi = true; return { toObject: () => ({}) }; }
    },
    writeOrderAudit: async () => {},
    locChiTietSanPhamTheoQuyen: value => value
  };
  vm.runInNewContext(ma.slice(batDau, ketThuc + 4), context);
  let ketQua;
  const res = { status(maTrangThai) { this.statusCode = maTrangThai; return this; }, json(value) { ketQua = value; return this; } };
  await xuLy({ params: { id: 'don-1' }, body: {} }, res);
  assert.equal(res.statusCode, 409);
  assert.match(ketQua.message, /chưa sẵn sàng/);
  assert.equal(daGhi, false);
  don = { _id: 'don-cu' };
  await xuLy({ params: { id: 'don-cu' }, body: { 'Số Tiền UNC': 100, 'Ngày Thanh Toán UNC': '2026-01-01' } }, res);
  assert.equal(daGhi, true);
  assert.equal(ketQua.success, true);
  daGhi = false;
  await xuLy({ params: { id: 'don-cu' }, body: {
    'Số Tiền UNC': 100, 'Ngày Thanh Toán UNC': '2026-01-01',
    'Ảnh UNC': `data:application/pdf;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')}`
  } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(ketQua.message, /3MB/);
  assert.equal(daGhi, false);
}

Promise.resolve().then(kiemTraGiaoDien).then(kiemTraChanApiCu).then(() => {
  console.log('Đạt: xem thử phân bổ nhiều dòng và chặn API UNC cũ ghi đè.');
}).catch(loi => { console.error(loi); process.exitCode = 1; });
