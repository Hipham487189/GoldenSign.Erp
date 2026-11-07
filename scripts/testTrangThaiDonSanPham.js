const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cacTrangThai } = require('../public/js/chi-tiet-san-pham-tao-don');
const { chuanBiSuaChiTiet } = require('../services/suaChiTietSanPham');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const dauDong = source.indexOf("app.patch('/api/orders/:id/trang-thai-san-pham'");
const cuoiDong = source.indexOf("app.patch('/api/orders/:id/chi-tiet-san-pham'", dauDong);
const dauDon = source.indexOf("app.put('/api/orders/update/:id'");
const cuoiDon = source.indexOf("\napp.delete('/api/orders/delete/:id'", dauDon);
assert.ok(dauDong >= 0 && cuoiDong > dauDong && dauDon >= 0 && cuoiDon > dauDon);

let handlerDong;
let handlerDon;
let user;
let don;
let capNhat;
let xungDot = false;
let anTrangThai = false;
let lichSu = [];
const truong = ['maDong', 'maSanPham', 'tenSanPham', 'loaiSanPham', 'ncc', 'hinhThuc', 'soLuong', 'donViTinh', 'trangThai', 'phaiThuKhach', 'giaBan', 'giaDongCongTy', 'giaNoNcc', 'thanhToanKhach', 'thanhToanNcc'];
const dong = maDong => Object.fromEntries(truong.map(key => [key, key === 'maDong' ? maDong : key === 'trangThai' ? 'Soạn Hồ Sơ' : key]));
const context = {
  app: { patch: (...args) => { handlerDong = args.at(-1); }, put: (...args) => { handlerDon = args.at(-1); } },
  requireAuth() {}, requirePermission: () => () => {}, cacTrangThai, hoTroNhieuSanPham: true,
  getAccessUser: async () => user, canViewFinancialOrderFields: u => u.roleId.name === 'Admin',
  mongoose: { isValidObjectId: () => true }, buildOrderFilter: () => ({ archivedAt: null }),
  orderScope: () => 'all',
  locChiTietSanPhamTheoQuyen: value => ({
    ...value, chiTietSanPham: anTrangThai ? value.chiTietSanPham.map(({ trangThai, ...khac }) => khac) : value.chiTietSanPham
  }),
  buildOrderHistoryChanges: (cu, moi) => cu['TÌNH TRẠNG'] !== moi['TÌNH TRẠNG'] && Object.hasOwn(moi, 'TÌNH TRẠNG')
    ? [{ field: 'TÌNH TRẠNG', from: cu['TÌNH TRẠNG'], to: moi['TÌNH TRẠNG'] }] : [],
  OrderHistory: { create: async entry => { lichSu.push(entry); } },
  writeOrderAudit: async (id, req, action, changes) => { lichSu.push({ changes }); },
  pushOrderToSheet: async () => {}, console,
  DonHang: {
    findOne: () => ({ select: () => ({ lean: async () => structuredClone(don) }) }),
    findById: () => ({ lean: async () => structuredClone(don) }),
    findOneAndUpdate: (filter, patch) => {
      assert.ok(filter.$and.some(item => item.chiTietSanPham));
      capNhat = patch.$set;
      const value = xungDot ? null : { ...don, ...capNhat };
      return {
        select: () => ({ lean: async () => value && { _id: don._id } }),
        then: (resolve, reject) => Promise.resolve(value && { toObject: () => value }).then(resolve, reject)
      };
    },
    findByIdAndUpdate: async (id, patch) => {
      capNhat = patch.$set;
      return { toObject: () => ({ ...don, ...capNhat }) };
    }
  }
};
vm.runInNewContext(source.slice(dauDong, cuoiDong), context);
vm.runInNewContext(source.slice(dauDon, cuoiDon), context);
async function goi(handler, body) {
  let ketQua;
  const res = { statusCode: 200, status(ma) { this.statusCode = ma; return this; }, json(value) { ketQua = value; return this; } };
  await handler({ params: { id: 'id' }, body, auth: {} }, res);
  return { ma: res.statusCode, ketQua };
}

async function kiemTra() {
  user = { isActive: true, roleId: { name: 'Admin', permissions: [] } };
  don = { _id: 'id', 'TÌNH TRẠNG': 'Soạn Hồ Sơ', chiTietSanPham: [dong('a'), { ...dong('b'), trangThai: 'Đã Kích Hoạt' }] };
  const body = { maDong: 'a', trangThaiCu: 'Soạn Hồ Sơ', trangThai: 'Đang Xử Lý' };
  let ketQua = await goi(handlerDong, body);
  assert.equal(ketQua.ma, 200);
  assert.equal(capNhat.chiTietSanPham[0].trangThai, 'Đang Xử Lý');
  assert.equal(capNhat.chiTietSanPham[1].trangThai, 'Đã Kích Hoạt');
  assert.equal(Object.keys(capNhat).join(','), 'chiTietSanPham');
  assert.equal(ketQua.ketQua.data.trangThai, 'Đang Xử Lý');
  assert.equal(lichSu[0].changes[0].field, 'chiTietSanPham.a.trangThai');
  assert.equal((await goi(handlerDong, { ...body, trangThaiCu: 'khác' })).ma, 409);
  assert.equal((await goi(handlerDong, { ...body, trangThai: 'khác' })).ma, 400);
  xungDot = true;
  assert.equal((await goi(handlerDong, body)).ma, 409);
  xungDot = false;
  anTrangThai = true;
  assert.equal((await goi(handlerDong, body)).ma, 403);
  anTrangThai = false;
  user = { isActive: true, roleId: { name: 'Chỉ Xem', permissions: [] } };
  assert.equal((await goi(handlerDong, body)).ma, 403);
  user = { isActive: true, roleId: { name: 'Admin', permissions: [] } };
  lichSu = [];
  ketQua = await goi(handlerDon, { 'TÌNH TRẠNG': 'Hoàn Tất' });
  assert.equal(ketQua.ma, 200);
  assert.deepEqual(Array.from(capNhat.chiTietSanPham, item => item.trangThai), ['Hoàn Tất', 'Hoàn Tất']);
  assert.equal(lichSu[0].changes.length, 3);
  assert.equal(capNhat.chiTietSanPham[1].thanhToanKhach, don.chiTietSanPham[1].thanhToanKhach);
  xungDot = true;
  assert.equal((await goi(handlerDon, { 'TÌNH TRẠNG': 'Đã Duyệt' })).ma, 409);
  xungDot = false;
  anTrangThai = true;
  assert.equal((await goi(handlerDon, { 'TÌNH TRẠNG': 'Đã Duyệt' })).ma, 403);
  anTrangThai = false;
  assert.equal((await goi(handlerDon, { 'TÌNH TRẠNG': 'khác' })).ma, 400);
  assert.equal((await goi(handlerDon, { 'TÌNH TRẠNG': 'Đã Duyệt', trangThaiDonCu: 'Đã Kích Hoạt' })).ma, 409);
  assert.equal((await goi(handlerDon, { 'TÌNH TRẠNG': 'Đã Duyệt', trangThaiDonCu: 'Soạn Hồ Sơ' })).ma, 200);
  assert.equal(Object.hasOwn(capNhat, 'trangThaiDonCu'), false);
  await goi(handlerDon, { 'TÌNH TRẠNG': 'Soạn Hồ Sơ', 'Tên Khách Hàng': 'Mới' });
  assert.equal(Object.hasOwn(capNhat, 'chiTietSanPham'), false);

  const sanPhamCu = { maDong: 'a', maSanPham: '64a000000000000000000001', tenSanPham: 'A', loaiSanPham: 'A', ncc: 'N', hinhThuc: 'M', soLuong: 1, donViTinh: 'Gói', trangThai: 'Đang Xử Lý', phaiThuKhach: 0, giaBan: 10, giaDongCongTy: 2, giaNoNcc: 1, thanhToanKhach: [], thanhToanNcc: [] };
  const sua = await chuanBiSuaChiTiet({ chiTietSanPham: [sanPhamCu], 'KH Thanh Toán': 0 }, { ...sanPhamCu, phienBan: { ...sanPhamCu } }, {});
  assert.equal(sua.moi.trangThai, 'Đang Xử Lý');
  console.log('Đạt: trạng thái từng dòng, đồng bộ đơn, quyền, lịch sử và xung đột (MongoDB giả).');
}
kiemTra().catch(loi => { console.error(loi); process.exitCode = 1; });
