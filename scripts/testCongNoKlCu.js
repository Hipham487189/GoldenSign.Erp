const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-kl-cu';

const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const CongNoKlCuCauHinh = require('../models/CongNoKlCuCauHinh');
const CongNoKlCuGiaoDich = require('../models/CongNoKlCuGiaoDich');
const fileStorageService = require('../services/fileStorageService');
const { JWT_SECRET, requireAuth, requireApiPermission, xoaCacheNguoiDung } = require('../middleware/auth');

const luuTepGoc = fileStorageService.luuTepNang;
const docTepGoc = fileStorageService.docTepNang;

const storeFiles = new Map();
fileStorageService.luuTepNang = async ({ dataUrl, fileName }) => {
  const ref = `gridfs:mock_${storeFiles.size + 1}|image/png|raw|${fileName || 'chung-tu.png'}`;
  storeFiles.set(ref, { dataUrl, mimeType: 'image/png', fileName: fileName || 'chung-tu.png' });
  return ref;
};
fileStorageService.docTepNang = async ref => storeFiles.get(ref) || null;

const routerCongNoKlCu = require('../routes/cong-no-kl-cu');

const idAdmin = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const idXem = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const idKhongQuyen = 'cccccccccccccccccccccccc';

const roles = {
  [idAdmin]: { _id: idAdmin, name: 'Admin', permissions: [] },
  [idXem]: { _id: idXem, name: 'Kế toán xem', permissions: ['view_internal_finance'] },
  [idKhongQuyen]: { _id: idKhongQuyen, name: 'Nhân Viên', permissions: ['view_orders'] }
};

let cauHinhDoc = null;
const giaoDichDocs = [];
let seq = 1;

function clone(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function cmpAsc(a, b) {
  const da = new Date(a.ngayChuyen).getTime();
  const db = new Date(b.ngayChuyen).getTime();
  if (da !== db) return da - db;
  const ca = new Date(a.createdAt).getTime();
  const cb = new Date(b.createdAt).getTime();
  if (ca !== cb) return ca - cb;
  return String(a._id).localeCompare(String(b._id));
}

function matchFilter(doc, filter = {}) {
  if (!filter || !Object.keys(filter).length) return true;
  if (filter.$or) {
    return filter.$or.some(cond => {
      if (cond.nguoiChuyen?.$regex) {
        return new RegExp(cond.nguoiChuyen.$regex, cond.nguoiChuyen.$options || '').test(doc.nguoiChuyen || '');
      }
      if (cond.ghiChu?.$regex) {
        return new RegExp(cond.ghiChu.$regex, cond.ghiChu.$options || '').test(doc.ghiChu || '');
      }
      if (cond.ngayChuyen?.$lt) {
        const d = new Date(doc.ngayChuyen).getTime();
        const t = new Date(cond.ngayChuyen.$lt).getTime();
        return d < t;
      }
      if (cond.ngayChuyen && cond.createdAt?.$lt) {
        return new Date(doc.ngayChuyen).getTime() === new Date(cond.ngayChuyen).getTime()
          && new Date(doc.createdAt).getTime() < new Date(cond.createdAt.$lt).getTime();
      }
      if (cond.ngayChuyen && cond.createdAt && cond._id?.$lt) {
        return new Date(doc.ngayChuyen).getTime() === new Date(cond.ngayChuyen).getTime()
          && new Date(doc.createdAt).getTime() === new Date(cond.createdAt).getTime()
          && String(doc._id) < String(cond._id.$lt);
      }
      return false;
    });
  }
  return true;
}

const orig = {
  userFindById: User.findById,
  auditCreate: AuditLog.create,
  cfgFindOne: CongNoKlCuCauHinh.findOne,
  cfgFindOneAndUpdate: CongNoKlCuCauHinh.findOneAndUpdate,
  gdAggregate: CongNoKlCuGiaoDich.aggregate,
  gdFind: CongNoKlCuGiaoDich.find,
  gdFindById: CongNoKlCuGiaoDich.findById,
  gdCreate: CongNoKlCuGiaoDich.create
};

async function runTests() {
  User.findById = id => ({
    select() { return this; },
    populate() { return this; },
    async lean() {
      return { _id: id, username: id === idAdmin ? 'admin' : 'user', isActive: true, roleId: roles[id] };
    }
  });
  AuditLog.create = async () => ({});

  CongNoKlCuCauHinh.findOne = () => ({
    select() { return this; },
    async lean() { return cauHinhDoc ? clone(cauHinhDoc) : null; }
  });
  CongNoKlCuCauHinh.findOneAndUpdate = async (_query, update) => {
    const data = update.$set || update;
    cauHinhDoc = { _id: 'cfg1', ma: 'khanh-linh-cu', ...data, updatedAt: new Date() };
    return clone(cauHinhDoc);
  };

  CongNoKlCuGiaoDich.aggregate = async pipeline => {
    const matchStage = pipeline.find(s => s.$match);
    const groupStage = pipeline.find(s => s.$group);
    const filtered = matchStage ? giaoDichDocs.filter(d => matchFilter(d, matchStage.$match)) : giaoDichDocs;
    if (!groupStage) return [];
    if (groupStage.$group.tongTruoc) {
      return [{ _id: null, tongTruoc: filtered.reduce((s, d) => s + Number(d.soTien || 0), 0) }];
    }
    return [{
      _id: null,
      tongDaChuyen: filtered.reduce((s, d) => s + Number(d.soTien || 0), 0),
      soDotChuyen: filtered.length
    }];
  };

  CongNoKlCuGiaoDich.find = (filter = {}) => {
    let sortDir = 1;
    let skipN = 0;
    let limitN = 50;
    return {
      select() { return this; },
      sort(obj) { sortDir = obj.ngayChuyen === -1 ? -1 : 1; return this; },
      skip(n) { skipN = n; return this; },
      limit(n) { limitN = n; return this; },
      async lean() {
        const list = giaoDichDocs.filter(d => matchFilter(d, filter)).sort((a, b) => sortDir * cmpAsc(a, b));
        return list.slice(skipN, skipN + limitN).map(clone);
      }
    };
  };

  CongNoKlCuGiaoDich.findById = id => {
    const idx = giaoDichDocs.findIndex(d => String(d._id) === String(id));
    if (idx < 0) {
      return {
        select() { return this; },
        async lean() { return null; },
        then(resolve) { return Promise.resolve(null).then(resolve); }
      };
    }
    const doc = giaoDichDocs[idx];
    return {
      select() { return this; },
      async lean() { return clone(doc); },
      then(resolve) {
        return Promise.resolve({
          ...doc,
          async save() {
            Object.assign(giaoDichDocs[idx], {
              ngayChuyen: this.ngayChuyen,
              nguoiChuyen: this.nguoiChuyen,
              soTien: this.soTien,
              ghiChu: this.ghiChu,
              anhChungTu: this.anhChungTu,
              tenAnhChungTu: this.tenAnhChungTu,
              nguoiCapNhat: this.nguoiCapNhat,
              updatedAt: new Date()
            });
          },
          async deleteOne() {
            giaoDichDocs.splice(idx, 1);
          }
        }).then(resolve);
      }
    };
  };

  CongNoKlCuGiaoDich.create = async payload => {
    const id = String(seq++).padStart(24, '0');
    const now = new Date(Date.now() + seq * 10);
    const created = { _id: id, ...payload, createdAt: now, updatedAt: now };
    giaoDichDocs.push(created);
    return clone(created);
  };

  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api', requireApiPermission);
  app.use('/api/cong-no-kl-cu', requireAuth, routerCongNoKlCu);

  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const callApi = async (roleId, path, opts = {}) => {
    const token = roleId ? jwt.sign({ userId: roleId, roleId }, JWT_SECRET) : '';
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetch(`${baseUrl}${path}`, { ...opts, headers });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };

  try {
    // 1. Auth & phân quyền
    assert.strictEqual((await callApi('', '/api/cong-no-kl-cu')).status, 401);
    assert.strictEqual((await callApi(idKhongQuyen, '/api/cong-no-kl-cu')).status, 403);
    assert.strictEqual((await callApi(idXem, '/api/cong-no-kl-cu')).status, 200);
    assert.strictEqual((await callApi(idXem, '/api/cong-no-kl-cu/giao-dich', {
      method: 'POST',
      body: JSON.stringify({ ngayChuyen: '2026-11-27', nguoiChuyen: 'Hi', soTien: 1000 })
    })).status, 403);

    roles[idXem].quyenCongCu = { 'theo-doi-cong-no-kl-cu': false };
    xoaCacheNguoiDung(idXem);
    assert.strictEqual((await callApi(idXem, '/api/cong-no-kl-cu')).status, 403);

    // 2. Thiết lập nợ gốc 220.000.000
    const cfgRes = await callApi(idAdmin, '/api/cong-no-kl-cu/cau-hinh', {
      method: 'PUT',
      body: JSON.stringify({
        tenCongTy: 'Công Ty KHÁNH LINH',
        soNoBanDau: 220000000,
        ngayChotNo: '2026-11-01',
        ghiChu: 'Nợ cũ chốt đầu kỳ'
      })
    });
    assert.strictEqual(cfgRes.status, 200);
    assert.strictEqual(cfgRes.body.data.soNoBanDau, 220000000);

    // 3. Thêm đợt chuyển 27/11/2026 Hi - 20.000.000 kèm ảnh
    const sampleImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const tx1 = await callApi(idAdmin, '/api/cong-no-kl-cu/giao-dich', {
      method: 'POST',
      body: JSON.stringify({
        ngayChuyen: '2026-11-27',
        nguoiChuyen: 'Hi',
        soTien: 20000000,
        ghiChu: 'Chuyển đợt 1',
        anhChungTuDataUrl: sampleImg,
        tenAnhChungTu: 'ck-hi-1.png'
      })
    });
    assert.strictEqual(tx1.status, 201);
    assert.strictEqual(tx1.body.data.coAnhChungTu, true);

    const list1 = await callApi(idAdmin, '/api/cong-no-kl-cu');
    assert.strictEqual(list1.status, 200);
    assert.strictEqual(list1.body.data.tongQuan.conNoHienTai, 200000000);
    assert.strictEqual(list1.body.data.items[0].duNoTruoc, 220000000);
    assert.strictEqual(list1.body.data.items[0].duNoSau, 200000000);
    assert.strictEqual(list1.body.data.items[0].anhChungTu, undefined);

    // 4. Thêm đợt chuyển thứ 2: 30.000.000 -> còn 170.000.000
    const tx2 = await callApi(idAdmin, '/api/cong-no-kl-cu/giao-dich', {
      method: 'POST',
      body: JSON.stringify({
        ngayChuyen: '2026-12-05',
        nguoiChuyen: 'An',
        soTien: 30000000
      })
    });
    assert.strictEqual(tx2.status, 201);

    const listDesc = await callApi(idAdmin, '/api/cong-no-kl-cu?sort=desc');
    assert.strictEqual(listDesc.body.data.tongQuan.conNoHienTai, 170000000);
    assert.strictEqual(listDesc.body.data.items[0].nguoiChuyen, 'An');
    assert.strictEqual(listDesc.body.data.items[0].duNoTruoc, 200000000);
    assert.strictEqual(listDesc.body.data.items[0].duNoSau, 170000000);
    assert.strictEqual(listDesc.body.data.items[1].duNoTruoc, 220000000);
    assert.strictEqual(listDesc.body.data.items[1].duNoSau, 200000000);

    const listAsc = await callApi(idAdmin, '/api/cong-no-kl-cu?sort=asc');
    assert.strictEqual(listAsc.body.data.items[0].nguoiChuyen, 'Hi');
    assert.strictEqual(listAsc.body.data.items[0].duNoSau, 200000000);
    assert.strictEqual(listAsc.body.data.items[1].nguoiChuyen, 'An');
    assert.strictEqual(listAsc.body.data.items[1].duNoSau, 170000000);

    // 5. Xem ảnh chứng từ
    const imgRes = await callApi(idAdmin, `/api/cong-no-kl-cu/giao-dich/${tx1.body.data._id}/anh`);
    assert.strictEqual(imgRes.status, 200);
    assert.strictEqual(imgRes.body.data.dataUrl, sampleImg);

    // 6. Sửa và xóa giao dịch
    const editRes = await callApi(idAdmin, `/api/cong-no-kl-cu/giao-dich/${tx2.body.data._id}`, {
      method: 'PUT',
      body: JSON.stringify({ ngayChuyen: '2026-12-05', nguoiChuyen: 'An', soTien: 50000000 })
    });
    assert.strictEqual(editRes.status, 200);
    const afterEdit = await callApi(idAdmin, '/api/cong-no-kl-cu');
    assert.strictEqual(afterEdit.body.data.tongQuan.conNoHienTai, 150000000);

    const delRes = await callApi(idAdmin, `/api/cong-no-kl-cu/giao-dich/${tx2.body.data._id}`, { method: 'DELETE' });
    assert.strictEqual(delRes.status, 200);
    const afterDel = await callApi(idAdmin, '/api/cong-no-kl-cu');
    assert.strictEqual(afterDel.body.data.tongQuan.conNoHienTai, 200000000);

    // 7. Validate đầu vào & giới hạn limit
    const badMoney = await callApi(idAdmin, '/api/cong-no-kl-cu/giao-dich', {
      method: 'POST',
      body: JSON.stringify({ ngayChuyen: '2026-11-27', nguoiChuyen: 'Hi', soTien: 0 })
    });
    assert.strictEqual(badMoney.status, 400);

    const badDate = await callApi(idAdmin, '/api/cong-no-kl-cu/giao-dich', {
      method: 'POST',
      body: JSON.stringify({ ngayChuyen: '27-11-2026', nguoiChuyen: 'Hi', soTien: 1000 })
    });
    assert.strictEqual(badDate.status, 400);

    const cappedLimit = await callApi(idAdmin, '/api/cong-no-kl-cu?limit=500');
    assert.strictEqual(cappedLimit.status, 200);
    assert.strictEqual(cappedLimit.body.data.limit, 100);

    console.log('✅ Tất cả kiểm thử Theo Dõi Công Nợ KL Cũ đã đạt!');
  } finally {
    server.close();
    Object.assign(User, { findById: orig.userFindById });
    Object.assign(AuditLog, { create: orig.auditCreate });
    Object.assign(CongNoKlCuCauHinh, { findOne: orig.cfgFindOne, findOneAndUpdate: orig.cfgFindOneAndUpdate });
    Object.assign(CongNoKlCuGiaoDich, {
      aggregate: orig.gdAggregate,
      find: orig.gdFind,
      findById: orig.gdFindById,
      create: orig.gdCreate
    });
    fileStorageService.luuTepNang = luuTepGoc;
    fileStorageService.docTepNang = docTepGoc;
  }
}

runTests().catch(err => {
  console.error('❌ Test thất bại:', err);
  process.exit(1);
});
