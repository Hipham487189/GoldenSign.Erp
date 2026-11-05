require('dotenv').config();
const mongoose = require('mongoose');
const HoSo = require('../models/HoSo');
const { taiDongSheet } = require('../services/hosoSheet');
const { taoTruongTimKiem, chuanHoaTimKiem } = require('../services/hoso');

async function chay() {
  const apDung = process.argv.includes('--apply');
  const lamMoiTinhTrang = process.argv.includes('--refresh-status');
  const cacDong = await taiDongSheet();
  const idDaGap = new Set();
  const cacDongTrung = [];
  const cacDongThieuId = [];
  const cacBanGhi = cacDong.map((dong, chiSo) => {
    const id = String(dong.ID || '').trim();
    if (!id) cacDongThieuId.push(chiSo + 2);
    else if (idDaGap.has(id)) cacDongTrung.push(id);
    else idDaGap.add(id);
    return { ...dong, ID: id, ...taoTruongTimKiem(dong) };
  });

  if (cacDongThieuId.length || cacDongTrung.length) {
    throw new Error(`Dữ liệu Sheet chưa an toàn để nhập: thiếu ID ${cacDongThieuId.length} dòng; ID trùng ${cacDongTrung.length} dòng.`);
  }

  console.log(`Đã đọc ${cacBanGhi.length} hồ sơ hợp lệ từ Google Sheet.`);
  if (!apDung && !lamMoiTinhTrang) {
    console.log('Chế độ xem trước: chưa kết nối/ghi dữ liệu MongoDB. Chạy lại với --apply để nhập hoặc --refresh-status để đồng bộ trạng thái.');
    return;
  }

  const uri = process.env.ATLAS_MONGO_URI || process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu cấu hình kết nối MongoDB.');
  await mongoose.connect(uri);
  await HoSo.init();

  if (lamMoiTinhTrang) {
    let soCapNhat = 0;
    for (let batDau = 0; batDau < cacBanGhi.length; batDau += 500) {
      const nhom = cacBanGhi.slice(batDau, batDau + 500);
      const ketQua = await HoSo.bulkWrite(nhom.map(duLieu => ({
        updateOne: {
          filter: { ID: duLieu.ID },
          update: {
            $set: {
              'TÌNH TRẠNG HỒ SƠ': duLieu['TÌNH TRẠNG HỒ SƠ'] || '',
              tinhTrangChuanHoa: chuanHoaTimKiem(duLieu['TÌNH TRẠNG HỒ SƠ'])
            }
          }
        }
      })), { ordered: true });
      soCapNhat += ketQua.matchedCount || 0;
    }
    console.log(`Đã đồng bộ trạng thái từ Google Sheet cho ${soCapNhat} hồ sơ MongoDB. Các trường khác không thay đổi.`);
    return;
  }

  let soDaNhap = 0;
  let soDaTonTai = 0;
  for (let batDau = 0; batDau < cacBanGhi.length; batDau += 500) {
    const nhom = cacBanGhi.slice(batDau, batDau + 500);
    const ketQua = await HoSo.bulkWrite(nhom.map(duLieu => ({
      updateOne: {
        filter: { ID: duLieu.ID },
        update: { $setOnInsert: duLieu },
        upsert: true
      }
    })), { ordered: true });
    soDaNhap += ketQua.upsertedCount || 0;
    soDaTonTai += nhom.length - (ketQua.upsertedCount || 0);
  }

  console.log(`Hoàn tất: thêm ${soDaNhap} hồ sơ; giữ nguyên ${soDaTonTai} hồ sơ MongoDB đã tồn tại. Không xóa dữ liệu nào.`);
}

chay()
  .catch(loi => {
    console.error('Không thể chuyển hồ sơ sang MongoDB:', loi.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
