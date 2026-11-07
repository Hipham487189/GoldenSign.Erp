const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mayChu = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const doanHam = mayChu.slice(mayChu.indexOf('function canViewFinancialOrderFields('), mayChu.indexOf('async function writeOrderAudit('));
assert.ok(doanHam.includes('function locChiTietSanPhamTheoQuyen('));
const nguCanh = {};
vm.runInNewContext(doanHam, nguCanh);

const dong = {
  maDong: 'dong-1', maSanPham: 'sp-1', tenSanPham: 'Gói A', loaiSanPham: 'Dịch vụ',
  ncc: 'NCC A', hinhThuc: 'Đăng ký mới', trangThai: 'Đã Kích Hoạt', donViTinh: 'Gói', soLuong: 2,
  giaBan: 100, giaDongCongTy: 70, giaNoNcc: 60, phaiThuKhach: 180,
  thanhToanKhach: [{ ngay: '2026-01-01', soTien: 40 }],
  thanhToanNcc: [{ ngay: '2026-01-02', soTien: 30, maPhieu: 'phieu-1' }],
  truongChuaDuocPhep: 'khong-tra-ve'
};
const don = { 'Mã Đơn Hàng': 'DH1', 'Thực Thu': 40, chiTietSanPham: [dong] };
const admin = { roleId: { name: 'Admin' } };
const quanLy = { roleId: { name: 'Quản lý', permissions: ['view_debts'] } };
const nhanVien = { roleId: { name: 'Nhân Viên', permissions: ['view_orders'] } };
const chiXem = { roleId: { name: 'Chỉ Xem', permissions: ['view_orders'] } };
const taiChinh = ['giaBan', 'giaDongCongTy', 'giaNoNcc', 'phaiThuKhach', 'thanhToanKhach', 'thanhToanNcc'];

for (const user of [nhanVien, chiXem, null]) {
  const ketQua = nguCanh.sanitizeOrderForUser(don, user);
  assert.equal(ketQua.chiTietSanPham[0].tenSanPham, 'Gói A');
  assert.equal(ketQua.chiTietSanPham[0].soLuong, 2);
  assert.equal(ketQua.chiTietSanPham[0].donViTinh, 'Gói');
  for (const truong of taiChinh) assert.equal(Object.hasOwn(ketQua.chiTietSanPham[0], truong), false);
  assert.equal(Object.hasOwn(ketQua.chiTietSanPham[0], 'truongChuaDuocPhep'), false);
}
for (const user of [admin, quanLy]) {
  const ketQua = nguCanh.sanitizeOrderForUser(don, user);
  for (const truong of taiChinh) assert.equal(Object.hasOwn(ketQua.chiTietSanPham[0], truong), true);
  assert.equal(ketQua.chiTietSanPham[0].thanhToanNcc[0].maPhieu, 'phieu-1');
}
for (const cot of ['KH Thanh Toán', 'Còn lại', 'Thành Tiền', 'chiTietSanPham.giaNoNcc']) {
  const user = { ...quanLy, hiddenColumns: { orders: [cot] } };
  const ketQua = nguCanh.locChiTietSanPhamTheoQuyen(don, user).chiTietSanPham[0];
  for (const truong of taiChinh) assert.equal(Object.hasOwn(ketQua, truong), false, cot);
}
const anNcc = { roleId: { name: 'Quản lý', permissions: ['view_debts'], hiddenColumns: { orders: ['NCC', 'Gói '] } } };
const dongDaLoc = nguCanh.locChiTietSanPhamTheoQuyen(don, anNcc).chiTietSanPham[0];
assert.equal(Object.hasOwn(dongDaLoc, 'ncc'), false);
assert.equal(Object.hasOwn(dongDaLoc, 'tenSanPham'), false);
assert.equal(Object.hasOwn(dongDaLoc, 'maSanPham'), false);
assert.equal(dongDaLoc.giaBan, 100);
assert.equal(Object.hasOwn(nguCanh.locChiTietSanPhamTheoQuyen(don, { ...admin, hiddenColumns: { orders: ['Đơn Vị Tính'] } }).chiTietSanPham[0], 'donViTinh'), false);
assert.equal(Object.hasOwn(nguCanh.locChiTietSanPhamTheoQuyen(don, { ...admin, hiddenColumns: { orders: ['chiTietSanPham'] } }), 'chiTietSanPham'), false);
assert.equal(Object.hasOwn(nguCanh.locChiTietSanPhamTheoQuyen({ chiTietSanPham: { giaBan: 100 } }, nhanVien), 'chiTietSanPham'), false);
assert.equal(nguCanh.locChiTietSanPhamTheoQuyen(don, { ...admin, hiddenColumns: { orders: ['chiTietSanPham'] } }).laDonNhieuSanPham, true);
assert.equal(nguCanh.locChiTietSanPhamTheoQuyen({ 'Gói ': 'Đơn cũ' }, nhanVien)['Gói '], 'Đơn cũ');
assert.equal(don.chiTietSanPham[0].giaBan, 100);

assert.match(mayChu, /items: items\.map\(order => locChiTietSanPhamTheoQuyen\(order, accessUser\)\)/);
assert.match(mayChu, /orders\.map\(order => locChiTietSanPhamTheoQuyen\(order, accessUser\)\)/);
assert.equal((mayChu.match(/locChiTietSanPhamTheoQuyen\(updatedOrder\.toObject\(\), accessUser\)/g) || []).length, 3);

async function kiemTraChanGhi() {
  for (const phuongThuc of ['post', 'put']) {
    const tenRoute = phuongThuc === 'post' ? '/api/orders/create' : '/api/orders/update/:id';
    const batDau = phuongThuc === 'post' ? mayChu.indexOf('const xuLyTaoDon = async') : mayChu.indexOf(`app.${phuongThuc}('${tenRoute}'`);
    const ketThuc = mayChu.indexOf(phuongThuc === 'post' ? '\n};' : '\n});', batDau);
    assert.ok(batDau >= 0 && ketThuc > batDau);
    let xuLy;
    const context = {
      app: { [phuongThuc]: (...args) => { xuLy = args[args.length - 1]; } },
      requireAuth() {}, requirePermission: () => () => {}, hoTroNhieuSanPham: false,
      getAccessUser: async () => ({ isActive: true }),
      DonHang: { findById: () => { throw new Error('Không được truy vấn đơn khi dữ liệu bị chặn.'); } }
    };
    vm.runInNewContext(phuongThuc === 'post' ? mayChu.slice(batDau, ketThuc + 3) + '\nxuLy = xuLyTaoDon;' : mayChu.slice(batDau, ketThuc + 4), context);
    if (phuongThuc === 'post') xuLy = context.xuLy;
    for (const body of [{ chiTietSanPham: [] }, { 'chiTietSanPham.0.giaBan': 1 }]) {
      let bodyTraVe;
      const res = { status(ma) { this.statusCode = ma; return this; }, json(value) { bodyTraVe = value; return this; } };
      await xuLy({ body, auth: {} }, res);
      assert.equal(res.statusCode, 400);
      assert.match(bodyTraVe.message, /chưa sẵn sàng|không hợp lệ/);
    }
  }
}

async function kiemTraDuongDoc() {
  for (const [tenRoute, user] of [
    ['/api/orders', nhanVien],
    ['/api/orders/debts', { ...quanLy, hiddenColumns: { orders: ['Thành Tiền'] } }],
    ['/api/orders/unc', nhanVien]
  ]) {
    const batDau = mayChu.indexOf(`app.get('${tenRoute}'`);
    const ketThuc = mayChu.indexOf('\n});', batDau);
    assert.ok(batDau >= 0 && ketThuc > batDau);
    let xuLy;
    const truyVan = {
      sort() { return this; }, skip() { return this; }, limit() { return this; },
      maxTimeMS() { return this; }, lean: async () => [don]
    };
    const context = {
      ...nguCanh,
      app: { get: (...args) => { xuLy = args[args.length - 1]; } },
      requireAuth() {}, requirePermission: () => () => {},
      getAccessUser: async () => ({ ...user, isActive: true }),
      buildOrderFilter: () => ({}), orderScope: () => 'own',
      orderSortFields: { registeredAt: 'registeredAtDate' },
      activatedOrderStatus: /kích hoạt/i, orderDebtExpression: () => ({}),
      DonHang: {
        find: () => truyVan,
        countDocuments: () => ({ maxTimeMS: async () => 1 }),
        aggregate: () => ({ option: async () => [don] })
      },
      console
    };
    vm.runInNewContext(mayChu.slice(batDau, ketThuc + 4), context);
    let body;
    const res = { status(ma) { this.statusCode = ma; return this; }, json(value) { body = value; return this; } };
    await xuLy({ query: { includeCount: '0' }, auth: {} }, res);
    assert.equal(body.success, true, tenRoute);
    const ketQua = (Array.isArray(body.data) ? body.data : body.data.items)[0];
    assert.equal(ketQua.chiTietSanPham[0].tenSanPham, 'Gói A');
    for (const truong of taiChinh) assert.equal(Object.hasOwn(ketQua.chiTietSanPham[0], truong), false, tenRoute);
  }
}

Promise.resolve().then(kiemTraChanGhi).then(kiemTraDuongDoc).then(() => console.log('Đạt: lọc quyền chi tiết sản phẩm tại các API và chặn ghi trực tiếp hoặc qua đường dẫn lồng.')).catch(loi => {
  console.error(loi);
  process.exitCode = 1;
});
