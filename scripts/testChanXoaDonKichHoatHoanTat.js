const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'DATAGS_modern_youth_lux_smooth (1).html'), 'utf8');

// 1. Kiểm tra logic backend trong server.js
const dauHam = serverSource.indexOf('function laDonDaKichHoatHoacHoanTat(');
const dauDelete = serverSource.indexOf("app.delete('/api/orders/delete/:id'");
assert.ok(dauHam >= 0, 'server.js phải có hàm laDonDaKichHoatHoacHoanTat');
assert.ok(dauDelete > dauHam, 'server.js phải có route delete');

const backendSandbox = {};
vm.runInNewContext(serverSource.slice(dauHam, dauDelete), backendSandbox);
const { laDonDaKichHoatHoacHoanTat } = backendSandbox;

// 2. Kiểm tra logic frontend trong HTML
const dauHamHtml = htmlSource.indexOf('function isOrderLockedOrCompleted(');
assert.ok(dauHamHtml >= 0, 'HTML phải có hàm isOrderLockedOrCompleted');
const cuoiHamHtml = htmlSource.indexOf('function getNccDebtRows(', dauHamHtml);
assert.ok(cuoiHamHtml > dauHamHtml, 'HTML phải có kết thúc hàm isOrderLockedOrCompleted');

const frontendSandbox = {};
vm.runInNewContext(htmlSource.slice(dauHamHtml, cuoiHamHtml), frontendSandbox);
const { isOrderLockedOrCompleted } = frontendSandbox;

const testCases = [
  { order: { 'TÌNH TRẠNG': 'Đã Kích Hoạt' }, expected: true, desc: 'Đã Kích Hoạt' },
  { order: { 'TÌNH TRẠNG': 'Kích Hoạt' }, expected: true, desc: 'Kích Hoạt' },
  { order: { 'TÌNH TRẠNG': 'kích hoạt' }, expected: true, desc: 'kích hoạt thường' },
  { order: { 'TÌNH TRẠNG': 'Hoàn Tất' }, expected: true, desc: 'Hoàn Tất' },
  { order: { 'TÌNH TRẠNG': 'hoàn tất' }, expected: true, desc: 'hoàn tất thường' },
  { order: { 'TÌNH TRẠNG': 'Hoàn Thành' }, expected: true, desc: 'Hoàn Thành' },
  { order: { 'TÌNH TRẠNG': 'Đã Hoàn Tất' }, expected: true, desc: 'Đã Hoàn Tất' },
  { order: { 'TÌNH TRẠNG': 'Đã Thanh Toán' }, expected: true, desc: 'Đã Thanh Toán' },
  { order: { lockedAt: new Date() }, expected: true, desc: 'Có lockedAt' },
  {
    order: {
      'TÌNH TRẠNG': 'Soạn Hồ Sơ',
      chiTietSanPham: [{ maDong: '1', trangThai: 'Đã Kích Hoạt' }]
    },
    expected: true,
    desc: 'Đơn nhiều sản phẩm có 1 dòng Đã Kích Hoạt'
  },
  {
    order: {
      'TÌNH TRẠNG': 'Soạn Hồ Sơ',
      chiTietSanPham: [{ maDong: '1', trangThai: 'Hoàn Tất' }]
    },
    expected: true,
    desc: 'Đơn nhiều sản phẩm có 1 dòng Hoàn Tất'
  },
  { order: { 'TÌNH TRẠNG': 'Chưa Kích Hoạt' }, expected: false, desc: 'Chưa Kích Hoạt (chưa kích hoạt thì được xóa)' },
  { order: { 'TÌNH TRẠNG': 'Soạn Hồ Sơ' }, expected: false, desc: 'Soạn Hồ Sơ' },
  { order: { 'TÌNH TRẠNG': 'Đang Xử Lý' }, expected: false, desc: 'Đang Xử Lý' },
  { order: { 'TÌNH TRẠNG': 'Đã Đăng Ký' }, expected: false, desc: 'Đã Đăng Ký' },
  { order: { 'TÌNH TRẠNG': 'Đã Duyệt' }, expected: false, desc: 'Đã Duyệt' },
  { order: { 'TÌNH TRẠNG': 'Từ Chối' }, expected: false, desc: 'Từ Chối' },
  { order: { 'TÌNH TRẠNG': 'Hủy' }, expected: false, desc: 'Hủy' }
];

testCases.forEach(({ order, expected, desc }) => {
  const kqBackend = laDonDaKichHoatHoacHoanTat(order);
  assert.equal(kqBackend, expected, `Backend thất bại cho trường hợp: ${desc}`);

  const kqFrontend = isOrderLockedOrCompleted(order);
  assert.equal(kqFrontend, expected, `Frontend thất bại cho trường hợp: ${desc}`);
});

// 3. Kiểm tra handler route delete của server.js
let deleteHandler;
let orderInDb = null;
let archivedOrder = null;
const routeSandbox = {
  app: {
    delete: (...args) => {
      deleteHandler = args.at(-1);
    }
  },
  requireAuth: () => {},
  requirePermission: () => () => {},
  getAccessUser: async () => ({ isActive: true, roleId: { name: 'Admin' } }),
  orderScope: () => 'all',
  DonHang: {
    findById: () => ({
      lean: async () => (orderInDb ? structuredClone(orderInDb) : null)
    }),
    findByIdAndUpdate: async (id, patch) => {
      archivedOrder = patch;
      return { _id: id, ...patch.$set };
    }
  },
  writeOrderAudit: async () => {}
};

const cuoiDelete = serverSource.indexOf("app.get('/api/sync/google-sheet/status'", dauDelete);
vm.runInNewContext(serverSource.slice(dauHam, cuoiDelete), routeSandbox);
assert.ok(deleteHandler, 'Phải trích xuất được deleteHandler từ server.js');

async function testRouteDelete() {
  const goiDelete = async (orderId) => {
    let ketQuaJson = null;
    let statusCode = 200;
    const req = { params: { id: orderId }, auth: { username: 'testAdmin' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        ketQuaJson = data;
        return this;
      }
    };
    await deleteHandler(req, res);
    return { statusCode, ketQuaJson };
  };

  // Case A: Đơn đã kích hoạt -> chặn với 423
  orderInDb = { _id: 'dh-1', 'TÌNH TRẠNG': 'Đã Kích Hoạt' };
  archivedOrder = null;
  const res1 = await goiDelete('dh-1');
  assert.equal(res1.statusCode, 423, 'Đơn Đã Kích Hoạt phải trả về HTTP 423');
  assert.equal(res1.ketQuaJson.success, false);
  assert.equal(archivedOrder, null, 'Không được archive đơn đã kích hoạt');

  // Case B: Đơn hoàn tất -> chặn với 423
  orderInDb = { _id: 'dh-2', 'TÌNH TRẠNG': 'Hoàn Tất' };
  archivedOrder = null;
  const res2 = await goiDelete('dh-2');
  assert.equal(res2.statusCode, 423, 'Đơn Hoàn Tất phải trả về HTTP 423');
  assert.equal(res2.ketQuaJson.success, false);
  assert.equal(archivedOrder, null, 'Không được archive đơn hoàn tất');

  // Case C: Đơn soạn hồ sơ -> cho phép xóa (archive) thành công
  orderInDb = { _id: 'dh-3', 'TÌNH TRẠNG': 'Soạn Hồ Sơ' };
  archivedOrder = null;
  const res3 = await goiDelete('dh-3');
  assert.equal(res3.statusCode, 200, 'Đơn Soạn Hồ Sơ phải xóa thành công (200)');
  assert.equal(res3.ketQuaJson.success, true);
  assert.ok(archivedOrder?.$set?.archivedAt, 'Đơn phải được ghi nhận archivedAt');
}

testRouteDelete().then(() => {
  console.log('✅ Đạt: Tất cả trường hợp kiểm tra chặn xóa đơn đã kích hoạt / hoàn tất đều thành công!');
});
