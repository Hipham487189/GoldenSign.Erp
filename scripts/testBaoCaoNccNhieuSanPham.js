const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { taoCacBuocDongNcc, dieuKienDonCoSanPhamKichHoat } = require('../services/tongHopNccNhieuSanPham');
const { tinhCongNoNcc } = require('../services/chiTietDonHang');
const { tinhBieuThuc } = require('./testTongHopChiTietDonHang');
const { taoBoLocThanhToanNcc } = require('../services/locThanhToanNcc');

async function kiemTra() {
  const dong = {
    maDong: '1', ncc: 'VINA-GS', tenSanPham: 'Gói A', hinhThuc: 'Đăng ký mới',
    trangThai: 'Đã Kích Hoạt', soLuong: 2, giaBan: 500000, giaDongCongTy: 300000,
    giaNoNcc: 250000, phaiThuKhach: 900000, thanhToanKhach: [], thanhToanNcc: []
  };
  const sanPham = [
    dong,
    { ...dong, maDong: '2', ncc: 'ONE-CA', soLuong: 1, giaNoNcc: 300000 },
    { ...dong, maDong: '3', trangThai: 'Chưa Kích Hoạt' }
  ];
  const buoc = taoCacBuocDongNcc(123000, 456000);
  const cacDong = tinhBieuThuc(buoc[0].$addFields.dongNcc, { chiTietSanPham: sanPham });
  assert.equal(cacDong.length, 2);
  assert.equal(cacDong[0].chiPhi, 500000);
  assert.equal(cacDong[0].chiPhiCongTy, 600000);
  assert.equal(cacDong[0].doanhThu, 1000000);
  assert.equal(cacDong[1].chiPhi, 300000);
  const tong = tinhCongNoNcc(sanPham, { 'VINA-GS': { daThanhToan: 0 }, 'ONE-CA': { daThanhToan: 0 } });
  assert.equal(cacDong[0].chiPhi, tong[0].congNo);
  assert.equal(cacDong[1].chiPhi, tong[1].congNo);
  const donCu = { NCC: 'NCC cũ', 'Gói ': 'Gói cũ', 'Hình Thức': 'Gia hạn', 'Thực Đóng Công Ty': 100000 };
  const dongCu = tinhBieuThuc(buoc[0].$addFields.dongNcc, donCu);
  assert.equal(dongCu.length, 1);
  assert.equal(dongCu[0].chiPhi, 123000);
  assert.equal(dongCu[0].doanhThu, 456000);
  assert.equal(dongCu[0].soLuong, 1);
  assert.equal(dieuKienDonCoSanPhamKichHoat().$or[1].chiTietSanPham.$elemMatch.trangThai.test('Chưa Kích Hoạt'), false);

  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const routeTong = server.match(/app\.get\('\/api\/orders\/ncc-debts',[\s\S]*?\n\}\);/);
  const routeChiTiet = server.match(/app\.get\('\/api\/orders\/ncc-debts\/details',[\s\S]*?\n\}\);/);
  assert.ok(routeTong && routeChiTiet);
  let handler;
  const pipelines = [];
  let boLoc;
  let locThanhToan;
  const context = {
    app: { get: (url, permission, callback) => { handler = callback; } },
    requirePermission: () => () => {},
    getAccessUser: async () => ({ isActive: true, roleId: { name: 'Admin' } }),
    buildOrderFilter: (query, options) => { boLoc = { query, options }; return { archivedAt: null, $and: [{ registeredAtDate: { $gte: 'ngày' } }] }; },
    hoTroNhieuSanPham: true,
    dieuKienDonCoSanPhamKichHoat,
    taoCacBuocDongNcc,
    escapeRegex: value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    taoBoLocThanhToanNcc,
    orderMoneyExpression: () => 456000,
    getNccDebtPeriodKey: () => 'ky',
    DonHang: { aggregate: pipeline => {
      pipelines.push(pipeline);
      return { option: async () => pipeline.some(stage => stage.$facet)
        ? [{ items: [{ laDonNhieuSanPham: true }], total: [{ value: 101 }] }]
        : [{ ncc: 'VINA-GS', cost: 1000000, tokenHold: 500000 }] };
    } },
    SupplierPayment: { aggregate: pipeline => {
      locThanhToan = pipeline;
      return { option: async () => [{ _id: 'VINA-GS', paid: 100000 }] };
    } },
    SupplierDebtAdjustment: { find: () => ({ lean: async () => [{ supplier: 'VINA-GS', dossierFee: 50000, dsQui: 0 }] }) },
    console
  };
  const res = {
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; return this; }
  };
  vm.createContext(context);
  vm.runInContext(routeTong[0], context);
  await handler({ query: { year: '2026', month: '1', q: 'VINA' } }, res);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.rows[0].remaining, 350000);
  assert.equal(res.body.data.rows[0].paid, 100000);
  assert.equal(boLoc.options.activatedOnly, false);
  assert.equal(pipelines[0][0].$match.$and.length, 2);
  assert.equal(pipelines[0][4].$match.NCC.test('VINA-GS'), true);
  const bieuThucToken = pipelines[0][5].$addFields.tokenHold;
  assert.equal(tinhBieuThuc(bieuThucToken, { NCC: 'VINA-GS', 'Hình Thức': 'Đăng ký mới', dongNcc: { soLuong: 2 } }), 500000);
  assert.equal(tinhBieuThuc(bieuThucToken, { NCC: 'ONE-CA', 'Hình Thức': 'Đăng ký mới', dongNcc: { soLuong: 1 } }), 169000);
  assert.equal(tinhBieuThuc(bieuThucToken, { NCC: 'VINA-GS', 'Hình Thức': 'Gia hạn', dongNcc: { soLuong: 2 } }), 0);
  assert.deepEqual(Array.from(locThanhToan[0].$match.supplier.$in), ['VINA-GS']);
  vm.runInContext(routeChiTiet[0], context);
  await handler({ query: { year: '2026', month: '1', ncc: 'VINA-GS', page: '2', limit: '200' } }, res);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.limit, 100);
  assert.equal(res.body.data.total, 101);
  assert.equal(res.body.data.totalPages, 2);
  const facet = pipelines[1].find(stage => stage.$facet).$facet;
  assert.equal(facet.items[1].$skip, 100);
  assert.equal(facet.items[2].$limit, 100);
  assert.equal(facet.items[3].$project.chiTietSanPham, 0);
  const giaoDien = fs.readFileSync(path.join(__dirname, '..', 'DATAGS_modern_youth_lux_smooth (1).html'), 'utf8');
  assert.match(giaoDien, /if \(!order \|\| order\.laDonNhieuSanPham\)/);
  const xuatExcel = giaoDien.match(/    async function exportNccDebtToExcel\(\) \{[\s\S]*?(?=\n    async function exportSingleNccToExcel)/);
  assert.ok(xuatExcel);
  let thongBao;
  const contextXuat = {
    nccDebtSummaryData: [{ ncc: 'VINA-GS' }],
    ensureXLSX: async () => {},
    getNccDebtFilters: () => ({}),
    URLSearchParams,
    API_URL: '/api/orders',
    fetch: async () => ({ ok: true, json: async () => ({ success: true, data: { items: [], hasMore: true } }) }),
    showAppToast: message => { thongBao = message; },
    alert: message => { throw new Error(message); }
  };
  vm.createContext(contextXuat);
  vm.runInContext(xuatExcel[0], contextXuat);
  await contextXuat.exportNccDebtToExcel();
  assert.match(thongBao, /Chưa thể xuất đầy đủ/);
  console.log('Đạt: NCC đa sản phẩm, token theo số lượng, lọc và phân trang (mô phỏng).');
}

kiemTra().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
