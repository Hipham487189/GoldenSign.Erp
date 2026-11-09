const assert = require('node:assert/strict');
const fs = require('node:fs');
const { kiemTraDuLieuNhapSanPham } = require('../services/nhapSanPhamExcel');

const tieuDe = [
  'MÃ SẢN PHẨM',
  'TÊN SẢN PHẨM',
  'LOẠI SẢN PHẨM',
  'NCC',
  'Hình Thức',
  'GIÁ SAU THUẾ',
  'VAT',
  'THỰC ĐÓNG CÔNG TY',
  'THỰC CÔNG NỢ CTY',
  'Ngày áp dụng',
  'Ngày kết thúc'
];
const dongMau = [
  'SP001',
  'Gói A',
  'Chữ ký số',
  'VINA -GS',
  'Đăng ký mới',
  1790000,
  8,
  594057,
  398520,
  new Date('2026-11-09T00:00:00.000Z'),
  new Date('2026-12-31T00:00:00.000Z')
];

const ketQua = kiemTraDuLieuNhapSanPham(tieuDe, [dongMau]);
assert.deepEqual(ketQua.loi, []);
assert.equal(ketQua.sanPham.length, 1);
assert.equal(ketQua.sanPham[0]['Hình Thức'], 'Đăng ký mới');
assert.equal(ketQua.sanPham[0]['GIÁ TRƯỚC THUẾ'], 1657407);
assert.equal(ketQua.sanPham[0]['THỰC ĐÓNG CÔNG TY'], 594057);
assert.equal(ketQua.sanPham[0]['THỰC CÔNG NỢ CTY'], 398520);
assert.equal(ketQua.sanPham[0]['Ngày áp dụng'], '2026-11-09');
assert.equal(ketQua.sanPham[0]['Ngày kết thúc'], '2026-12-31');

const html = fs.readFileSync(require.resolve('../DATAGS_modern_youth_lux_smooth (1).html'), 'utf8');
assert((html.match(/"GIÁ TRƯỚC THUẾ":/g) || []).length >= 4);
const batDauHam = html.indexOf('    function formatProductDate(');
const ketThucHam = html.indexOf('\n    function coQuyenCapNhatSanPham', batDauHam);
const hamGiaoDien = new Function(
  'productMgmt',
  `${html.slice(batDauHam, ketThucHam)}; return { truongQuanLySanPham, giaTriCotCoDinhSanPham, formatProductDate };`
)({ items: ketQua.sanPham });
const cotGiaoDien = hamGiaoDien.truongQuanLySanPham();
const viTriHinhThuc = cotGiaoDien.indexOf('Hình Thức');
assert.deepEqual(cotGiaoDien.slice(viTriHinhThuc + 1, viTriHinhThuc + 4), ['Giá Trước Thuế', 'VAT', 'Giá Sau Thuế']);
assert(!cotGiaoDien.includes('Mã Sản Phẩm'));
assert.equal(hamGiaoDien.giaTriCotCoDinhSanPham(ketQua.sanPham[0], 'Giá Trước Thuế'), 1657407);
assert.equal(hamGiaoDien.formatProductDate(ketQua.sanPham[0]['Ngày áp dụng']), '09/11/2026');
const batDauNhap = html.indexOf('    async function importProductsFromExcel(');
const ketThucNhap = html.indexOf('\n    function openProductImportModal', batDauNhap);
const hamNhap = html.slice(batDauNhap, ketThucNhap);
assert(hamNhap.includes("cellDates: true"));
assert(hamNhap.indexOf('/import/validate') < hamNhap.indexOf('confirm(`File hợp lệ'));
assert(hamNhap.indexOf('confirm(`File hợp lệ') < hamNhap.indexOf("API_SANPHAM_URL + '/import'"));

const tieuDeKhongChiPhi = [...tieuDe].filter(tieuDeCot => !tieuDeCot.startsWith('THỰC '));
const dongKhongChiPhi = dongMau.filter((_, chiSo) => ![7, 8].includes(chiSo));
const ketQuaKhongChiPhi = kiemTraDuLieuNhapSanPham(tieuDeKhongChiPhi, [dongKhongChiPhi]);
assert.deepEqual(ketQuaKhongChiPhi.loi, []);
assert.equal(ketQuaKhongChiPhi.sanPham[0]['THỰC ĐÓNG CÔNG TY'], 0);
assert.equal(ketQuaKhongChiPhi.sanPham[0]['THỰC CÔNG NỢ CTY'], 0);

const dongKhongNgay = [...dongMau];
dongKhongNgay[9] = '';
dongKhongNgay[10] = '';
const ketQuaKhongNgay = kiemTraDuLieuNhapSanPham(tieuDe, [dongKhongNgay]);
assert.deepEqual(ketQuaKhongNgay.loi, []);
assert.equal(ketQuaKhongNgay.sanPham[0]['Ngày áp dụng'], '');
assert.equal(ketQuaKhongNgay.sanPham[0]['Ngày kết thúc'], '');

const tieuDeBienThe = [
  'Mã Sản Phẩm',
  'Tên Sản Phẩm / Gói Cước',
  'Loại Sản Phẩm',
  'NCC',
  'HÌNH THỨC',
  'Giá Sau Thuế (VNĐ)',
  'VAT (%)',
  'Thực Đóng Công Ty (VNĐ)',
  'Thực Công Nợ Cty (VNĐ)',
  'Ngày Áp Dụng',
  'Ngày Kết Thúc'
];
const dongBienThe = [
  'SP002',
  'Gói B',
  'Chữ ký số',
  'VINA -GS',
  'Gia hạn',
  1100000,
  10,
  700000,
  600000,
  '09/11/2026',
  '31/12/2026'
];
const ketQuaBienThe = kiemTraDuLieuNhapSanPham(tieuDeBienThe, [dongBienThe]);
assert.deepEqual(ketQuaBienThe.loi, []);
assert.equal(ketQuaBienThe.sanPham[0]['Hình Thức'], 'Gia hạn');
assert.equal(ketQuaBienThe.sanPham[0]['GIÁ TRƯỚC THUẾ'], 1000000);

const ketQuaSai = kiemTraDuLieuNhapSanPham(tieuDe, [[...dongMau.slice(0, 5), 'không phải giá', 8, 0, 0, '2026-02-30', 'không phải ngày']]);
assert.equal(ketQuaSai.sanPham.length, 0);
assert(ketQuaSai.loi.some(loi => loi.dong === 2 && loi.noiDung.includes('GIÁ SAU THUẾ')));
assert(ketQuaSai.loi.some(loi => loi.dong === 2 && loi.noiDung.includes('Ngày áp dụng')));
assert(ketQuaSai.loi.some(loi => loi.dong === 2 && loi.noiDung.includes('Ngày kết thúc')));

const dongThieuNgayKetThuc = [...dongMau];
dongThieuNgayKetThuc[10] = '';
const ketQuaThieuNgayKetThuc = kiemTraDuLieuNhapSanPham(tieuDe, [dongThieuNgayKetThuc]);
assert.equal(ketQuaThieuNgayKetThuc.sanPham.length, 0);
assert(ketQuaThieuNgayKetThuc.loi.some(loi => loi.noiDung.includes('cùng có dữ liệu')));

const ketQuaSaiThuTuNgay = kiemTraDuLieuNhapSanPham(tieuDe, [[...dongMau.slice(0, 9), '2026-12-31', '2026-01-01']]);
assert.equal(ketQuaSaiThuTuNgay.sanPham.length, 0);
assert(ketQuaSaiThuTuNgay.loi.some(loi => loi.noiDung.includes('trước hoặc bằng')));

const ketQuaThieuCot = kiemTraDuLieuNhapSanPham(['Tên Sản Phẩm'], [['Gói lỗi']]);
assert.equal(ketQuaThieuCot.sanPham.length, 0);
assert(ketQuaThieuCot.loi.some(loi => loi.noiDung === 'Thiếu cột bắt buộc.'));

console.log('Kiểm tra nhập Excel sản phẩm: đạt.');
