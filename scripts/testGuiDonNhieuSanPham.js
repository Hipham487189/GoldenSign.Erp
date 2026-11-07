const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function kiemTra() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'add-order.html'), 'utf8');
  const batDau = html.indexOf('    function readOrderAttachment(');
  const ketThuc = html.indexOf('    // Khởi tạo khi trang tải', batDau);
  assert.ok(batDau >= 0 && ketThuc > batDau);
  const ds = [{ maSanPham: 'sp1', tenSanPham: 'Gói A' }, { maSanPham: 'sp2', tenSanPham: 'Gói B' }];
  const nut = { disabled: false };
  const tep = {};
  const HoSoDinhKem = require('../public/js/hoSoDinhKem');
  const hoSo = Object.create(HoSoDinhKem.prototype);
  hoSo.files = tep;
  let daGui;
  let thongBao;
  let daTroVe = false;
  const context = {
    xemThuNhieuSanPham: true, sanPhamTam: ds, danhSachGoiTrangHienTai: [],
    document: {
      getElementById: id => ({ value: id === 'new_customerId' ? 'khach-id' : '' }),
      querySelector: () => nut
    },
    window: { hoSoDinhKem: hoSo },
    FileReader: class {
      readAsDataURL(file) {
        this.result = `data:${file.name}`;
        this.onload();
      }
    },
    parseMoneyValue: () => 0, canonicalMST: value => value,
    authenticatedFetch: async (url, options) => {
      daGui = { url, body: JSON.parse(options.body) };
      return { ok: true, async json() { return { success: true, data: { 'Mã Đơn Hàng': 'DH1' } }; } };
    },
    sessionStorage: { setItem() {} }, goBack() { daTroVe = true; },
    hienThongBao: async message => { thongBao = message; }, console
  };
  vm.runInNewContext(html.slice(batDau, ketThuc), context);
  await context.submitCreateOrder();
  assert.equal(daGui.url, '/api/orders/create-voi-khach-hang');
  assert.deepEqual(daGui.body.chiTietSanPham, ds);
  assert.equal(daGui.body['Hợp Đồng / GDK'], '');
  assert.equal(daTroVe, true);
  assert.equal(nut.disabled, false);

  Object.assign(tep, {
    hopDong: { name: 'hopdong.pdf', size: 10 },
    xacNhan: { name: 'xacnhan.pdf', size: 10 },
    gpkd: { name: 'gpkd.pdf', size: 10 },
    cccd: { name: 'cccd.png', size: 10 },
    fileTong: { name: 'tong.zip', size: 10 }
  });
  await context.submitCreateOrder();
  assert.equal(daGui.body['Hợp Đồng / GDK'], 'data:hopdong.pdf');
  assert.equal(daGui.body['Xác Nhận/ BBBG'], 'data:xacnhan.pdf');
  assert.equal(daGui.body.GPKD, 'data:gpkd.pdf');
  assert.equal(daGui.body.CCCD, 'data:cccd.png');
  assert.equal(daGui.body['File tong'], 'data:tong.zip');

  tep.fileTong = { name: 'tong.pdf', size: 10 };
  daGui = null;
  await context.submitCreateOrder();
  assert.equal(daGui, null);
  assert.match(thongBao, /RAR hoặc ZIP/);
  tep.fileTong = null;
  tep.hopDong = { name: 'lon.pdf', size: 5 * 1024 * 1024 + 1 };
  await context.submitCreateOrder();
  assert.equal(daGui, null);
  assert.match(thongBao, /vượt quá 5MB/);

  context.window.hoSoDinhKem = null;
  await context.submitCreateOrder();
  assert.equal(daGui, null);
  assert.match(thongBao, /Không thể tải phần hồ sơ đính kèm/);
  assert.equal(nut.disabled, false);

  context.sanPhamTam = [];
  daGui = null;
  await context.submitCreateOrder();
  assert.equal(daGui, null);
  assert.match(thongBao, /ít nhất một sản phẩm/);
}

kiemTra().then(() => console.log('Đạt: gửi các dòng từ giao diện tới API tạo đơn (mô phỏng).'))
  .catch(loi => { console.error(loi); process.exitCode = 1; });
