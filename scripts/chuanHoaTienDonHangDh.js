// Dùng: node scripts/chuanHoaTienDonHangDh.js [--apply]
// Mặc định chạy thử (dry-run, không ghi DB). Chỉ chuyển chuỗi số hợp lệ sang Number, giữ nguyên mọi trường trống.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;
const TRUONG_TIEN = [
  'Thành Tiền',
  'Chiết Khấu',
  'Thực Thu',
  'KH Thanh Toán',
  'Còn lại',
  'Thực Đóng Công Ty',
  'Lợi Nhuận Dự Kiến',
  'THỰC CÔNG NỢ CTY',
  'Thực Đóng Cuối Cùng'
];
const REGEX_SO_HOP_LE = /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/;

function laGiaTriTrong(giaTri) {
  return giaTri === undefined || giaTri === null || (typeof giaTri === 'string' && giaTri.trim() === '');
}

function chuyenSoHopLe(giaTri) {
  if (typeof giaTri !== 'string') return { hopLe: false, boQua: true };
  const chuoi = giaTri.trim();
  if (!chuoi) return { hopLe: false, boQua: true };
  if (!REGEX_SO_HOP_LE.test(chuoi)) return { hopLe: false, boQua: false, giaTriGoc: chuoi };
  const so = Number(chuoi.replace(/,/g, ''));
  if (!Number.isFinite(so)) return { hopLe: false, boQua: false, giaTriGoc: chuoi };
  return { hopLe: true, giaTriMoi: so };
}

async function demTrangThaiTrong(col) {
  const [thucThuTrong, khThanhToanTrong, ngayKhThanhToanTrong, conLaiChuoi] = await Promise.all([
    col.countDocuments({ 'Mã Đơn Hàng': /^DH/i, $or: [{ 'Thực Thu': { $exists: false } }, { 'Thực Thu': null }, { 'Thực Thu': '' }] }),
    col.countDocuments({ 'Mã Đơn Hàng': /^DH/i, $or: [{ 'KH Thanh Toán': { $exists: false } }, { 'KH Thanh Toán': null }, { 'KH Thanh Toán': '' }] }),
    col.countDocuments({ 'Mã Đơn Hàng': /^DH/i, $or: [{ 'Ngày KH thanh toán': { $exists: false } }, { 'Ngày KH thanh toán': null }, { 'Ngày KH thanh toán': '' }] }),
    col.countDocuments({ 'Mã Đơn Hàng': /^DH/i, 'Còn lại': { $type: 'string' } })
  ]);
  return { thucThuTrong, khThanhToanTrong, ngayKhThanhToanTrong, conLaiChuoi };
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI hoặc MONGO_URI trong .env');

  await mongoose.connect(uri);
  const col = mongoose.connection.db.collection('GS-DONHANG');

  const projection = { _id: 1, STT: 1, 'Mã Đơn Hàng': 1, 'Ngày KH thanh toán': 1 };
  for (const truong of TRUONG_TIEN) projection[truong] = 1;

  const cursor = col.find({ 'Mã Đơn Hàng': /^DH/i }, { projection });

  let tongDonQuet = 0;
  let soDonCanCapNhat = 0;
  const thongKeTruong = Object.fromEntries(TRUONG_TIEN.map(t => [t, { chuanHoa: 0, giuTrong: 0, daLaSo: 0, boQuaKhac: 0 }]));
  const skippedNonNumeric = [];
  const backupRecords = [];
  const bulkOps = [];

  for await (const doc of cursor) {
    tongDonQuet++;
    const setFields = {};
    const beforeFields = {};

    for (const truong of TRUONG_TIEN) {
      const giaTri = doc[truong];
      if (laGiaTriTrong(giaTri)) {
        thongKeTruong[truong].giuTrong++;
        continue;
      }
      if (typeof giaTri === 'number') {
        thongKeTruong[truong].daLaSo++;
        continue;
      }
      const kq = chuyenSoHopLe(giaTri);
      if (kq.hopLe) {
        setFields[truong] = kq.giaTriMoi;
        beforeFields[truong] = giaTri;
        thongKeTruong[truong].chuanHoa++;
      } else if (!kq.boQua) {
        thongKeTruong[truong].boQuaKhac++;
        if (skippedNonNumeric.length < 30) {
          skippedNonNumeric.push({ maDon: doc['Mã Đơn Hàng'], truong, giaTri: kq.giaTriGoc });
        }
      }
    }

    if (Object.keys(setFields).length > 0) {
      soDonCanCapNhat++;
      backupRecords.push({
        _id: doc._id,
        STT: doc.STT ?? '',
        'Mã Đơn Hàng': doc['Mã Đơn Hàng'] ?? '',
        before: beforeFields
      });
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: setFields }
        }
      });
    }
  }

  const trangThaiTruoc = await demTrangThaiTrong(col);
  const baoCao = {
    cheDo: APPLY ? 'APPLY' : 'DRY_RUN',
    tongDonDhQuet: tongDonQuet,
    soDonCanCapNhat,
    thongKeTruong,
    soGiaTriKhongPhaiSoBoQua: Object.values(thongKeTruong).reduce((s, item) => s + item.boQuaKhac, 0),
    mauGiaTriKhongPhaiSo: skippedNonNumeric,
    trangThaiTrongTruoc: trangThaiTruoc
  };

  if (!APPLY) {
    console.log(JSON.stringify(baoCao, null, 2));
    console.log('Chạy thử hoàn tất (không ghi DB). Thêm --apply để backup và cập nhật.');
    await mongoose.disconnect();
    return;
  }

  if (bulkOps.length === 0) {
    console.log(JSON.stringify({ ...baoCao, message: 'Không có bản ghi nào cần chuẩn hóa.' }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const backupDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `dh-orders-money-before-normalize-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupRecords, null, 2), 'utf8');

  const stat = fs.statSync(backupFile);
  if (!fs.existsSync(backupFile) || stat.size <= 0) {
    throw new Error('Không thể xác nhận file backup hợp lệ. Dừng cập nhật.');
  }

  let matchedCount = 0;
  let modifiedCount = 0;
  for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
    const batch = bulkOps.slice(i, i + BATCH_SIZE);
    const res = await col.bulkWrite(batch, { ordered: false });
    matchedCount += res.matchedCount || 0;
    modifiedCount += res.modifiedCount || 0;
  }

  const trangThaiSau = await demTrangThaiTrong(col);
  const chuoiTienConLai = await Promise.all([
    col.countDocuments({ 'Mã Đơn Hàng': /^DH/i, 'Thực Thu': { $type: 'string' } }),
    col.countDocuments({ 'Mã Đơn Hàng': /^DH/i, 'KH Thanh Toán': { $type: 'string' } }),
    col.countDocuments({ 'Mã Đơn Hàng': /^DH/i, 'Thành Tiền': { $type: 'string' } })
  ]);

  console.log(JSON.stringify({
    ...baoCao,
    backupFile,
    backupSizeBytes: stat.size,
    matchedCount,
    modifiedCount,
    trangThaiTrongSau: trangThaiSau,
    chuoiTienConLai: {
      thucThuString: chuoiTienConLai[0],
      khThanhToanString: chuoiTienConLai[1],
      thanhTienString: chuoiTienConLai[2]
    }
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
