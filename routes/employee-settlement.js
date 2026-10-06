const EmployeePayable = require('../models/EmployeePayable');
const EmployeeOpeningAdjustment = require('../models/EmployeeOpeningAdjustment');

const UNC_APPROVED = 'Đã Duyệt';
const PAYABLE_FIELDS = ['salary', 'advance', 'dossierFee', 'otherFee', 'deliveryFee'];
const MAX_AMOUNT = 1e12;

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round = value => Math.round(Number(value) || 0);

module.exports = function registerEmployeeSettlement(router, h) {
  const { Order, EmployeePayment, scopedEmployee, requestError, sendRouteError, dateExpression, validYear, pageParams, ORDER_DATE, EMPLOYEE_NAME, ACTIVE_ORDER } = h;

  const money = field => ({ $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: [`$${field}`, ''] } }, find: ',', replacement: '' } }, to: 'double', onError: 0, onNull: 0 } });
  const nameCondition = name => ({ $regex: `^${escapeRegex(name)}$`, $options: 'i' });
  const orderBase = name => ({ ...ACTIVE_ORDER, ...(name ? { [EMPLOYEE_NAME]: nameCondition(name) } : {}) });
  const paymentBase = name => (name ? { employee: nameCondition(name) } : {});
  const uncPaidAt = { $ifNull: [dateExpression('Ngày Thanh Toán UNC'), { $ifNull: [dateExpression('Ngày Upload UNC'), `$${ORDER_DATE}`] }] };
  const costExpression = money('Thực Đóng Công Ty');

  function validMonth(value, year) {
    if (value === undefined || value === null || String(value).trim() === '') {
      const now = new Date();
      return year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 12;
    }
    const month = Number.parseInt(value, 10);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw requestError('Tháng báo cáo không hợp lệ.');
    return month;
  }

  const monthRange = (year, month) => ({ start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) });
  const byKey = rows => Object.fromEntries(rows.map(row => [`${row._id.y}-${row._id.m}`, row]));
  const statusOf = net => (net > 0 ? 'Công ty còn phải trả nhân viên' : net < 0 ? 'Nhân viên còn phải nộp công ty' : 'Đã đối soát đủ');

  async function loadSeries(name, year) {
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const group = dateField => ({ _id: { y: { $year: dateField }, m: { $month: dateField } } });
    const [incurredRows, uncRows, directRows, payableRows, adjustmentRows] = await Promise.all([
      Order.aggregate([
        { $match: { ...orderBase(name), [ORDER_DATE]: { $lt: end } } },
        { $group: { ...group(`$${ORDER_DATE}`), amount: { $sum: costExpression }, count: { $sum: 1 } } }
      ]).option({ maxTimeMS: 20000 }),
      Order.aggregate([
        { $match: { ...orderBase(name), 'Trạng Thái UNC': UNC_APPROVED } },
        { $addFields: { uncAmount: money('Số Tiền UNC'), paidAt: uncPaidAt } },
        { $match: { uncAmount: { $gt: 0 }, paidAt: { $lt: end } } },
        { $group: { ...group('$paidAt'), amount: { $sum: '$uncAmount' } } }
      ]).option({ maxTimeMS: 20000 }),
      EmployeePayment.aggregate([
        { $match: paymentBase(name) },
        { $addFields: { paidAt: dateExpression('paymentDate') } },
        { $match: { paidAt: { $lt: end } } },
        { $group: { ...group('$paidAt'), amount: { $sum: money('amount') } } }
      ]).option({ maxTimeMS: 20000 }),
      EmployeePayable.find({ year, ...(name ? { employeeKey: name.toUpperCase() } : {}) }).lean(),
      EmployeeOpeningAdjustment.find({ year: { $lte: year }, ...(name ? { employeeKey: name.toUpperCase() } : {}) }).lean()
    ]);
    const adjustments = {};
    adjustmentRows.forEach(item => {
      const key = `${item.year}-${item.month}`;
      adjustments[key] = (adjustments[key] || 0) + item.delta;
    });
    const incurred = byKey(incurredRows);
    const unc = byKey(uncRows);
    const direct = byKey(directRows);
    const payables = {};
    payableRows.forEach(item => {
      const sum = payables[item.month] || (payables[item.month] = { salary: 0, advance: 0, dossierFee: 0, otherFee: 0, deliveryFee: 0 });
      PAYABLE_FIELDS.forEach(field => { sum[field] += Number(item[field]) || 0; });
    });

    const keys = [...Object.keys(incurred), ...Object.keys(unc), ...Object.keys(direct)].map(key => key.split('-').map(Number));
    let [cursorYear, cursorMonth] = keys.length ? keys.reduce((min, key) => (key[0] < min[0] || (key[0] === min[0] && key[1] < min[1]) ? key : min)) : [year, 1];
    if (cursorYear > year) [cursorYear, cursorMonth] = [year, 1];

    let opening = 0;
    const months = [];
    while (cursorYear < year || (cursorYear === year && cursorMonth <= 12)) {
      const key = `${cursorYear}-${cursorMonth}`;
      const baseOpening = opening;
      const adjustment = adjustments[key] || 0;
      opening = Math.max(0, opening + adjustment);
      const incurredAmount = round(incurred[key]?.amount);
      const uncPaid = round(unc[key]?.amount);
      const directPaid = round(direct[key]?.amount);
      const paid = uncPaid + directPaid;
      const totalDue = opening + incurredAmount;
      const remaining = Math.max(0, totalDue - paid);
      if (cursorYear === year) {
        const fees = payables[cursorMonth] || { salary: 0, advance: 0, dossierFee: 0, otherFee: 0, deliveryFee: 0 };
        const payable = round(fees.salary + fees.dossierFee + fees.otherFee + fees.deliveryFee - fees.advance);
        const net = payable - remaining;
        months.push({
          month: cursorMonth, opening, baseOpening, adjustment, incurred: incurredAmount, orderCount: incurred[key]?.count || 0, totalDue,
          uncPaid, directPaid, paid, remaining, overpay: Math.max(0, paid - totalDue),
          salary: round(fees.salary), advance: round(fees.advance), dossierFee: round(fees.dossierFee), otherFee: round(fees.otherFee), deliveryFee: round(fees.deliveryFee),
          payable, net, status: statusOf(net)
        });
      }
      opening = remaining;
      cursorMonth += 1;
      if (cursorMonth > 12) { cursorMonth = 1; cursorYear += 1; }
    }
    return months;
  }

  const monthlyView = row => ({ month: row.month, opening: row.opening, adjustment: row.adjustment, incurred: row.incurred, totalDue: row.totalDue, paid: row.paid, uncPaid: row.uncPaid, directPaid: row.directPaid, remaining: row.remaining, overpay: row.overpay });

  router.get('/nhan-vien/summary', async (req, res) => {
    try {
      const name = await scopedEmployee(req, req.query.employeeId);
      const year = validYear(req.query.year);
      const month = validMonth(req.query.month, year);
      const months = await loadSeries(name, year);
      res.json({ success: true, data: { employee: name, year, month, summary: months[month - 1] } });
    } catch (error) {
      sendRouteError(res, error, 'Không thể tổng hợp công nợ nhân viên');
    }
  });

  router.get('/nhan-vien/monthly', async (req, res) => {
    try {
      const name = await scopedEmployee(req, req.query.employeeId);
      const year = validYear(req.query.year);
      const months = await loadSeries(name, year);
      res.json({ success: true, data: { employee: name, year, months: months.map(monthlyView) } });
    } catch (error) {
      sendRouteError(res, error, 'Không thể tổng hợp công nợ nhân viên theo tháng');
    }
  });

  router.get('/nhan-vien/settlement', async (req, res) => {
    try {
      const name = await scopedEmployee(req, req.query.employeeId);
      const year = validYear(req.query.year);
      const month = validMonth(req.query.month, year);
      const months = await loadSeries(name, year);
      res.json({ success: true, data: { employee: name, year, month, canEdit: Boolean(req.debtAccess.isAdmin && name), months, summary: months[month - 1] } });
    } catch (error) {
      sendRouteError(res, error, 'Không thể đối soát công nợ nhân viên');
    }
  });

  router.get('/nhan-vien/orders', async (req, res) => {
    try {
      const name = await scopedEmployee(req, req.query.employeeId);
      const year = validYear(req.query.year);
      const month = validMonth(req.query.month, year);
      const { page, limit } = pageParams(req.query);
      const ncc = String(req.query.ncc || '').trim();
      const { start, end } = monthRange(year, month);
      const nccMatch = ncc ? [{ $match: { NCC: ncc } }] : [];
      const [result] = await Order.aggregate([
        { $match: { ...orderBase(name), [ORDER_DATE]: { $gte: start, $lt: end } } },
        { $addFields: { cost: costExpression } },
        { $facet: {
          suppliers: [{ $group: { _id: '$NCC', cost: { $sum: '$cost' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          totals: [...nccMatch, { $group: { _id: null, cost: { $sum: '$cost' }, count: { $sum: 1 } } }],
          items: [
            ...nccMatch,
            { $sort: { [ORDER_DATE]: 1, 'Mã Đơn Hàng': 1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
            { $addFields: { uncPaid: { $cond: [{ $eq: ['$Trạng Thái UNC', UNC_APPROVED] }, money('Số Tiền UNC'), 0] } } },
            { $project: { _id: 1, code: '$Mã Đơn Hàng', date: '$Ngày Đăng Ký', company: '$Tên Công Ty ', mst: '$MST', pack: '$Gói ', ncc: '$NCC', employee: `$${EMPLOYEE_NAME}`, cost: 1, uncPaid: 1, remaining: { $max: [0, { $subtract: ['$cost', '$uncPaid'] }] } } }
          ]
        } }
      ]).option({ maxTimeMS: 20000 });
      const total = result?.totals?.[0]?.count || 0;
      res.json({ success: true, data: {
        year, month, items: result?.items || [], page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
        totalCost: round(result?.totals?.[0]?.cost),
        suppliers: (result?.suppliers || []).map(item => ({ ncc: item._id || '', count: item.count, cost: round(item.cost) }))
      } });
    } catch (error) {
      sendRouteError(res, error, 'Không thể tải chi tiết công nợ phát sinh');
    }
  });

  router.get('/nhan-vien/payments', async (req, res) => {
    try {
      const name = await scopedEmployee(req, req.query.employeeId);
      const year = validYear(req.query.year);
      const month = req.query.month ? validMonth(req.query.month, year) : 0;
      const { page, limit } = pageParams(req.query);
      const range = month ? monthRange(year, month) : { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
      const [directResult, uncItems] = await Promise.all([
        EmployeePayment.aggregate([
          { $match: paymentBase(name) },
          { $addFields: { parsedPaymentDate: dateExpression('paymentDate') } },
          { $match: { parsedPaymentDate: { $gte: range.start, $lt: range.end } } },
          { $sort: { parsedPaymentDate: -1, createdAt: -1 } },
          { $facet: {
            items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 1, employee: 1, amount: 1, paymentDate: 1, paymentMethod: 1, note: 1, enteredBy: 1, createdBy: 1 } }],
            totals: [{ $group: { _id: null, count: { $sum: 1 }, amount: { $sum: money('amount') } } }]
          } }
        ]).option({ maxTimeMS: 20000 }),
        Order.aggregate([
          { $match: { ...orderBase(name), 'Trạng Thái UNC': UNC_APPROVED } },
          { $addFields: { uncAmount: money('Số Tiền UNC'), paidAt: uncPaidAt } },
          { $match: { uncAmount: { $gt: 0 }, paidAt: { $gte: range.start, $lt: range.end } } },
          { $sort: { paidAt: -1 } }, { $limit: 500 },
          { $project: { _id: 1, code: '$Mã Đơn Hàng', date: '$paidAt', amount: '$uncAmount', ncc: '$NCC', employee: `$${EMPLOYEE_NAME}`, fileName: '$Tên File UNC', content: '$Nội Dung UNC', status: '$Trạng Thái UNC' } }
        ]).option({ maxTimeMS: 20000 })
      ]);
      const total = directResult[0]?.totals?.[0]?.count || 0;
      res.json({ success: true, data: {
        items: directResult[0]?.items || [], page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
        directTotal: round(directResult[0]?.totals?.[0]?.amount),
        unc: uncItems, uncTotal: round(uncItems.reduce((sum, item) => sum + item.amount, 0))
      } });
    } catch (error) {
      sendRouteError(res, error, 'Không thể tải chi tiết thanh toán nhân viên');
    }
  });

  async function adminEmployee(req) {
    if (!req.debtAccess.isAdmin) throw requestError('Chỉ Admin được thay đổi các khoản công ty phải trả nhân viên.', 403);
    const name = await scopedEmployee(req, req.body?.employeeId ?? req.query.employeeId);
    if (!name) throw requestError('Vui lòng chọn một nhân viên cụ thể.');
    return name;
  }

  router.put('/nhan-vien/khoan-phai-tra', async (req, res) => {
    try {
      const name = await adminEmployee(req);
      const year = validYear(req.body.year);
      const month = validMonth(req.body.month, year);
      const values = {};
      for (const field of PAYABLE_FIELDS) {
        const value = Number(req.body[field] ?? 0);
        if (!Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) throw requestError('Số tiền các khoản phải trả phải là số không âm hợp lệ.');
        values[field] = Math.round(value);
      }
      const saved = await EmployeePayable.findOneAndUpdate(
        { employeeKey: name.toUpperCase(), year, month },
        { $set: { ...values, employee: name, updatedBy: req.auth?.username || 'Hệ thống' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      res.json({ success: true, data: saved });
    } catch (error) {
      sendRouteError(res, error, 'Không thể lưu khoản công ty phải trả nhân viên');
    }
  });

  router.put('/nhan-vien/no-dau-ky', async (req, res) => {
    try {
      const name = await adminEmployee(req);
      const year = validYear(req.body.year);
      const month = validMonth(req.body.month, year);
      const target = Number(req.body.target);
      if (!Number.isFinite(target) || target < 0 || target > MAX_AMOUNT) throw requestError('Nợ đầu kỳ phải là số không âm hợp lệ.');
      const months = await loadSeries(name, year);
      const delta = Math.round(target) - months[month - 1].baseOpening;
      const filter = { employeeKey: name.toUpperCase(), year, month };
      if (delta === 0) {
        await EmployeeOpeningAdjustment.deleteOne(filter);
        return res.json({ success: true, data: null });
      }
      const saved = await EmployeeOpeningAdjustment.findOneAndUpdate(
        filter,
        { $set: { employee: name, target: Math.round(target), delta, note: String(req.body.note || '').trim().slice(0, 300), updatedBy: req.auth?.username || 'Hệ thống' } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      ).lean();
      res.json({ success: true, data: saved });
    } catch (error) {
      sendRouteError(res, error, 'Không thể điều chỉnh nợ đầu kỳ');
    }
  });

  router.delete('/nhan-vien/no-dau-ky', async (req, res) => {
    try {
      const name = await adminEmployee(req);
      const year = validYear(req.query.year);
      const month = validMonth(req.query.month, year);
      const result = await EmployeeOpeningAdjustment.deleteOne({ employeeKey: name.toUpperCase(), year, month });
      res.json({ success: true, deleted: result.deletedCount });
    } catch (error) {
      sendRouteError(res, error, 'Không thể xóa điều chỉnh nợ đầu kỳ');
    }
  });

  router.delete('/nhan-vien/khoan-phai-tra', async (req, res) => {
    try {
      const name = await adminEmployee(req);
      const year = validYear(req.query.year);
      const month = validMonth(req.query.month, year);
      const result = await EmployeePayable.deleteOne({ employeeKey: name.toUpperCase(), year, month });
      res.json({ success: true, deleted: result.deletedCount });
    } catch (error) {
      sendRouteError(res, error, 'Không thể xóa khoản công ty phải trả nhân viên');
    }
  });
};
