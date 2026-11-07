const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function kiemTra() {
  const thuMuc = path.resolve(__dirname, '..');
  const mayChu = fs.readFileSync(path.join(thuMuc, 'server.js'), 'utf8');
  const giaoDien = fs.readFileSync(path.join(thuMuc, 'DATAGS_modern_youth_lux_smooth (1).html'), 'utf8');
  const hamQuyen = mayChu.match(/async function chiAdminCongNoNcc\(req, res, next\) \{[\s\S]*?\n\}/);
  const hamMenu = giaoDien.match(/    function applyMenuPermissions\(\) \{[^\n]+/);
  assert.ok(hamQuyen, 'Không tìm thấy middleware công nợ NCC.');
  assert.ok(hamMenu, 'Không tìm thấy phân quyền menu.');
  assert.match(mayChu, /app\.use\('\/api\/orders\/ncc-debts', chiAdminCongNoNcc\)/);
  assert.match(giaoDien, /tab === 'ncc-debts' && currentUser\?\.role\?\.name !== 'Admin'/);

  let user;
  const context = {
    getAccessUser: async () => user,
    console: { error() {} }
  };
  vm.runInNewContext(hamQuyen[0], context);
  async function kiemTraQuyen(taiKhoan, duocPhep) {
    user = taiKhoan;
    let status;
    let daTiepTuc = false;
    const res = {
      status(ma) { status = ma; return this; },
      json(value) { return value; }
    };
    await context.chiAdminCongNoNcc({}, res, () => { daTiepTuc = true; });
    assert.equal(daTiepTuc, duocPhep);
    if (!duocPhep) assert.equal(status, 403);
  }
  await kiemTraQuyen({ isActive: true, roleId: { name: 'Admin' } }, true);
  for (const role of ['Quản lý', 'Nhân Viên', 'Chỉ Xem']) {
    await kiemTraQuyen({ isActive: true, roleId: { name: role, permissions: ['view_debts', 'manage_orders'] } }, false);
  }
  await kiemTraQuyen({ isActive: false, roleId: { name: 'Admin' } }, false);
  await kiemTraQuyen(null, false);

  const elements = new Map();
  const menuContext = {
    currentUser: null,
    document: { getElementById: id => {
      if (!elements.has(id)) elements.set(id, { style: {} });
      return elements.get(id);
    } }
  };
  vm.runInNewContext(hamMenu[0], menuContext);
  for (const role of ['Admin', 'Quản lý', 'Nhân Viên', 'Chỉ Xem']) {
    menuContext.currentUser = { role: { name: role, permissions: ['view_debts'] } };
    menuContext.applyMenuPermissions();
    assert.equal(elements.get('menu-ncc-debts').style.display, role === 'Admin' ? '' : 'none');
  }
  console.log('Đạt: chỉ Admin đang hoạt động được truy cập API và thấy menu công nợ NCC.');
}

kiemTra().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
