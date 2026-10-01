const path = require('path');
const { google } = require('googleapis');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const SanPham = require('../models/SanPham');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '1-Xn6eGSTqD6yiCEsCcNIDiJ5L6_EzQIUF6HCw5v9y7c';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'GS-DONHANG';
const CREDENTIALS_FILE = process.env.GOOGLE_CREDENTIALS_FILE || path.join(__dirname, '..', 'credentials.json');
const POLL_INTERVAL_MS = Number(process.env.GOOGLE_SHEET_SYNC_INTERVAL_MS || 30000);
const FILE_HEADER = 'FILE ĐÍNH KÈM';

let syncTimer = null;
let syncRunning = false;
let lastSync = { status: 'idle', at: null, error: null };
let orderPushQueue = Promise.resolve();

async function getSheets() {
  const authOptions = process.env.GOOGLE_CREDENTIALS_JSON
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON), scopes: ['https://www.googleapis.com/auth/spreadsheets'] }
    : { keyFile: CREDENTIALS_FILE, scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  const auth = new google.auth.GoogleAuth(authOptions);
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function readSheet() {
  const sheets = await getSheets();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A:ZZ` });
  const values = response.data.values || [];
  return { sheets, headers: values[0] || [], rows: values.slice(1) };
}

function codeOf(row, headers) {
  const index = headers.indexOf('Mã Đơn Hàng');
  return index >= 0 ? String(row[index] || '').trim() : '';
}

function sttOf(row, headers) {
  const index = headers.indexOf('STT');
  return index >= 0 ? String(row[index] || '').trim() : '';
}

function valueFor(order, header) {
  if (header === FILE_HEADER) return undefined;
  if (header === 'Thực Đóng Cuối Cùng') return order['THỰC CÔNG NỢ CTY'];
  const value = order[header];
  if (value === null || value === undefined || value === '') return undefined;
  if (header === 'MST') {
    const text = String(value).replace(/^'+/, '').trim();
    const digits = text.replace(/\D/g, '');
    return digits.length === 9 ? `0${digits}` : text;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function rowData(headers, row) {
  const data = {};
  headers.forEach((header, index) => {
    const value = row[index];
    if (header && value !== undefined && value !== null && String(value).trim() !== '') data[header] = value;
  });
  return data;
}

// Google Sheet dùng chuẩn ngày DD/MM/YYYY, không phải MM/DD/YYYY của JS Date mặc định.
function parseSheetRegistrationDate(value) {
  const text = String(value || '').trim();
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  const localMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (localMatch) return new Date(Date.UTC(Number(localMatch[3]), Number(localMatch[2]) - 1, Number(localMatch[1])));
  return null;
}

async function pullSheetToMongo(headers, rows) {
  if (!headers.includes('Mã Đơn Hàng')) throw new Error(`Sheet ${SHEET_NAME} thiếu cột Mã Đơn Hàng.`);
  if (!headers.includes('STT')) throw new Error(`Sheet ${SHEET_NAME} thiếu cột STT.`);
  const collection = Order.collection;
  const existing = await Order.find({}).lean();
  const byStt = new Map(existing.map(order => [String(order.STT || '').trim(), order]).filter(([stt]) => stt));
  const untrackedByCode = new Map();
  existing.forEach(order => {
    const code = String(order['Mã Đơn Hàng'] || '').trim();
    if (code && !order.__SHEET_ROW && !untrackedByCode.has(code)) untrackedByCode.set(code, order);
  });
  const operations = [];
  const seenStt = new Set();
  let created = 0;
  let updated = 0;

  rows.forEach(row => {
    if (!row.some(value => String(value ?? '').trim())) return;
    const data = rowData(headers, row);
    const code = String(data['Mã Đơn Hàng'] || '').trim();
    const stt = String(data.STT || '').trim();
    if (!code) return;
    if (!stt) return;
    if (seenStt.has(stt)) return;
    seenStt.add(stt);
    if (data['Thực Đóng Cuối Cùng'] !== undefined && data['THỰC CÔNG NỢ CTY'] === undefined) data['THỰC CÔNG NỢ CTY'] = data['Thực Đóng Cuối Cùng'];
    delete data['Thực Đóng Cuối Cùng'];
    const registeredAtDate = parseSheetRegistrationDate(data['Ngày Đăng Ký']);
    if (registeredAtDate) data.registeredAtDate = registeredAtDate;
    const current = byStt.get(stt) || untrackedByCode.get(code);
    if (current) {
      operations.push({ updateOne: { filter: { _id: current._id }, update: { $set: data } } });
      updated += 1;
      byStt.set(stt, current);
      untrackedByCode.delete(code);
    } else {
      const newOrder = { ...data, _id: new mongoose.Types.ObjectId() };
      operations.push({ insertOne: { document: newOrder } });
      created += 1;
      byStt.set(stt, newOrder);
    }
  });

  if (operations.length) await collection.bulkWrite(operations, { ordered: false });
  const deleted = process.env.GOOGLE_SHEET_SYNC_ALLOW_DELETES === 'true'
    ? await deleteMongoRowsMissingFromSheet(existing, seenStt)
    : 0;
  return { created, updated, deleted };
}

async function syncSheetProductsToMongo(headers, rows) {
  const findHeader = names => names.find(name => headers.includes(name));
  const nccHeader = findHeader(['NCC']);
  const typeHeader = findHeader(['Loại Sản Phẩm', 'LOẠI SẢN PHẨM']);
  const formHeader = findHeader(['Hình Thức', 'HÌnh Thức']);
  const packageHeader = findHeader(['Gói ', 'Gói']);
  const priceHeader = findHeader(['Thành Tiền']);
  if (!nccHeader || !typeHeader || !formHeader || !packageHeader) return { created: 0, updated: 0, skipped: true };

  const existing = await SanPham.find({}).lean();
  const keyOf = product => [product.NCC, product['LOẠI SẢN PHẨM'], product['HÌnh Thức'], product['TÊN SẢN PHẨM']].map(value => String(value || '').trim().toLowerCase()).join('|');
  const byKey = new Map(existing.map(product => [keyOf(product), product]).filter(([key]) => key !== '|||'));
  const operations = [];
  let created = 0;
  let updated = 0;
  rows.forEach(row => {
    const ncc = String(row[headers.indexOf(nccHeader)] || '').trim();
    const type = String(row[headers.indexOf(typeHeader)] || '').trim();
    const form = String(row[headers.indexOf(formHeader)] || '').trim();
    const packageName = String(row[headers.indexOf(packageHeader)] || '').trim();
    if (!ncc || !type || !form || !packageName) return;
    const product = { NCC: ncc, 'LOẠI SẢN PHẨM': type, 'HÌnh Thức': form, 'TÊN SẢN PHẨM': packageName };
    if (priceHeader) product['GIÁ SAU THUẾ'] = row[headers.indexOf(priceHeader)] || '';
    const current = byKey.get(keyOf(product));
    if (current) {
      operations.push({ updateOne: { filter: { _id: current._id }, update: { $set: product } } });
      updated += 1;
    } else {
      const newProduct = { ...product, _id: new mongoose.Types.ObjectId() };
      operations.push({ insertOne: { document: newProduct } });
      byKey.set(keyOf(product), newProduct);
      created += 1;
    }
  });
  if (operations.length) await SanPham.collection.bulkWrite(operations, { ordered: false });
  return { created, updated };
}

async function syncOrderFinalCostsFromProducts() {
  const products = await SanPham.find({}).lean();
  const orders = await Order.find({}).lean();
  const normalize = value => String(value || '').trim().toLowerCase();
  const productKey = product => [product.NCC, product['LOẠI SẢN PHẨM'] || product['Loại Sản Phẩm'], product['HÌnh Thức'] || product['Hình Thức'], product['TÊN SẢN PHẨM'] || product['Tên Sản Phẩm']].map(normalize).join('|');
  const productByKey = new Map(products.map(product => [productKey(product), product]).filter(([key]) => !key.startsWith('|||')));
  const operations = [];
  orders.forEach(order => {
    const product = productByKey.get([order.NCC, order['Loại Sản Phẩm'] || order['LOẠI SẢN PHẨM'], order['Hình Thức'], order['Gói ']].map(normalize).join('|'));
    if (!product) return;
    const finalCost = product['THỰC CÔNG NỢ CTY'] ?? product['THỰC CÔNG NỢ CTY (VNĐ)'];
    if (finalCost === undefined || finalCost === null || finalCost === '') return;
    if (String(order['THỰC CÔNG NỢ CTY'] ?? '') === String(finalCost)) return;
    operations.push({ updateOne: { filter: { _id: order._id }, update: { $set: { 'THỰC CÔNG NỢ CTY': finalCost }, $unset: { 'Thực Đóng Cuối Cùng': '' } } } });
  });
  if (operations.length) await Order.collection.bulkWrite(operations, { ordered: false });
  return { updated: operations.length };
}

async function deleteMongoRowsMissingFromSheet(existing, seenCodes) {
  const ids = existing.filter(order => {
    const stt = String(order.STT || '').trim();
    return stt && !seenCodes.has(stt);
  }).map(order => order._id);
  if (!ids.length) return 0;
  const result = await Order.deleteMany({ _id: { $in: ids } });
  return result.deletedCount || 0;
}

async function pushMongoToSheet(sheets, headers, rows) {
  if (!headers.includes('Mã Đơn Hàng')) throw new Error(`Sheet ${SHEET_NAME} thiếu cột Mã Đơn Hàng.`);
  if (!headers.includes('STT')) throw new Error(`Sheet ${SHEET_NAME} thiếu cột STT.`);
  const orders = await Order.find({}).lean();
  const rowByStt = new Map(rows.map((row, index) => [sttOf(row, headers), index + 2]).filter(([stt]) => stt));
  const rowByCode = new Map(rows.map((row, index) => [codeOf(row, headers), index + 2]).filter(([code]) => code));
  const mongoCodes = new Set(orders.map(order => String(order['Mã Đơn Hàng'] || '').trim()).filter(Boolean));
  let updated = 0;
  let appended = 0;

  for (const order of orders) {
    const code = String(order['Mã Đơn Hàng'] || '').trim();
    if (!code) continue;
    const rowNumber = rowByStt.get(String(order.STT || '').trim()) || rowByCode.get(code);
    if (rowNumber) {
      const currentRow = rows[rowNumber - 2] || [];
      const nextRow = headers.map((header, index) => valueFor(order, header) ?? currentRow[index] ?? '');
      await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A${rowNumber}:${columnName(headers.length - 1)}${rowNumber}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [nextRow] } });
      updated += 1;
    } else {
      const newRow = headers.map(header => valueFor(order, header) ?? '');
      await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A:${columnName(headers.length - 1)}`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [newRow] } });
      appended += 1;
    }
  }
  return { updated, appended, deleted: 0, columnsAdded: 0, mongoCodes: mongoCodes.size };
}

async function pushOrderToSheetNow(orderId) {
  const { sheets, headers, rows } = await readSheet();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(title,gridProperties(rowCount)))' });
  const sheet = metadata.data.sheets?.find(item => item.properties?.title === SHEET_NAME) || metadata.data.sheets?.[0];
  const maxRows = sheet?.properties?.gridProperties?.rowCount || rows.length + 1;
  const order = await Order.collection.findOne({ _id: new mongoose.Types.ObjectId(orderId) });
  if (!order || !headers.includes('Mã Đơn Hàng')) return { skipped: true };
  if (!headers.includes('STT')) return { skipped: true };
  const code = String(order['Mã Đơn Hàng'] || '').trim();
  if (!code) return { skipped: true };
  const sttIndex = rows.findIndex(row => sttOf(row, headers) === String(order.STT || '').trim());
  const codeIndex = rows.findIndex(row => codeOf(row, headers) === code);
  const rowNumber = sttIndex >= 0 ? sttIndex + 2 : (codeIndex >= 0 ? codeIndex + 2 : null);
  const row = headers.map((header, index) => valueFor(order, header) ?? (rowNumber ? rows[rowNumber - 2]?.[index] || '' : ''));
  if (rowNumber) {
    await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A${rowNumber}:${columnName(headers.length - 1)}${rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [row] } });
    return { updated: 1, appended: 0 };
  }
  const lastDataIndex = rows.reduce((last, current, index) => current.some(value => String(value ?? '').trim()) ? index : last, -1);
  let newRowNumber = lastDataIndex + 3;
  if (newRowNumber > maxRows) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ insertDimension: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: maxRows, endIndex: maxRows + 1 }, inheritFromBefore: true } }] } });
    newRowNumber = maxRows + 1;
  }
  await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A${newRowNumber}:${columnName(headers.length - 1)}${newRowNumber}`, valueInputOption: 'RAW', requestBody: { values: [row] } });
  return { updated: 0, appended: 1 };
}

function pushOrderToSheet(orderId) {
  const task = orderPushQueue.then(() => pushOrderToSheetNow(orderId));
  orderPushQueue = task.catch(() => {});
  return task;
}

function columnName(index) {
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

async function syncBidirectional() {
  if (syncRunning) return { skipped: true };
  syncRunning = true;
  lastSync = { status: 'running', at: new Date(), error: null };
  try {
    const { sheets, headers, rows } = await readSheet();
    const pulled = await pullSheetToMongo(headers, rows);
    const products = await syncSheetProductsToMongo(headers, rows);
    const finalCosts = await syncOrderFinalCostsFromProducts();
    const pushed = await pushMongoToSheet(sheets, headers, rows);
    lastSync = { status: 'success', at: new Date(), pulled, products, finalCosts, pushed, mode: 'no-sheet-delete-no-new-column', error: null };
    return { pulled, products, finalCosts, pushed };
  } catch (error) {
    lastSync = { status: 'error', at: new Date(), error: error.message };
    throw error;
  } finally {
    syncRunning = false;
  }
}

function startGoogleSheetSync() {
  if (process.env.GOOGLE_SHEET_SYNC_ENABLED === 'false' || syncTimer) return;
  syncBidirectional().catch(error => console.error('Google Sheet sync error:', error.message));
  syncTimer = setInterval(() => syncBidirectional().catch(error => console.error('Google Sheet polling error:', error.message)), POLL_INTERVAL_MS);
}

function getSyncStatus() {
  return { ...lastSync, spreadsheetId: SPREADSHEET_ID, sheetName: SHEET_NAME, intervalMs: POLL_INTERVAL_MS, mode: 'no-sheet-delete-no-new-column' };
}

module.exports = { syncBidirectional, startGoogleSheetSync, getSyncStatus, pushOrderToSheet };
