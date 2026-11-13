const assert = require('assert');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const ChuyenPhatNhanh = require('../models/ChuyenPhatNhanh');
const { chuanHoaNgay, taoBanGhi, tinhThoiGianChoLanDongBo, taoMaGiaoNhan, dongBoChuyenPhatNhanh, layTinhTrangDongBo } = require('../services/chuyenPhatNhanhSheetSync');

assert.strictEqual(chuanHoaNgay('04/05/2022').toISOString(), '2022-05-04T00:00:00.000Z');
assert.strictEqual(chuanHoaNgay('2022-05-04').toISOString(), '2022-05-04T00:00:00.000Z');
assert.strictEqual(chuanHoaNgay('31/02/2022'), null);
assert.strictEqual(tinhThoiGianChoLanDongBo(new Date('2026-11-13T23:59:59.000Z')), 1000);
assert.strictEqual(tinhThoiGianChoLanDongBo(new Date('2026-11-14T00:00:00.000Z')), 0);
assert.strictEqual(tinhThoiGianChoLanDongBo(new Date('2026-11-14T00:00:01.000Z')), 86399000);

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

async function kiemTraTrungMaSheet() {
  const xacThucCu = google.auth.GoogleAuth;
  const sheetsCu = google.sheets;
  const bulkWriteCu = ChuyenPhatNhanh.bulkWrite;
  const banGhiWeb = { maSheet: 'GN2026-00001', nguonTaoGiaoNhan: 'web', 'TÊN CÔNG TY': 'Công ty web' };
  try {
    google.auth.GoogleAuth = class { async getClient() { return {}; } };
    google.sheets = () => ({ spreadsheets: { values: { get: async () => ({
      data: { values: [['ID', 'NGÀY GỬI', 'TÊN CÔNG TY'], ['GN2026-00001', '2026-01-01', 'Công ty Sheet']] }
    }) } } });
    ChuyenPhatNhanh.bulkWrite = async thaoTac => {
      const { filter, upsert } = thaoTac[0].updateOne;
      assert.deepStrictEqual(filter, { maSheet: banGhiWeb.maSheet, nguonTaoGiaoNhan: { $ne: 'web' } });
      assert.strictEqual(upsert, true);
      const loi = new Error('duplicate key');
      loi.code = 11000;
      throw loi;
    };
    await assert.rejects(dongBoChuyenPhatNhanh(), /trùng bản ghi tạo trên web/);
    assert.strictEqual(layTinhTrangDongBo().status, 'error');
    assert.strictEqual(banGhiWeb['TÊN CÔNG TY'], 'Công ty web');
  } finally {
    google.auth.GoogleAuth = xacThucCu;
    google.sheets = sheetsCu;
    ChuyenPhatNhanh.bulkWrite = bulkWriteCu;
  }
}

kiemTraMaGiaoNhan().then(kiemTraTrungMaSheet).then(() => {
  console.log('Kiểm tra đồng bộ, lịch 07:00 và mã giao nhận đạt.');
}).catch(loi => {
  console.error(loi);
  process.exitCode = 1;
});
