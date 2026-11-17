const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { daBatTinhNang } = require('../services/tinhNangDonNhieuSanPham');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const batDauTaoKhach = server.indexOf("app.post('/api/orders/khach-hang-moi'");
const ketThucTaoKhach = server.indexOf('\n});', batDauTaoKhach);
const batDauTaoDon = server.indexOf('const xuLyTaoDon = async');
const ketThucTaoDon = server.indexOf('\n};', batDauTaoDon);
assert.ok(batDauTaoKhach >= 0 && ketThucTaoKhach > batDauTaoKhach && batDauTaoDon >= 0 && ketThucTaoDon > batDauTaoDon);

let handlerKhach;
let handlerNhanVien;
let handlerNguoiDangKy;
let quyenNguoiDangKy;
let khachTonTai = null;
let khachDuocTao;
let donDuocTao;
let user = { isActive: true, username: 'nhanvien', roleId: { name: 'Nhân Viên' }, employeeId: { _id: '123' } };
let nhanVienHoatDong = true;
let locNhanVien;
let boQuaNhanVien;
let phamViDon = 'all';
const context = {
  app: { post: (...args) => { handlerKhach = args.at(-1); }, get: (...args) => {
    if (args[0] === '/api/orders/nhan-vien-dang-ky') { handlerNguoiDangKy = args.at(-1); quyenNguoiDangKy = args[2].permission; }
    else handlerNhanVien = args.at(-1);
  } },
  requireAuth() {}, requirePermission: permission => Object.assign(() => {}, { permission }),
  getAccessUser: async () => user,
  escapeRegex: value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  Customer: { findOne: () => ({ select() { return this; }, lean: async () => khachTonTai }) },
  Employee: {
    exists: async () => nhanVienHoatDong,
    find: filter => { locNhanVien = filter; return { select() { return this; }, sort() { return this; }, skip(value) { boQuaNhanVien = value; return this; }, limit(value) { assert.equal(value, 21); return this; }, lean: async () => Array.from({ length: 21 }, (_, i) => ({ _id: String(i), name: 'Tên' })) }; }
  },
  taoKhachHangTuThongTinDon: async data => { khachDuocTao = data; return { _id: '123', code: 'KH01', ...data }; },
  mongoose: { isValidObjectId: value => value === '123' },
  hoTroNhieuSanPham: true, daBatTinhNang, process: { env: { TAO_DON_NHIEU_SAN_PHAM_ENABLED: 'true' } },
  canViewFinancialOrderFields: () => true, orderScope: () => phamViDon,
  taoMaDonHangTiepTheo: async () => 'DH1', generateUniqueStt: async () => '1',
  DonHang: { create: async data => { donDuocTao = data; return { _id: 'order', ...data }; } },
  writeOrderAudit: async () => {}, pushOrderToSheet: async () => {},
  luuKhachHangTuDonHang: async () => { throw new Error('Không được tự tạo khách trên luồng mới'); },
  console
};
vm.createContext(context);
vm.runInContext(server.slice(server.indexOf('function duocChonNhanVienQuanLy('), server.indexOf("\napp.get('/api/orders/nhan-vien-quan-ly'")), context);
const batDauNhanVien = server.indexOf("app.get('/api/orders/nhan-vien-quan-ly'");
vm.runInContext(server.slice(batDauNhanVien, server.indexOf('\n});', batDauNhanVien) + 4), context);
vm.runInContext(server.slice(batDauTaoKhach, ketThucTaoKhach + 4), context);
vm.runInContext(server.slice(batDauTaoDon, ketThucTaoDon + 3) + '\nthis.xuLyTaoDon = xuLyTaoDon;', context);
const res = () => ({ status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });

async function kiemTra() {
  const body = { name: ' Khách A ', phone: '123', email: '', mst: '1234567890', company: 'Công ty', deliveryAddress: '', nhanVienQuanLy: '123' };
  let r = res();
  assert.equal(quyenNguoiDangKy, 'manage_orders');
  user.roleId = { name: 'Nhập Liệu', permissions: ['manage_orders'] };
  await handlerNguoiDangKy({ query: { q: 'a.*' } }, r);
  assert.equal(locNhanVien.isActive.$ne, false);
  assert.equal(locNhanVien.name.test('a.*'), true);
  assert.equal(locNhanVien.name.test('abc'), false);
  assert.equal(r.body.data.items.length, 20);
  assert.equal(r.body.data.hasMore, true);
  assert.equal(boQuaNhanVien, 0);
  r = res();
  await handlerNguoiDangKy({ query: { page: '2' } }, r);
  assert.equal(boQuaNhanVien, 20);
  assert.equal(r.body.data.items.length, 20);
  r = res();
  await handlerNguoiDangKy({ query: { page: '0' } }, r);
  assert.equal(r.code, 400);
  r = res();
  await handlerNguoiDangKy({ query: { q: 'x'.repeat(101) } }, r);
  assert.equal(r.code, 400);
  r = res();
  await handlerNguoiDangKy({ query: { q: ['An'] } }, r);
  assert.equal(r.code, 400);
  user.roleId = { name: 'Nhân Viên', permissions: ['manage_orders'] };
  r = res();
  await handlerNguoiDangKy({ query: {} }, r);
  assert.equal(r.code, 403);
  user.roleId.permissions.push('view_employees');
  r = res();
  await handlerNguoiDangKy({ query: {} }, r);
  assert.equal(r.body.success, true);
  assert.equal(locNhanVien.name, undefined);
  phamViDon = 'own';
  r = res();
  await handlerNguoiDangKy({ query: {} }, r);
  assert.equal(locNhanVien._id, '123');
  phamViDon = 'all';
  user.isActive = false;
  r = res();
  await handlerNguoiDangKy({ query: {} }, r);
  assert.equal(r.code, 403);
  user.isActive = true;
  user.roleId = { name: 'Nhân Viên' };
  r = res();
  await handlerNhanVien({ query: { q: 'a.*' } }, r);
  assert.equal(locNhanVien._id, '123');
  assert.equal(r.body.data.duocChon, false);
  assert.equal(r.body.data.items.length, 20);
  user.roleId.name = 'Admin';
  r = res();
  await handlerNhanVien({ query: { q: 'a.*' } }, r);
  assert.equal(r.body.data.duocChon, true);
  assert.equal(locNhanVien.name.test('a.*'), true);
  assert.equal(locNhanVien.name.test('abc'), false);
  user.roleId.name = 'Nhân Viên';
  r = res();
  await handlerKhach({ body }, r);
  assert.equal(r.code, 201);
  assert.equal(khachDuocTao.name, 'Khách A');
  assert.equal(khachDuocTao.mst, body.mst);
  assert.equal(khachDuocTao.nhanVienQuanLy, '123');
  r = res();
  await handlerKhach({ body: { ...body, nhanVienQuanLy: '' } }, r);
  assert.equal(r.code, 400);
  user.employeeId._id = 'khac';
  r = res();
  await handlerKhach({ body }, r);
  assert.equal(r.code, 403);
  user.username = 'khoinguyen29';
  r = res();
  await handlerKhach({ body }, r);
  assert.equal(r.code, 201);
  user.username = 'nguoidung';
  user.roleId.name = 'Admin';
  r = res();
  await handlerKhach({ body }, r);
  assert.equal(r.code, 201);
  nhanVienHoatDong = false;
  r = res();
  await handlerKhach({ body }, r);
  assert.equal(r.code, 400);
  nhanVienHoatDong = true;
  khachTonTai = { _id: 'khach-trung' };
  r = res();
  await handlerKhach({ body }, r);
  assert.equal(r.code, 409);
  user = { isActive: false };
  r = res();
  await handlerKhach({ body }, r);
  assert.equal(r.code, 403);
  user = { isActive: true, roleId: { name: 'Admin' } };

  r = res();
  await context.xuLyTaoDon({ path: '/api/orders/create-voi-khach-hang', body: { customerId: '123' } }, r);
  assert.equal(r.code, 400);
  assert.match(r.body.message, /chưa liên kết/);
  user.employeeId = { name: 'Người đăng nhập', isActive: false };
  r = res();
  await context.xuLyTaoDon({ path: '/api/orders/create-voi-khach-hang', body: { customerId: '123' } }, r);
  assert.equal(r.code, 400);
  user.employeeId.isActive = true;
  r = res();
  await context.xuLyTaoDon({ path: '/api/orders/create-voi-khach-hang', body: {} }, r);
  assert.equal(r.code, 400);
  khachTonTai = null;
  r = res();
  await context.xuLyTaoDon({ path: '/api/orders/create-voi-khach-hang', body: { customerId: '123' } }, r);
  assert.equal(r.code, 409);
  khachTonTai = { _id: '123', name: 'Tên trong danh sách' };
  r = res();
  await context.xuLyTaoDon({ path: '/api/orders/create-voi-khach-hang', body: { customerId: '123', 'Tên Khách Hàng': 'Tên sai', 'Nhân Viên Nhập Liệu': 'Nhân viên A' } }, r);
  assert.equal(r.code, 201);
  assert.equal(donDuocTao.customerId, '123');
  assert.equal(donDuocTao['Tên Khách Hàng'], 'Tên trong danh sách');
  assert.equal(donDuocTao['Nhân Viên Nhập Liệu'], 'Người đăng nhập');
  user.roleId = { name: 'Nhập Liệu', permissions: ['manage_orders'] };
  r = res();
  await context.xuLyTaoDon({ path: '/api/orders/create-voi-khach-hang', body: { customerId: '123', 'Nhân Viên Đăng Ký': 'Người khác' } }, r);
  assert.equal(r.code, 201);
  assert.equal(donDuocTao['Nhân Viên Đăng Ký'], 'Người khác');
  phamViDon = 'own';
  r = res();
  await context.xuLyTaoDon({ path: '/api/orders/create-voi-khach-hang', body: { customerId: '123', 'Nhân Viên Đăng Ký': 'Người khác' } }, r);
  assert.equal(r.code, 201);
  assert.equal(donDuocTao['Nhân Viên Đăng Ký'], 'Người đăng nhập');
  console.log('Đạt: tạo khách, quyền, kiểm tra khách và lưu liên kết trên đơn mới (MongoDB giả).');
}
kiemTra().catch(loi => { console.error(loi); process.exitCode = 1; });
