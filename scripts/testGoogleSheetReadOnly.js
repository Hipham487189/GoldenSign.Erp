const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function kiemTra() {
  const donCu = { _id: 'cu', STT: '1', 'Mã Đơn Hàng': 'CU', 'Tên Khách Hàng': 'Trước' };
  const donWeb = { _id: 'web', STT: '2', 'Mã Đơn Hàng': 'WEB', nguonTaoDon: 'web' };
  const donWebThieuSheet = { _id: 'web-khac', STT: '3', 'Mã Đơn Hàng': 'WEB2', nguonTaoDon: 'web' };
  const donCuThieuSheet = { _id: 'cu-khac', STT: '4', 'Mã Đơn Hàng': 'CU2' };
  const donDhThieuSheet = { _id: 'dh-khac', STT: '8', 'Mã Đơn Hàng': 'DH008' };
  const cacDon = [donCu, donWeb, donWebThieuSheet, donCuThieuSheet, donDhThieuSheet];
  const thaoTac = [];
  let soLanGoiXoa = 0;
  let phamVi;
  const Order = {
    find: () => ({ lean: async () => cacDon }),
    collection: {
      bulkWrite: async danhSach => {
        thaoTac.push(...danhSach);
        danhSach.forEach(op => {
          if (op.insertOne) cacDon.push(op.insertOne.document);
          if (op.updateOne) {
            const order = cacDon.find(item => item._id === op.updateOne.filter._id);
            Object.assign(order, op.updateOne.update.$set);
          }
        });
      }
    },
    deleteMany: async () => { soLanGoiXoa++; throw new Error('Đồng bộ không được phép xóa đơn'); }
  };
  const SanPham = { find: () => ({ lean: async () => [] }) };
  const header = ['STT', 'Mã Đơn Hàng', 'Tên Khách Hàng', 'nguonTaoDon'];
  const duLieu = {
    'DONHANG!A:ZZ': [
      header,
      ['1', 'CU', 'Từ DONHANG', ''],
      ['4', 'CU2', 'Khôi phục từ DONHANG', ''],
      ['7', 'DH007', 'Đơn DH cần khôi phục', ''],
      ['9', 'DH007', 'Dòng khác cùng mã DH', '']
    ],
    'GS-DONHANG!A:ZZ': [
      header,
      ['1', 'CU', 'Cập nhật từ GSDONHANG', ''],
      ['2', 'KHAC', 'Không ghi đè đơn web', ''],
      ['5', 'WEB2', 'Không ghi đè đơn web', ''],
      ['6', 'MOI', 'Mới từ GSDONHANG', ''],
      ['10', 'GS007', 'Đơn GSDONHANG khác STT', '']
    ]
  };
  const bang = {
    spreadsheets: {
      values: {
        get: async ({ range }) => ({ data: { values: duLieu[range] } }),
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
  assert.equal(ketQua.pulled.created, 4);
  assert.equal(ketQua.pulled.updated, 3);
  assert.equal(ketQua.pulled.deleted, 0);
  assert.equal(ketQua.pulled.xungDotDonWeb, 2);
  assert.deepEqual(Array.from(ketQua.pulled.bySheet, item => item.sheetName), ['DONHANG', 'GS-DONHANG']);
  assert.equal(dongBo.getSyncStatus().direction, 'sheet-to-mongo');
  assert.deepEqual(Array.from(dongBo.getSyncStatus().sourceSheets), ['DONHANG', 'GS-DONHANG']);
  assert.deepEqual(Array.from(phamVi), ['https://www.googleapis.com/auth/spreadsheets.readonly']);
  assert.equal(thaoTac.length, 7);
  const capNhatCu = thaoTac.filter(op => op.updateOne?.filter._id === 'cu');
  assert.equal(capNhatCu.length, 2);
  assert.equal(capNhatCu[0].updateOne.update.$set['Tên Khách Hàng'], 'Từ DONHANG');
  assert.equal(capNhatCu[1].updateOne.update.$set['Tên Khách Hàng'], 'Cập nhật từ GSDONHANG');
  assert.equal(thaoTac.find(op => op.updateOne?.filter._id === 'cu-khac').updateOne.update.$set['Tên Khách Hàng'], 'Khôi phục từ DONHANG');
  const donDhDuocNhap = thaoTac.filter(op => op.insertOne?.document['Mã Đơn Hàng'] === 'DH007');
  assert.equal(donDhDuocNhap.length, 2);
  assert.deepEqual(donDhDuocNhap.map(op => op.insertOne.document.STT), ['7', '9']);
  assert.equal(donDhDuocNhap[0].insertOne.document['Tên Khách Hàng'], 'Đơn DH cần khôi phục');
  assert.equal(donDhDuocNhap[1].insertOne.document['Tên Khách Hàng'], 'Dòng khác cùng mã DH');
  assert.equal(thaoTac.find(op => op.insertOne?.document['Mã Đơn Hàng'] === 'MOI').insertOne.document['Tên Khách Hàng'], 'Mới từ GSDONHANG');
  assert.equal(thaoTac.find(op => op.insertOne?.document['Mã Đơn Hàng'] === 'GS007').insertOne.document['Tên Khách Hàng'], 'Đơn GSDONHANG khác STT');
  assert.equal(thaoTac.some(op => op.updateOne?.filter._id === 'web' || op.updateOne?.filter._id === 'web-khac'), false);
  assert.equal(soLanGoiXoa, 0);
  console.log('Đạt: nhập DONHANG và GS-DONHANG; đơn DH thiếu trên Sheet không bị xóa; dữ liệu đơn web được bảo vệ.');
}

kiemTra().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
