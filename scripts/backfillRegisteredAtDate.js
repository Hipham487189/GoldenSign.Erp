const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const applyChanges = process.argv.includes('--apply');
const backupDir = path.join(__dirname, '..', 'backups');
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
const schema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('BackfillRegisteredAtDate', schema, 'GS-DONHANG');

function normalizeDate(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) return new Date(Date.UTC(Number(local[3]), Number(local[2]) - 1, Number(local[1])));
  return null;
}

(async () => {
  await mongoose.connect(uri);
  const orders = await Order.find({}).lean();
  const operations = [];
  let invalid = 0;
  for (const order of orders) {
    const date = normalizeDate(order['Ngày Đăng Ký']);
    if (!date || Number.isNaN(date.getTime())) { invalid += 1; continue; }
    operations.push({ updateOne: { filter: { _id: order._id }, update: { $set: { registeredAtDate: date } } } });
  }
  const report = { dryRun: !applyChanges, total: orders.length, updates: operations.length, invalid };
  if (applyChanges) {
    fs.mkdirSync(backupDir, { recursive: true });
    const file = path.join(backupDir, `orders-before-date-index-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(orders));
    const result = await Order.bulkWrite(operations, { ordered: false });
    report.backup = file;
    report.modified = result.modifiedCount;
  }
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
