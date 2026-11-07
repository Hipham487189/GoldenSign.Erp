const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { daBatTinhNang } = require('../services/tinhNangDonNhieuSanPham');

assert.equal(daBatTinhNang(undefined), true);
assert.equal(daBatTinhNang('true'), true);
for (const giaTri of ['false', '', 'TRUE', 'khong-hop-le']) assert.equal(daBatTinhNang(giaTri), false);

const thuMuc = path.join(__dirname, '..');
const cauHinh = fs.readFileSync(path.join(thuMuc, 'render.yaml'), 'utf8');
const mayChu = fs.readFileSync(path.join(thuMuc, 'server.js'), 'utf8');
const baoCao = fs.readFileSync(path.join(thuMuc, 'routes', 'customer-debts.js'), 'utf8');
for (const ten of ['DON_NHIEU_SAN_PHAM_ENABLED', 'TAO_DON_NHIEU_SAN_PHAM_ENABLED', 'UNC_NHIEU_SAN_PHAM_ENABLED']) {
  assert.match(cauHinh, new RegExp(`key: ${ten}\\s+value: "true"`));
  assert.ok(mayChu.includes(`daBatTinhNang(process.env.${ten})`));
}
assert.ok(baoCao.includes('daBatTinhNang(process.env.DON_NHIEU_SAN_PHAM_ENABLED)'));
assert.ok(mayChu.indexOf("require('dotenv').config()") < mayChu.indexOf("require('./routes/customer-debts')"));
console.log('Đạt: bật mặc định, cho phép tắt bằng cấu hình và đồng nhất báo cáo khách.');
