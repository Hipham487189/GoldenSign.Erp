const assert = require('node:assert/strict');
const { google } = require('googleapis');
const Order = require('../models/Order');
const {
  isSheetToMongoEnabled,
  pushOrderToSheet,
  syncBidirectional,
  getSyncStatus
} = require('../services/googleSheetSync');

async function kiemTra() {
  const xacThucCu = google.auth.GoogleAuth;
  const sheetsCu = google.sheets;
  const orderFindCu = Order.find;
  const orderBulkCu = Order.collection.bulkWrite;

  let soLanGhiMongo = 0;
  Order.collection.bulkWrite = async () => { soLanGhiMongo++; };
  Order.find = () => ({
    select() { return this; },
    lean: async () => [
      { _id: 'o1', STT: '1', 'Mã Đơn Hàng': 'DH01', 'Tên Khách Hàng': 'Từ Web' }
    ]
  });

  const duLieuGhi = [];
  google.auth.GoogleAuth = class { async getClient() { return {}; } };
  google.sheets = () => ({
    spreadsheets: {
      get: async () => ({
        data: { sheets: [{ properties: { sheetId: 1, title: 'GS-DONHANG', gridProperties: { rowCount: 10 } } }] }
      }),
      values: {
        get: async () => ({
          data: {
            values: [
              ['STT', 'Mã Đơn Hàng', 'Tên Khách Hàng'],
              ['1', 'DH01', 'Cũ Trên Sheet']
            ]
          }
        }),
        batchUpdate: async ({ requestBody }) => {
          duLieuGhi.push(...requestBody.data);
        }
      }
    }
  });

  try {
    assert.equal(isSheetToMongoEnabled(), false);
    assert.equal((await pushOrderToSheet('web')).reason, 'scheduled-daily-20h-only');
    const ketQua = await syncBidirectional();
    assert.equal(ketQua.pulled.skipped, true);
    assert.equal(ketQua.pulled.reason, 'sheet-to-mongo-disabled');
    assert.equal(ketQua.pushed.updated, 1);
    assert.equal(duLieuGhi.length, 1);
    assert.equal(soLanGhiMongo, 0);
    assert.equal(getSyncStatus().direction, 'mongo-to-sheet');
    assert.equal(getSyncStatus().schedule, '20:00 (UTC+7)');
    console.log('Đạt: đã ngắt Sheet -> MongoDB và chuyển sang đồng bộ 1 chiều MongoDB -> Google Sheet.');
  } finally {
    google.auth.GoogleAuth = xacThucCu;
    google.sheets = sheetsCu;
    Order.find = orderFindCu;
    Order.collection.bulkWrite = orderBulkCu;
  }
}

kiemTra().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
