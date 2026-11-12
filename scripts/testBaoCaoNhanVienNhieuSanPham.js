const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TRANG_THAI_KICH_HOAT } = require('../services/chiTietDonHang');
const tongHop = require('../services/tongHopChiTietDonHang');
const { tinhBieuThuc } = require('./testTongHopChiTietDonHang');

const nguon = fs.readFileSync(path.join(__dirname, '..', 'routes', 'employee-settlement.js'), 'utf8');

function taoMoiTruong(batTinhNang) {
  const routes = {};
  const pipelines = [];
  const dieuKienMucPhi = [];
  const router = {
    get(url, handler) { routes[url] = handler; },
    post() {},
    put() {},
    delete() {}
  };
  const emptyModel = { find: () => ({ lean: async () => [] }) };
  const ExpenseRate = {
    find: dieuKien => {
      dieuKienMucPhi.push(dieuKien);
      return {
        select() { return this; },
        sort() { return this; },
        limit() { return this; },
        lean: async () => dieuKien.tenChiPhiKey.$in.includes('phí tạm giũ hs one')
          ? [{ tenChiPhiKey: 'phí tạm giũ hs one', donGia: 30000, tuNgay: new Date('2026-01-01T00:00:00.000Z'), denNgay: new Date('2026-12-31T00:00:00.000Z') }]
          : []
      };
    }
  };
  const Order = {
    aggregate(pipeline) {
      pipelines.push(pipeline);
      const laChiTiet = pipeline.some(stage => stage.$facet?.suppliers);
      const laChiTietUnc = pipeline.some(stage => stage.$facet?.totals) && !laChiTiet;
      const laDangKyNccOne = pipeline.some(stage => stage.$addFields?.cacDangKyNcc);
      const laUnc = pipeline[0].$match['Trạng Thái UNC'] === 'Đã Duyệt' || pipeline.some(stage => stage.$unwind === '$phieu');
      return { option: async () => laDangKyNccOne
        ? [{ _id: '2026-01-15', soLuong: 2 }]
        : laChiTiet
        ? [{ allOrders: [{ count: 1 }], totals: [{ count: 1, cost: 600000 }], items: [{ code: 'DH1', cost: 600000, khongPhanBoUnc: true, uncPaid: null, remaining: null }], suppliers: [{ _id: 'NCC A', count: 1, cost: 600000 }, { _id: 'NCC B', count: 1, cost: 300000 }] }]
        : laChiTietUnc ? [{ items: [{ amount: 150000 }], totals: [{ count: 120, amount: 1200000 }] }]
          : laUnc ? [{ _id: { y: 2026, m: 1 }, amount: 150000 }] : [{ _id: { y: 2026, m: 1 }, amount: 900000, count: 1 }] };
    }
  };
  const EmployeePayment = { aggregate: pipeline => ({ option: async () => pipeline.some(stage => stage.$facet)
    ? [{ items: [], totals: [{ count: 0, amount: 50000 }] }]
    : [{ _id: { y: 2026, m: 1 }, amount: 50000 }] }) };
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === '../services/tongHopChiTietDonHang') return tongHop;
      if (name === '../models/ExpenseRate') return ExpenseRate;
      if (name.startsWith('../models/')) return emptyModel;
      throw new Error(`Require không hỗ trợ: ${name}`);
    }
  };
  vm.createContext(context);
  vm.runInContext(nguon, context);
  context.module.exports(router, {
    Order, EmployeePayment,
    scopedEmployee: async (req, requested) => {
      if (requested && requested !== 'Nhân viên A') throw new Error('Không được xem nhân viên khác');
      return 'Nhân viên A';
    },
    requestError: message => new Error(message),
    sendRouteError: (res, error) => res.status(403).json({ success: false, message: error.message }),
    dateExpression: field => `$${field}`,
    validYear: value => Number(value),
    pageParams: () => ({ page: 1, limit: 50 }),
    ORDER_DATE: 'registeredAtDate',
    EMPLOYEE_NAME: 'Nhân Viên Đăng Ký',
    ACTIVE_ORDER: { 'TÌNH TRẠNG': TRANG_THAI_KICH_HOAT },
    hoTroNhieuSanPham: batTinhNang,
    dieuKienDonKhach: () => ({ $or: [
      { chiTietSanPham: { $not: { $type: 'array' } }, 'TÌNH TRẠNG': TRANG_THAI_KICH_HOAT },
      { chiTietSanPham: { $elemMatch: { trangThai: TRANG_THAI_KICH_HOAT } } }
    ] })
  });
  return { routes, pipelines, dieuKienMucPhi };
}

async function goi(handler, query) {
  let ketQua;
  let ma = 200;
  await handler({ query }, {
    status(code) { ma = code; return this; },
    json(body) { ketQua = body; return this; }
  });
  return { ma, ketQua };
}

async function kiemTra() {
  for (const bat of [false, true]) {
    const { routes, pipelines, dieuKienMucPhi } = taoMoiTruong(bat);
    const summary = await goi(routes['/nhan-vien/summary'], { employeeId: 'Nhân viên A', year: '2026', month: '1' });
    assert.equal(summary.ketQua.success, true);
    assert.equal(summary.ketQua.data.summary.incurred, 900000);
    assert.equal(summary.ketQua.data.summary.uncPaid, 150000);
    assert.equal(summary.ketQua.data.summary.directPaid, 50000);
    assert.equal(summary.ketQua.data.summary.remaining, 700000);
    assert.equal(summary.ketQua.data.summary.dossierHold, 60000);
    assert.ok(Array.from(dieuKienMucPhi[0].tenChiPhiKey.$in).includes('phí tạm giũ hs one'));
    assert.equal(pipelines[0][0].$match['Nhân Viên Đăng Ký'].$regex, '^Nhân viên A$');
    const pipelineDangKy = pipelines.find(pipeline => pipeline.some(stage => stage.$addFields?.cacDangKyNcc));
    assert.ok(pipelineDangKy);
    const locDangKy = pipelineDangKy.find(stage => stage.$match?.loaiDangKy).$match.loaiDangKy.$regex;
    assert.match(locDangKy, /đăng ký mới/);
    assert.match(locDangKy, /gia hạn/);
    assert.ok(pipelineDangKy[pipelineDangKy.length - 1].$group.soLuong.$sum.$convert);
    if (bat) {
      assert.equal(pipelines[1].some(stage => stage.$unwind === '$phieu'), true);
      const bieuThuc = pipelines[1][1].$project.phieu;
      const donUnc = {
        'Trạng Thái UNC': 'Đã Duyệt', 'Số Tiền UNC': 150000, 'Ngày Thanh Toán UNC': '2026-01-01',
        phieuUnc: [
          { maPhieu: 'a', trangThai: 'Đã Duyệt', soTien: 300000, ngay: '2026-01-10' },
          { maPhieu: 'b', trangThai: 'Đã Duyệt', soTien: 200000, ngay: '2026-02-01' },
          { maPhieu: 'c', trangThai: 'Từ Chối', soTien: 900000, ngay: '2026-01-15' },
          { maPhieu: 'd', trangThai: 'Chờ Duyệt', soTien: 900000, ngay: '2026-01-16' }
        ]
      };
      const phieu = tinhBieuThuc(bieuThuc, donUnc);
      assert.equal(phieu.length, 3);
      assert.deepEqual(Array.from(phieu, item => item.amount), [150000, 300000, 200000]);
      assert.equal(phieu[1].date.toISOString().slice(0, 10), '2026-01-10');
      assert.equal(phieu[2].date.toISOString().slice(0, 10), '2026-02-01');
      assert.equal(tinhBieuThuc(bieuThuc, { ...donUnc, phieuUnc: [] }).length, 1);
    } else {
      assert.equal(pipelines[1][0].$match['Trạng Thái UNC'], 'Đã Duyệt');
      assert.equal(pipelines[1].some(stage => stage.$unwind), false);
    }
    if (bat) {
      assert.equal(pipelines[0][0].$match.$or[1].chiTietSanPham.$elemMatch.trangThai.test('Chưa Kích Hoạt'), false);
      assert.ok(pipelines[0][1].$group.amount.$sum.$cond);
    } else {
      assert.equal(pipelines[0][0].$match['TÌNH TRẠNG'].test('Đã Kích Hoạt'), true);
      assert.ok(pipelines[0][1].$group.amount.$sum.$convert);
    }
    const chiTiet = await goi(routes['/nhan-vien/orders'], { employeeId: 'Nhân viên A', year: '2026', month: '1', ncc: 'NCC A' });
    assert.equal(chiTiet.ketQua.success, true);
    assert.equal(chiTiet.ketQua.data.totalCost, 600000);
    const pipeline = pipelines.find(item => item.some(stage => stage.$facet?.suppliers));
    if (bat) {
      const facet = pipeline[3].$facet;
      assert.equal(chiTiet.ketQua.data.totalOrders, 1);
      assert.equal(chiTiet.ketQua.data.suppliers.length, 2);
      assert.equal(facet.allOrders[0].$count, 'count');
      assert.equal(facet.suppliers[1].$unwind, '$dong');
      assert.equal(facet.suppliers[2].$group._id.don, '$_id');
      assert.equal(facet.suppliers[3].$group.count.$sum, 1);
      assert.equal(facet.items[0].$match.$or[1]['dongChon.0'].$exists, true);
      assert.equal(facet.items[3].$limit, 50);
      assert.equal(facet.items[4].$addFields.khongPhanBoUnc.$and[1], true);
      assert.equal(facet.items[5].$project.uncPaid.$cond[1], null);
      assert.equal(facet.items[5].$project.remaining.$cond[1], null);
      const dongA = { ncc: 'NCC A', tenSanPham: 'Gói A', trangThai: 'Đã Kích Hoạt', giaDongCongTy: 300000, soLuong: 2 };
      const dongB = { ncc: 'NCC B', tenSanPham: 'Gói B', trangThai: 'Đã Kích Hoạt', giaDongCongTy: 300000, soLuong: 1 };
      const dongC = { ...dongA, trangThai: 'Chưa Kích Hoạt', giaDongCongTy: 999999 };
      const don = { chiTietSanPham: [dongA, dongB, dongC], 'Trạng Thái UNC': 'Đã Duyệt', 'Số Tiền UNC': 150000 };
      don.laNhieuSanPham = true;
      don.dongKichHoat = tinhBieuThuc(pipeline[1].$addFields.dongKichHoat, don);
      don.dongChon = tinhBieuThuc(pipeline[2].$addFields.dongChon, don);
      assert.equal(don.dongKichHoat.length, 2);
      assert.equal(don.dongChon.length, 1);
      const truongTinh = facet.items[4].$addFields;
      don.chiPhiChon = tinhBieuThuc(truongTinh.chiPhiChon, don);
      don.khongPhanBoUnc = tinhBieuThuc(truongTinh.khongPhanBoUnc, don);
      don.uncPaid = 150000;
      assert.equal(don.chiPhiChon, 600000);
      assert.equal(don.khongPhanBoUnc, true);
      assert.equal(tinhBieuThuc(facet.items[5].$project.uncPaid, don), null);
      assert.equal(tinhBieuThuc(facet.items[5].$project.remaining, don), null);
      assert.equal(tinhBieuThuc(facet.items[5].$project.pack, don), 'Gói A');
      await goi(routes['/nhan-vien/orders'], { employeeId: 'Nhân viên A', year: '2026', month: '1' });
      const pipelineTatCa = pipelines.filter(item => item.some(stage => stage.$facet?.suppliers))[1];
      const facetTatCa = pipelineTatCa[3].$facet;
      don.dongChon = tinhBieuThuc(pipelineTatCa[2].$addFields.dongChon, don);
      don.chiPhiChon = tinhBieuThuc(facetTatCa.items[3].$addFields.chiPhiChon, don);
      don.khongPhanBoUnc = tinhBieuThuc(facetTatCa.items[3].$addFields.khongPhanBoUnc, don);
      assert.equal(don.chiPhiChon, 900000);
      assert.equal(don.khongPhanBoUnc, false);
      assert.equal(tinhBieuThuc(facetTatCa.items[4].$project.uncPaid, don), 150000);
      assert.equal(tinhBieuThuc(facetTatCa.items[4].$project.remaining, don), 750000);
      assert.equal(tinhBieuThuc(facetTatCa.items[4].$project.pack, don), 'Gói A, Gói B');
    } else {
      assert.equal(pipeline[2].$facet.items[0].$match.NCC, 'NCC A');
    }
    const thanhToan = await goi(routes['/nhan-vien/payments'], { employeeId: 'Nhân viên A', year: '2026', month: '1' });
    assert.equal(thanhToan.ketQua.data.uncTotal, 1200000);
    assert.equal(thanhToan.ketQua.data.uncCount, 120);
    assert.equal(thanhToan.ketQua.data.unc.length, 1);
    const buocTrangUnc = pipelines[pipelines.length - 1].find(stage => stage.$facet).$facet;
    assert.equal(buocTrangUnc.items.find(stage => stage.$limit).$limit, 50);
    assert.equal(buocTrangUnc.totals[0].$group.amount.$sum, '$uncAmount');
    const nccUnc = buocTrangUnc.items.find(stage => stage.$project).$project.ncc;
    if (bat) {
      assert.equal(tinhBieuThuc(nccUnc, { laNhieuSanPham: true, NCC: 'NCC A' }), null);
      assert.equal(tinhBieuThuc(nccUnc, { laNhieuSanPham: false, NCC: 'NCC A' }), 'NCC A');
    } else assert.equal(nccUnc, '$NCC');
    const tuChoi = await goi(routes['/nhan-vien/summary'], { employeeId: 'Người khác', year: '2026', month: '1' });
    assert.equal(tuChoi.ma, 403);
    assert.equal(tuChoi.ketQua.success, false);
  }
  const giaoDien = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee-debts.js'), 'utf8');
  const ham = giaoDien.match(/  async function showOrders\(month, ncc = '', page = 1\) \{[\s\S]*?(?=\n  async function showPayments)/);
  assert.ok(ham, 'Không tìm thấy giao diện danh sách công nợ nhân viên.');
  const card = { innerHTML: '', insertAdjacentHTML() { throw new Error('Không được báo lỗi khi tải thành công.'); } };
  const body = { querySelector: selector => selector === '.edb-card' ? card : { addEventListener() {} }, querySelectorAll: () => [] };
  const contextGiaoDien = {
    openModal: () => body,
    call: async () => ({ data: {
      totalOrders: 1, totalCost: 600000, total: 1, page: 1, totalPages: 1,
      suppliers: [{ ncc: 'NCC A', count: 1, cost: 600000 }, { ncc: 'NCC B', count: 1, cost: 300000 }],
      items: [{ code: 'DH1', ncc: 'NCC A', cost: 600000, khongPhanBoUnc: true }]
    } }),
    data: { year: 2026, months: [{ incurred: 900000 }] },
    ctx: { filters: { employeeId: 'Nhân viên A' } },
    money: String, esc: String, tone: () => '', periodText: () => 'Tháng 1/2026'
  };
  vm.createContext(contextGiaoDien);
  vm.runInContext(ham[0], contextGiaoDien);
  await contextGiaoDien.showOrders(1, 'NCC A');
  assert.match(card.innerHTML, /Tất cả NCC \(1\)/);
  assert.match(card.innerHTML, /UNC thuộc toàn bộ đơn và chưa phân bổ theo NCC/);
  assert.match(card.innerHTML, /Không thể tính số còn lại theo NCC khi UNC chưa phân bổ/);
  console.log('Đạt: báo cáo nhân viên cũ/mới, UNC không nhân theo dòng, lọc NCC và giới hạn quyền (mô phỏng).');
}

kiemTra().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
