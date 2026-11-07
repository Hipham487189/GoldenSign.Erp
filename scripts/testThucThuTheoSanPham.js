const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { tinhTongChiTiet } = require('../services/chiTietDonHang');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
const batDau = source.indexOf("app.patch('/api/orders/:id/thuc-thu-chi-tiet'");
const ketThuc = source.indexOf("\napp.patch('/api/orders/:id/trang-thai-san-pham'", batDau);
assert.ok(batDau >= 0 && ketThuc > batDau);
let handler;
let stored;
let conflict = false;
let user;
let audits;
const context = {
  app: { patch: (...args) => { handler = args.at(-1); } },
  requireAuth() {}, requirePermission: () => () => {}, hoTroNhieuSanPham: true,
  mongoose: { isValidObjectId: id => id === 'valid' },
  getAccessUser: async () => user,
  canViewFinancialOrderFields: u => u.roleId.permissions.includes('view_debts'),
  buildOrderFilter: () => ({ archivedAt: null }),
  locChiTietSanPhamTheoQuyen: don => ({ chiTietSanPham: don.chiTietSanPham }),
  sanitizeOrderForUser: don => don,
  tinhTongChiTiet,
  writeOrderAudit: async (...args) => { audits.push(args); },
  DonHang: {
    findOne: () => ({ select: () => ({ lean: async () => structuredClone(stored) }) }),
    findOneAndUpdate: (filter, update) => ({ select: () => ({ lean: async () => {
      if (conflict) return null;
      assert.equal(filter.$and[1].chiTietSanPham[0].phaiThuKhach, stored.chiTietSanPham[0].phaiThuKhach);
      Object.assign(stored, update.$set);
      return stored;
    } }) })
  },
  console
};
vm.runInNewContext(source.slice(batDau, ketThuc), context);
function dong(maDong, phaiThuKhach, thanhToanKhach = []) {
  return { maDong, soLuong: 1, trangThai: 'Soạn Hồ Sơ', giaBan: 100, giaDongCongTy: 40, giaNoNcc: 30, phaiThuKhach, thanhToanKhach, thanhToanNcc: [] };
}
async function goi(chiTiet) {
  let body;
  const res = { statusCode: 200, status(ma) { this.statusCode = ma; return this; }, json(value) { body = value; return this; } };
  await handler({ params: { id: 'valid' }, body: { chiTiet }, auth: {} }, res);
  return { status: res.statusCode, body };
}
async function kiemTra() {
  user = { isActive: true, roleId: { name: 'Admin', permissions: ['view_debts'] } };
  stored = { _id: 'valid', chiTietSanPham: [dong('a', 100, [{ ngay: '2026-01-01', soTien: 30, maPhieuUnc: 'unc1' }]), dong('b', 200)], phieuUnc: [{ maPhieu: 'unc1' }], 'Thực Thu': 300, 'KH Thanh Toán': 30, 'Còn lại': 270 };
  audits = [];
  const ds = [{ maDong: 'a', phaiThuCu: 100, phaiThuKhach: 150 }, { maDong: 'b', phaiThuCu: 200, phaiThuKhach: 250 }];
  const ketQua = await goi(ds);
  assert.equal(ketQua.status, 200);
  assert.equal(stored['Thực Thu'], 400);
  assert.equal(stored['KH Thanh Toán'], 30);
  assert.equal(stored['Còn lại'], 370);
  assert.equal(stored.chiTietSanPham[0].thanhToanKhach[0].maPhieuUnc, 'unc1');
  assert.equal(stored.phieuUnc[0].maPhieu, 'unc1');
  assert.equal(audits.length, 1);
  assert.equal((await goi(ds)).status, 409);
  assert.equal((await goi([{ maDong: 'a', phaiThuCu: 150, phaiThuKhach: -1 }])).status, 400);
  stored['KH Thanh Toán'] = 35;
  assert.equal((await goi([{ maDong: 'a', phaiThuCu: 150, phaiThuKhach: 10 }, { maDong: 'b', phaiThuCu: 250, phaiThuKhach: 10 }])).status, 409);
  assert.equal(stored['KH Thanh Toán'], 35);
  stored['KH Thanh Toán'] = 30;
  user.hiddenColumns = { orders: ['Thực Thu'] };
  assert.equal((await goi(ds)).status, 403);
  delete user.hiddenColumns;
  conflict = true;
  assert.equal((await goi([{ maDong: 'a', phaiThuCu: 150, phaiThuKhach: 10 }, { maDong: 'b', phaiThuCu: 250, phaiThuKhach: 10 }])).status, 409);
  assert.equal(stored['Thực Thu'], 400);
}
kiemTra().then(() => console.log('Đạt: cập nhật thực thu theo dòng, tổng, UNC, quyền và xung đột (MongoDB giả).'))
  .catch(loi => { console.error(loi); process.exitCode = 1; });
