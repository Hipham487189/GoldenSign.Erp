const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mayChu = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const batDau = mayChu.indexOf("app.get('/api/orders/unc/danh-sach'");
const ketThuc = mayChu.indexOf('\n});', batDau);
assert.ok(batDau >= 0 && ketThuc > batDau);
let handler;
let pipeline;
let nguoiDung = { isActive: true, roleId: { name: 'Nhân Viên', permissions: ['view_orders'] } };
const context = {
  app: { get(url, middleware, ham) { handler = ham; } },
  requireAuth() {},
  getAccessUser: async () => nguoiDung,
  orderScope: () => 'own',
  buildOrderFilter: (_, options) => ({ nhanVien: options.scopeUser.roleId.name }),
  DonHang: { aggregate(buoc) {
    pipeline = buoc;
    return { option: async () => [{ items: [
      { _id: 'don1', phieu: { loai: 'cu', soTien: 100 } },
      { _id: 'don2', phieu: { loai: 'moi', maPhieu: 'p1', soTien: 200 } },
      { _id: 'don2', phieu: { loai: 'moi', maPhieu: 'p2', soTien: 300 } }
    ], tong: [{ soPhieu: 101, choDuyet: 2 }] }] };
  } },
  console
};
vm.runInNewContext(mayChu.slice(batDau, ketThuc + 4), context);

async function goi(query = {}) {
  let ketQua;
  const res = { statusCode: 200, status(ma) { this.statusCode = ma; return this; }, json(value) { ketQua = value; return this; } };
  await handler({ query, auth: {} }, res);
  return { ma: res.statusCode, ketQua };
}

async function kiemTra() {
  const duLieu = await goi({ page: '2', limit: '1000' });
  assert.equal(duLieu.ma, 200);
  assert.equal(duLieu.ketQua.data.total, 101);
  assert.equal(duLieu.ketQua.data.limit, 50);
  assert.equal(duLieu.ketQua.data.totalPages, 3);
  assert.equal(duLieu.ketQua.data.items.length, 3);
  assert.equal(pipeline[0].$match.$and[0].nhanVien, 'Nhân Viên');
  assert.equal(pipeline[2].$unwind, '$phieu');
  assert.equal(pipeline[4].$facet.items[1].$skip, 50);
  assert.equal(pipeline[4].$facet.items[2].$limit, 50);
  assert.equal(pipeline[1].$project.phieu.$concatArrays.length, 2);
  assert.equal(pipeline[1].$project.phieu.$concatArrays[1].$map.in.maPhieu, '$$p.maPhieu');
  assert.equal(pipeline[1].$project.phieu.$concatArrays[1].$map.in.duLieu, undefined);
  nguoiDung = { isActive: false, roleId: { name: 'Admin', permissions: [] } };
  assert.equal((await goi()).ma, 403);
  nguoiDung = { isActive: true, roleId: { name: 'Chỉ Xem', permissions: [] } };
  assert.equal((await goi()).ma, 403);

  const giaoDien = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'unc-management.js'), 'utf8');
  const thanhPhan = {
    currentMonthRevenue: {}, totalOrdersCount: {}, mainContainerBox: {}
  };
  const cu = { _id: 'abc', 'Mã Đơn Hàng': 'DH1', phieu: { loai: 'cu', soTien: 100, trangThai: 'Chờ Duyệt' } };
  const moi = { _id: 'def', 'Mã Đơn Hàng': 'DH2', phieu: { loai: 'moi', maPhieu: 'p1', soTien: 200, trangThai: 'Chờ Duyệt', coTep: true } };
  const yeuCau = [];
  const ctx = {
    window: {}, document: { getElementById: id => thanhPhan[id] },
    currentUser: { role: { name: 'Admin' } }, currentTab: 'unc-management', API_URL: '/api/orders',
    escapeHtml: value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    fetch: async (url, options) => {
      yeuCau.push({ url, options });
      return { ok: true, json: async () => options
        ? { success: true } : { success: true, data: { items: [cu, moi], page: 1, total: 101, choDuyet: 2, totalPages: 3 } } };
    },
    showAppToast() {}, alert(message) { throw new Error(message); }, console
  };
  vm.createContext(ctx);
  vm.runInContext(giaoDien, ctx);
  await ctx.window.renderUncManagement();
  assert.match(thanhPhan.mainContainerBox.innerHTML, /DH1/);
  assert.match(thanhPhan.mainContainerBox.innerHTML, /DH2/);
  assert.match(thanhPhan.mainContainerBox.innerHTML, /viewUncMoi/);
  assert.match(thanhPhan.mainContainerBox.innerHTML, /updateUncMoi/);
  assert.match(thanhPhan.mainContainerBox.innerHTML, /updateUncStatus/);
  assert.equal(thanhPhan.currentMonthRevenue.innerText, '101 phiếu UNC');
  await ctx.window.updateUncMoi('def', 'p1', 'Đã Duyệt');
  assert.match(yeuCau[1].url, /unc-nhieu-san-pham\/def\/p1$/);
  assert.equal(JSON.parse(yeuCau[1].options.body).trangThai, 'Đã Duyệt');
  console.log('Đạt: danh sách UNC cũ/mới, phân trang, phạm vi và duyệt (MongoDB giả).');
}

kiemTra().catch(loi => { console.error(loi); process.exitCode = 1; });
