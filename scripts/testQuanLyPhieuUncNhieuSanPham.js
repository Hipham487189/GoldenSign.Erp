const assert = require('node:assert/strict');
const { taoPhieuUnc, xuLyPhieuUnc, tongUncDaDuyet } = require('../services/quanLyPhieuUncNhieuSanPham');
const { tinhCongNoKhach } = require('../services/chiTietDonHang');

const dong = {
  maDong: 'dong-1', trangThai: 'Đã Kích Hoạt', soLuong: 1, giaBan: 1000,
  giaDongCongTy: 700, giaNoNcc: 600, phaiThuKhach: 1000,
  thanhToanKhach: [{ ngay: '2026-01-01', soTien: 100 }], thanhToanNcc: []
};
const danhSach = [dong, { ...dong, maDong: 'dong-2', thanhToanKhach: [] }];
const thongTin = { ngay: '2026-02-01', soTien: 1000, ghiChu: ' thanh toán ', phanBo: [
  { maDong: 'dong-1', soTien: 300 }, { maDong: 'dong-2', soTien: 200 }
] };
const phieu = taoPhieuUnc(danhSach, thongTin);
assert.match(phieu.maPhieu, /^[0-9a-f-]{36}$/);
assert.equal(phieu.trangThai, 'Chờ Duyệt');
assert.equal(phieu.chuaPhanBo, 500);
assert.equal(phieu.ghiChu, 'thanh toán');
assert.deepEqual(tongUncDaDuyet([phieu]), {});
const duyet = xuLyPhieuUnc(danhSach, [phieu], phieu.maPhieu, 'Đã Duyệt');
assert.deepEqual(tinhCongNoKhach(duyet.chiTietSanPham), { phaiThu: 2000, daThanhToan: 600, conLai: 1400 });
assert.deepEqual(tongUncDaDuyet(duyet.phieuUnc), { '2026-02-01': 1000 });
assert.equal(danhSach[0].thanhToanKhach.length, 1);
assert.equal(phieu.trangThai, 'Chờ Duyệt');
assert.throws(() => xuLyPhieuUnc(duyet.chiTietSanPham, duyet.phieuUnc, phieu.maPhieu, 'Đã Duyệt'), /chờ duyệt/);
assert.throws(() => taoPhieuUnc(danhSach, { ...thongTin, phanBo: [] }), /chọn ít nhất một dòng/);
const phieuHai = taoPhieuUnc(danhSach, { ...thongTin, soTien: 200, phanBo: [{ maDong: 'dong-1', soTien: 100 }] });
const tuChoi = xuLyPhieuUnc(duyet.chiTietSanPham, [...duyet.phieuUnc, phieuHai], phieuHai.maPhieu, 'Từ Chối', ' Sai chứng từ ');
assert.equal(tuChoi.phieuUnc[1].lyDoTuChoi, 'Sai chứng từ');
assert.deepEqual(tongUncDaDuyet(tuChoi.phieuUnc), { '2026-02-01': 1000 });
assert.deepEqual(tinhCongNoKhach(tuChoi.chiTietSanPham), tinhCongNoKhach(duyet.chiTietSanPham));
assert.throws(() => xuLyPhieuUnc(danhSach, [phieuHai], phieuHai.maPhieu, 'Từ Chối'), /lý do/);
assert.throws(() => xuLyPhieuUnc(danhSach, [phieu, phieu], phieu.maPhieu, 'Đã Duyệt'), /bị trùng/);
assert.throws(() => xuLyPhieuUnc(danhSach, [phieu], 'khac', 'Đã Duyệt'), /Không tìm thấy/);
assert.throws(() => taoPhieuUnc(danhSach, { ...thongTin, ngay: '2026-02-30' }), /Ngày/);
assert.throws(() => taoPhieuUnc(danhSach, { ...thongTin, soTien: 400 }), /vượt/);
const coTep = taoPhieuUnc(danhSach, { ...thongTin, tep: { ten: ' UNC.pdf ', duLieu: 'data:application/pdf;base64,SGVsbG8=' } });
assert.deepEqual(coTep.tep, { ten: 'UNC.pdf', duLieu: 'data:application/pdf;base64,SGVsbG8=' });
assert.throws(() => taoPhieuUnc(danhSach, { ...thongTin, tep: { ten: 'UNC.pdf', duLieu: 'data:application/pdf;base64,????' } }), /không hợp lệ/);
const tepDungGioiHan = `data:application/pdf;base64,${Buffer.alloc(3 * 1024 * 1024).toString('base64')}`;
assert.equal(taoPhieuUnc(danhSach, { ...thongTin, tep: { ten: 'UNC.pdf', duLieu: tepDungGioiHan } }).tep.duLieu, tepDungGioiHan);
assert.throws(() => taoPhieuUnc(danhSach, { ...thongTin, tep: { ten: 'UNC.pdf', duLieu: `data:application/pdf;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')}` } }), /3MB/);
assert.throws(() => tongUncDaDuyet([{ ...phieu, trangThai: 'Đã Duyệt', soTien: -1 }]), /không hợp lệ/);
const lon = { ...phieu, trangThai: 'Đã Duyệt', soTien: Number.MAX_SAFE_INTEGER };
assert.throws(() => tongUncDaDuyet([lon, { ...lon, maPhieu: 'khac', soTien: 1 }]), /vượt giới hạn/);
console.log('Đạt: tạo, duyệt, từ chối và tổng UNC nhiều phiếu.');
