const assert = require('assert');
const { tinhQuyTrinhDonHang } = require('../services/quyTrinhDonHang');

// 1. Đơn mới soạn hồ sơ
const flow1 = tinhQuyTrinhDonHang({
  'TÌNH TRẠNG': 'Soạn Hồ Sơ',
  'Thành Tiền': 1790000,
  'Thực Thu': 1250000,
  'KH Thanh Toán': 0
});
assert.strictEqual(flow1.length, 6);
assert.deepStrictEqual(flow1.map(n => n.nhan), [
  'Soạn Hồ Sơ',
  'Kích Hoạt',
  'Xuất Hóa Đơn',
  'Thanh Toán',
  'Giao Nhận',
  'Hồ Sơ'
]);
assert.strictEqual(flow1[0].trangThai, 'dang_xu_ly');
assert.strictEqual(flow1[1].trangThai, 'chua_bat_dau');
assert.strictEqual(flow1[2].trangThai, 'chua_bat_dau');
assert.strictEqual(flow1[3].trangThai, 'chua_bat_dau');
assert.strictEqual(flow1[4].trangThai, 'chua_bat_dau');
assert.strictEqual(flow1[5].trangThai, 'chua_bat_dau');

// 2. Đơn đã kích hoạt, đã xuất hóa đơn, đã thanh toán đủ, đang giao nhận, đã nộp hồ sơ NCC
const flow2 = tinhQuyTrinhDonHang(
  {
    'TÌNH TRẠNG': 'Đã Kích Hoạt',
    'Xuất Hóa Đơn': 'Đã Xuất',
    'Thực Thu': 1250000,
    'KH Thanh Toán': 1250000,
    'Còn lại': 0
  },
  {
    'TÌNH TRẠNG': 'Đang Trên Đường Giao',
    quyTrinhGiaoNhan: { buocHienTai: 'dang_giao' }
  },
  {
    'TÌNH TRẠNG HỒ SƠ': 'Đã nộp',
    'Nơi Nộp': 'VINA',
    quyTrinhHoSo: { buocHienTai: 'nop_ncc' }
  }
);
assert.strictEqual(flow2[0].trangThai, 'hoan_thanh');
assert.strictEqual(flow2[1].trangThai, 'hoan_thanh');
assert.strictEqual(flow2[2].trangThai, 'hoan_thanh');
assert.strictEqual(flow2[3].trangThai, 'hoan_thanh');
assert.strictEqual(flow2[4].trangThai, 'dang_xu_ly');
assert.strictEqual(flow2[5].trangThai, 'hoan_thanh');

// 3. Đơn nhiều sản phẩm kích hoạt 1/2
const flow3 = tinhQuyTrinhDonHang({
  'TÌNH TRẠNG': 'Soạn Hồ Sơ',
  chiTietSanPham: [
    { trangThai: 'Đã Kích Hoạt' },
    { trangThai: 'Soạn Hồ Sơ' }
  ],
  'Hợp Đồng / GDK': '__HAS_ATTACHMENT__'
});
assert.strictEqual(flow3[0].trangThai, 'hoan_thanh');
assert.strictEqual(flow3[1].trangThai, 'dang_xu_ly');
assert.strictEqual(flow3[1].moTa, 'Kích hoạt 1/2 SP');
assert.strictEqual(flow3[5].trangThai, 'dang_xu_ly');

console.log('✅ Tất cả kiểm thử Quy Trình Đơn Hàng 6 node đã đạt!');
