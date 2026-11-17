const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'add-order.html'), 'utf8');
const ham = html.match(/    async function taiNhanVienDangNhap\(\) \{[\s\S]*?(?=\n    async function loadProductTypes\(\))/);
assert.ok(ham, 'Không tìm thấy hàm tải nhân viên.');
assert.doesNotMatch(html, /id="timNguoiDangKy"/);

const oChon = {
  value: '',
  options: [],
  replaceChildren(...options) { this.options = options; this.value = ''; }
};
const trangThai = { textContent: '', className: '' };
const oNhanVienNhap = { value: '' };
const trangThaiNhanVienNhap = { textContent: '', className: '' };
const cacO = {
  new_nhanVien: oChon, trangThaiNguoiDangKy: trangThai, new_nhanVienNhap: oNhanVienNhap, trangThaiNhanVienNhap,
  phanTrangNguoiDangKy: { hidden: true }, nguoiDangKyTruoc: { disabled: false }, nguoiDangKyTiep: { disabled: false },
  trangNguoiDangKyText: { textContent: '' }
};
let goiApi;
const context = {
  document: { getElementById: id => cacO[id] },
  Option: function(text, value) { this.text = text; this.value = value; },
  URLSearchParams,
  maYeuCauNguoiDangKy: 0,
  trangNguoiDangKy: 1,
  conTrangNguoiDangKy: false,
  daTaiNguoiDangKy: false,
  dangTaiNguoiDangKy: false,
  setFormStatus: (id, message, type = '') => { cacO[id].textContent = message; cacO[id].className = type; },
  fetchApiData: url => goiApi(url)
};
vm.createContext(context);
vm.runInContext(ham[0], context);

async function kiemTra() {
  context.authenticatedFetch = async () => ({ ok: true, json: async () => ({ success: true, user: { employee: { name: ' Người nhập ', isActive: true } } }) });
  await context.taiNhanVienDangNhap();
  assert.equal(oNhanVienNhap.value, 'Người nhập');
  context.authenticatedFetch = async () => ({ ok: true, json: async () => ({ success: true, user: { employee: null } }) });
  await context.taiNhanVienDangNhap();
  assert.equal(oNhanVienNhap.value, '');
  assert.match(trangThaiNhanVienNhap.textContent, /chưa liên kết/);

  let url;
  goiApi = async value => { url = value; return { items: [{ name: 'An' }], hasMore: true }; };
  await context.taiNguoiDangKy(1);
  assert.match(url, /page=1$/);
  assert.equal(oChon.options[1].value, 'An');
  assert.equal(cacO.phanTrangNguoiDangKy.hidden, false);
  assert.equal(cacO.nguoiDangKyTruoc.disabled, true);
  assert.equal(cacO.nguoiDangKyTiep.disabled, false);

  oChon.value = 'An';
  goiApi = async () => ({ items: [{ name: 'Bình' }], hasMore: false });
  await context.taiNguoiDangKy(2);
  assert.equal(oChon.value, 'An');
  assert.deepEqual(oChon.options.map(option => option.value), ['', 'An', 'Bình']);
  assert.equal(cacO.nguoiDangKyTruoc.disabled, false);
  assert.equal(cacO.nguoiDangKyTiep.disabled, true);
  assert.equal(cacO.trangNguoiDangKyText.textContent, 'Trang 2');

  let traCu;
  goiApi = () => new Promise(resolve => { traCu = resolve; });
  const dangCho = context.taiNguoiDangKy(1);
  goiApi = async () => ({ items: [{ name: 'Mới' }], hasMore: false });
  await context.taiNguoiDangKy(2);
  traCu({ items: [{ name: 'Cũ' }], hasMore: false });
  await dangCho;
  assert.equal(oChon.options.some(option => option.value === 'Cũ'), false);
  assert.equal(oChon.options.some(option => option.value === 'Mới'), true);

  goiApi = async () => { throw new Error('Không có quyền'); };
  await context.taiNguoiDangKy(1);
  assert.equal(trangThai.className, 'error');
  assert.match(trangThai.textContent, /Không có quyền/);
  console.log('Đạt: tự lấy nhân viên nhập, phân trang người đăng ký và bỏ qua phản hồi cũ.');
}

kiemTra().catch(loi => { console.error(loi); process.exitCode = 1; });
