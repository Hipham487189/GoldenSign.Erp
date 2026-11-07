const assert = require('node:assert/strict');
const { chuanBiSuaChiTiet } = require('../services/suaChiTietSanPham');

const cu = {
  maDong: 'dong1', maSanPham: '64a000000000000000000001', tenSanPham: 'Gói cũ',
  loaiSanPham: 'CKS', ncc: 'NCC', hinhThuc: 'Mới', donViTinh: 'Gói',
  trangThai: 'Soạn Hồ Sơ', soLuong: 1, giaBan: 100, giaDongCongTy: 40,
  giaNoNcc: 30, phaiThuKhach: 80, thanhToanKhach: [], thanhToanNcc: []
};
const phienBan = dong => ({ ...dong });
const dauVao = { maDong: 'dong1', phienBan: phienBan(cu), maSanPham: cu.maSanPham, soLuong: 2, donViTinh: 'Gói', trangThai: 'Đã Kích Hoạt', phaiThuKhach: 90 };
const goi = {
  _id: '64a000000000000000000002', 'TÊN SẢN PHẨM': 'Gói mới', 'LOẠI SẢN PHẨM': 'HDDT', NCC: 'NCC2', 'Hình Thức': 'Mới',
  'GIÁ SAU THUẾ': 200, 'THỰC ĐÓNG CÔNG TY': 80, 'THỰC CÔNG NỢ CTY': 60
};
const SanPham = { findById: () => ({ select() { return this; }, maxTimeMS() { return this; }, lean: async () => goi }) };
async function kiemTra() {
  const don = { chiTietSanPham: [cu], 'KH Thanh Toán': 0 };
  const ketQua = await chuanBiSuaChiTiet(don, dauVao, SanPham);
  assert.equal(ketQua.tong.thanhTien, 200);
  assert.equal(ketQua.tong.phaiThuKhach, 90);
  assert.equal(ketQua.moi.trangThai, 'Đã Kích Hoạt');
  assert.equal(cu.soLuong, 1);
  const doi = { ...dauVao, maSanPham: goi._id };
  const goiMoi = await chuanBiSuaChiTiet(don, doi, SanPham);
  assert.equal(goiMoi.moi.tenSanPham, 'Gói mới');
  assert.equal(goiMoi.tong.thanhTien, 400);
  assert.equal(goiMoi.tong.congNoNcc, 120);
  await assert.rejects(() => chuanBiSuaChiTiet({ ...don, phieuUnc: [{ trangThai: 'Chờ Duyệt', phanBo: [{ maDong: 'dong1' }] }] }, doi, SanPham), /UNC chờ duyệt/);
  const daTra = { ...cu, thanhToanKhach: [{ ngay: '2026-01-01', soTien: 20 }] };
  await assert.rejects(() => chuanBiSuaChiTiet({ chiTietSanPham: [daTra], 'KH Thanh Toán': 20 }, { ...doi, phienBan: phienBan(daTra) }, SanPham), /đã có thanh toán/);
  const traNcc = { ...cu, thanhToanNcc: [{ ngay: '2026-01-01', soTien: 20, maPhieu: 'p' }] };
  await assert.rejects(() => chuanBiSuaChiTiet({ chiTietSanPham: [traNcc], 'KH Thanh Toán': 0 }, { ...doi, phienBan: phienBan(traNcc) }, SanPham), /đã có thanh toán/);
  await assert.rejects(() => chuanBiSuaChiTiet(don, { ...dauVao, phienBan: { ...dauVao.phienBan, soLuong: 3 } }, SanPham), /đã thay đổi/);
  await assert.rejects(() => chuanBiSuaChiTiet({ ...don, 'KH Thanh Toán': 99 }, dauVao, SanPham), /không khớp/);
}
kiemTra().then(() => console.log('Đạt: sửa dòng, đổi gói, thanh toán, UNC chờ duyệt và xung đột (mô phỏng).'))
  .catch(error => { console.error(error); process.exitCode = 1; });
