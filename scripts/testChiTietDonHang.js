const assert = require('node:assert/strict');
const { TRANG_THAI_KICH_HOAT, chuanHoaChiTiet, tinhDong, tinhTongChiTiet, tinhCongNoNcc, tinhCongNoKhach, tongThanhToanKhachTheoThang } = require('../services/chiTietDonHang');

const dong = {
  soLuong: 2,
  trangThai: 'Đã Kích Hoạt',
  giaBan: 500000,
  giaDongCongTy: 300000,
  giaNoNcc: 250000,
  phaiThuKhach: 900000,
  thanhToanKhach: [{ ngay: '2026-01-31', soTien: 100000 }, { ngay: '2026-02-01', soTien: 200000 }],
  thanhToanNcc: [{ ngay: '2026-02-02', soTien: 50000 }]
};
const chuaKichHoat = { ...dong, soLuong: 1, trangThai: 'Chưa Kích Hoạt', thanhToanKhach: [], thanhToanNcc: [] };
const ketQua = tinhTongChiTiet([dong, chuaKichHoat]);
assert.deepEqual(ketQua.daKichHoat, {
  thanhTien: 1000000, thucDongCongTy: 600000, congNoNcc: 500000,
  phaiThuKhach: 900000, khachDaThanhToan: 300000, daThanhToanNcc: 50000
});
assert.equal(ketQua.tatCa.thanhTien, 1500000);
assert.equal(ketQua.tatCa.phaiThuKhach, 1800000);
assert.equal(tinhDong({ ...dong, trangThai: 'Soạn Hồ Sơ' }, 0).kichHoat, false);
assert.equal(TRANG_THAI_KICH_HOAT.test('Chưa Kích Hoạt'), false);
assert.equal(TRANG_THAI_KICH_HOAT.test('Đã Kích Hoạt'), true);
assert.throws(() => tinhTongChiTiet([]), /ít nhất một sản phẩm/);
assert.throws(() => tinhDong({ ...dong, soLuong: 0 }, 0), /số lượng/);
assert.throws(() => tinhDong({ ...dong, giaBan: -1 }, 0), /giá bán/);
assert.throws(() => tinhDong({ ...dong, giaBan: Number.MAX_SAFE_INTEGER }, 0), /vượt giới hạn/);
assert.throws(() => tinhDong({ ...dong, thanhToanKhach: [{ ngay: '2026-02-30', soTien: 1 }] }, 0), /ngày thanh toán/);
assert.throws(() => tinhDong({ ...dong, thanhToanNcc: [{ ngay: '2026-02-01', soTien: 0 }] }, 0), /lớn hơn 0/);
const vina = { ...dong, ncc: 'VINA-GS', hinhThuc: 'Đăng ký mới', giaNoNcc: 500000 };
const one = { ...dong, ncc: 'ONE-CA', hinhThuc: 'Đăng ký mới', soLuong: 1 };
const chuaKichHoatNcc = { ...vina, trangThai: 'Chưa Kích Hoạt' };
assert.deepEqual(tinhCongNoNcc([vina, one, chuaKichHoatNcc], { 'VINA-GS': { phiHoSo: 100000, dsQuy: 50000, daThanhToan: 50000 }, 'ONE-CA': { daThanhToan: 50000 } }), [
  { ncc: 'VINA-GS', soDong: 1, soLuong: 2, congNo: 1000000, token: 500000, daThanhToan: 50000, phiHoSo: 100000, dsQuy: 50000, conLai: 300000 },
  { ncc: 'ONE-CA', soDong: 1, soLuong: 1, congNo: 250000, token: 169000, daThanhToan: 50000, phiHoSo: 0, dsQuy: 0, conLai: 31000 }
]);
assert.deepEqual(tongThanhToanKhachTheoThang([vina, one, chuaKichHoatNcc]), { '2026-01': 200000, '2026-02': 400000 });
assert.deepEqual(tinhCongNoKhach([vina, one, chuaKichHoatNcc]), { phaiThu: 1800000, daThanhToan: 600000, conLai: 1200000 });
assert.equal(tinhTongChiTiet([vina, one, chuaKichHoatNcc]).daKichHoat.thucDongCongTy, 900000);
assert.deepEqual(tinhCongNoKhach([chuaKichHoatNcc]), { phaiThu: 0, daThanhToan: 0, conLai: 0 });
assert.deepEqual(tinhCongNoKhach([{ ...dong, phaiThuKhach: 100000 }]), { phaiThu: 100000, daThanhToan: 300000, conLai: 0 });
assert.deepEqual(tongThanhToanKhachTheoThang([{ ...dong, trangThai: 'Đã Thanh Toán' }]), {});
assert.throws(() => tinhCongNoNcc([{ ...vina, ncc: '' }]), /thiếu nhà cung cấp/);
assert.throws(() => tinhCongNoNcc([vina], { 'VINA-GS': { phiHoSo: -1, daThanhToan: 0 } }), /phí hồ sơ/);
assert.throws(() => tinhCongNoNcc([vina]), /tổng phiếu thanh toán/);
assert.equal(tinhCongNoNcc([{ ...vina, giaNoNcc: 0 }], { 'VINA-GS': { daThanhToan: 0 } })[0].conLai, 0);
const chiTietDauVao = {
  ...vina, maSanPham: ' san-pham-1 ', tenSanPham: ' Gói 1 ', loaiSanPham: ' CHỮ KÝ SỐ ',
  thanhToanKhach: [{ ngay: '2026-01-31', soTien: 100000, duLieuThua: true }],
  thanhToanNcc: [{ ngay: '2026-02-02', soTien: 50000, maPhieu: ' phieu-1 ' }],
  duLieuThua: 'không lưu'
};
const [chiTietMoi] = chuanHoaChiTiet([chiTietDauVao]);
assert.match(chiTietMoi.maDong, /^[0-9a-f-]{36}$/);
assert.equal(chiTietMoi.maSanPham, 'san-pham-1');
assert.equal(chiTietMoi.tenSanPham, 'Gói 1');
assert.equal(chiTietMoi.duLieuThua, undefined);
assert.deepEqual(chiTietMoi.thanhToanKhach, [{ ngay: '2026-01-31', soTien: 100000 }]);
assert.deepEqual(chiTietMoi.thanhToanNcc, [{ ngay: '2026-02-02', soTien: 50000, maPhieu: 'phieu-1' }]);
assert.equal(chiTietDauVao.maDong, undefined);
assert.equal(chuanHoaChiTiet([chiTietMoi])[0].maDong, chiTietMoi.maDong);
const chiTietKhongNhapPhaiThu = chuanHoaChiTiet([{ ...chiTietDauVao, phaiThuKhach: null }])[0];
assert.equal(chiTietKhongNhapPhaiThu.phaiThuKhach, 0);
assert.equal(tinhTongChiTiet([chiTietKhongNhapPhaiThu]).daKichHoat.phaiThuKhach, 0);
assert.equal(chuanHoaChiTiet([{ ...chiTietDauVao, phaiThuKhach: 0 }])[0].phaiThuKhach, 0);
assert.equal(chuanHoaChiTiet([{ ...chiTietDauVao, phaiThuKhach: undefined }])[0].phaiThuKhach, 0);
assert.throws(() => chuanHoaChiTiet([{ ...chiTietDauVao, phaiThuKhach: '' }]), /phải thu khách/);
assert.throws(() => chuanHoaChiTiet([
  { ...chiTietDauVao, soLuong: 1, giaBan: Number.MAX_SAFE_INTEGER, phaiThuKhach: null },
  { ...chiTietDauVao, soLuong: 1, giaBan: 1, phaiThuKhach: 0 }
]), /vượt giới hạn/);
const haiDong = chuanHoaChiTiet([chiTietDauVao, { ...chiTietDauVao, maSanPham: 'san-pham-2', tenSanPham: 'Gói 2', ncc: 'ONE-CA', trangThai: 'Chưa Kích Hoạt' }]);
assert.notEqual(haiDong[0].maDong, haiDong[1].maDong);
assert.equal(tinhTongChiTiet(haiDong).tatCa.thanhTien, 2000000);
assert.equal(tinhTongChiTiet(haiDong).daKichHoat.thanhTien, 1000000);
assert.throws(() => chuanHoaChiTiet([chiTietMoi, chiTietMoi]), /mã dòng bị trùng/);
assert.throws(() => chuanHoaChiTiet([{ ...chiTietDauVao, tenSanPham: ' ' }]), /tên sản phẩm/);
assert.throws(() => chuanHoaChiTiet([{ ...chiTietDauVao, ncc: undefined }]), /nhà cung cấp/);
assert.throws(() => chuanHoaChiTiet([{ ...chiTietDauVao, thanhToanKhach: [{ ngay: '2026-02-30', soTien: 1 }] }]), /ngày thanh toán/);
assert.throws(() => chuanHoaChiTiet([{ ...chiTietDauVao, thanhToanNcc: [{ ngay: '2026-02-02', soTien: 50000 }] }]), /mã phiếu NCC/);
assert.throws(() => chuanHoaChiTiet([{ ...chiTietDauVao, giaBan: Number.MAX_SAFE_INTEGER }]), /vượt giới hạn/);
assert.throws(() => chuanHoaChiTiet([
  { ...chiTietDauVao, giaBan: Number.MAX_SAFE_INTEGER, soLuong: 1 },
  { ...chiTietDauVao, giaBan: 1, soLuong: 1 }
]), /vượt giới hạn/);
console.log('Đạt: chi tiết, số lượng, thanh toán theo tháng, công nợ NCC và dữ liệu không hợp lệ.');
