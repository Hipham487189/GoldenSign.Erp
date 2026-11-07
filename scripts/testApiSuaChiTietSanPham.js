const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf("app.patch('/api/orders/:id/chi-tiet-san-pham'");
const end = source.indexOf("\napp.get('/api/orders/detail/:id'", start);
assert.ok(start >= 0 && end > start);
let handler;
let user;
let conflict = false;
let data;
let update;
let audit = 0;
const context = {
  app: { patch: (...args) => { handler = args.at(-1); } }, requireAuth() {}, requirePermission: () => () => {},
  hoTroNhieuSanPham: true, getAccessUser: async () => user, canViewFinancialOrderFields: u => u.roleId.name === 'Admin',
  mongoose: { isValidObjectId: () => true }, buildOrderFilter: () => ({ archivedAt: null }),
  SanPham: {},
  locChiTietSanPhamTheoQuyen: don => ({ chiTietSanPham: don.chiTietSanPham }),
  chuanBiSuaChiTiet: async don => ({ cu: don.chiTietSanPham[0], moi: { ...don.chiTietSanPham[0], soLuong: 2 },
    chiTiet: [{ ...don.chiTietSanPham[0], soLuong: 2 }], tong: { thanhTien: 200, phaiThuKhach: 90, khachDaThanhToan: 10, thucDongCongTy: 80, congNoNcc: 60 } }),
  DonHang: {
    findOne: () => ({ select: () => ({ lean: async () => structuredClone(data) }) }),
    findOneAndUpdate: (filter, patch) => ({ select: () => ({ lean: async () => {
      assert.equal(filter.$and[1].chiTietSanPham[0].soLuong, 1);
      if (conflict) return null;
      update = patch.$set;
      return { _id: 'id', ...update, 'KH Thanh Toán': 10 };
    } }) })
  },
  writeOrderAudit: async () => { audit++; }, sanitizeOrderForUser: value => value, console
};
vm.runInNewContext(source.slice(start, end), context);
async function goi() {
  let body;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { body = value; return this; } };
  await handler({ params: { id: 'id' }, body: {}, auth: {} }, res);
  return { status: res.statusCode, body };
}
async function kiemTra() {
  user = { isActive: true, roleId: { name: 'Admin', permissions: [] } };
  const dong = Object.fromEntries(['maDong', 'maSanPham', 'tenSanPham', 'loaiSanPham', 'ncc', 'hinhThuc', 'soLuong', 'donViTinh', 'trangThai', 'phaiThuKhach', 'giaBan', 'giaDongCongTy', 'giaNoNcc', 'thanhToanKhach', 'thanhToanNcc'].map(k => [k, k === 'soLuong' ? 1 : k]));
  data = { _id: 'id', chiTietSanPham: [dong], phieuUnc: [], 'KH Thanh Toán': 10 };
  assert.equal((await goi()).status, 200);
  assert.equal(update['Thành Tiền'], 200);
  assert.equal(update['Thực Thu'], 90);
  assert.equal(update['Còn lại'], 80);
  assert.equal(Object.hasOwn(update, 'KH Thanh Toán'), false);
  assert.equal(Object.hasOwn(update, 'phieuUnc'), false);
  assert.equal(audit, 1);
  conflict = true;
  assert.equal((await goi()).status, 409);
  conflict = false;
  delete data.chiTietSanPham[0].giaBan;
  assert.equal((await goi()).status, 403);
  user.roleId.name = 'Chỉ Xem';
  assert.equal((await goi()).status, 403);
}
kiemTra().then(() => console.log('Đạt: API sửa sản phẩm, tổng đơn, kiểm tra quyền và xung đột (MongoDB giả).'))
  .catch(error => { console.error(error); process.exitCode = 1; });
