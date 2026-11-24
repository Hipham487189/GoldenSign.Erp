const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';
const User = require('../models/User');
const Role = require('../models/Role');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const authRoutes = require('../routes/auth');
const { xoaCacheNguoiDung } = require('../middleware/auth');
const { quyenCot, quyenSuaCot, phamViDuLieu, duocXemCongCu, duocDungCongCu, choPhepCongCuTheoCauHinh, loiQuyenCongCu, layRegistry } = require('../services/permissionRegistry');

const vaiTroTheoCot = {
  accessControl: {
    version: 1,
    resources: {
      orders: {
        actions: ['view', 'edit'],
        scope: 'own',
        columns: { 'Nhân Viên Đăng Ký': ['view', 'edit'], 'Thực Thu': ['view'] }
      }
    }
  }
};
assert.equal(quyenCot(vaiTroTheoCot, 'orders', 'Nhân Viên Đăng Ký'), true);
assert.equal(quyenSuaCot(vaiTroTheoCot, 'orders', 'Nhân Viên Đăng Ký'), true);
assert.equal(quyenSuaCot(vaiTroTheoCot, 'orders', 'Thực Thu'), false);
assert.equal(quyenCot(vaiTroTheoCot, 'orders', 'Thực Thu'), true);
assert.equal(quyenCot(vaiTroTheoCot, 'orders', 'THỰC CÔNG NỢ CTY'), false);
assert.equal(quyenCot(vaiTroTheoCot, 'orders', 'newUnregisteredColumn'), false);
assert.equal(phamViDuLieu(vaiTroTheoCot, 'orders'), 'own');
assert.equal(quyenCot({ name: 'Nhân Viên', permissions: ['view_debts'] }, 'orders', 'Thực Thu'), false);
assert.equal(quyenCot({ name: 'Nhân Viên', permissions: ['view_orders'] }, 'orders', 'newUnregisteredColumn'), false);
assert.equal(quyenCot({ name: 'Nhân Viên', permissions: ['view_orders'] }, 'products', 'Thực Đóng Công Ty'), false);
assert.equal(quyenCot({ name: 'Nhân Viên', permissions: ['view_orders'] }, 'products', 'TÊN SẢN PHẨM'), true);
const vaiTroCongCu = { name: 'Nhân Viên', permissions: ['manage_orders'] };
assert.equal(duocXemCongCu(vaiTroCongCu), true);
assert.equal(duocDungCongCu(vaiTroCongCu, 'nhap-ho-so'), true);
assert.equal(duocDungCongCu(vaiTroCongCu, 'nhap-so-lieu'), false);
assert.equal(duocDungCongCu({ ...vaiTroCongCu, quyenCongCu: { 'nhap-ho-so': false } }, 'nhap-ho-so'), false);
assert.equal(duocDungCongCu({ ...vaiTroCongCu, quyenCongCu: { menu: false } }, 'nhap-ho-so'), false);
assert.equal(duocDungCongCu({ name: 'Nhân Viên', permissions: [], quyenCongCu: { 'nhap-ho-so': true } }, 'nhap-ho-so'), false);
assert.equal(choPhepCongCuTheoCauHinh({ name: 'Nhân Viên', accessControl: { version: 1, resources: {} } }, 'nhap-ho-so'), true);
assert.equal(choPhepCongCuTheoCauHinh(vaiTroCongCu, 'khong-ton-tai'), false);
assert.equal(duocDungCongCu({ name: 'Admin', quyenCongCu: { menu: false } }, 'nhap-so-lieu'), true);
assert.equal(loiQuyenCongCu({ menu: false, 'nhap-ho-so': true }), '');
assert.notEqual(loiQuyenCongCu({ khong_hop_le: true }), '');
assert.notEqual(loiQuyenCongCu({ menu: 'false' }), '');
assert.equal(layRegistry().resources.congCu.maCongCu, 'menu');
assert.equal(layRegistry().resources['congCu_nhap-ho-so'].maCongCu, 'nhap-ho-so');

const html = fs.readFileSync(path.join(__dirname, '..', 'DATAGS_modern_youth_lux_smooth (1).html'), 'utf8');
const dauSuaVaiTro = html.indexOf('    function editRole(id) {');
const cuoiSuaVaiTro = html.indexOf('    async function deleteRole(id)', dauSuaVaiTro);
assert.ok(dauSuaVaiTro >= 0 && cuoiSuaVaiTro > dauSuaVaiTro, 'Không tìm thấy hàm sửa vai trò trong giao diện.');
const cacOQuyenCot = ['view', 'edit'].flatMap(thaoTac =>
  ['cotXem', 'cotSua'].map(cot => ({ dataset: { roleColumn: 'orders', columnKey: cot, columnAction: thaoTac } }))
);
const vaiTroGiaoDien = {
  _id: 'role', name: 'Test',
  accessControl: { version: 1, resources: { orders: { actions: ['edit'], scope: 'own', columns: { cotXem: true, cotSua: 'edit' } } } }
};
const phamViGiaoDien = [{ dataset: { roleScope: 'orders' } }];
const oThaoTac = [{ dataset: { roleResource: 'orders', roleAction: 'edit' } }];
const phanTu = {};
const nguCanh = {
  allRoles: [vaiTroGiaoDien], editingRoleId: null,
  accessControlTuVaiTro: vaiTro => vaiTro.accessControl,
  document: {
    getElementById: id => phanTu[id] || (phanTu[id] = {}),
    querySelectorAll: selector => selector.includes('data-role-column') ? cacOQuyenCot : selector.includes('data-role-resource') ? oThaoTac : phamViGiaoDien
  }
};
vm.runInNewContext(`${html.slice(dauSuaVaiTro, cuoiSuaVaiTro)}\neditRole('role');`, nguCanh);
assert.deepEqual(cacOQuyenCot.map(o => o.checked), [true, true, false, true]);
assert.equal(oThaoTac[0].checked, true);
assert.equal(phamViGiaoDien[0].value, 'own');
assert.equal(phanTu.canhBaoVaiTroCu.hidden, true);
vaiTroGiaoDien.accessControl.version = 0;
vm.runInNewContext("editRole('role');", nguCanh);
assert.equal(phanTu.canhBaoVaiTroCu.hidden, false);

const dauCapNhatMaTran = html.indexOf('    function taoAccessControlMaTran(');
const cuoiCapNhatMaTran = html.indexOf('    function moChinhQuyenMaTran(', dauCapNhatMaTran);
assert.ok(dauCapNhatMaTran >= 0 && cuoiCapNhatMaTran > dauCapNhatMaTran, 'Không tìm thấy hàm cập nhật ma trận.');
const capNhatMaTran = vm.runInNewContext(`${html.slice(dauCapNhatMaTran, cuoiCapNhatMaTran)}\ntaoAccessControlMaTran;`);
const vaiTroMaTran = {
  accessControl: { version: 1, resources: {
    orders: { actions: ['view'], scope: 'own', columns: { cotXem: ['view'] } },
    customers: { actions: ['view'], scope: 'all', columns: {} }
  } }
};
const truocCapNhat = JSON.stringify(vaiTroMaTran);
const sauCapNhat = capNhatMaTran(vaiTroMaTran, 'orders', ['view', 'edit'], 'department');
assert.equal(JSON.stringify(vaiTroMaTran), truocCapNhat);
assert.equal(JSON.stringify(sauCapNhat.resources.orders.columns), JSON.stringify(vaiTroMaTran.accessControl.resources.orders.columns));
assert.equal(JSON.stringify(sauCapNhat.resources.customers), JSON.stringify(vaiTroMaTran.accessControl.resources.customers));
assert.equal(sauCapNhat.resources.orders.scope, 'department');
assert.equal(JSON.stringify(sauCapNhat.resources.orders.actions), '["view","edit"]');
const capNhatMaCu = vm.runInNewContext(`${html.slice(dauCapNhatMaTran, cuoiCapNhatMaTran)}\ncapNhatMaQuyenCuMaTran;`);
const maCu = ['view_orders', 'quyen_khac'];
const maMoi = capNhatMaCu(maCu, ['view_orders', 'manage_orders'], ['manage_orders']);
assert.equal(JSON.stringify(maCu), '["view_orders","quyen_khac"]');
assert.equal(JSON.stringify(maMoi), '["quyen_khac","manage_orders"]');

let gioiHanTaiKhoan, gioiHanVaiTro, gioiHanNhanVien, boLocTaiKhoan, boLocNhanVien, thayDoiVaiTro;
const vaiTroTheoNguoiDung = {
  admin: { _id: 'admin-role', name: 'Admin', permissions: [] },
  employee: { _id: 'employee-role', name: 'Nhân Viên', permissions: [] }
};
function truyVan(duLieu, ghiGioiHan) {
  const q = {
    select() { return q; }, populate() { return q; }, sort() { return q; }, skip() { return q; },
    limit(so) { ghiGioiHan(so); return q; }, lean: async () => duLieu
  };
  return q;
}
User.findById = id => {
  const q = {
    select() { return q; },
    populate() { return q; },
    lean: async () => ({ _id: id, username: String(id), isActive: true, roleId: vaiTroTheoNguoiDung[String(id)] })
  };
  return q;
};
User.find = boLoc => { boLocTaiKhoan = boLoc; return truyVan([{ username: 'test' }], so => { gioiHanTaiKhoan = so; }); };
User.countDocuments = async () => 1;
Role.find = () => truyVan([{ name: 'Test' }], so => { gioiHanVaiTro = so; });
Role.countDocuments = async () => 1;
Role.findById = () => ({ lean: async () => ({ name: 'Test', permissions: [], dataScopes: { orders: 'own' } }) });
Role.findByIdAndUpdate = async (id, duLieu) => { thayDoiVaiTro = duLieu; return { _id: id, toObject: () => duLieu }; };
Employee.find = boLoc => { boLocNhanVien = boLoc; return truyVan([{ name: 'Test' }], so => { gioiHanNhanVien = so; }); };
AuditLog.create = async () => ({});

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
const server = app.listen(0, '127.0.0.1', async () => {
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/auth`;
    const admin = jwt.sign({ userId: 'admin', roleId: 'role', isSuperAdmin: true }, process.env.JWT_SECRET);
    const nhanVien = jwt.sign({ userId: 'employee', roleId: 'role', isSuperAdmin: false }, process.env.JWT_SECRET);
    const headers = { Authorization: `Bearer ${admin}` };
    let response = await fetch(`${url}/users/page?limit=999&q=%5B`, { headers });
    assert.equal(response.status, 200);
    assert.equal(gioiHanTaiKhoan, 100);
    assert.equal(boLocTaiKhoan.username.test('['), true);
    assert.equal(boLocTaiKhoan.username.test('x'), false);

    response = await fetch(`${url}/roles/page?limit=999`, { headers });
    assert.equal(response.status, 200);
    assert.equal(gioiHanVaiTro, 100);

    response = await fetch(`${url}/employee-options?q=Test`, { headers });
    assert.equal(response.status, 200);
    assert.equal(gioiHanNhanVien, 20);
    assert.equal(boLocNhanVien.$or[0].name.test('Test'), true);

    response = await fetch(`${url}/users/page`);
    assert.equal(response.status, 401);
    response = await fetch(`${url}/employee-options?q=Test`, { headers: { Authorization: `Bearer ${nhanVien}` } });
    assert.equal(response.status, 403);

    vaiTroTheoNguoiDung.admin = { _id: 'employee-role', name: 'Nhân Viên', permissions: [] };
    xoaCacheNguoiDung('admin');
    response = await fetch(`${url}/roles/page`, { headers });
    assert.equal(response.status, 403);

    vaiTroTheoNguoiDung.admin = { _id: 'admin-role', name: 'Admin', permissions: [] };
    xoaCacheNguoiDung('admin');
    response = await fetch(`${url}/roles/test`, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', permissions: [], hiddenColumns: {} })
    });
    assert.equal(response.status, 200);
    assert.equal(Object.hasOwn(thayDoiVaiTro, 'dataScopes'), false);
    assert.equal(Object.hasOwn(thayDoiVaiTro, 'accessControl'), false);
    response = await fetch(`${url}/roles/test`, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', permissions: [], hiddenColumns: {}, quyenCongCu: { 'nhap-ho-so': false } })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(thayDoiVaiTro.quyenCongCu, { 'nhap-ho-so': false });
    assert.equal(Object.hasOwn(thayDoiVaiTro, 'accessControl'), false);
    assert.equal(Object.hasOwn(thayDoiVaiTro, 'dataScopes'), false);
    response = await fetch(`${url}/roles/test`, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', quyenCongCu: { menu: 'false' } })
    });
    assert.equal(response.status, 400);
    console.log('Đạt: phân trang, tìm nhân viên, kiểm tra quyền và giữ phạm vi khi sửa vai trò.');
  } catch (loi) {
    console.error(loi);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
