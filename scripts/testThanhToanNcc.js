const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { taoBoLocThanhToanNcc } = require('../services/locThanhToanNcc');

async function kiemTra() {
  assert.deepEqual(taoBoLocThanhToanNcc({ year: '2024', month: '2', fromDate: '2024-02-05', toDate: '2024-02-29' }), {
    $and: [
      { paymentDate: { $gte: '2024-02-01', $lt: '2024-03-01' } },
      { paymentDate: { $gte: '2024-02-05', $lte: '2024-02-29' } }
    ]
  });
  assert.deepEqual(taoBoLocThanhToanNcc({ year: '2026', month: '12' }), {
    $and: [{ paymentDate: { $gte: '2026-12-01', $lt: '2027-01-01' } }]
  });
  assert.deepEqual(taoBoLocThanhToanNcc({ year: '2026', month: 'ALL' }), {
    $and: [{ paymentDate: { $gte: '2026-01-01', $lt: '2027-01-01' } }]
  });
  assert.deepEqual(taoBoLocThanhToanNcc({ year: 'ALL', month: '3' }), {
    $and: [{ $expr: { $eq: [{ $substrCP: [{ $convert: { input: '$paymentDate', to: 'string', onError: '', onNull: '' } }, 5, 2] }, '03'] } }]
  });
  assert.deepEqual(taoBoLocThanhToanNcc({ year: 'ALL', month: 'ALL' }), {});
  assert.throws(() => taoBoLocThanhToanNcc({ month: '13' }), /Tháng/);
  assert.throws(() => taoBoLocThanhToanNcc({ fromDate: '2026-02-30' }), /Ngày bắt đầu/);
  assert.throws(() => taoBoLocThanhToanNcc({ fromDate: '2026-02-02', toDate: '2026-02-01' }), /trước ngày/);

  const server = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
  const route = server.match(/app\.get\('\/api\/orders\/ncc-debts',[\s\S]*?\n\}\);\r?\n\r?\napp\.patch\('\/api\/orders\/ncc-debts\/adjustments'/);
  assert.ok(route, 'Không tìm thấy route tổng hợp công nợ NCC.');
  let handler;
  let pipelineThanhToan;
  let boLocDon;
  const context = {
    app: { get: (url, permission, callback) => { handler = callback; } },
    requirePermission: () => () => {},
    hoTroNhieuSanPham: false,
    getAccessUser: async () => ({ isActive: true }),
    buildOrderFilter: query => { boLocDon = query; return {}; },
    escapeRegex: value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    taoBoLocThanhToanNcc,
    orderMoneyExpression: () => 0,
    getNccDebtPeriodKey: () => 'ky',
    DonHang: { aggregate: () => ({ option: async () => [{ ncc: 'NCC', cost: 1000000, tokenHold: 200000 }] }) },
    SupplierPayment: { aggregate: pipeline => {
      pipelineThanhToan = pipeline;
      return { option: async () => [{ _id: 'NCC', paid: 300000 }] };
    } },
    SupplierDebtAdjustment: { find: () => ({ lean: async () => [{ supplier: 'NCC', dossierFee: 100000, dsQui: 50000 }] }) },
    console
  };
  vm.runInNewContext(route[0].replace(/\r?\n\r?\napp\.patch\('\/api\/orders\/ncc-debts\/adjustments'$/, ''), context);
  let body;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(value) { body = value; return this; }
  };
  await handler({ query: { year: '2024', month: '2', fromDate: '2024-02-05', q: 'NCC' } }, res);
  assert.equal(body.success, true);
  assert.equal(body.data.rows[0].paid, 300000);
  assert.equal(body.data.rows[0].remaining, 350000);
  assert.equal(pipelineThanhToan[0].$match.supplier.$in[0], 'NCC');
  assert.equal(pipelineThanhToan[0].$match.$and[1].paymentDate.$gte, '2024-02-05');
  assert.equal(boLocDon.q, '');
  await handler({ query: { month: '13' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(body.success, false);
  console.log('Đạt: lọc phiếu theo giao thời gian, tổng hợp NCC và từ chối ngày không hợp lệ.');
}

kiemTra().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
