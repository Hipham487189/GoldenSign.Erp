const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function kiemTra() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'DATAGS_modern_youth_lux_smooth (1).html'), 'utf8');
  const hamTrangThai = html.match(/    function isActivatedOrder\(order\) \{[\s\S]*?\n    \}/);
  const hamTai = html.match(/    let maYeuCauCongNoNcc = 0;[\s\S]*?(?=\n    let nccDebtFilterApplied = false;)/);
  assert.ok(hamTrangThai && hamTai, 'Không tìm thấy các hàm cần kiểm tra.');
  const choXuLy = [];
  const ketQuaHienThi = [];
  const phanTu = {
    mainContainerBox: { insertAdjacentHTML() {} },
    nccDebtLoading: { remove() {} }
  };
  const context = {
    document: { getElementById: id => phanTu[id] || null },
    URLSearchParams,
    API_URL: '/api/orders',
    currentTab: 'ncc-debts',
    nccDebtSummaryData: [],
    allOrders: [],
    allOrdersLoadedFully: true,
    nccDebtFilterApplied: false,
    getNccDebtFilters: () => ({ year: '2026', month: '1', fromDate: '', toDate: '', search: '' }),
    fetch: () => new Promise(resolve => choXuLy.push(resolve)),
    renderNccDebtManagement: () => ketQuaHienThi.push(context.nccDebtSummaryData[0].ncc),
    showAppToast: () => { throw new Error('Không được hiển thị lỗi cho yêu cầu cũ.'); },
    console
  };
  vm.createContext(context);
  vm.runInContext(`${hamTrangThai[0]}\n${hamTai[0]}`, context);
  assert.equal(context.isActivatedOrder({ 'TÌNH TRẠNG': 'Đã Kích Hoạt' }), true);
  assert.equal(context.isActivatedOrder({ 'TÌNH TRẠNG': 'Chưa Kích Hoạt' }), false);
  const cu = context.loadNccDebtData();
  const moi = context.loadNccDebtData();
  choXuLy[1]({ ok: true, json: async () => ({ success: true, data: { rows: [{ ncc: 'Mới' }] } }) });
  await moi;
  choXuLy[0]({ ok: true, json: async () => ({ success: true, data: { rows: [{ ncc: 'Cũ' }] } }) });
  await cu;
  assert.deepEqual(ketQuaHienThi, ['Mới']);
  const khacTab = context.loadNccDebtData();
  context.currentTab = 'overview';
  choXuLy[2]({ ok: true, json: async () => ({ success: true, data: { rows: [{ ncc: 'Khác' }] } }) });
  await khacTab;
  assert.deepEqual(ketQuaHienThi, ['Mới']);

  const hamDanhSach = html.match(/    let maYeuCauDanhSachNcc = 0;[\s\S]*?(?=\n    function showNccRegistrationList)/);
  assert.ok(hamDanhSach, 'Không tìm thấy hàm tải danh sách NCC.');
  const danhSachCho = [];
  const duLieuHienThi = [];
  const danhSach = { innerHTML: '' };
  const contextDanhSach = {
    document: { getElementById: id => id === 'nccRegistrationList' ? danhSach : null },
    URLSearchParams,
    API_URL: '/api/orders',
    currentTab: 'ncc-debts',
    allOrders: [],
    allOrdersLoadedFully: true,
    getNccDebtFilters: () => ({ year: '2026', month: '1', fromDate: '', toDate: '', search: 'ncc' }),
    fetch: url => new Promise(resolve => danhSachCho.push({ url, resolve })),
    getSupplierCost: order => order.supplierCost,
    parseMoneyValue: Number,
    escapeHtml: String,
    window: { renderNccRegistrationList: (element, ncc, rows, parse, pagination) => duLieuHienThi.push({ ncc, rows, pagination }) }
  };
  vm.createContext(contextDanhSach);
  vm.runInContext(hamDanhSach[0], contextDanhSach);
  const trangCu = contextDanhSach.loadNccRegistrationList('NCC cũ', 1);
  const trangMoi = contextDanhSach.loadNccRegistrationList('NCC mới', 2);
  assert.match(danhSachCho[1].url, /page=2/);
  assert.match(danhSachCho[1].url, /limit=50/);
  danhSachCho[1].resolve({ ok: true, json: async () => ({ success: true, data: { items: [{ supplierCost: 42 }], page: 2, totalPages: 2, total: 51, hasMore: false } }) });
  await trangMoi;
  danhSachCho[0].resolve({ ok: true, json: async () => ({ success: true, data: { items: [{ supplierCost: 3 }], page: 1 } }) });
  await trangCu;
  assert.equal(duLieuHienThi.length, 1);
  assert.equal(duLieuHienThi[0].ncc, 'NCC mới');
  assert.equal(duLieuHienThi[0].rows[0].cost, 42);
  assert.equal(duLieuHienThi[0].pagination.total, 51);
  assert.equal(contextDanhSach.allOrders.length, 1);
  assert.equal(contextDanhSach.allOrders[0].supplierCost, 42);
  assert.equal(contextDanhSach.allOrdersLoadedFully, false);
  const loiTai = contextDanhSach.loadNccRegistrationList('NCC lỗi');
  danhSachCho[2].resolve({ ok: false, json: async () => ({ success: false, message: 'Không thể tải dữ liệu' }) });
  await loiTai;
  assert.match(danhSach.innerHTML, /Không thể tải dữ liệu/);
  const boQuaKhiChuyenTrang = contextDanhSach.loadNccRegistrationList('NCC khác');
  contextDanhSach.currentTab = 'overview';
  danhSachCho[3].resolve({ ok: true, json: async () => ({ success: true, data: { items: [], page: 1 } }) });
  await boQuaKhiChuyenTrang;
  assert.equal(duLieuHienThi.length, 1);

  const maThanhPhan = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ncc-registration-list.js'), 'utf8');
  const suKien = {};
  const trangDuocChon = [];
  const thanhPhan = {
    innerHTML: '',
    querySelector: selector => ({ addEventListener: (event, callback) => { suKien[selector] = callback; } }),
    scrollIntoView() {}
  };
  const contextThanhPhan = {
    window: {},
    loadNccRegistrationList: (ncc, page, limit) => trangDuocChon.push({ ncc, page, limit })
  };
  vm.runInNewContext(maThanhPhan, contextThanhPhan);
  contextThanhPhan.window.renderNccRegistrationList(thanhPhan, 'NCC mới', [], Number, { page: 2, limit: 50, totalPages: 3, total: 120, hasMore: true });
  assert.match(thanhPhan.innerHTML, /Trang 2 \/ 3 · 120 đăng ký/);
  assert.match(thanhPhan.innerHTML, /value="50" selected/);
  suKien['[data-trang-ncc="truoc"]']();
  suKien['[data-trang-ncc="sau"]']();
  suKien['[data-trang-ncc="so-dong"]']({ target: { value: '100' } });
  assert.deepEqual(trangDuocChon, [{ ncc: 'NCC mới', page: 1, limit: 50 }, { ncc: 'NCC mới', page: 3, limit: 50 }, { ncc: 'NCC mới', page: 1, limit: 100 }]);
  console.log('Đạt: trạng thái kích hoạt, phân trang NCC, lỗi tải và bỏ qua phản hồi cũ.');
}

kiemTra().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
