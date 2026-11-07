const assert = require('node:assert/strict');
const { taoKhoGia } = require('./giaLapKhoTepUnc');
const kho = taoKhoGia();
const { luuPhieuUnc, luuKetQuaDuyetUnc } = require('../services/luuPhieuUncNhieuSanPham');
const { docTepUnc } = require('../services/tepUncMongo');

const dong = {
  maDong: 'dong-1', trangThai: 'Đã Kích Hoạt', soLuong: 1, giaBan: 1000,
  giaDongCongTy: 700, giaNoNcc: 600, phaiThuKhach: 1000,
  thanhToanKhach: [], thanhToanNcc: []
};
const saoChep = value => JSON.parse(JSON.stringify(value));
let don = { _id: 'don-1', chiTietSanPham: [dong] };
let gayXungDot = false;
const Order = {
  db: kho.db,
  findOne(boLoc) {
    return { select() { return this; }, async lean() { return boLoc._id === don._id ? saoChep(don) : null; } };
  },
  findOneAndUpdate(filter, update) {
    return { async lean() {
      if (gayXungDot) { gayXungDot = false; return null; }
      const [boLoc, chiTiet, phieu, uncCu, ...cacTruong] = filter.$and;
      if (boLoc._id !== don._id || JSON.stringify(chiTiet.chiTietSanPham) !== JSON.stringify(don.chiTietSanPham)) return null;
      if (phieu.phieuUnc.$exists === false ? don.phieuUnc !== undefined : JSON.stringify(phieu.phieuUnc) !== JSON.stringify(don.phieuUnc)) return null;
      if (uncCu['Số Tiền UNC']?.$exists === false ? don['Số Tiền UNC'] !== undefined : uncCu['Số Tiền UNC'] !== don['Số Tiền UNC']) return null;
      for (const dieuKien of cacTruong) {
        const [truong, giaTri] = Object.entries(dieuKien)[0];
        if (giaTri?.$exists === false ? don[truong] !== undefined : don[truong] !== giaTri) return null;
      }
      Object.assign(don, saoChep(update.$set));
      return { _id: don._id };
    } };
  }
};

async function kiemTra() {
  const thongTin = { ngay: '2026-02-01', soTien: 1000, phanBo: [{ maDong: 'dong-1', soTien: 600 }],
    tep: { ten: 'unc.pdf', duLieu: 'data:application/pdf;base64,SGVsbG8=' } };
  const phieu = await luuPhieuUnc(Order, { _id: 'don-1' }, thongTin);
  assert.equal(phieu.coTep, true);
  assert.equal(phieu.tep, undefined);
  assert.equal(don.phieuUnc[0].tep.ten, 'unc.pdf');
  assert.equal(don.phieuUnc[0].tep.duLieu, undefined);
  assert.equal(kho.tep.size, 1);
  assert.equal((await docTepUnc(Order, don.phieuUnc[0].tep)).duLieu, thongTin.tep.duLieu);
  assert.equal(don.chiTietSanPham[0].thanhToanKhach.length, 0);
  gayXungDot = true;
  await assert.rejects(() => luuKetQuaDuyetUnc(Order, { _id: 'don-1' }, phieu.maPhieu, 'Đã Duyệt'), error => error.statusCode === 409);
  assert.equal(don.phieuUnc[0].trangThai, 'Chờ Duyệt');
  assert.equal(don.chiTietSanPham[0].thanhToanKhach.length, 0);
  const daDuyet = await luuKetQuaDuyetUnc(Order, { _id: 'don-1' }, phieu.maPhieu, 'Đã Duyệt');
  assert.equal(daDuyet.trangThai, 'Đã Duyệt');
  assert.equal(daDuyet.tep, undefined);
  assert.equal(don.chiTietSanPham[0].thanhToanKhach[0].soTien, 600);
  assert.equal(don['KH Thanh Toán'], 600);
  assert.equal(don['Còn lại'], 400);
  await assert.rejects(() => luuKetQuaDuyetUnc(Order, { _id: 'don-1' }, phieu.maPhieu, 'Đã Duyệt'), /chờ duyệt/);
  await assert.rejects(() => luuPhieuUnc(Order, { _id: 'khac' }, thongTin), error => error.statusCode === 404);
  gayXungDot = true;
  await assert.rejects(() => luuPhieuUnc(Order, { _id: 'don-1' }, thongTin), error => error.statusCode === 409);
  assert.equal(don.phieuUnc.length, 1);
  assert.equal(kho.tep.size, 1);
  const tepLon = `data:application/pdf;base64,${Buffer.alloc(3 * 1024 * 1024, 97).toString('base64')}`;
  await luuPhieuUnc(Order, { _id: 'don-1' }, { ...thongTin, tep: { ten: 'lon1.pdf', duLieu: tepLon } });
  await luuPhieuUnc(Order, { _id: 'don-1' }, { ...thongTin, tep: { ten: 'lon2.pdf', duLieu: tepLon } });
  assert.equal(kho.tep.size, 3);
  assert.ok(Buffer.byteLength(JSON.stringify(don)) < 10000);
  assert.equal((await docTepUnc(Order, don.phieuUnc[1].tep)).duLieu, tepLon);
  assert.equal((await docTepUnc(Order, thongTin.tep)).duLieu, thongTin.tep.duLieu);
  await assert.rejects(() => docTepUnc(Order, { ten: 'khong-co.pdf', maTep: 'khong-co', loai: 'application/pdf' }), /Không tìm thấy tệp/);
  const phieuTuChoi = await luuPhieuUnc(Order, { _id: 'don-1' }, thongTin);
  await luuKetQuaDuyetUnc(Order, { _id: 'don-1' }, phieuTuChoi.maPhieu, 'Từ Chối', 'Sai chứng từ');
  await luuPhieuUnc(Order, { _id: 'don-1' }, thongTin);
  assert.equal(don.phieuUnc.length, 5);
  await assert.rejects(() => luuPhieuUnc(Order, { _id: 'don-1' }, thongTin), /tối đa 5 phiếu/);
  assert.equal(kho.tep.size, 5);
  don = { _id: 'don-1', chiTietSanPham: [dong], 'Số Tiền UNC': 100, phieuUnc: don.phieuUnc.slice(0, 4) };
  await assert.rejects(() => luuPhieuUnc(Order, { _id: 'don-1' }, thongTin), /tối đa 5 phiếu/);
  don = { _id: 'don-1', chiTietSanPham: [dong], phieuUnc: don.phieuUnc.slice(0, 4) };
  const ketQuaDongThoi = await Promise.allSettled([
    luuPhieuUnc(Order, { _id: 'don-1' }, thongTin),
    luuPhieuUnc(Order, { _id: 'don-1' }, thongTin)
  ]);
  assert.equal(ketQuaDongThoi.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(ketQuaDongThoi.filter(item => item.status === 'rejected' && item.reason.statusCode === 409).length, 1);
  assert.equal(don.phieuUnc.length, 5);
  kho.khoiPhuc();
}

kiemTra().then(() => console.log('Đạt: lưu phiếu, duyệt nguyên tử và xử lý xung đột (MongoDB giả).'))
  .catch(error => { console.error(error); process.exitCode = 1; });
