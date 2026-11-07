const assert = require('node:assert/strict');
const express = require('express');
const { taoKhoGia } = require('./giaLapKhoTepUnc');
const kho = taoKhoGia();
const taoRouter = require('../routes/unc-nhieu-san-pham');

const id = '64a000000000000000000001';
const dong = { maDong: 'd1', trangThai: 'Đã Kích Hoạt', soLuong: 1, giaBan: 1000, giaDongCongTy: 700,
  giaNoNcc: 600, phaiThuKhach: 1000, thanhToanKhach: [], thanhToanNcc: [] };
const saoChep = obj => JSON.parse(JSON.stringify(obj));
let don = { _id: id, employee: 'nhanvien', chiTietSanPham: [dong] };
let bat = false;
let xungDot = false;
function dungDon(filter) {
  return String(filter._id) === id && (!filter.employee || filter.employee === don.employee);
}
const Order = {
  db: kho.db,
  findOne(filter) {
    let chon;
    return { select(giaTri) { chon = giaTri; return this; }, async lean() {
      if (!dungDon(filter)) return null;
      if (chon?.phieuUnc?.$elemMatch) return { phieuUnc: (don.phieuUnc || []).filter(p => p.maPhieu === chon.phieuUnc.$elemMatch.maPhieu).slice(0, 1) };
      return saoChep(don);
    } };
  },
  findOneAndUpdate(filter, update) { return { async lean() {
    if (xungDot || !dungDon(filter.$and[0])) { xungDot = false; return null; }
    const [,, phieu, uncCu, ...cacTruong] = filter.$and;
    if (JSON.stringify(filter.$and[1].chiTietSanPham) !== JSON.stringify(don.chiTietSanPham)) return null;
    if (phieu.phieuUnc.$exists === false ? don.phieuUnc !== undefined : JSON.stringify(phieu.phieuUnc) !== JSON.stringify(don.phieuUnc)) return null;
    if (uncCu['Số Tiền UNC']?.$exists === false ? don['Số Tiền UNC'] !== undefined : uncCu['Số Tiền UNC'] !== don['Số Tiền UNC']) return null;
    for (const dieuKien of cacTruong) {
      const [truong, giaTri] = Object.entries(dieuKien)[0];
      if (giaTri?.$exists === false ? don[truong] !== undefined : don[truong] !== giaTri) return null;
    }
    Object.assign(don, saoChep(update.$set));
    return { _id: id };
  } }; },
  aggregate(pipeline) { return { async option() {
    if (!dungDon(pipeline[0].$match)) return [];
    assert.ok(pipeline[1].$project.phieuUnc.$slice);
    assert.equal(pipeline[2].$project.phieuUnc.$map.in.tep, undefined);
    const items = (don.phieuUnc || []).map(({ tep, ...phieu }) => ({ ...phieu, tenTep: tep?.ten }));
    return [{ phieuUnc: items, tongPhieu: items.length + (Number(don['Số Tiền UNC']) > 0 ? 1 : 0) }];
  } }; }
};

async function kiemTra() {
  const app = express();
  app.use(express.json());
  app.use('/unc', taoRouter({
    Order, daBat: () => bat,
    requireAuth(req, res, next) { if (!req.headers['x-role']) return res.status(401).json({ success: false }); req.auth = {}; next(); },
    async getAccessUser(req) {
      const ten = req.headers['x-role'];
      return { isActive: true, username: ten, roleId: {
        name: ten === 'admin' ? 'Admin' : 'Nhân Viên',
        permissions: ten === 'xem' ? ['view_orders'] : ['view_orders', 'manage_orders']
      } };
    },
    orderScope: user => user.roleId.name === 'Admin' ? 'all' : 'own',
    buildOrderFilter: (_, options) => options.scopeUser.roleId.name === 'Admin' ? {} : { employee: options.scopeUser.username }
  }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/unc`;
  async function go(url, role, method = 'GET', body) {
    const response = await fetch(base + url, { method, headers: { ...(role ? { 'x-role': role } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  try {
    assert.equal((await go(`/${id}`, null)).status, 401);
    assert.equal((await go(`/${id}`, 'nhanvien')).status, 503);
    bat = true;
    assert.equal((await go('/sai', 'nhanvien')).status, 400);
    const dauVao = { ngay: '2026-02-01', soTien: 1000, phanBo: [{ maDong: 'd1', soTien: 600 }],
      tep: { ten: 'unc.pdf', duLieu: 'data:application/pdf;base64,SGVsbG8=' } };
    assert.equal((await go(`/${id}`, 'xem', 'POST', dauVao)).status, 403);
    assert.equal((await go(`/${id}`, 'khac', 'POST', dauVao)).status, 404);
    assert.equal((await go(`/${id}`, 'nhanvien', 'POST', { ...dauVao, soTien: 10 })).status, 400);
    assert.equal((await go(`/${id}`, 'nhanvien', 'POST', { ...dauVao, phanBo: [] })).status, 400);
    const gui = await go(`/${id}`, 'nhanvien', 'POST', dauVao);
    assert.equal(gui.status, 201);
    assert.equal(gui.body.data.coTep, true);
    assert.equal(gui.body.data.tep, undefined);
    const maPhieu = gui.body.data.maPhieu;
    const danhSach = await go(`/${id}`, 'nhanvien');
    assert.equal(danhSach.body.data.items.length, 1);
    assert.equal(danhSach.body.data.tongPhieu, 1);
    assert.equal(danhSach.body.data.items[0].tep, undefined);
    assert.equal((await go(`/${id}/${maPhieu}/file`, null)).status, 401);
    assert.equal((await go(`/${id}/${maPhieu}/file`, 'khac')).status, 404);
    assert.equal((await go(`/${id}/khong-co/file`, 'nhanvien')).status, 404);
    const tep = await go(`/${id}/${maPhieu}/file`, 'nhanvien');
    assert.equal(tep.status, 200);
    assert.equal(tep.body.data.duLieu, dauVao.tep.duLieu);
    assert.equal((await go(`/${id}/${maPhieu}`, 'nhanvien', 'PATCH', { trangThai: 'Đã Duyệt' })).status, 403);
    xungDot = true;
    assert.equal((await go(`/${id}/${maPhieu}`, 'admin', 'PATCH', { trangThai: 'Đã Duyệt' })).status, 409);
    assert.equal((await go(`/${id}/${maPhieu}`, 'admin', 'PATCH', { trangThai: 'Đã Duyệt' })).status, 200);
    assert.equal(don.chiTietSanPham[0].thanhToanKhach[0].soTien, 600);
    assert.equal(don['KH Thanh Toán'], 600);
    assert.equal(don['Còn lại'], 400);
    assert.equal((await go(`/${id}/${maPhieu}`, 'admin', 'PATCH', { trangThai: 'Đã Duyệt' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); kho.khoiPhuc(); }
}

kiemTra().then(() => console.log('Đạt: API UNC, quyền, phân bổ, duyệt và xung đột (MongoDB giả).'))
  .catch(loi => { console.error(loi); process.exitCode = 1; });
