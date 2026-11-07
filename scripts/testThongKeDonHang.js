const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ngayHienTaiVietNam } = require('../services/ngayThongKe');
const { tinhBieuThuc } = require('./testTongHopChiTietDonHang');

assert.equal(ngayHienTaiVietNam(new Date('2026-11-07T16:59:59Z')).toISOString(), '2026-11-07T00:00:00.000Z');
assert.equal(ngayHienTaiVietNam(new Date('2026-11-07T17:00:00Z')).toISOString(), '2026-11-08T00:00:00.000Z');
assert.equal(ngayHienTaiVietNam(new Date('2026-12-31T17:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const batDau = source.indexOf('function getStatsRange(period)');
const ketThuc = source.indexOf("\napp.get('/api/orders/debts'", batDau);
assert.ok(batDau >= 0 && ketThuc > batDau);
const handlers = {};
const pipelines = [];
const user = { isActive: true, roleId: { name: 'Nhân Viên' } };
const context = {
  app: { get: (url, permission, handler) => { handlers[url] = handler; } },
  requirePermission: () => () => {},
  getAccessUser: async () => user,
  ngayHienTaiVietNam: () => ngayHienTaiVietNam(new Date('2026-11-07T20:06:00Z')),
  buildOrderFilter: (query, options) => {
    assert.equal(options.scopeUser, user);
    return { archivedAt: null, 'Nhân Viên Đăng Ký': 'Nhân viên A' };
  },
  canViewFinancialOrderFields: () => false,
  orderMoneyExpression: field => ({ $convert: { input: `$${field}`, to: 'double', onError: 0, onNull: 0 } }),
  orderDebtExpression: () => 0,
  DonHang: { aggregate: pipeline => {
    pipelines.push(pipeline);
    return { option: async () => [] };
  } },
  console
};
vm.runInNewContext(source.slice(batDau, ketThuc), context);
function response() {
  return { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
}
async function kiemTra() {
  const res = response();
  await handlers['/api/orders/stats']({ query: { period: 'day' } }, res);
  assert.equal(res.body.success, true);
  assert.equal(pipelines[0][0].$match.registeredAtDate.$gte.toISOString(), '2026-11-08T00:00:00.000Z');
  assert.equal(pipelines[0][0].$match.registeredAtDate.$lt.toISOString(), '2026-11-09T00:00:00.000Z');
  assert.equal(pipelines[0][0].$match.$and[1]['Nhân Viên Đăng Ký'], 'Nhân viên A');
  const bieuThuc = pipelines[3][1].$project.dongDoanhThu;
  const nhieuDong = tinhBieuThuc(bieuThuc, { chiTietSanPham: [
    { ncc: 'VINA -GS', giaBan: 3050000, soLuong: 1, trangThai: 'Soạn Hồ Sơ' },
    { ncc: 'VISNAM-ONE-GS', giaBan: 380000, soLuong: 1, trangThai: 'Soạn Hồ Sơ' }
  ] });
  assert.equal(nhieuDong[0].doanhThu, 3050000);
  assert.equal(nhieuDong[1].doanhThu, 380000);
  const donCu = tinhBieuThuc(bieuThuc, { NCC: 'NCC cũ', 'Thành Tiền': 123000 });
  assert.equal(donCu[0].ncc, 'NCC cũ');
  assert.equal(donCu[0].doanhThu, 123000);
  pipelines.length = 0;
  await handlers['/api/orders/stats']({ query: { period: 'month' } }, res);
  assert.equal(pipelines[0][0].$match.registeredAtDate.$lt.toISOString(), '2026-11-09T00:00:00.000Z');
  pipelines.length = 0;
  await handlers['/api/orders/dashboard']({ query: {}, auth: {} }, res);
  assert.equal(res.body.success, true);
  assert.equal(pipelines[0][0].$match.$and[2].registeredAtDate.$gte.toISOString(), '2026-11-08T00:00:00.000Z');
  assert.equal(pipelines[0][0].$match.$and[1]['Nhân Viên Đăng Ký'], 'Nhân viên A');
  assert.equal(res.body.data.loiNhuanThang, null);
  console.log('Đạt: ngày Việt Nam, dữ liệu cũ, doanh thu theo NCC và phạm vi quyền (mô phỏng).');
}
kiemTra().catch(error => { console.error(error); process.exitCode = 1; });
