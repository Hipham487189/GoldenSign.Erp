const assert = require('assert');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const ChuyenPhatNhanh = require('../models/ChuyenPhatNhanh');
const { chuanHoaNgay, taoBanGhi, tinhThoiGianChoLanDongBo, taoMaGiaoNhan, dongBoChuyenPhatNhanh, layTinhTrangDongBo } = require('../services/chuyenPhatNhanhSheetSync');

assert.strictEqual(chuanHoaNgay('04/05/2022').toISOString(), '2022-05-04T00:00:00.000Z');
assert.strictEqual(chuanHoaNgay('2022-05-04').toISOString(), '2022-05-04T00:00:00.000Z');
assert.strictEqual(chuanHoaNgay('31/02/2022'), null);
assert.strictEqual(tinhThoiGianChoLanDongBo(new Date('2026-11-14T12:59:59.000Z')), 1000);
assert.strictEqual(tinhThoiGianChoLanDongBo(new Date('2026-11-14T13:00:00.000Z')), 86400000);
assert.strictEqual(tinhThoiGianChoLanDongBo(new Date('2026-11-14T13:00:01.000Z')), 86399000);

const banGhi = taoBanGhi(
  ['ID', 'NGÀY GỬI', 'TÊN NHÂN VIÊN', 'TÊN CÔNG TY', 'THANH TOÁN\nCHI PHÍ NV '],
  ['sample-1', '04/05/2022', 'Nguyễn An', 'CÔNG TY ĐỒNG THỬ NGHIỆM', 'FALSE']
);
assert.strictEqual(banGhi.maSheet, 'sample-1');
assert.strictEqual(banGhi.ngayGuiDate.toISOString(), '2022-05-04T00:00:00.000Z');
assert.strictEqual(banGhi['THANH TOÁN\nCHI PHÍ NV'], 'FALSE');
assert.ok(banGhi.tuKhoaTimKiem.includes('cong ty dong thu nghiem'));

async function kiemTraMaGiaoNhan() {
  const timBanGhiCu = ChuyenPhatNhanh.findOne;
  const layCollection = mongoose.connection.collection;
  const boDem = new Map();
  const maCu = new Map([[2026, 'GN2026-00009']]);
  try {
    ChuyenPhatNhanh.findOne = dieuKien => ({
      select() { return this; },
      sort() { return this; },
      async lean() {
        const nam = Number(dieuKien.maSheet.source.match(/GN(\d{4})/)[1]);
        return maCu.has(nam) ? { maSheet: maCu.get(nam) } : null;
      }
    });
    mongoose.connection.collection = ten => {
      assert.strictEqual(ten, 'giao_nhan_code_counters');
      return {
        async updateOne(boLoc, capNhat) {
          boDem.set(boLoc._id, Math.max(boDem.get(boLoc._id) || 0, capNhat.$max.value));
        },
        async findOneAndUpdate(boLoc) {
          const value = (boDem.get(boLoc._id) || 0) + 1;
          boDem.set(boLoc._id, value);
          return { value };
        }
      };
    };
    const maDongThoi = await Promise.all(Array.from({ length: 10 }, () => taoMaGiaoNhan(new Date('2026-06-01T00:00:00Z'))));
    assert.strictEqual(new Set(maDongThoi).size, 10);
    assert.ok(maDongThoi.includes('GN2026-00010'));
    assert.ok(maDongThoi.includes('GN2026-00019'));
    assert.strictEqual(await taoMaGiaoNhan(new Date('2026-12-31T17:00:00Z')), 'GN2027-00001');
    boDem.set(2026, 99999);
    await assert.rejects(taoMaGiaoNhan(new Date('2026-06-01T00:00:00Z')), /hết số thứ tự/);
  } finally {
    ChuyenPhatNhanh.findOne = timBanGhiCu;
    mongoose.connection.collection = layCollection;
  }
}

async function kiemTraDayGiaoNhanLenSheet() {
  const xacThucCu = google.auth.GoogleAuth;
  const sheetsCu = google.sheets;
  const findCu = ChuyenPhatNhanh.find;
  const bulkWriteCu = ChuyenPhatNhanh.bulkWrite;
  let soLanGhiMongo = 0;
  const cacDongGhi = [];
  try {
    ChuyenPhatNhanh.bulkWrite = async () => { soLanGhiMongo += 1; };
    ChuyenPhatNhanh.find = () => ({
      select() { return this; },
      lean: async () => [{ _id: '1', maSheet: 'GN2026-00001', 'TÊN CÔNG TY': 'Công ty web' }]
    });
    google.auth.GoogleAuth = class { async getClient() { return {}; } };
    google.sheets = () => ({
      spreadsheets: {
        get: async () => ({ data: { sheets: [{ properties: { sheetId: 1, title: 'ChuyenPhatNhanh', gridProperties: { rowCount: 10 } } }] } }),
        values: {
          get: async () => ({ data: { values: [['ID', 'NGÀY GỬI', 'TÊN CÔNG TY'], ['GN2026-00001', '2026-01-01', 'Công ty Sheet']] } }),
          batchUpdate: async ({ requestBody }) => { cacDongGhi.push(...requestBody.data); }
        }
      }
    });
    const ketQua = await dongBoChuyenPhatNhanh();
    assert.strictEqual(ketQua.updated, 1);
    assert.strictEqual(cacDongGhi.length, 1);
    assert.strictEqual(soLanGhiMongo, 0);
    assert.strictEqual(layTinhTrangDongBo().status, 'success');
  } finally {
    google.auth.GoogleAuth = xacThucCu;
    google.sheets = sheetsCu;
    ChuyenPhatNhanh.find = findCu;
    ChuyenPhatNhanh.bulkWrite = bulkWriteCu;
  }
}

kiemTraMaGiaoNhan().then(kiemTraDayGiaoNhanLenSheet).then(() => {
  console.log('Kiểm tra đồng bộ lên Sheet, lịch 20:00 và mã giao nhận đạt.');
}).catch(loi => {
  console.error(loi);
  process.exitCode = 1;
});
