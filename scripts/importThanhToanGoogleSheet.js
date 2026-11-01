// Dùng: node scripts/importThanhToanGoogleSheet.js [--apply]
// Mặc định chạy thử (không ghi). Thêm mới + cập nhật theo maGoogleSheet, không xóa dữ liệu.
require('dotenv').config();
const mongoose = require('mongoose');
const { syncThanhToan } = require('../services/thanhToanSheetSync');

const APPLY = process.argv.includes('--apply');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI trong .env');
  await mongoose.connect(uri);
  const result = await syncThanhToan({ apply: APPLY });
  console.log(JSON.stringify(result.results, null, 2));
  console.log(APPLY ? 'Hoàn tất.' : 'Chạy thử xong, thêm --apply để ghi thật.');
  await mongoose.disconnect();
})().catch(err => { console.error(err.message); process.exit(1); });
