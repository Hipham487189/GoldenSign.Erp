const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'DATAGS_modern_youth_lux_smooth (1).html'), 'utf8');
const batDau = html.indexOf('    function duocSuaDongSanPham(order)');
const ketThuc = html.indexOf('    async function openMstOrderDetail(', batDau);
assert.ok(batDau >= 0 && ketThuc > batDau);
const context = {
  ChiTietSanPhamTaoDon: require('../public/js/chi-tiet-san-pham-tao-don'),
  currentUser: { role: { name: 'Admin', permissions: ['manage_orders'] } },
  escapeHtml: value => String(value).replace(/[&<>"']/g, kyTu => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[kyTu])
};
vm.runInNewContext(html.slice(batDau, ketThuc), context);
const dong = {
  maDong: 'a',
  tenSanPham: '<Gói A>', loaiSanPham: 'CKS', ncc: 'NCC A', hinhThuc: 'Mới',
  donViTinh: 'Gói', soLuong: 2, trangThai: 'Soạn Hồ Sơ',
  maSanPham: '64a000000000000000000001', giaBan: 100000, giaDongCongTy: 50000, giaNoNcc: 30000,
  phaiThuKhach: 180000, thanhToanKhach: [{ soTien: 40000 }], thanhToanNcc: []
};
const bang = context.bangChiTietSanPham({ chiTietSanPham: [dong, { ...dong, tenSanPham: 'Gói B' }] });
assert.match(bang, /&lt;Gói A&gt;/);
assert.match(bang, /Gói B/);
assert.equal((bang.match(/<tr(?:\s[^>]*)?>/g) || []).length, 4);
assert.match(bang, /200\.000 đ/);
assert.match(bang, /400\.000 đ/);
assert.match(bang, /140\.000 đ/);
assert.match(bang, /NCC A · CKS · Mới/);
assert.match(bang, /1 lần thanh toán · 40\.000 đ/);
assert.equal((bang.match(/class="form-input thanh-toan-ngay"/g) || []).length, 2);
assert.equal((bang.match(/class="form-input thanh-toan-tien"/g) || []).length, 2);
assert.equal((bang.match(/Ghi nhận thanh toán/g) || []).length, 2);
assert.match(bang, /Tổng thành tiền/);
assert.doesNotMatch(bang, /Xóa dòng|Thêm dòng/);
assert.match(bang, /Lưu thực thu sản phẩm/);
assert.equal((bang.match(/class="form-input chi-tiet-thuc-thu"/g) || []).length, 2);
assert.equal((bang.match(/onclick="moSuaDongSanPham\(/g) || []).length, 2);
assert.equal((bang.match(/class="form-select trang-thai-dong"/g) || []).length, 2);
assert.match(bang, /Đang Xử Lý/);
assert.match(bang, /fa-pen/);
let xuLyDong;
const hopThoai = {
  open: false,
  addEventListener: (ten, xuLy) => { if (ten === 'close') xuLyDong = xuLy; },
  showModal() { this.open = true; },
  close() { this.open = false; xuLyDong(); }
};
const noiDung = { dataset: {}, innerHTML: '', querySelector: chon => chon === '.xem-san-pham-dialog' && noiDung.innerHTML ? hopThoai : null };
context.currentOrder = { chiTietSanPham: [dong] };
context.document = { querySelector: () => ({ querySelector: () => noiDung }) };
context.moChiTietDongSanPham(0);
assert.match(noiDung.innerHTML, /Chi tiết sản phẩm 1/);
assert.match(noiDung.innerHTML, /Gói dịch vụ/);
assert.match(noiDung.innerHTML, /&lt;Gói A&gt;/);
assert.match(noiDung.innerHTML, /50\.000/);
assert.match(noiDung.innerHTML, /40\.000 đ/);
assert.match(noiDung.innerHTML, /<form method="dialog"/);
assert.doesNotMatch(noiDung.innerHTML, /<input|<select|sua-dong-luu|sua-san-pham-dialog/);
assert.equal(hopThoai.open, true);
hopThoai.close();
assert.equal(noiDung.innerHTML, '');
context.currentOrder = { chiTietSanPham: [{ tenSanPham: 'Gói A', soLuong: 2 }] };
context.moChiTietDongSanPham(0);
assert.doesNotMatch(noiDung.innerHTML, /Thực Đóng|CÔNG NỢ|Phải thu|thanh toán|Giá bán/);
hopThoai.close();
const anTaiChinh = context.bangChiTietSanPham({ chiTietSanPham: [{ tenSanPham: 'Gói A', soLuong: 2 }] });
assert.doesNotMatch(anTaiChinh, /Đơn giá|Thành tiền|Phải thu khách|Khách đã thanh toán|Còn lại|Lưu thực thu sản phẩm/);
assert.doesNotMatch(anTaiChinh, /Tổng thành tiền/);
const chiTietKhongDayDu = context.bangChiTietSanPham({ chiTietSanPham: [dong, { tenSanPham: 'B' }] });
assert.doesNotMatch(chiTietKhongDayDu, /Tổng thành tiền/);
assert.match(context.bangChiTietSanPham({ chiTietSanPham: [{ ncc: '<NCC>' }] }), /&lt;NCC&gt;/);
context.currentUser = { role: { name: 'Quản lý', permissions: ['manage_orders', 'view_debts'] } };
const bangQuanLy = context.bangChiTietSanPham({ chiTietSanPham: [dong] });
assert.match(bangQuanLy, /moSuaDongSanPham/);
assert.match(bangQuanLy, /1 lần thanh toán · 40\.000 đ/);
assert.doesNotMatch(bangQuanLy, /Ghi nhận thanh toán|thanh-toan-ngay|thanh-toan-tien/);
context.currentUser = { role: { name: 'Nhân Viên', permissions: ['manage_orders', 'view_debts'] } };
assert.doesNotMatch(context.bangChiTietSanPham({ chiTietSanPham: [dong] }), /Ghi nhận thanh toán|thanh-toan-ngay|thanh-toan-tien/);
context.currentUser = { role: { name: 'Chỉ Xem', permissions: ['view_debts'] } };
assert.doesNotMatch(context.bangChiTietSanPham({ chiTietSanPham: [dong] }), /chi-tiet-thuc-thu|Lưu thực thu sản phẩm/);
assert.doesNotMatch(context.bangChiTietSanPham({ chiTietSanPham: [dong] }), /moSuaDongSanPham/);
assert.doesNotMatch(context.bangChiTietSanPham({ chiTietSanPham: [dong] }), /trang-thai-dong/);
assert.doesNotMatch(context.bangChiTietSanPham({ chiTietSanPham: [dong] }), /Ghi nhận thanh toán|thanh-toan-ngay/);
assert.doesNotMatch(context.bangChiTietSanPham({ laDonNhieuSanPham: true }), /Chi Tiết Sản Phẩm/);
assert.equal(context.bangChiTietSanPham({ 'Gói ': 'Đơn cũ' }), '');
assert.match(context.bangChiTietSanPham({ chiTietSanPham: [] }), /Chưa có sản phẩm/);
const anSoLuong = context.bangChiTietSanPham({ chiTietSanPham: [{ giaBan: 100 }] });
assert.doesNotMatch(anSoLuong, /100 đ<\/td><\/tr>/);
console.log('Đạt: bảng chi tiết, số tiền, thoát HTML và trường theo quyền (mô phỏng).');
