const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mayChu = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const batDau = mayChu.indexOf("app.put('/api/orders/update/:id'");
const ketThuc = mayChu.indexOf('\n});', batDau);
let handler;
let don = {};
let capNhat;
let ghiLichSu = 0;
const context = {
  app: { put: (...args) => { handler = args[args.length - 1]; } },
  requireAuth() {}, requirePermission: () => () => {},
  getAccessUser: async () => ({ isActive: true, roleId: { name: 'Admin' } }),
  orderScope: () => 'all',
  canViewFinancialOrderFields: () => true,
  DonHang: {
    findById: () => ({ lean: async () => don }),
    findByIdAndUpdate: async (id, update) => { capNhat = update.$set; return { toObject: () => ({ ...don, ...capNhat }) }; }
  },
  buildOrderHistoryChanges: () => [],
  OrderHistory: { create: async () => { ghiLichSu++; } },
  locChiTietSanPhamTheoQuyen: value => value,
  pushOrderToSheet: async () => {},
  console
};
vm.runInNewContext(mayChu.slice(batDau, ketThuc + 4), context);

async function goi(body) {
  let ketQua;
  const res = { statusCode: 200, status(ma) { this.statusCode = ma; return this; }, json(value) { ketQua = value; return this; } };
  await handler({ params: { id: 'id' }, body, auth: {} }, res);
  return { ma: res.statusCode, ketQua };
}

async function kiemTra() {
  don = { _id: 'id', chiTietSanPham: [{ maDong: 'a' }], 'TÌNH TRẠNG': 'Soạn Hồ Sơ' };
  const truong = ['Thành Tiền', 'Thực Thu', 'KH Thanh Toán', 'Còn lại', 'Thực Đóng Công Ty', 'Thực Đóng NCC', 'THỰC CÔNG NỢ CTY'];
  for (const ten of truong) {
    for (const key of [ten, `${ten}.x`]) {
      capNhat = undefined;
      const ketQua = await goi({ [key]: 10 });
      assert.equal(ketQua.ma, 400, key);
      assert.match(ketQua.ketQua.message, /theo chi tiết/);
      assert.equal(capNhat, undefined);
    }
  }
  assert.equal(ghiLichSu, 0);
  assert.equal((await goi({ 'Tên Khách Hàng': 'Mới', 'TÌNH TRẠNG': 'Soạn Hồ Sơ' })).ma, 200);
  assert.equal(capNhat['Tên Khách Hàng'], 'Mới');
  don = { _id: 'id', 'TÌNH TRẠNG': 'Soạn Hồ Sơ' };
  assert.equal((await goi({ 'KH Thanh Toán': 100, 'TÌNH TRẠNG': 'Soạn Hồ Sơ' })).ma, 200);
  assert.equal(capNhat['KH Thanh Toán'], 100);

  const html = fs.readFileSync(path.join(__dirname, '..', 'DATAGS_modern_youth_lux_smooth (1).html'), 'utf8');
  const ham = html.match(/    async function saveDetail\(\) \{[\s\S]*?(?=\n    function deleteDetail\(\))/);
  assert.ok(ham);
  assert.match(html, /input\.readOnly = true/);
  let body;
  const gui = {
    currentOrder: { _id: 'id', laDonNhieuSanPham: true, 'KH Thanh Toán': 100, chiTietSanPham: [{ maDong: 'a' }], CCCD: 'tep-moi' },
    truongTongTheoDong: truong,
    truongGoiTheoDong: ['NCC', 'Loại Sản Phẩm', 'Hình Thức', 'Gói '],
    tepChiTietDaSua: new Set(['CCCD']),
    document: { querySelector: () => null, querySelectorAll: () => [
      { dataset: { field: 'Tên Khách Hàng' }, value: 'Mới' },
      { dataset: { field: 'KH Thanh Toán' }, value: '999' },
      { dataset: { field: 'Gói ' }, value: 'khác' }
    ] },
    fetch: async (url, options) => { body = JSON.parse(options.body); return { json: async () => ({ success: true }) }; },
    API_URL: '/api/orders', canonicalMST: value => value,
    closeDetail() {}, refreshData: async () => {}, alert() {}
  };
  vm.createContext(gui);
  vm.runInContext(ham[0], gui);
  await gui.saveDetail();
  assert.equal(body['Tên Khách Hàng'], 'Mới');
  assert.equal(body.CCCD, 'tep-moi');
  assert.equal(Object.hasOwn(body, 'KH Thanh Toán'), false);
  assert.equal(Object.hasOwn(body, 'chiTietSanPham'), false);
  assert.equal(Object.hasOwn(body, 'Gói '), false);
  body = undefined;
  gui.document.querySelector = () => ({ dataset: {} });
  gui.coThanhToanChuaLuu = () => true;
  let canhBao = '';
  gui.showAppToast = message => { canhBao = message; };
  await gui.saveDetail();
  assert.equal(body, undefined);
  assert.match(canhBao, /thanh toán đang nhập/);
  console.log('Đạt: bảo vệ tổng đơn nhiều sản phẩm, giữ sửa thông tin và đơn cũ (mô phỏng).');
}

kiemTra().catch(loi => { console.error(loi); process.exitCode = 1; });
