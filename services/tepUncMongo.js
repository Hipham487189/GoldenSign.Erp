const mongoose = require('mongoose');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { luuTepNang, docTepNang, laThamChieuTep } = require('./fileStorageService');

function khoTep(Order) {
  if (!Order.db?.db) throw new Error('MongoDB chưa kết nối, không thể lưu tệp UNC.');
  return new mongoose.mongo.GridFSBucket(Order.db.db, { bucketName: 'tep_unc' });
}

async function luuTepUnc(Order, tep) {
  const khop = /^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(tep.duLieu);
  if (!khop) throw new Error('Dữ liệu tệp UNC không hợp lệ.');
  const thamChieu = await luuTepNang({
    dataUrl: tep.duLieu,
    mimeType: khop[1],
    fileName: tep.ten || `unc-${Date.now()}`,
    prefix: 'unc'
  });
  return { ten: tep.ten, thamChieu, loai: khop[1] };
}

async function xoaTepUnc(Order, maTep) {
  if (!maTep) return;
  await khoTep(Order).delete(maTep);
}

async function docTepUnc(Order, tep) {
  if (typeof tep.duLieu === 'string') return { ten: tep.ten, duLieu: tep.duLieu };
  if (laThamChieuTep(tep.thamChieu)) {
    const ketQua = await docTepNang(tep.thamChieu);
    if (!ketQua?.dataUrl) throw new Error('Không tìm thấy dữ liệu tệp UNC.');
    return { ten: tep.ten || ketQua.fileName, duLieu: ketQua.dataUrl };
  }
  if (!tep.maTep || !/^(image\/[a-zA-Z0-9.+-]+|application\/pdf)$/.test(tep.loai || '')) {
    throw new Error('Thông tin tệp UNC không hợp lệ.');
  }
  const luong = khoTep(Order).openDownloadStream(tep.maTep);
  const cacPhan = [];
  let kichThuoc = 0;
  for await (const phan of luong) {
    kichThuoc += phan.length;
    if (kichThuoc > 8 * 1024 * 1024) {
      luong.destroy();
      throw new Error('Tệp UNC vượt quá kích thước cho phép.');
    }
    cacPhan.push(phan);
  }
  return { ten: tep.ten, duLieu: `data:${tep.loai};base64,${Buffer.concat(cacPhan).toString('base64')}` };
}

module.exports = { luuTepUnc, xoaTepUnc, docTepUnc };
