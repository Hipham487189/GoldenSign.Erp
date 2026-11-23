const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';
const User = require('../models/User');
const Role = require('../models/Role');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const authRoutes = require('../routes/auth');

let gioiHanTaiKhoan, gioiHanVaiTro, gioiHanNhanVien, boLocTaiKhoan, boLocNhanVien, thayDoiVaiTro;
function truyVan(duLieu, ghiGioiHan) {
  const q = {
    select() { return q; }, populate() { return q; }, sort() { return q; }, skip() { return q; },
    limit(so) { ghiGioiHan(so); return q; }, lean: async () => duLieu
  };
  return q;
}
User.findById = () => ({ select: () => ({ lean: async () => ({ isActive: true, roleId: 'role' }) }) });
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

    response = await fetch(`${url}/roles/test`, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', permissions: [], hiddenColumns: {} })
    });
    assert.equal(response.status, 200);
    assert.equal(Object.hasOwn(thayDoiVaiTro, 'dataScopes'), false);
    console.log('Đạt: phân trang, tìm nhân viên, kiểm tra quyền và giữ phạm vi khi sửa vai trò.');
  } catch (loi) {
    console.error(loi);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
