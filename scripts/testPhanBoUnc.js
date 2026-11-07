const assert = require('node:assert/strict');
const { kiemTraPhanBoUnc } = require('../services/chiTietDonHang');

const phanBo = [{ maDong: ' dong-1 ', soTien: 300000 }, { maDong: 'dong-2', soTien: 200000 }];
assert.deepEqual(kiemTraPhanBoUnc(800000, phanBo, ['dong-1', 'dong-2']), {
  phanBo: [{ maDong: 'dong-1', soTien: 300000 }, { maDong: 'dong-2', soTien: 200000 }],
  tongPhanBo: 500000,
  chuaPhanBo: 300000
});
assert.equal(phanBo[0].maDong, ' dong-1 ');
assert.equal(kiemTraPhanBoUnc(500000, phanBo, ['dong-1', 'dong-2']).chuaPhanBo, 0);
assert.deepEqual(kiemTraPhanBoUnc(1, [], ['dong-1']), { phanBo: [], tongPhanBo: 0, chuaPhanBo: 1 });
assert.throws(() => kiemTraPhanBoUnc(0, [], ['dong-1']), /lớn hơn 0/);
assert.throws(() => kiemTraPhanBoUnc(1.5, [], ['dong-1']), /số nguyên/);
assert.throws(() => kiemTraPhanBoUnc(1, null, ['dong-1']), /danh sách/);
assert.throws(() => kiemTraPhanBoUnc(1, [], []), /mã dòng/);
assert.throws(() => kiemTraPhanBoUnc(1, [], ['dong-1', ' dong-1 ']), /bị trùng/);
assert.throws(() => kiemTraPhanBoUnc(1, [null], ['dong-1']), /không hợp lệ/);
assert.throws(() => kiemTraPhanBoUnc(1, [{ maDong: 'khac', soTien: 1 }], ['dong-1']), /không tìm thấy/);
assert.throws(() => kiemTraPhanBoUnc(2, [{ maDong: 'dong-1', soTien: 1 }, { maDong: ' dong-1 ', soTien: 1 }], ['dong-1']), /bị trùng/);
assert.throws(() => kiemTraPhanBoUnc(1, [{ maDong: 'dong-1', soTien: 0 }], ['dong-1']), /lớn hơn 0/);
assert.throws(() => kiemTraPhanBoUnc(1, [{ maDong: 'dong-1', soTien: 2 }], ['dong-1']), /vượt số tiền/);
assert.throws(() => kiemTraPhanBoUnc(Number.MAX_SAFE_INTEGER, [{ maDong: 'dong-1', soTien: Number.MAX_SAFE_INTEGER }, { maDong: 'dong-2', soTien: 1 }], ['dong-1', 'dong-2']), /vượt giới hạn/);
console.log('Đạt: kiểm tra phân bổ UNC nhiều dòng và phần chưa phân bổ.');
