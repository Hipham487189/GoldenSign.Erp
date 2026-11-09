const assert = require('node:assert/strict');
const { taoBoLocSanPhamHetHan, taoBoLocSanPhamConApDung } = require('../services/sanPhamHetHan');

const ngayHienTai = new Date(2026, 10, 9, 14, 30);
const hetHan = taoBoLocSanPhamHetHan(ngayHienTai);
const conApDung = taoBoLocSanPhamConApDung(ngayHienTai);
const serialHomNay = Math.floor((Date.UTC(2026, 10, 9) - Date.UTC(1899, 11, 30)) / 86400000);

assert(hetHan.$or.some(dieuKien => dieuKien['Ngày kết thúc']?.$lt === '2026-11-09'));
assert(hetHan.$or.some(dieuKien => dieuKien['Ngày kết thúc']?.$lt instanceof Date));
assert(hetHan.$or.some(dieuKien => dieuKien['Ngày kết thúc']?.$lt === serialHomNay));
assert.deepEqual(conApDung, { $nor: [hetHan] });
assert(hetHan.$or.every(dieuKien => {
  const [tenCot, dieuKienCot] = Object.entries(dieuKien)[0] || [];
  return tenCot && dieuKienCot.$type;
}));
assert(hetHan.$or
  .filter(dieuKien => Object.values(dieuKien)[0].$type === 'string')
  .every(dieuKien => Object.values(dieuKien)[0].$regex.test('2026-11-08')));
assert(hetHan.$or
  .filter(dieuKien => Object.values(dieuKien)[0].$type === 'string')
  .every(dieuKien => !Object.values(dieuKien)[0].$regex.test('')));

console.log('Kiểm tra bộ lọc sản phẩm hết hạn: đạt.');
