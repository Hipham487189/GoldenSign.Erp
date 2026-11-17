const assert = require('node:assert/strict');
const { luuKetQuaUncDonHangCu } = require('../services/duyetUncDonHangCu');

const saoChep = giaTri => JSON.parse(JSON.stringify(giaTri));
let don;
const Order = {
  findOneAndUpdate(filter, update) {
    return Promise.resolve().then(() => {
      if (filter.$and.some(dieuKien => {
        const [truong, mongMuon] = Object.entries(dieuKien)[0];
        if (mongMuon && mongMuon.$exists === false) return don[truong] !== undefined;
        return JSON.stringify(don[truong]) !== JSON.stringify(mongMuon);
      })) return null;
      Object.assign(don, saoChep(update.$set));
      return { ...don, toObject() { return { ...don }; } };
    });
  }
};

async function kiemTra() {
  don = {
    _id: 'don-1', 'Số Tiền UNC': 75, 'Trạng Thái UNC': 'Chờ Duyệt',
    'KH Thanh Toán': 25, 'Thực Thu': 200, 'Còn lại': 175
  };
  const daDuyet = await luuKetQuaUncDonHangCu(Order, saoChep(don), 'Đã Duyệt', '');
  assert.equal(daDuyet['KH Thanh Toán'], 100);
  assert.equal(daDuyet['Còn lại'], 100);
  await assert.rejects(
    () => luuKetQuaUncDonHangCu(Order, saoChep(don), 'Đã Duyệt', ''),
    loi => loi.statusCode === 409
  );

  don = { _id: 'don-2', 'Số Tiền UNC': 50, 'Trạng Thái UNC': 'Chờ Duyệt' };
  const thanhToanBanDau = await luuKetQuaUncDonHangCu(Order, saoChep(don), 'Đã Duyệt', '');
  assert.equal(thanhToanBanDau['KH Thanh Toán'], 50);
  assert.equal(thanhToanBanDau['Còn lại'], 0);

  don = { _id: 'don-3', 'Số Tiền UNC': 30, 'Trạng Thái UNC': 'Chờ Duyệt', 'KH Thanh Toán': 10, 'Thực Thu': 100 };
  const snapshotCu = saoChep(don);
  don['KH Thanh Toán'] = 40;
  assert.equal(await luuKetQuaUncDonHangCu(Order, snapshotCu, 'Đã Duyệt', ''), null);
}

kiemTra()
  .then(() => console.log('Đạt: UNC cũ cộng tiền đã duyệt đúng một lần, tính lại còn lại và phát hiện xung đột.'))
  .catch(loi => { console.error(loi); process.exitCode = 1; });
