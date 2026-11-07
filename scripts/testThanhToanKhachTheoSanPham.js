const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { tinhTongChiTiet, kiemTraNgay } = require('../services/chiTietDonHang');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf("app.post('/api/orders/:id/thanh-toan-san-pham'");
const end = source.indexOf("\napp.patch('/api/orders/:id/thuc-thu-chi-tiet'", start);
assert.ok(start >= 0 && end > start);
let handler, user, stored, conflict, auditError, audits;
const context = {
  app: { post: (...args) => { handler = args.at(-1); } },
  requireAuth() {}, requirePermission: () => () => {}, hoTroNhieuSanPham: true,
  mongoose: { isValidObjectId: id => id === 'valid' },
  getAccessUser: async () => user,
  canViewFinancialOrderFields: u => u.roleId.name === 'Admin',
  buildOrderFilter: () => ({ archivedAt: null, owner: 'allowed' }),
  locChiTietSanPhamTheoQuyen: don => ({ chiTietSanPham: user.anTaiChinh ? don.chiTietSanPham.map(({ maDong }) => ({ maDong })) : don.chiTietSanPham }),
  sanitizeOrderForUser: don => don,
  tinhTongChiTiet, kiemTraNgay,
  writeOrderAudit: async (...args) => { if (auditError) throw new Error('test'); audits.push(args); },
  DonHang: {
    findOne: filter => ({ select: () => ({ lean: async () => filter.owner === stored.owner ? structuredClone(stored) : null }) }),
    findOneAndUpdate: (filter, patch) => ({ select: () => ({ lean: async () => {
      assert.equal(filter.$and[0].owner, 'allowed');
      assert.equal(JSON.stringify(filter.$and[1].chiTietSanPham), JSON.stringify(stored.chiTietSanPham));
      if (conflict) return null;
      Object.assign(stored, patch.$set);
      return structuredClone(stored);
    } }) })
  },
  console: { error() {} }
};
vm.runInNewContext(source.slice(start, end), context);
function taoDon() {
  const dong = (maDong, thanhToanKhach = []) => ({ maDong, soLuong: 1, trangThai: 'Đã Kích Hoạt', giaBan: 100, giaDongCongTy: 40, giaNoNcc: 30, phaiThuKhach: 100, thanhToanKhach, thanhToanNcc: [] });
  return { _id: 'valid', owner: 'allowed', chiTietSanPham: [dong('a', [{ ngay: '2026-01-01', soTien: 20, maPhieuUnc: 'unc1' }]), dong('b')], phieuUnc: [{ maPhieu: 'unc1', trangThai: 'Đã Duyệt' }], 'Thực Thu': 200, 'KH Thanh Toán': 20, 'Còn lại': 180 };
}
async function goi(body) {
  let ketQua;
  const res = { statusCode: 200, status(ma) { this.statusCode = ma; return this; }, json(value) { ketQua = value; return this; } };
  await handler({ params: { id: 'valid' }, body, auth: {} }, res);
  return { status: res.statusCode, body: ketQua };
}
async function kiemTra() {
  user = { isActive: true, roleId: { name: 'Admin', permissions: [] } };
  stored = taoDon(); conflict = false; auditError = false; audits = [];
  const body = { maDong: 'a', ngay: '2026-02-01', soTien: 30, thanhToanCu: structuredClone(stored.chiTietSanPham[0].thanhToanKhach) };
  assert.equal((await goi(body)).status, 201);
  assert.deepEqual(JSON.parse(JSON.stringify(stored.chiTietSanPham[0].thanhToanKhach)), [...body.thanhToanCu, { ngay: body.ngay, soTien: 30 }]);
  assert.equal(stored['KH Thanh Toán'], 50);
  assert.equal(stored['Còn lại'], 150);
  assert.equal(stored.phieuUnc[0].maPhieu, 'unc1');
  assert.equal(audits.length, 1);
  assert.equal((await goi(body)).status, 409);
  assert.equal(stored['KH Thanh Toán'], 50);
  const moi = { ...body, maDong: 'b', thanhToanCu: [] };
  for (const thay of [{ ngay: '2026-02-30' }, { soTien: 0 }, { soTien: 1.5 }, { thanhToanCu: null }]) assert.equal((await goi({ ...moi, ...thay })).status, 400);
  user.anTaiChinh = true;
  assert.equal((await goi(moi)).status, 403);
  delete user.anTaiChinh;
  stored.lockedAt = 'locked'; user.roleId.name = 'Quản lý'; user.roleId.permissions = ['manage_orders', 'view_debts', 'manage_financials'];
  context.canViewFinancialOrderFields = () => true;
  assert.equal((await goi(moi)).status, 403);
  user.roleId.name = 'Nhân Viên';
  assert.equal((await goi(moi)).status, 403);
  user.roleId.name = 'Chỉ Xem';
  assert.equal((await goi(moi)).status, 403);
  user.roleId.name = 'Admin'; delete stored.lockedAt;
  stored.owner = 'other';
  assert.equal((await goi(moi)).status, 404);
  stored.owner = 'allowed';
  stored.phieuUnc.push({ trangThai: 'Chờ Duyệt', phanBo: [{ maDong: 'b', soTien: 10 }] });
  assert.equal((await goi(moi)).status, 409);
  stored.phieuUnc.pop();
  stored['KH Thanh Toán'] = 1;
  assert.equal((await goi(moi)).status, 409);
  stored['KH Thanh Toán'] = 50;
  conflict = true;
  assert.equal((await goi(moi)).status, 409);
  conflict = false;
  auditError = true;
  const loi = await goi(moi);
  assert.equal(loi.status, 500);
  assert.match(loi.body.message, /Đã ghi nhận thanh toán/);
  assert.equal((await goi(moi)).status, 409);
  assert.equal(stored['KH Thanh Toán'], 80);
}
kiemTra().then(() => console.log('Đạt: thanh toán theo dòng, quyền, UNC, lỗi và chống ghi trùng (MongoDB giả).'))
  .catch(loi => { console.error(loi); process.exitCode = 1; });
