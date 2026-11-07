const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { chuanHoaChiTiet, tinhTongChiTiet } = require('../services/chiTietDonHang');

const giaoDien = fs.readFileSync(path.join(__dirname, '../add-order.html'), 'utf8');
assert.match(giaoDien, /<table class="san-pham-bang">/);
assert.match(giaoDien, /id="soDongSanPhamTam"/);
assert.match(giaoDien, /nutChon\.textContent = 'Chọn sản phẩm \/ dịch vụ'/);
assert.match(giaoDien, /nutChon\.addEventListener\('click', \(\) => moChonGoiDong\(null\)\)/);
assert.match(giaoDien, /onclick="moChonGoiDong\(null\)"/);
assert.match(giaoDien, /id="khuVucSanPhamCu"/);
assert.match(giaoDien, /getElementById\('khuVucSanPhamCu'\)\.hidden = xemThuNhieuSanPham/);
assert.match(giaoDien, /id="timGoiDong"/);
assert.match(giaoDien, /role="combobox"[^>]+aria-controls="goiGoiY"/);
assert.match(giaoDien, /id="goiGoiY"[^>]+role="listbox"/);
assert.doesNotMatch(giaoDien, /id="chonDongGoi"/);
assert.match(giaoDien, /id="thongTinGoiDong"/);
assert.match(giaoDien, /id="giaDongCongTyDong"[^>]+readonly/);
assert.match(giaoDien, /id="giaNoCongTyDong"[^>]+readonly/);
assert.match(giaoDien, /id="nutXemThuNhieuSanPham"[^>]+onclick="doiCheDoXemThuSanPham\(\)"/);
assert.match(giaoDien, /aria-controls="khuVucNhieuSanPham"/);
assert.match(giaoDien, /if \(xemThuNhieuSanPham && !sanPhamTam\.length\)/);
assert.match(giaoDien, /if \(xemThuNhieuSanPham\) donHang\.chiTietSanPham = sanPhamTam/);
assert.match(giaoDien, /'Sản phẩm \/ dịch vụ', 'Đơn vị tính'/);
assert.match(giaoDien, /'Đơn giá', 'Thuế suất', 'Thành tiền'/);
assert.match(giaoDien, /bang\.createTFoot\(\)\.insertRow\(\)/);
assert.match(giaoDien, /Tổng thành tiền \(chưa lưu\)/);
assert.match(giaoDien, /id="chonGoiDongDialog"/);
assert.match(giaoDien, /\/api\/sanpham\/order-package-search/);

const nguCanh = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/chi-tiet-san-pham-tao-don.js'), 'utf8'), nguCanh);
const { taoDong, taoThanhToan, tinhTong, capNhatDong, layGiaDanhMuc, layGiaDongCongTy, layGiaNoNcc, layThongTinDanhMuc, doiGoi } = nguCanh.window.ChiTietSanPhamTaoDon;
assert.equal(layGiaDongCongTy({ 'Thực Đóng Cty': '1.000' }), 1000);
assert.equal(layGiaNoNcc({ 'THỰC CÔNG NỢ CTY (VNĐ)': 0 }), 0);
assert.throws(() => layGiaDongCongTy({ 'THỰC ĐÓNG CÔNG TY': '' }), /thiếu/);
assert.throws(() => layGiaNoNcc({ 'THỰC CÔNG NỢ CTY': '1.5' }), /không hợp lệ/);
const thongTin = layThongTinDanhMuc({ 'LOẠI SẢN PHẨM': '  ', 'Loại Sản Phẩm': ' Chữ ký số ', NCC: ' NCC A ', 'HÌnh Thức': '', 'Hình Thức': ' Gia hạn ' });
assert.equal(thongTin.loaiSanPham, 'Chữ ký số');
assert.equal(thongTin.ncc, 'NCC A');
assert.equal(thongTin.hinhThuc, 'Gia hạn');
assert.throws(() => layThongTinDanhMuc({ 'LOẠI SẢN PHẨM': 'A', NCC: '', 'Hình Thức': 'C' }), /NCC.*thiếu/);
const giaTheoTenCu = layGiaDanhMuc({ 'Gia Sau Thue': '1.053.000', 'Thực Đóng Cty': '700,000', 'THỰC CÔNG NỢ CTY (VNĐ)': 0 });
assert.equal(giaTheoTenCu.giaBan, 1053000);
assert.equal(giaTheoTenCu.giaDongCongTy, 700000);
assert.equal(giaTheoTenCu.giaNoNcc, 0);
assert.throws(() => layGiaDanhMuc({ 'GIÁ SAU THUẾ': '1.5', 'THỰC ĐÓNG CÔNG TY': 0, 'THỰC CÔNG NỢ CTY': 0 }), /Giá bán.*không hợp lệ/);
assert.throws(() => layGiaDanhMuc({ 'GIÁ SAU THUẾ': 'abc', 'THỰC ĐÓNG CÔNG TY': 0, 'THỰC CÔNG NỢ CTY': 0 }), /Giá bán.*không hợp lệ/);
assert.throws(() => layGiaDanhMuc({ 'GIÁ SAU THUẾ': 0, 'THỰC ĐÓNG CÔNG TY': '', 'THỰC CÔNG NỢ CTY': 0 }), /Thực đóng công ty.*thiếu/);
assert.throws(() => layGiaDanhMuc({ 'GIÁ SAU THUẾ': 0, 'THỰC ĐÓNG CÔNG TY': 0, 'THỰC CÔNG NỢ CTY': Number.MAX_SAFE_INTEGER + 1 }), /Công nợ NCC.*không hợp lệ/);
const dauVao = {
  maSanPham: 'sp1', tenSanPham: 'Gói A', loaiSanPham: 'Chữ ký số', ncc: 'NCC A',
  hinhThuc: 'Đăng ký mới', donViTinh: 'Gói', trangThai: 'Đã Kích Hoạt', soLuong: '2', giaBan: '100',
  giaDongCongTy: '70', giaNoNcc: '60', phaiThuKhach: '180',
  ngayThanhToan: '2026-02-28', tienThanhToan: '40'
};
const dong = taoDong(dauVao);
dong.thanhToanKhach.push(taoThanhToan('2026-03-01', '30'));
const dongChuaKichHoat = taoDong({ ...dauVao, maSanPham: 'sp2', ncc: 'NCC B', trangThai: 'Chưa Kích Hoạt', ngayThanhToan: '', tienThanhToan: '' });
const chiTiet = chuanHoaChiTiet(JSON.parse(JSON.stringify([dong, dongChuaKichHoat])));
assert.equal(chiTiet[0].donViTinh, 'Gói');
const tong = tinhTong([dong, dongChuaKichHoat]);
assert.equal(tong.thanhTien, 400);
assert.equal(tinhTong([taoDong({ ...dauVao, soLuong: '1', giaBan: '3050000' }), taoDong({ ...dauVao, soLuong: '1', giaBan: '2000000' })]).thanhTien, 5050000);
assert.equal(tong.phaiThuKhach, 360);
assert.equal(tong.khachDaThanhToan, 70);
assert.equal(tinhTongChiTiet(chiTiet).daKichHoat.phaiThuKhach, 180);
assert.equal(tinhTongChiTiet(chiTiet).daKichHoat.khachDaThanhToan, 70);
const dongDaSua = capNhatDong(dong, { soLuong: '3', phaiThuKhach: '250', trangThai: 'Chưa Kích Hoạt' });
assert.equal(dongDaSua.soLuong, 3);
assert.equal(dongDaSua.phaiThuKhach, 250);
assert.equal(dongDaSua.trangThai, 'Chưa Kích Hoạt');
assert.equal(dongDaSua.thanhToanKhach.length, 2);
assert.equal(dongDaSua.thanhToanKhach[0].soTien, 40);
assert.equal(dongDaSua.donViTinh, 'Gói');
assert.equal(dong.soLuong, 2);
const dongDoiGoi = doiGoi(dong, { maSanPham: 'sp3', tenSanPham: 'Gói C', ncc: 'NCC C', giaBan: 150, giaDongCongTy: 90, giaNoNcc: 80 });
assert.equal(dongDoiGoi.maSanPham, 'sp3');
assert.equal(dongDoiGoi.ncc, 'NCC C');
assert.equal(dongDoiGoi.giaBan * dongDoiGoi.soLuong, 300);
assert.equal(dongDoiGoi.phaiThuKhach, 180);
assert.equal(dongDoiGoi.donViTinh, 'Gói');
assert.equal(dongDoiGoi.thanhToanKhach.length, 2);
assert.equal(dong.maSanPham, 'sp1');
assert.throws(() => doiGoi(dong, { giaBan: Number.MAX_SAFE_INTEGER }), /giới hạn/);
assert.equal(tinhTongChiTiet(chuanHoaChiTiet(JSON.parse(JSON.stringify([dongDaSua])))).daKichHoat.phaiThuKhach, 0);
assert.throws(() => capNhatDong(dong, { soLuong: '0', phaiThuKhach: '250', trangThai: 'Đã Kích Hoạt' }), /Số lượng/);
const dongKhongNhapPhaiThu = taoDong({ ...dauVao, phaiThuKhach: '' });
assert.equal(dongKhongNhapPhaiThu.phaiThuKhach, 0);
assert.equal(taoDong({ ...dauVao, phaiThuKhach: '0' }).phaiThuKhach, 0);
const tongCoDongKhongNhap = tinhTong([dong, dongKhongNhapPhaiThu]);
assert.equal(tongCoDongKhongNhap.phaiThuKhach, 180);
const dongXoaPhaiThu = capNhatDong(dong, { soLuong: '1', phaiThuKhach: '', trangThai: 'Đã Kích Hoạt' });
assert.equal(dongXoaPhaiThu.phaiThuKhach, 0);
assert.equal(dongXoaPhaiThu.thanhToanKhach.length, 2);
assert.equal(doiGoi(dongKhongNhapPhaiThu, { maSanPham: 'sp4' }).phaiThuKhach, 0);
assert.equal(tinhTongChiTiet(chuanHoaChiTiet([dongKhongNhapPhaiThu])).daKichHoat.phaiThuKhach, 0);
assert.throws(() => capNhatDong(dong, { soLuong: String(Number.MAX_SAFE_INTEGER), phaiThuKhach: '0', trangThai: 'Đã Kích Hoạt' }), /giới hạn/);
assert.throws(() => taoDong({ ...dauVao, soLuong: '0' }), /Số lượng/);
assert.throws(() => taoDong({ ...dauVao, giaBan: '1.5' }), /Đơn giá/);
assert.throws(() => taoDong({ ...dauVao, phaiThuKhach: '-1' }), /Phải thu/);
assert.throws(() => taoDong({ ...dauVao, phaiThuKhach: '1.5' }), /Phải thu/);
assert.throws(() => taoDong({ ...dauVao, tenSanPham: 'a'.repeat(201) }), /200/);
assert.throws(() => taoDong({ ...dauVao, giaBan: String(Number.MAX_SAFE_INTEGER), soLuong: '2' }), /giới hạn/);
assert.throws(() => taoThanhToan('2026-02-29', '10'), /Ngày/);
assert.throws(() => taoThanhToan('2026-01-01', '0'), /Số tiền/);
assert.throws(() => tinhTong([taoDong({ ...dauVao, phaiThuKhach: String(Number.MAX_SAFE_INTEGER) }), dong]), /giới hạn/);

async function kiemTraPhanTrangDanhMuc() {
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const batDau = server.indexOf("app.get('/api/sanpham/order-options'");
  const ketThuc = server.indexOf('// Lightweight NCC counts', batDau);
  assert.ok(batDau >= 0 && ketThuc > batDau);
  let xuLy;
  let pipeline;
  const nguCanhApi = {
    app: { get: (duongDan, ...ham) => { xuLy = ham[ham.length - 1]; } },
    requireAuth: () => {},
    requirePermission: () => () => {},
    SanPham: { aggregate: ds => {
      pipeline = ds;
      return { option: async () => Array.from({ length: 101 }, (_, i) => ({ _id: `NCC ${i}` })) };
    } },
    console
  };
  vm.runInNewContext(server.slice(batDau, ketThuc), nguCanhApi);
  async function goi(query) {
    let ketQua;
    await xuLy({ query }, { json: duLieu => { ketQua = duLieu; }, status: () => { throw new Error('API báo lỗi'); } });
    return ketQua.data;
  }
  const cu = await goi({ loaiSP: 'A' });
  assert.equal(cu.values.length, 100);
  assert.equal(cu.hasMore, true);
  assert.equal(pipeline.find(muc => '$skip' in muc).$skip, 0);
  assert.equal(pipeline.find(muc => '$limit' in muc).$limit, 101);
  const moi = await goi({ loaiSP: 'A', page: '2', limit: '20' });
  assert.equal(moi.values.length, 20);
  assert.equal(moi.page, 2);
  assert.equal(moi.hasMore, true);
  assert.equal(pipeline.find(muc => '$skip' in muc).$skip, 20);
  assert.equal(pipeline.find(muc => '$limit' in muc).$limit, 21);
  const gioiHan = await goi({ loaiSP: 'A', ncc: 'B', page: '2', limit: '9999' });
  assert.equal(gioiHan.limit, 20);
  assert.equal(pipeline.find(muc => '$skip' in muc).$skip, 20);
}

async function kiemTraTimGoi() {
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const batDau = server.indexOf("app.get('/api/sanpham/order-package-search'");
  const ketThuc = server.indexOf("app.get('/api/sanpham/order-options'", batDau);
  let xuLy;
  let dieuKien;
  let truongChon;
  let boQua;
  let gioiHan;
  let soLanTruyVan = 0;
  const nguCanhApi = {
    app: { get: (duongDan, ...ham) => { assert.equal(ham.length, 3); xuLy = ham[2]; } },
    requireAuth: () => {},
    requirePermission: quyen => { assert.equal(quyen, 'view_orders'); return () => {}; },
    SanPham: { find: dieuKienTim => {
      soLanTruyVan += 1;
      dieuKien = dieuKienTim;
      return {
        select(truong) { truongChon = truong; return this; },
        sort() { return this; },
        skip(so) { boQua = so; return this; },
        limit(so) { gioiHan = so; return this; },
        maxTimeMS() { return this; },
        async lean() { return Array.from({ length: 21 }, (_, i) => ({ _id: String(i) })); }
      };
    } },
    console
  };
  assert.ok(batDau >= 0 && ketThuc > batDau);
  vm.runInNewContext(server.slice(batDau, ketThuc), nguCanhApi);
  async function goi(query) {
    let ma = 200;
    let noiDung;
    const res = { status(so) { ma = so; return this; }, json(data) { noiDung = data; return this; } };
    await xuLy({ query }, res);
    return { ma, noiDung };
  }
  assert.equal((await goi({ q: 'a' })).ma, 400);
  assert.equal((await goi({ q: ['x', 'y'] })).ma, 400);
  assert.equal(soLanTruyVan, 0);
  const ketQua = await goi({ q: 'gói (a)', page: '2' });
  assert.equal(ketQua.noiDung.data.products.length, 20);
  assert.equal(ketQua.noiDung.data.hasMore, true);
  assert.equal(boQua, 20);
  assert.equal(gioiHan, 21);
  assert.equal(truongChon.NCC, 1);
  assert.equal(truongChon['Hình Thức'], 1);
  assert.equal(dieuKien.$or[0]['TÊN SẢN PHẨM'].test('Gói (a)'), true);
  assert.equal(dieuKien.$or[0]['TÊN SẢN PHẨM'].test('Gói a'), false);
}

Promise.all([kiemTraPhanTrangDanhMuc(), kiemTraTimGoi()]).then(() => {
  console.log('Kiểm thử giao diện xem thử và phân trang danh mục: đạt.');
}).catch(loi => {
  console.error(loi);
  process.exitCode = 1;
});
