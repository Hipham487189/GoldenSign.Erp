const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'DATAGS_modern_youth_lux_smooth (1).html'), 'utf8');
const dau = html.indexOf('    async function showDetail(orderId)');
const cuoi = html.indexOf('    function doiHienThiGoiCuoc(', dau);
assert.ok(dau >= 0 && cuoi > dau);

function taoMoiTruong(don, anEmail = false) {
  const nut = {};
  const phanTu = {
    modalTitle: {},
    modalBody: { innerHTML: '', scrollTop: 0 },
    detailModal: { classList: { add() {} }, setAttribute() {} },
    noiDungGoiCuoc: { insertAdjacentHTML() {} }
  };
  let khoiTaoGoiCu = false;
  const context = {
    ChiTietSanPhamTaoDon: require('../public/js/chi-tiet-san-pham-tao-don'),
    maYeuCauChiTietDon: 0, currentOrder: null, tepChiTietDaSua: null,
    allOrders: [], allCustomers: [], allProducts: [{}], API_URL: '/api/orders',
    truongTongTheoDong: ['Thành Tiền', 'Thực Thu', 'KH Thanh Toán', 'Còn lại'],
    truongGoiTheoDong: ['NCC', 'Gói '],
    fetch: async () => ({ ok: true, json: async () => ({ success: true, data: don }) }),
    document: {
      getElementById: id => phanTu[id],
      querySelector: selector => nut[selector] || (nut[selector] = {}),
      body: { classList: { add() {} } }
    },
    window: { initializeOrderEditProductSelectors: () => { khoiTaoGoiCu = true; } },
    formatMST: value => value || '--',
    escapeHtml: value => String(value).replace(/[&<>"']/g, kyTu => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[kyTu]),
    isActivatedOrder: () => false,
    parseMoneyValue: value => Number(value) || 0,
    getProductStatusOptions: () => ['Soạn Hồ Sơ'],
    getOrderPaymentMethodOptions: () => [],
    canViewColumn: (bang, cot) => cot !== 'Email' || !anEmail,
    HoSoDinhKem: { addStyles() {} },
    bangChiTietSanPham: order => Array.isArray(order.chiTietSanPham) ? '<div class="order-products-detail-card"></div>' : '',
    showAppToast: message => { throw new Error(message); }
  };
  vm.runInNewContext(html.slice(dau, cuoi), context);
  return { context, phanTu, nut, daKhoiTaoGoiCu: () => khoiTaoGoiCu };
}

async function kiemTra() {
  const don = {
    _id: 'don1', 'Mã Đơn Hàng': 'DH-1', 'Ngày Đăng Ký': '08/11/2026',
    'Tên Khách Hàng': 'Khách "A"', 'Tên Công Ty ': 'Công ty A', MST: '0123456789',
    'TÌNH TRẠNG': 'Soạn Hồ Sơ', chiTietSanPham: [{ maDong: '1' }, { maDong: '2' }]
  };
  const moi = taoMoiTruong(don);
  await moi.context.showDetail('don1');
  const giaoDien = moi.phanTu.modalBody.innerHTML;
  assert.ok(giaoDien.indexOf('order-basic-card') < giaoDien.indexOf('order-customer-card'));
  assert.ok(giaoDien.indexOf('order-product-card') < giaoDien.indexOf('order-products-detail-card'));
  assert.ok(giaoDien.indexOf('order-products-detail-card') < giaoDien.indexOf('order-attachments-detail-card'));
  for (const noiDung of ['data-field="Email"', 'openDeliveryMap()', 'toggleOrderCustomerHistory()', 'order-related-detail-card', 'order-detail-attachments', 'doiHienThiGoiCuoc(this)']) {
    assert.ok(giaoDien.includes(noiDung), noiDung);
  }
  const viTriKhach = ['data-field="MST"', 'data-field="Tên Công Ty "', 'data-field="Địa Chỉ Công Ty"', 'toggleOrderCustomerHistory()', 'data-field="Tên Khách Hàng"', 'data-field="SĐT"', 'data-field="Email"', 'data-field="Địa Chỉ Giao Nhận"', 'openDeliveryMap()'].map(truong => giaoDien.indexOf(truong));
  assert.ok(viTriKhach.every((viTri, i) => viTri >= 0 && (i === 0 || viTri > viTriKhach[i - 1])));
  assert.match(giaoDien, /Khách &quot;A&quot;/);
  assert.equal((giaoDien.match(/class="hos-file-item order-attachment-item"/g) || []).length, 5);
  assert.equal((giaoDien.match(/class="hos-file-btn"/g) || []).length, 5);
  assert.match(giaoDien, /RAR\/ZIP, tối đa 5MB/);
  assert.doesNotMatch(giaoDien, /order-package-grid/);
  for (const truong of ['Loại Sản Phẩm', 'NCC', 'Hình Thức', 'Gói ']) assert.ok(!giaoDien.includes(`data-field="${truong}"`));
  assert.match(giaoDien, /data-field="Thành Tiền"/);
  assert.ok(html.indexOf('#modalBody .form-grid { grid-template-columns: repeat(auto-fit') < html.indexOf('#modalBody .order-customer-grid { grid-template-columns: repeat(6'));
  assert.equal(moi.nut['#modalBody [data-field="Thành Tiền"]'].readOnly, true);
  const an = taoMoiTruong(don, true);
  await an.context.showDetail('don1');
  assert.doesNotMatch(an.phanTu.modalBody.innerHTML, /data-field="Email"/);
  assert.match(an.phanTu.modalBody.innerHTML, /order-customer-grid detail-an-email/);
  const motDong = taoMoiTruong({ ...don, chiTietSanPham: [{ maDong: '1' }] });
  await motDong.context.showDetail('don1');
  assert.match(motDong.phanTu.modalBody.innerHTML, /order-package-grid/);
  const cu = taoMoiTruong({ ...don, chiTietSanPham: undefined });
  await cu.context.showDetail('don1');
  assert.equal(cu.daKhoiTaoGoiCu(), true);
  const hangGoi = cu.phanTu.modalBody.innerHTML.match(/<div class="form-grid order-package-grid">([\s\S]*?)<\/div><\/div>/);
  assert.ok(hangGoi);
  const cacTruongGoi = [...hangGoi[1].matchAll(/data-field="([^"]+)"/g)].map(kq => kq[1]);
  assert.deepEqual(cacTruongGoi, ['Loại Sản Phẩm', 'NCC', 'Hình Thức', 'Gói ']);
  assert.match(cu.phanTu.modalBody.innerHTML, /order-related-detail-card/);
  console.log('Đạt: bố cục chi tiết, chức năng giữ lại, ẩn email và đơn cũ (mô phỏng).');
}
kiemTra().catch(error => { console.error(error); process.exitCode = 1; });
