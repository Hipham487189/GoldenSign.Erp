const assert = require('assert');
const {
  phanLoaiThayDoi,
  chuanHoaLichSuGiaoNhan,
  chuanHoaLichSuHoSo,
  phanNhomLichSuDonHang,
  locLichSuTheoNhom
} = require('../services/phanLoaiLichSuDonHang');

// 1. Phân loại các trường chính xác (đặc biệt trường dễ trùng từ khóa)
assert.strictEqual(phanLoaiThayDoi({ field: 'KH Thanh Toán', to: '1500000' }), 'thanh_toan');
assert.strictEqual(phanLoaiThayDoi({ field: 'Trạng Thái UNC', to: 'Đã duyệt' }), 'thanh_toan');
assert.strictEqual(phanLoaiThayDoi({ field: 'chiTietSanPham.d1.thanhToanKhach', to: '500000' }), 'thanh_toan');
assert.strictEqual(phanLoaiThayDoi({ field: 'Tình  Trạng Giao Nhận', to: 'Đang giao' }), 'giao_nhan');
assert.strictEqual(phanLoaiThayDoi({ field: 'SỐ  BILL', to: 'VTP123456' }), 'giao_nhan');
assert.strictEqual(phanLoaiThayDoi({ field: 'TÌNH TRẠNG HỒ SƠ', to: 'Đủ hồ sơ' }), 'ho_so');
assert.strictEqual(phanLoaiThayDoi({ field: 'FILE ĐÍNH KÈM', to: 'gridfs:123' }), 'ho_so');
assert.strictEqual(phanLoaiThayDoi({ field: 'TÌNH TRẠNG', to: 'Đã Kích Hoạt' }), 'kich_hoat');
assert.strictEqual(phanLoaiThayDoi({ field: 'chiTietSanPham.d1.trangThai', to: 'Đã Kích Hoạt' }), 'kich_hoat');
assert.strictEqual(phanLoaiThayDoi({ field: 'Xuất Hóa Đơn', to: 'Đã xuất' }), 'kich_hoat');
assert.strictEqual(phanLoaiThayDoi({ field: 'Thao tác', to: 'Duyệt UNC thành công' }), 'thanh_toan');
assert.strictEqual(phanLoaiThayDoi({ field: 'Tên Khách Hàng', to: 'Nguyễn Văn A' }), 'khac');

// 2. Tách entry có nhiều thay đổi thuộc nhiều nhóm
const orderEntries = [
  {
    _id: 'o1',
    changedBy: 'admin',
    changedAt: '2026-11-27T08:00:00.000Z',
    changes: [
      { field: 'KH Thanh Toán', from: '0', to: '1000000' },
      { field: 'TÌNH TRẠNG', from: 'Soạn Hồ Sơ', to: 'Đã Kích Hoạt' }
    ]
  }
];

const gnEntries = chuanHoaLichSuGiaoNhan([
  {
    _id: 'gn1',
    ID: 'GN-01',
    quyTrinhGiaoNhan: {
      lichSu: [
        { buoc: 'dang_giao', nguoiGiao: 'Nam', nguoiThaoTac: 'admin', thoiGian: '2026-11-27T09:00:00.000Z' }
      ]
    }
  }
]);

const hsEntries = chuanHoaLichSuHoSo([
  {
    _id: 'hs1',
    ID: 'HS-01',
    quyTrinhHoSo: {
      lichSu: [
        { tuBuoc: 'khach_hang', denBuoc: 'hi_nhan', nguoiNhan: 'Hi', nguoiThaoTac: 'admin', thoiGian: '2026-11-27T10:00:00.000Z' }
      ]
    }
  }
]);

const { items, counts } = phanNhomLichSuDonHang(orderEntries, gnEntries, hsEntries);
assert.strictEqual(counts.tong, 3);
assert.strictEqual(counts.thanh_toan, 1);
assert.strictEqual(counts.kich_hoat, 1);
assert.strictEqual(counts.giao_nhan, 1);
assert.strictEqual(counts.ho_so, 1);

const onlyPay = locLichSuTheoNhom(items, 'thanh_toan');
assert.strictEqual(onlyPay.length, 1);
assert.strictEqual(onlyPay[0].changes.length, 1);
assert.strictEqual(onlyPay[0].changes[0].field, 'KH Thanh Toán');

const onlyActivate = locLichSuTheoNhom(items, 'kich_hoat');
assert.strictEqual(onlyActivate.length, 1);
assert.strictEqual(onlyActivate[0].changes[0].field, 'TÌNH TRẠNG');

const onlyGn = locLichSuTheoNhom(items, 'giao_nhan');
assert.strictEqual(onlyGn.length, 1);
assert.ok(onlyGn[0].changes[0].to.includes('Đang Trên Đường Giao'));

const onlyHs = locLichSuTheoNhom(items, 'ho_so');
assert.strictEqual(onlyHs.length, 1);
assert.ok(onlyHs[0].changes[0].to.includes('Hi nhận'));

console.log('✅ Tất cả kiểm thử phân loại Lịch Sử Đơn Hàng đã đạt!');
