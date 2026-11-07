const assert = require('node:assert/strict');
const { duyetPhieuUnc, chuanHoaChiTiet, tinhCongNoKhach, tongThanhToanKhachTheoThang } = require('../services/chiTietDonHang');

const dong = {
  maDong: 'dong-1', maSanPham: 'sp-1', tenSanPham: 'Gói 1',
  loaiSanPham: 'Dịch vụ', ncc: 'NCC 1', hinhThuc: 'Đăng ký mới',
  trangThai: 'Đã Kích Hoạt', soLuong: 1, giaBan: 1000, giaDongCongTy: 700,
  giaNoNcc: 600, phaiThuKhach: 1000,
  thanhToanKhach: [{ ngay: '2026-01-01', soTien: 100 }], thanhToanNcc: []
};
const danhSach = [dong, { ...dong, maDong: 'dong-2', maSanPham: 'sp-2', thanhToanKhach: [] }];
const phieu = { maPhieu: 'phieu-1', soTien: 1000, ngay: '2026-02-01', trangThai: 'Chờ Duyệt', phanBo: [
  { maDong: 'dong-1', soTien: 300 }, { maDong: 'dong-2', soTien: 200 }
] };
const ketQua = duyetPhieuUnc(danhSach, phieu);
assert.equal(ketQua.phieu.trangThai, 'Đã Duyệt');
assert.equal(ketQua.phieu.chuaPhanBo, 500);
assert.deepEqual(ketQua.chiTietSanPham[0].thanhToanKhach, [
  { ngay: '2026-01-01', soTien: 100 }, { ngay: '2026-02-01', soTien: 300, maPhieuUnc: 'phieu-1' }
]);
assert.deepEqual(tinhCongNoKhach(ketQua.chiTietSanPham), { phaiThu: 2000, daThanhToan: 600, conLai: 1400 });
assert.deepEqual(tongThanhToanKhachTheoThang(ketQua.chiTietSanPham), { '2026-01': 100, '2026-02': 500 });
assert.equal(danhSach[0].thanhToanKhach.length, 1);
assert.equal(phieu.trangThai, 'Chờ Duyệt');
assert.equal(chuanHoaChiTiet(ketQua.chiTietSanPham)[0].thanhToanKhach[1].maPhieuUnc, 'phieu-1');
assert.throws(() => duyetPhieuUnc(ketQua.chiTietSanPham, ketQua.phieu), /chờ duyệt/);
assert.throws(() => duyetPhieuUnc(ketQua.chiTietSanPham, phieu), /đã được ghi nhận/);
assert.throws(() => duyetPhieuUnc(danhSach, { ...phieu, ngay: '2026-02-30' }), /Ngày/);
assert.throws(() => duyetPhieuUnc(danhSach, { ...phieu, trangThai: 'Từ Chối' }), /chờ duyệt/);
assert.throws(() => duyetPhieuUnc(danhSach, { ...phieu, soTien: 400 }), /vượt/);
assert.throws(() => duyetPhieuUnc(danhSach, { ...phieu, phanBo: [{ maDong: 'khac', soTien: 1 }] }), /không tìm thấy/);
const coKhoangTrang = duyetPhieuUnc([{ ...dong, maDong: ' dong-1 ' }], { ...phieu, phanBo: [{ maDong: 'dong-1', soTien: 10 }] });
assert.equal(coKhoangTrang.chiTietSanPham[0].thanhToanKhach[1].soTien, 10);
const phieuKhac = duyetPhieuUnc(ketQua.chiTietSanPham, { ...phieu, maPhieu: 'phieu-2', phanBo: [{ maDong: 'dong-2', soTien: 50 }] });
assert.equal(tinhCongNoKhach(phieuKhac.chiTietSanPham).daThanhToan, 650);
console.log('Đạt: duyệt phân bổ UNC, giữ thanh toán cũ và chống ghi nhận trùng.');
