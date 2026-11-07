const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chuanBiDonNhieuSanPham } = require('../services/taoDonNhieuSanPham');

const id = '64a000000000000000000001';
const sanPham = { _id: id, 'TÊN SẢN PHẨM': 'Gói A', 'LOẠI SẢN PHẨM': 'Dịch vụ', NCC: 'NCC A',
  'Hình Thức': 'Đăng ký mới', 'GIÁ SAU THUẾ': '1.000', 'THỰC ĐÓNG CÔNG TY': 700, 'THỰC CÔNG NỢ CTY': 600 };
const dong = { maSanPham: id, tenSanPham: 'Gói A', loaiSanPham: 'Dịch vụ', ncc: 'NCC A', hinhThuc: 'Đăng ký mới',
  donViTinh: 'Gói', trangThai: 'Đã Kích Hoạt', soLuong: 2, giaBan: 1000, giaDongCongTy: 700,
  giaNoNcc: 600, phaiThuKhach: 0, thanhToanKhach: [{ ngay: '2026-01-01', soTien: 100 }], thanhToanNcc: [] };
let soTruyVan = 0;
const SanPham = { find(filter) {
  soTruyVan += 1;
  assert.ok(filter._id.$in.length <= 100);
  return { select() { return this; }, maxTimeMS() { return this; }, async lean() { return [sanPham]; } };
} };

async function kiemTra() {
  const ketQua = await chuanBiDonNhieuSanPham(SanPham, [dong, { ...dong, trangThai: 'Chưa Kích Hoạt' }]);
  assert.equal(soTruyVan, 1);
  assert.notEqual(ketQua.chiTietSanPham[0].maDong, ketQua.chiTietSanPham[1].maDong);
  assert.equal(ketQua.chiTietSanPham[0].donViTinh, 'Gói');
  assert.equal(ketQua.tong.tatCa.thanhTien, 4000);
  assert.equal(ketQua.tong.daKichHoat.khachDaThanhToan, 100);
  await assert.rejects(() => chuanBiDonNhieuSanPham(SanPham, []), /1 đến 100/);
  await assert.rejects(() => chuanBiDonNhieuSanPham(SanPham, Array(101).fill(dong)), /1 đến 100/);
  await assert.rejects(() => chuanBiDonNhieuSanPham(SanPham, [{ ...dong, giaBan: 1 }]), /đã thay đổi/);
  await assert.rejects(() => chuanBiDonNhieuSanPham(SanPham, [{ ...dong, maSanPham: 'sai' }]), /Mã sản phẩm/);
  await assert.rejects(() => chuanBiDonNhieuSanPham(SanPham, [{ ...dong, maDong: 'gia' }]), /mã dòng/);
  await assert.rejects(() => chuanBiDonNhieuSanPham(SanPham, [{ ...dong, thanhToanKhach: [{ ngay: '2026-01-01', soTien: 1, maPhieuUnc: 'gia' }] }]), /mã dòng/);
  await assert.rejects(() => chuanBiDonNhieuSanPham(SanPham, [{ ...dong, trangThai: 'khác' }]), /Trạng thái/);

  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const batDau = server.indexOf('const xuLyTaoDon = async');
  const ketThuc = server.indexOf('\n};', batDau);
  let xuLy;
  let duLieuLuu;
  let taiChinh = true;
  const context = {
    app: { post: (...args) => { xuLy = args[args.length - 1]; } },
    requireAuth() {}, requirePermission: () => () => {},
    getAccessUser: async () => ({ isActive: true, username: 'nv' }),
    hoTroNhieuSanPham: true, process: { env: { TAO_DON_NHIEU_SAN_PHAM_ENABLED: 'true' } },
    canViewFinancialOrderFields: () => taiChinh, chuanBiDonNhieuSanPham, SanPham,
    orderScope: () => 'own', taoMaDonHangTiepTheo: async () => 'DH1', generateUniqueStt: async () => '1',
    luuKhachHangTuDonHang: async () => {}, writeOrderAudit: async () => {}, pushOrderToSheet: async () => {},
    DonHang: { create: async data => { duLieuLuu = data; return { _id: 'don', ...data }; } }, console
  };
  vm.runInNewContext(server.slice(batDau, ketThuc + 3) + '\nxuLy = xuLyTaoDon;', context);
  xuLy = context.xuLy;
  let body;
  const res = { status(code) { this.statusCode = code; return this; }, json(value) { body = value; return this; } };
  await xuLy({ body: { chiTietSanPham: [dong], 'Thành Tiền': 1, 'Thực Thu': 999 }, auth: {} }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(body.success, true);
  assert.equal(duLieuLuu['Thành Tiền'], 2000);
  assert.equal(duLieuLuu['Thực Thu'], 0);
  assert.equal(duLieuLuu['Nhân Viên Đăng Ký'], 'nv');
  taiChinh = false;
  await xuLy({ body: { chiTietSanPham: [dong] }, auth: {} }, res);
  assert.equal(res.statusCode, 403);
  taiChinh = true;
  await xuLy({ body: { chiTietSanPham: [dong], 'Trạng Thái UNC': 'Đã Duyệt' }, auth: {} }, res);
  assert.equal(res.statusCode, 400);
}

kiemTra().then(() => console.log('Đạt: tạo đơn nhiều sản phẩm, đối chiếu danh mục và quyền (MongoDB giả).'))
  .catch(loi => { console.error(loi); process.exitCode = 1; });
