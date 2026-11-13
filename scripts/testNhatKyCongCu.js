const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const AuditLog = require('../models/AuditLog');
const ExpenseRate = require('../models/ExpenseRate');
const ThietLapLuongNhanVien = require('../models/ThietLapLuongNhanVien');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');
const router = require('../routes/nhat-ky-cong-cu');
const routerChiPhi = require('../routes/expense-rates');

const idAdmin = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const idNhanVien = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const vaiTro = {
  [idAdmin]: { name: 'Admin', permissions: [] },
  [idNhanVien]: { name: 'Nhân Viên', permissions: ['manage_orders'] }
};
const daLuu = [];
let loiGhi = false;
let boLocGanNhat;
let gioiHanGanNhat;
const goc = { user: User.findById, role: Role.findById, create: AuditLog.create, find: AuditLog.find,
  exists: ExpenseRate.exists, expense: ExpenseRate.create, findExpense: ExpenseRate.findById,
  saveSalary: ThietLapLuongNhanVien.findOneAndUpdate, deleteSalary: ThietLapLuongNhanVien.deleteOne };

async function kiemTra() {
  User.findById = id => {
    let daPopulate = false;
    return {
      select() { return this; },
      populate() { daPopulate = true; return this; },
      async lean() { return { isActive: true, roleId: daPopulate ? vaiTro[id] : id }; }
    };
  };
  Role.findById = id => ({ select() { return this; }, async lean() { return vaiTro[id]; } });
  AuditLog.create = async item => {
    if (loiGhi) throw new Error('Lỗi ghi giả lập');
    daLuu.push({ ...item, createdAt: new Date(), _id: String(daLuu.length) });
  };
  AuditLog.find = boLoc => {
    boLocGanNhat = boLoc;
    let boQua = 0;
    let gioiHan = 0;
    return {
      select() { return this; }, sort() { return this; },
      skip(n) { boQua = n; return this; },
      limit(n) { gioiHan = n; gioiHanGanNhat = n; return this; },
      async lean() {
        return daLuu.filter(item => boLoc.module.$in.includes(item.module)
          && (!boLoc.actorUserId || item.actorUserId === boLoc.actorUserId)).reverse().slice(boQua, boQua + gioiHan);
      }
    };
  };
  ExpenseRate.exists = async () => false;
  ExpenseRate.create = async item => ({ ...item, _id: 'chi-phi' });
  ExpenseRate.findById = async () => ({
    _id: 'chi-phi', tenChiPhi: 'Phí thử', async save() {}, async deleteOne() {}
  });
  ThietLapLuongNhanVien.findOneAndUpdate = () => ({ async lean() { return { _id: 'luong' }; } });
  let soLuongXoa = 1;
  ThietLapLuongNhanVien.deleteOne = async () => ({ deletedCount: soLuongXoa });
  const app = express();
  app.use(express.json());
  app.use('/nhat-ky', requireAuth, router);
  app.use('/chi-phi', requireAuth, routerChiPhi);
  const routerLuong = express.Router();
  require('../routes/employee-settlement')(routerLuong, {
    scopedEmployee: async () => 'Nhân viên thử',
    dateExpression: () => ({}),
    requestError: message => new Error(message),
    sendRouteError: (res, error) => res.status(500).json({ success: false, message: error.message })
  });
  app.use('/luong', requireAuth, (req, res, next) => { req.debtAccess = { isAdmin: true }; next(); }, routerLuong);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const diaChi = `http://127.0.0.1:${server.address().port}`;
  const goi = async (id, duongDan, tuyChon = {}) => {
    const token = jwt.sign({ userId: id, username: id === idAdmin ? 'admin' : 'nhanvien', roleId: id }, JWT_SECRET);
    return fetch(diaChi + duongDan, { ...tuyChon, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  };
  const mo = (id, ma) => goi(id, '/nhat-ky/mo', { method: 'POST', body: JSON.stringify({ ma }) });
  try {
    assert.strictEqual((await fetch(diaChi + '/nhat-ky')).status, 401);
    assert.strictEqual((await mo(idNhanVien, 'thiet-lap-luong')).status, 403);
    assert.strictEqual((await mo(idNhanVien, '__proto__')).status, 400);
    for (let i = 0; i < 12; i++) assert.strictEqual((await mo(idNhanVien, 'nhap-ho-so')).status, 201);
    assert.strictEqual((await mo(idAdmin, 'thiet-lap-luong')).status, 201);
    let response = await goi(idNhanVien, '/nhat-ky');
    let body = await response.json();
    assert.strictEqual(response.headers.get('cache-control'), 'private, no-store');
    assert.strictEqual(body.data.items.length, 10);
    assert.strictEqual(body.data.hasMore, true);
    assert.strictEqual(gioiHanGanNhat, 11);
    assert.strictEqual(boLocGanNhat.actorUserId, idNhanVien);
    assert.deepStrictEqual(boLocGanNhat.module.$in, ['cong-cu:nhap-ho-so']);
    body = await (await goi(idNhanVien, '/nhat-ky?page=2')).json();
    assert.strictEqual(body.data.items.length, 2);
    assert.strictEqual(body.data.hasMore, false);
    body = await (await goi(idAdmin, '/nhat-ky')).json();
    assert.strictEqual(body.data.items[0].actorUsername, 'admin');
    assert.strictEqual(boLocGanNhat.actorUserId, undefined);
    assert.strictEqual(boLocGanNhat.module.$in.length, 5);
    vaiTro[idNhanVien].permissions = [];
    body = await (await goi(idNhanVien, '/nhat-ky')).json();
    assert.strictEqual(body.data.items.length, 0);
    assert.strictEqual((await goi(idAdmin, '/nhat-ky?page=0')).status, 400);
    const chiPhi = { tenChiPhi: 'Phí thử', donGia: 1, donVi: 'hồ sơ', tuNgay: '2026-01-01' };
    for (const [method, path] of [['POST', '/chi-phi'], ['PUT', '/chi-phi/chi-phi'], ['DELETE', '/chi-phi/chi-phi']]) {
      response = await goi(idAdmin, path, { method, body: method === 'DELETE' ? undefined : JSON.stringify(chiPhi) });
      assert.ok(response.ok);
    }
    assert.deepStrictEqual(daLuu.slice(-3).map(item => item.action), ['tao', 'cap-nhat', 'xoa']);
    const duLieuLuong = { employeeId: 'nhan-vien', tuNam: 2026, tuThang: 1, luongCoBan: 10 };
    response = await goi(idAdmin, '/luong/nhan-vien/thiet-lap-luong', { method: 'PUT', body: JSON.stringify(duLieuLuong) });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(daLuu.at(-1).module, 'cong-cu:thiet-lap-luong');
    response = await goi(idAdmin, '/luong/nhan-vien/thiet-lap-luong?employeeId=nhan-vien&tuNam=2026&tuThang=1', { method: 'DELETE' });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(daLuu.at(-1).action, 'xoa');
    const truocKhiXoaRong = daLuu.length;
    soLuongXoa = 0;
    await goi(idAdmin, '/luong/nhan-vien/thiet-lap-luong?employeeId=nhan-vien&tuNam=2026&tuThang=1', { method: 'DELETE' });
    assert.strictEqual(daLuu.length, truocKhiXoaRong);
    loiGhi = true;
    assert.strictEqual((await mo(idAdmin, 'thiet-lap-luong')).status, 500);
    response = await goi(idAdmin, '/chi-phi', {
      method: 'POST',
      body: JSON.stringify({ tenChiPhi: 'Phí thử', donGia: 1, donVi: 'hồ sơ', tuNgay: '2026-01-01' })
    });
    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.headers.get('x-canh-bao-nhat-ky'), '1');
    assert.strictEqual((await response.json()).success, true);
    console.log('Kiểm tra nhật ký, quyền, phân trang và cảnh báo lỗi ghi đạt.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    User.findById = goc.user;
    Role.findById = goc.role;
    AuditLog.create = goc.create;
    AuditLog.find = goc.find;
    ExpenseRate.exists = goc.exists;
    ExpenseRate.create = goc.expense;
    ExpenseRate.findById = goc.findExpense;
    ThietLapLuongNhanVien.findOneAndUpdate = goc.saveSalary;
    ThietLapLuongNhanVien.deleteOne = goc.deleteSalary;
  }
}

kiemTra().catch(loi => { console.error(loi); process.exitCode = 1; });
