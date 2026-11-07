const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function kiemTra() {
  const donCu = { _id: 'cu', STT: '1', 'Mã Đơn Hàng': 'CU', 'Tên Khách Hàng': 'Trước' };
  const donWeb = { _id: 'web', STT: '2', 'Mã Đơn Hàng': 'WEB', nguonTaoDon: 'web' };
  const donWebThieuSheet = { _id: 'web-khac', STT: '3', 'Mã Đơn Hàng': 'WEB2', nguonTaoDon: 'web' };
  const donCuThieuSheet = { _id: 'cu-khac', STT: '4', 'Mã Đơn Hàng': 'CU2' };
  const cacDon = [donCu, donWeb, donWebThieuSheet, donCuThieuSheet];
  const thaoTac = [];
  let daXoa = [];
  let phamVi;
  const Order = {
    find: () => ({ lean: async () => cacDon }),
    collection: { bulkWrite: async danhSach => thaoTac.push(...danhSach) },
    deleteMany: async boLoc => { daXoa = boLoc._id.$in; return { deletedCount: daXoa.length }; }
  };
  const SanPham = { find: () => ({ lean: async () => [] }) };
  const bang = {
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: [
          ['STT', 'Mã Đơn Hàng', 'Tên Khách Hàng', 'nguonTaoDon'],
          ['1', 'CU', 'Sau', 'web'],
          ['2', 'KHAC', 'Không ghi đè', ''],
          ['5', 'WEB2', 'Không ghi đè', ''],
          ['6', 'MOI', 'Mới', 'web']
        ] } }),
        update: () => { throw new Error('Không được ghi Sheet'); },
        batchUpdate: () => { throw new Error('Không được ghi Sheet'); }
      },
      batchUpdate: () => { throw new Error('Không được ghi Sheet'); }
    }
  };
  const google = {
    auth: { GoogleAuth: class { constructor(cauHinh) { phamVi = cauHinh.scopes; } async getClient() { return {}; } } },
    sheets: () => bang
  };
  const moduleGia = { exports: {} };
  const tep = path.resolve(__dirname, '..', 'services', 'googleSheetSync.js');
  const context = {
    module: moduleGia,
    exports: moduleGia.exports,
    __dirname: path.dirname(tep),
    process: { env: { GOOGLE_SHEET_SYNC_DIRECTION: 'bidirectional', GOOGLE_SHEET_SYNC_ALLOW_DELETES: 'true' } },
    console,
    setInterval,
    setTimeout,
    URLSearchParams,
    require: ten => {
      if (ten === 'googleapis') return { google };
      if (ten === '../models/Order') return Order;
      if (ten === '../models/SanPham') return SanPham;
      return require(ten);
    }
  };
  vm.runInNewContext(fs.readFileSync(tep, 'utf8'), context, { filename: tep });
  const dongBo = moduleGia.exports;
  assert.equal((await dongBo.pushOrderToSheet('web')).reason, 'mongo-to-sheet-disabled');
  const ketQua = await dongBo.syncBidirectional();
  assert.equal(ketQua.pushed.reason, 'mongo-to-sheet-disabled');
  assert.equal(ketQua.pulled.xungDotDonWeb, 2);
  assert.equal(dongBo.getSyncStatus().direction, 'sheet-to-mongo');
  assert.deepEqual(Array.from(phamVi), ['https://www.googleapis.com/auth/spreadsheets.readonly']);
  assert.equal(thaoTac.length, 2);
  assert.equal(thaoTac[0].updateOne.filter._id, 'cu');
  assert.equal(thaoTac[0].updateOne.update.$set['Tên Khách Hàng'], 'Sau');
  assert.equal(thaoTac[0].updateOne.update.$set.nguonTaoDon, undefined);
  assert.equal(thaoTac[1].insertOne.document['Mã Đơn Hàng'], 'MOI');
  assert.equal(thaoTac[1].insertOne.document.nguonTaoDon, undefined);
  assert.deepEqual(Array.from(daXoa), ['cu-khac']);
  console.log('Đạt: chỉ đọc Sheet; bảo vệ đơn web theo STT, mã đơn và khi xóa; đơn cũ vẫn đồng bộ.');
}

kiemTra().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
