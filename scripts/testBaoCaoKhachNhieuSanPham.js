const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TRANG_THAI_KICH_HOAT, tinhTongChiTiet, duyetPhieuUnc } = require('../services/chiTietDonHang');
const { tongHopDongKichHoat } = require('../services/tongHopChiTietDonHang');
const { tinhBieuThuc } = require('./testTongHopChiTietDonHang');
const { daBatTinhNang } = require('../services/tinhNangDonNhieuSanPham');

const nguon = fs.readFileSync(path.join(__dirname, '..', 'routes', 'customer-debts.js'), 'utf8');

function taoMoiTruong(batTinhNang) {
  const pipelines = [];
  const routes = {};
  const router = { use() {}, get(url, handler) { routes[url] = handler; }, post() {}, put() {}, delete() {} };
  const Order = {
    aggregate(pipeline) {
      pipelines.push(pipeline);
      return { option: async () => [{
        newDebt: [{ _id: 1, amount: 900000 }],
        monthlyPaid: [{ _id: 1, amount: 100000 }, { _id: 2, amount: 200000 }],
        openingDebt: [{ amount: 400000 }],
        openingPaid: [{ amount: 150000 }],
        missingPaymentDate: []
      }] };
    }
  };
  const context = {
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === 'mongoose') return { isValidObjectId: () => false };
      if (name === '../models/Order') return Order;
      if (name === '../services/chiTietDonHang') return { TRANG_THAI_KICH_HOAT, tinhTongChiTiet };
      if (name === '../services/tongHopChiTietDonHang') return { tongHopDongKichHoat };
      if (name === '../services/tinhNangDonNhieuSanPham') return { daBatTinhNang };
      if (name === './employee-settlement') return () => {};
      return {};
    },
    process: { env: batTinhNang ? {} : { DON_NHIEU_SAN_PHAM_ENABLED: 'false' } },
    module: { exports: {} },
    console
  };
  vm.createContext(context);
  vm.runInContext(nguon, context, { filename: 'customer-debts.js' });
  return { context, pipelines, routes };
}

async function kiemTra() {
  const dong = {
    trangThai: 'Đã Kích Hoạt', soLuong: 2, giaBan: 500000, giaDongCongTy: 300000,
    giaNoNcc: 250000, phaiThuKhach: 900000,
    thanhToanKhach: [{ ngay: '2026-01-31', soTien: 100000 }, { ngay: '2026-02-01', soTien: 200000 }],
    thanhToanNcc: []
  };
  const don = {
    'Thành Tiền': 700,
    'Thực Thu': 600,
    'KH Thanh Toán': 100,
    chiTietSanPham: [dong, { ...dong, trangThai: 'Chưa Kích Hoạt' }]
  };
  const cu = taoMoiTruong(false);
  assert.deepEqual({ ...cu.context.soLieuKhach(don) }, { sales: 700, due: 600, paid: 100 });
  assert.equal(cu.context.cacBuocThanhToanKhach().length, 0);
  assert.equal(cu.context.orderMatch('Nhân viên A', 'Khách A')['TÌNH TRẠNG'].source, TRANG_THAI_KICH_HOAT.source);
  const duLieuCu = await cu.context.orderMonthlyData(cu.context.orderMatch('Nhân viên A', 'Khách A'), 2026);
  assert.equal(duLieuCu.months[0].oldDebt, 250000);
  assert.equal(duLieuCu.months[0].remaining, 1050000);
  assert.equal(duLieuCu.months[1].remaining, 850000);
  assert.equal(cu.pipelines[0][2].$facet.monthlyPaid.length, 2);

  const moi = taoMoiTruong(true);
  assert.deepEqual({ ...moi.context.soLieuKhach(don) }, { sales: 1000000, due: 900000, paid: 300000 });
  const danhSach = [
    { ...dong, maDong: 'd1', thanhToanKhach: [{ ngay: '2026-01-01', soTien: 100 }] },
    { ...dong, maDong: 'd2', trangThai: 'Chưa Kích Hoạt', thanhToanKhach: [] }
  ];
  const phieu = { maPhieu: 'p1', soTien: 1000, ngay: '2026-01-15', trangThai: 'Chờ Duyệt',
    phanBo: [{ maDong: 'd1', soTien: 300 }, { maDong: 'd2', soTien: 200 }] };
  const lanMot = duyetPhieuUnc(danhSach, phieu);
  const lanHai = duyetPhieuUnc(lanMot.chiTietSanPham, { ...phieu, maPhieu: 'p2', ngay: '2026-02-01', phanBo: [{ maDong: 'd1', soTien: 50 }] });
  const donDaDuyet = { chiTietSanPham: lanHai.chiTietSanPham };
  const thanhToan = tinhBieuThuc(tongHopDongKichHoat().thanhToanKhach, donDaDuyet);
  assert.equal(tinhBieuThuc(tongHopDongKichHoat().khachDaThanhToan, donDaDuyet), 450);
  assert.deepEqual(thanhToan.map(item => item.ngay), ['2026-01-01', '2026-01-15', '2026-02-01']);
  assert.equal(moi.context.soLieuKhach(donDaDuyet).paid, 450);
  assert.throws(() => duyetPhieuUnc(lanHai.chiTietSanPham, phieu), /đã được ghi nhận/);
  assert.deepEqual({ ...moi.context.soLieuKhach({ 'Thành Tiền': 700, 'Thực Thu': 600, 'KH Thanh Toán': 100 }) }, { sales: 700, due: 600, paid: 100 });
  const boLoc = moi.context.orderMatch('Nhân viên A', 'Khách A');
  assert.equal(boLoc['Nhân Viên Đăng Ký'], 'Nhân viên A');
  assert.equal(boLoc['Tên Khách Hàng'], 'Khách A');
  assert.equal(boLoc.$or[1].chiTietSanPham.$elemMatch.trangThai.test('Chưa Kích Hoạt'), false);
  assert.equal(boLoc.$or[1].chiTietSanPham.$elemMatch.trangThai.test('Đã Kích Hoạt'), true);
  const duLieuMoi = await moi.context.orderMonthlyData(boLoc, 2026);
  assert.equal(duLieuMoi.months[0].remaining, 1050000);
  assert.equal(duLieuMoi.months[1].remaining, 850000);
  const facet = moi.pipelines[0][2].$facet;
  assert.equal(facet.monthlyPaid.length, 5);
  assert.equal(facet.openingPaid.length, 5);
  assert.equal(facet.monthlyPaid[1].$unwind.path, '$cacLanThanhToan');
  assert.equal(facet.monthlyPaid[1].$unwind.includeArrayIndex, 'viTriThanhToan');
  assert.equal(facet.monthlyPaid[2].$addFields.paidValue, '$cacLanThanhToan.soTien');
  assert.equal(facet.missingPaymentDate[0].$match.chiTietSanPham.$not.$type, 'array');
  assert.ok(moi.context.orderMoneyFields().salesValue.$cond);
  let ketQuaApi;
  const resApi = { json(body) { ketQuaApi = body; return this; }, status() { return this; } };
  await moi.routes['/khach-hang/monthly-payments']({
    query: { employeeId: 'Nhân viên A', customerId: 'Khách A', year: '2026', month: '2', page: '1', limit: '50' },
    debtAccess: { employeeName: 'Nhân viên A', employeeId: 'employee-id' }
  }, resApi);
  assert.equal(ketQuaApi.success, true);
  const pipelineApi = moi.pipelines[1];
  assert.equal(pipelineApi[0].$match['Nhân Viên Đăng Ký'], 'Nhân viên A');
  assert.equal(pipelineApi[0].$match['Tên Khách Hàng'], 'Khách A');
  assert.equal(pipelineApi[3].$unwind.includeArrayIndex, 'viTriThanhToan');
  assert.equal(pipelineApi[6].$facet.items[0].$sort.viTriThanhToan, 1);
  assert.equal(pipelineApi[6].$facet.items[2].$limit, 50);

  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const tao = server.slice(server.indexOf('const xuLyTaoDon = async'), server.indexOf("app.put('/api/orders/update/:id'"));
  const sua = server.slice(server.indexOf("app.put('/api/orders/update/:id'"), server.indexOf("app.delete('/api/orders/delete/:id'"));
  for (const route of [tao, sua]) {
    assert.match(route, /hasOwnProperty\.call\((?:data|req\.body), 'chiTietSanPham'\)/);
    assert.match(route, /Chức năng đơn nhiều sản phẩm chưa sẵn sàng/);
  }
  for (const [nguonRoute, phuongThuc] of [[tao, 'post'], [sua, 'put']]) {
    let xuLy;
    const app = { [phuongThuc]: (url, auth, quyen, handler) => { xuLy = handler; } };
    const contextRoute = {
      app,
      requireAuth() {},
      requirePermission: () => () => {},
      hoTroNhieuSanPham: false,
      getAccessUser: async () => ({ isActive: true }),
      DonHang: { findById: () => { throw new Error('Không được đọc hoặc ghi đơn khi tính năng chưa sẵn sàng'); } }
    };
    vm.runInNewContext(nguonRoute, contextRoute);
    let maTrangThai;
    let body;
    const res = {
      status(ma) { maTrangThai = ma; return this; },
      json(value) { body = value; return this; }
    };
    await xuLy({ body: { chiTietSanPham: [dong] }, params: { id: 'id' } }, res);
    assert.equal(maTrangThai, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /chưa sẵn sàng/);
  }
  console.log('Đạt: báo cáo khách cũ, nhánh nhiều sản phẩm, bộ lọc quyền và khóa lưu chưa hoàn thành (mô phỏng).');
}

kiemTra().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
