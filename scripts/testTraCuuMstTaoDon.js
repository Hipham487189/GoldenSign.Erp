const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'add-order.html'), 'utf8');
const ham = html.match(/    function canonicalMST\(value\) \{[\s\S]*?(?=\n    function searchCustomers\(\))/);
const hamTrangThai = html.match(/    function setFormStatus\(elementId, message, type = ''\) \{[\s\S]*?\n    \}/);
assert.ok(ham && hamTrangThai, 'Không tìm thấy các hàm tra cứu MST.');

const cacO = Object.fromEntries([
  'new_mst', 'mstLoading', 'new_customerId', 'new_tenKH', 'new_sdt',
  'new_congTy', 'new_diaChiCongTy', 'new_diaChiGiaoNhan', 'new_email'
].map(id => [id, { value: '', textContent: '' }]));
const context = {
  document: { getElementById: id => cacO[id] },
  maYeuCauMST: 0,
  console,
  encodeURIComponent
};
vm.createContext(context);
vm.runInContext(hamTrangThai[0], context);
vm.runInContext(ham[0], context);

async function kiemTra() {
  cacO.new_mst.value = '0123456789';
  Object.assign(cacO.new_customerId, { value: 'khach-cu' });
  cacO.new_tenKH.value = 'Tên giữ nguyên';
  cacO.new_sdt.value = 'Điện thoại giữ nguyên';
  cacO.new_diaChiGiaoNhan.value = 'Giao nhận giữ nguyên';
  cacO.new_email.value = 'email giữ nguyên';
  context.authenticatedFetch = async () => ({ ok: true, json: async () => ({
    success: true, data: { _id: 'khach-moi', tenKH: 'Tên khác', sdt: 'Khác', congTy: 'Công ty nội bộ',
      diaChiCongTy: 'Địa chỉ nội bộ', diaChiGiaoNhan: 'Giao nhận khác', email: 'khac' }
  }) });
  await context.lookupMST();
  assert.equal(cacO.new_congTy.value, 'Công ty nội bộ');
  assert.equal(cacO.new_diaChiCongTy.value, 'Địa chỉ nội bộ');
  assert.equal(cacO.new_customerId.value, 'khach-cu');
  assert.equal(cacO.new_tenKH.value, 'Tên giữ nguyên');
  assert.equal(cacO.new_sdt.value, 'Điện thoại giữ nguyên');
  assert.equal(cacO.new_diaChiGiaoNhan.value, 'Giao nhận giữ nguyên');
  assert.equal(cacO.new_email.value, 'email giữ nguyên');
  assert.equal(cacO.mstLoading.className, 'form-status success');

  cacO.new_congTy.value = '';
  cacO.new_diaChiCongTy.value = '';
  context.authenticatedFetch = async () => ({ ok: false, status: 404, json: async () => ({ success: false }) });
  context.fetch = async () => ({ ok: true, json: async () => ({ code: '00', data: { name: 'Công ty API', address: 'Địa chỉ API' } }) });
  await context.lookupMST();
  assert.equal(cacO.new_congTy.value, 'Công ty API');
  assert.equal(cacO.new_diaChiCongTy.value, 'Địa chỉ API');
  assert.equal(cacO.new_tenKH.value, 'Tên giữ nguyên');
  assert.equal(cacO.new_diaChiGiaoNhan.value, 'Giao nhận giữ nguyên');
  assert.equal(cacO.mstLoading.className, 'form-status success');

  cacO.new_congTy.value = 'Công ty nhập tay';
  cacO.new_diaChiCongTy.value = 'Địa chỉ nhập tay';
  await context.lookupMST();
  assert.equal(cacO.new_congTy.value, 'Công ty nhập tay');
  assert.equal(cacO.new_diaChiCongTy.value, 'Địa chỉ nhập tay');

  context.fetch = async () => ({ ok: false, json: async () => ({ code: '99' }) });
  await context.lookupMST();
  assert.equal(cacO.mstLoading.className, 'form-status error');
  assert.match(cacO.mstLoading.textContent, /Không tìm thấy/);
  context.fetch = async () => { throw new Error('Mất kết nối'); };
  await context.lookupMST();
  assert.equal(cacO.mstLoading.className, 'form-status error');
  assert.match(cacO.mstLoading.textContent, /Mất kết nối/);

  let traKetQua;
  context.authenticatedFetch = () => new Promise(resolve => { traKetQua = resolve; });
  cacO.new_congTy.value = '';
  cacO.new_diaChiCongTy.value = '';
  const dangTra = context.lookupMST();
  cacO.new_mst.value = '0987654321';
  context.formatMstTyping(cacO.new_mst);
  assert.equal(cacO.mstLoading.className, 'form-status');
  assert.equal(cacO.mstLoading.textContent, '');
  traKetQua({ ok: true, json: async () => ({ success: true, data: { congTy: 'Kết quả cũ' } }) });
  await dangTra;
  assert.equal(cacO.new_congTy.value, '');

  context.fillCustomerFields({ _id: 'khach-chon', name: 'Khách chọn', phone: '123', deliveryAddress: 'Địa chỉ giao nhận', email: 'a@example.test' });
  assert.equal(cacO.new_customerId.value, 'khach-chon');
  assert.equal(cacO.new_tenKH.value, 'Khách chọn');
  assert.equal(cacO.new_sdt.value, '123');
  console.log('Đạt: tra MST chỉ điền công ty, bỏ qua kết quả cũ và giữ luồng chọn khách hàng.');
}

kiemTra().catch(loi => { console.error(loi); process.exitCode = 1; });
