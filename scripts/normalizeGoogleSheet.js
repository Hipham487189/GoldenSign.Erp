const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('../models/Order');
const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1-Xn6eGSTqD6yiCEsCcNIDiJ5L6_EzQIUF6HCw5v9y7c';
const sheetName = process.env.GOOGLE_SHEET_NAME || 'GS-DONHANG';
const credentialsFile = process.env.GOOGLE_CREDENTIALS_FILE || path.join(__dirname, '..', 'credentials.json');
const backupDir = path.join(__dirname, '..', 'backups');
const applyChanges = process.argv.includes('--apply');

function text(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function columnName(index) {
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}
function isBlankRow(row) { return !row.some(value => text(value)); }
function rowData(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
}
function orderRow(headers, order) {
  return headers.map(header => {
    if (header === 'Thực Đóng Cuối Cùng') return order['THỰC CÔNG NỢ CTY'] ?? '';
    return order[header] ?? '';
  });
}

async function getSheets() {
  const authOptions = process.env.GOOGLE_CREDENTIALS_JSON
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON), scopes: ['https://www.googleapis.com/auth/spreadsheets'] }
    : { keyFile: credentialsFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  const auth = new google.auth.GoogleAuth(authOptions);
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function readSheet(sheets) {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:ZZ` });
  const values = response.data.values || [];
  return { values, headers: values[0] || [], rows: values.slice(1) };
}

async function backup(name, payload) {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

async function main() {
  const sheets = await getSheets();
  const current = await readSheet(sheets);
  const sttIndex = current.headers.indexOf('STT');
  const codeIndex = current.headers.indexOf('Mã Đơn Hàng');
  if (sttIndex < 0 || codeIndex < 0) throw new Error('Sheet phải có cột STT và Mã Đơn Hàng.');

  const dataRows = current.rows.filter(row => !isBlankRow(row));
  const blankRows = current.rows.length - dataRows.length;
  const seenStt = new Set();
  const duplicateStt = [];
  const missingStt = [];
  for (const row of dataRows) {
    const stt = text(row[sttIndex]);
    if (!stt) missingStt.push(row);
    else if (seenStt.has(stt)) duplicateStt.push(stt);
    else seenStt.add(stt);
  }
  if (missingStt.length || duplicateStt.length) {
    throw new Error(`Dừng: ${missingStt.length} dòng thiếu STT, ${duplicateStt.length} dòng trùng STT. Không tự ý xóa.`);
  }

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const mongoOrders = await Order.collection.find({}).toArray();
  const mongoByStt = new Map(mongoOrders.map(order => [text(order.STT), order]).filter(([stt]) => stt));
  const sheetStt = new Set(dataRows.map(row => text(row[sttIndex])).filter(Boolean));
  const missingMongo = dataRows.map(row => text(row[sttIndex])).filter(stt => !mongoByStt.has(stt));
  if (missingMongo.length) throw new Error(`Dừng: ${missingMongo.length} STT trên Sheet không tồn tại trong MongoDB.`);
  const missingSheet = [...mongoByStt.keys()].filter(stt => !sheetStt.has(stt));
  const missingOrders = missingSheet.map(stt => mongoByStt.get(stt));
  const sourceRows = [...dataRows, ...missingOrders.map(order => orderRow(current.headers, order))];

  const normalizedRows = sourceRows.map((row, index) => {
    const order = mongoByStt.get(text(row[sttIndex]));
    const next = [...row];
    while (next.length < current.headers.length) next.push('');
    next[codeIndex] = `GS${String(index + 1).padStart(6, '0')}`;
    return next;
  });

  const mongoUpdates = normalizedRows.map((row, index) => ({
    updateOne: {
      filter: { STT: text(row[sttIndex]) },
      update: { $set: { 'Mã Đơn Hàng': row[codeIndex] } }
    }
  }));
  const sheetPayload = [current.headers, ...normalizedRows];
  const report = { dryRun: !applyChanges, sheetRowsBefore: current.rows.length, blankRows, dataRows: dataRows.length, mongoOnlyOrdersAppended: missingOrders.length, mongoOrders: mongoOrders.length, renumberCount: normalizedRows.length, firstCode: normalizedRows[0]?.[codeIndex], lastCode: normalizedRows.at(-1)?.[codeIndex] };

  if (!applyChanges) {
    report.sheetBackupPreview = 'Backup sẽ được tạo khi chạy --apply';
    console.log(JSON.stringify(report, null, 2));
    await mongoose.disconnect();
    return;
  }

  const sheetBackup = await backup('google-sheet-before-normalize', { spreadsheetId, sheetName, values: current.values });
  const mongoBackup = await backup('mongo-orders-before-normalize', mongoOrders);
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetName}!A:ZZ` });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetName}!A1:${columnName(current.headers.length - 1)}${sheetPayload.length}`, valueInputOption: 'RAW', requestBody: { values: sheetPayload } });
  await Order.collection.bulkWrite(mongoUpdates, { ordered: true });
  report.sheetBackup = sheetBackup;
  report.mongoBackup = mongoBackup;
  report.applied = true;
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
