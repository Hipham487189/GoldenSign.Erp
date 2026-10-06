const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Employee = require('../models/Employee');
const Customer = require('../models/Customer');
const EmployeePayment = require('../models/EmployeePayment');
const User = require('../models/User');
const OrderHistory = require('../models/OrderHistory');

const router = express.Router();
const ORDER_DATE = 'registeredAtDate';
const CUSTOMER_NAME = 'Tên Khách Hàng';
const EMPLOYEE_NAME = 'Nhân Viên Đăng Ký';
const ACTIVE_ORDER = { 'TÌNH TRẠNG': /kích hoạt/i };

function numberExpression(field) {
  return { $convert: { input: `$${field}`, to: 'double', onError: 0, onNull: 0 } };
}

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendRouteError(res, error, label) {
  if (!error.status || error.status >= 500) console.error(`${label}:`, error);
  return res.status(error.status || 500).json({ success: false, message: error.message || 'Không thể tải báo cáo công nợ.' });
}

function dateExpression(field) {
  const value = { $convert: { input: `$${field}`, to: 'string', onError: '', onNull: '' } };
  return {
    $switch: {
      branches: [
        {
          case: { $regexMatch: { input: value, regex: /^\d{1,2}\/\d{1,2}\/\d{4}$/ } },
          then: { $dateFromString: { dateString: value, format: '%d/%m/%Y', onError: null, onNull: null } }
        },
        {
          case: { $regexMatch: { input: value, regex: /^\d{4}-\d{1,2}-\d{1,2}$/ } },
          then: { $dateFromString: { dateString: value, format: '%Y-%m-%d', onError: null, onNull: null } }
        }
      ],
      default: { $convert: { input: `$${field}`, to: 'date', onError: null, onNull: null } }
    }
  };
}

function validYear(value) {
  if (value === undefined || value === null || String(value).trim() === '') return new Date().getUTCFullYear();
  const year = Number.parseInt(value, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || String(year) !== String(value).trim()) {
    throw requestError('Năm báo cáo không hợp lệ.');
  }
  return year;
}

function parseDate(value, endOfDay = false) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function reportOrderRange(query) {
  const fromDate = parseDate(query.fromDate);
  const toDate = parseDate(query.toDate, true);
  if (query.fromDate && !fromDate) throw requestError('Ngày bắt đầu không hợp lệ.');
  if (query.toDate && !toDate) throw requestError('Ngày kết thúc không hợp lệ.');
  if (fromDate && toDate && fromDate > toDate) throw requestError('Ngày bắt đầu phải trước ngày kết thúc.');
  if (fromDate || toDate) {
    const range = {};
    if (fromDate) range.$gte = fromDate;
    if (toDate) range.$lte = toDate;
    return { [ORDER_DATE]: range };
  }
  const year = validYear(query.year);
  return { [ORDER_DATE]: { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) } };
}

async function authorizeDebtAccess(req, res, next) {
  try {
    const user = await User.findById(req.auth?.userId).populate('roleId').populate('employeeId').lean();
    if (!user?.isActive || !user.roleId) return res.status(403).json({ success: false, message: 'Tài khoản không có quyền xem công nợ.' });

    const isAdmin = user.roleId.name === 'Admin' || req.auth?.isSuperAdmin;
    const hasDebtPermission = (user.roleId.permissions || []).includes('view_debts');
    const ownScope = user.roleId.dataScopes?.orders === 'own' || ['Nhân Viên', 'Chỉ Xem'].includes(user.roleId.name);
    const employeeName = String(user.employeeId?.name || '').trim();

    if (!isAdmin && !hasDebtPermission && !(ownScope && employeeName)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem báo cáo công nợ.' });
    }
    if (!isAdmin && ownScope && !employeeName) {
      return res.status(403).json({ success: false, message: 'Tài khoản chưa được liên kết với nhân viên.' });
    }

    req.debtAccess = {
      isAdmin,
      employeeName: !isAdmin && ownScope ? employeeName : '',
      employeeId: !isAdmin && ownScope ? String(user.employeeId._id) : ''
    };
    next();
  } catch (error) {
    console.error('Không thể kiểm tra quyền báo cáo công nợ:', error);
    res.status(500).json({ success: false, message: 'Không thể kiểm tra quyền truy cập công nợ.' });
  }
}

router.use(authorizeDebtAccess);

async function scopedEmployee(req, requested) {
  const value = String(requested || '').trim();
  if (req.debtAccess.employeeName) {
    if (value && value !== req.debtAccess.employeeName && value !== req.debtAccess.employeeId) {
      throw requestError('Nhân viên chỉ được xem công nợ của chính mình.', 403);
    }
    return req.debtAccess.employeeName;
  }
  if (!value) return '';
  if (/^[a-f\d]{24}$/i.test(value) && mongoose.isValidObjectId(value)) {
    const employee = await Employee.findById(value).select('name').lean();
    if (!employee) throw requestError('Không tìm thấy nhân viên được chọn.');
    return String(employee.name || '').trim();
  }
  return value;
}

function orderMatch(employeeName, customerName = '') {
  const match = { ...ACTIVE_ORDER };
  if (employeeName) match[EMPLOYEE_NAME] = employeeName;
  if (customerName) match[CUSTOMER_NAME] = customerName;
  return match;
}

async function resolveCustomerName(value) {
  const customerKey = String(value || '').trim();
  if (!customerKey) return '';
  if (!mongoose.isValidObjectId(customerKey)) return customerKey;
  const customer = await Customer.findOne({ _id: customerKey, isActive: { $ne: false } }).select('name').lean();
  if (!customer) throw requestError('Không tìm thấy khách hàng trong Quản lý khách hàng.');
  return String(customer.name || '').trim();
}

function customerDueExpression() {
  return { $max: [0, numberExpression('Thực Thu')] };
}

function orderMoneyFields() {
  return {
    dueValue: customerDueExpression(),
    paidValue: numberExpression('KH Thanh Toán'),
    paidAt: { $ifNull: [dateExpression('Ngày KH thanh toán'), `$${ORDER_DATE}`] }
  };
}

function pageParams(query) {
  return {
    page: Math.max(1, Number.parseInt(query.page, 10) || 1),
    limit: Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25))
  };
}

async function aggregateOrderSummary(match, range) {
  const fields = orderMoneyFields();
  const [result] = await Order.aggregate([
    { $match: { ...match, ...range } },
    { $addFields: fields },
    {
      $group: {
        _id: null,
        orderCount: { $sum: 1 },
        sales: { $sum: numberExpression('Thành Tiền') },
        debt: { $sum: '$dueValue' },
        paid: { $sum: '$paidValue' },
      }
    },
    { $addFields: { remaining: { $max: [0, { $subtract: ['$debt', '$paid'] }] } } }
  ]).option({ maxTimeMS: 20000 });
  return result || { orderCount: 0, sales: 0, debt: 0, paid: 0, remaining: 0 };
}

async function orderMonthlyData(match, year) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const fields = orderMoneyFields();
  const [result] = await Order.aggregate([
    { $match: { ...match, [ORDER_DATE]: { $lt: end } } },
    { $addFields: fields },
    {
      $facet: {
        newDebt: [
          { $match: { [ORDER_DATE]: { $gte: start, $lt: end } } },
          { $group: { _id: { $month: `$${ORDER_DATE}` }, amount: { $sum: '$dueValue' } } }
        ],
        monthlyPaid: [
          { $match: { paidAt: { $gte: start, $lt: end }, paidValue: { $gt: 0 } } },
          { $group: { _id: { $month: '$paidAt' }, amount: { $sum: '$paidValue' } } }
        ],
        openingDebt: [
          { $match: { [ORDER_DATE]: { $lt: start } } },
          { $group: { _id: null, amount: { $sum: '$dueValue' } } }
        ],
        openingPaid: [
          { $match: { [ORDER_DATE]: { $lt: start }, paidAt: { $lt: start }, paidValue: { $gt: 0 } } },
          { $group: { _id: null, amount: { $sum: '$paidValue' } } }
        ],
        missingPaymentDate: [
          { $match: {
            [ORDER_DATE]: { $gte: start, $lt: end },
            paidValue: { $gt: 0 },
            $expr: { $eq: [dateExpression('Ngày KH thanh toán'), null] }
          } },
          { $count: 'count' }
        ]
      }
    }
  ]).option({ maxTimeMS: 30000 });

  const monthAmounts = items => Object.fromEntries((items || []).map(item => [item._id, item.amount || 0]));
  const newDebt = monthAmounts(result?.newDebt);
  const monthlyPaid = monthAmounts(result?.monthlyPaid);
  const openingDebt = result?.openingDebt?.[0]?.amount || 0;
  const openingPaid = result?.openingPaid?.[0]?.amount || 0;
  const openingBalance = Math.max(0, openingDebt - openingPaid);
  let carry = openingBalance;
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const incurred = newDebt[month] || 0;
    const oldDebt = carry;
    const receivable = oldDebt + incurred;
    const paid = monthlyPaid[month] || 0;
    carry = Math.max(0, receivable - paid);
    return { month, incurred, oldDebt, receivable, paid, remaining: carry };
  });
  return {
    year,
    months,
    totals: months.reduce((total, month) => ({
      incurred: total.incurred + month.incurred,
      paid: total.paid + month.paid,
      remaining: month.remaining,
      receivable: total.receivable + month.incurred
    }), { incurred: 0, paid: 0, remaining: carry, receivable: openingBalance }),
    missingPaymentDateCount: result?.missingPaymentDate?.[0]?.count || 0
  };
}

function employeePaymentMatch(employeeName) {
  return employeeName ? { employee: employeeName } : {};
}

async function aggregateEmployeePayments(employeeName, start, end) {
  const parsedPaymentDate = dateExpression('paymentDate');
  const [result] = await EmployeePayment.aggregate([
    { $match: employeePaymentMatch(employeeName) },
    { $addFields: { paidAt: parsedPaymentDate } },
    ...(start || end ? [{ $match: { paidAt: { ...(start ? { $gte: start } : {}), ...(end ? { $lt: end } : {}) } } }] : []),
    { $group: { _id: null, paid: { $sum: numberExpression('amount') } } }
  ]).option({ maxTimeMS: 20000 });
  return result?.paid || 0;
}

async function employeeMonthlyPayments(employeeName, year) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const parsedPaymentDate = dateExpression('paymentDate');
  const monthly = await EmployeePayment.aggregate([
    { $match: employeePaymentMatch(employeeName) },
    { $addFields: { paidAt: parsedPaymentDate } },
    { $match: { paidAt: { $gte: start, $lt: end } } },
    { $group: { _id: { $month: '$paidAt' }, amount: { $sum: numberExpression('amount') } } }
  ]).option({ maxTimeMS: 20000 });
  return Object.fromEntries(monthly.map(item => [item._id, item.amount || 0]));
}

router.get('/khach-hang/options', async (req, res) => {
  try {
    const employeeName = await scopedEmployee(req, req.query.employeeId);
    const searchText = String(req.query.q || '').trim().slice(0, 80);
    const customerNameRegex = searchText ? new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const customerFilter = { isActive: { $ne: false } };
    if (customerNameRegex) {
      customerFilter.$or = [
        { name: customerNameRegex }, { code: customerNameRegex }, { company: customerNameRegex },
        { phone: customerNameRegex }, { mst: customerNameRegex }
      ];
    }
    const [employees, customers] = await Promise.all([
      !req.debtAccess.employeeName && !searchText
        ? Employee.find({ isActive: { $ne: false } }).select('name').sort({ name: 1 }).limit(500).lean()
        : Promise.resolve([]),
      Customer.aggregate([
        { $match: customerFilter },
        ...(employeeName ? [{
          $lookup: {
            from: 'GS-DONHANG',
            let: { managedCustomerName: '$name' },
            pipeline: [
              { $match: {
                'TÌNH TRẠNG': /kích hoạt/i,
                $expr: { $and: [
                  { $eq: [`$${CUSTOMER_NAME}`, '$$managedCustomerName'] },
                  { $eq: [`$${EMPLOYEE_NAME}`, employeeName] }
                ] }
              } },
              { $limit: 1 },
              { $project: { _id: 1 } }
            ],
            as: 'assignedOrders'
          }
        }, { $match: { 'assignedOrders.0': { $exists: true } } }] : []),
        { $sort: { name: 1 } },
        { $limit: 100 },
        { $project: { _id: 1, name: 1, company: 1, mst: 1, code: 1 } }
      ]).option({ maxTimeMS: 20000 })
    ]);
    res.json({ success: true, data: {
      employees: employees.map(item => ({ id: String(item._id), name: item.name })),
      customers: customers.map(item => ({ id: String(item._id), name: item.name, company: item.company, mst: item.mst, code: item.code }))
    } });
  } catch (error) {
    sendRouteError(res, error, 'Không thể tải bộ lọc công nợ khách hàng');
  }
});

router.get('/khach-hang/summary', async (req, res) => {
  try {
    const employeeName = await scopedEmployee(req, req.query.employeeId);
    const customerName = await resolveCustomerName(req.query.customerId);
    const range = reportOrderRange(req.query);
    const page = pageParams(req.query);
    const sortFields = { remaining: 'remaining', debt: 'debt', sales: 'sales', paid: 'paid', name: '_id' };
    const requestedSort = String(req.query.sort || 'remaining');
    const sortField = Object.prototype.hasOwnProperty.call(sortFields, requestedSort) ? sortFields[requestedSort] : 'remaining';
    const sortDirection = req.query.direction === 'asc' ? 1 : -1;
    const customerSort = { [sortField]: sortDirection };
    if (sortField !== '_id') customerSort._id = 1;
    const match = orderMatch(employeeName, customerName);
    const [summary, customerPage] = await Promise.all([
      aggregateOrderSummary(match, range),
      Order.aggregate([
        { $match: { ...match, ...range } },
        { $match: { [CUSTOMER_NAME]: { $type: 'string', $ne: '' } } },
        { $sort: { [ORDER_DATE]: -1, _id: -1 } },
        { $addFields: { dueValue: customerDueExpression(), paidValue: numberExpression('KH Thanh Toán') } },
        { $group: {
          _id: `$${CUSTOMER_NAME}`,
          employee: { $last: `$${EMPLOYEE_NAME}` },
          mst: { $last: '$MST' },
          orderCount: { $sum: 1 },
          sales: { $sum: numberExpression('Thành Tiền') },
          debt: { $sum: '$dueValue' },
          paid: { $sum: '$paidValue' },
        } },
        { $addFields: { remaining: { $max: [0, { $subtract: ['$debt', '$paid'] }] } } },
        { $sort: customerSort },
        { $facet: {
          items: [{ $skip: (page.page - 1) * page.limit }, { $limit: page.limit }, { $project: { _id: 0, name: '$_id', employee: 1, mst: 1, orderCount: 1, sales: 1, debt: 1, paid: 1, remaining: 1 } }],
          total: [{ $count: 'value' }]
        } }
      ]).option({ maxTimeMS: 20000 })
    ]);
    const customerResult = customerPage[0] || {};
    res.json({ success: true, data: {
      ...summary,
      customers: customerResult.items || [],
      page: page.page,
      limit: page.limit,
      totalCustomers: customerResult.total?.[0]?.value || 0,
      totalPages: Math.max(1, Math.ceil((customerResult.total?.[0]?.value || 0) / page.limit))
    } });
  } catch (error) {
    sendRouteError(res, error, 'Không thể tổng hợp công nợ khách hàng');
  }
});

router.get('/khach-hang/monthly', async (req, res) => {
  try {
    const employeeName = await scopedEmployee(req, req.query.employeeId);
    const customerName = await resolveCustomerName(req.query.customerId);
    const year = validYear(req.query.year);
    const data = await orderMonthlyData(orderMatch(employeeName, customerName), year);
    res.json({ success: true, data });
  } catch (error) {
    sendRouteError(res, error, 'Không thể tổng hợp công nợ khách hàng theo tháng');
  }
});

router.get('/khach-hang/detail', async (req, res) => {
  try {
    const employeeName = await scopedEmployee(req, req.query.employeeId);
    const customerName = await resolveCustomerName(req.query.customerId);
    if (!customerName) return res.status(400).json({ success: false, message: 'Vui lòng chọn khách hàng.' });
    const range = reportOrderRange(req.query);
    const { page, limit } = pageParams(req.query);
    const match = orderMatch(employeeName, customerName);
    const [summary, total, orders] = await Promise.all([
      aggregateOrderSummary(match, range),
      Order.countDocuments({ ...match, ...range }).maxTimeMS(15000),
      Order.find({ ...match, ...range }).select({
        'Mã Đơn Hàng': 1, registeredAtDate: 1, 'Ngày Đăng Ký': 1, 'Gói ': 1, 'Loại Sản Phẩm': 1,
        'Thành Tiền': 1, 'Thực Thu': 1, 'KH Thanh Toán': 1, 'TÌNH TRẠNG': 1,
        MST: 1, 'Nhân Viên Đăng Ký': 1, 'Tên Khách Hàng': 1
      }).sort({ [ORDER_DATE]: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean()
    ]);
    const orderIds = orders.map(order => order._id);
    const histories = orderIds.length ? await OrderHistory.find({
      orderId: { $in: orderIds },
      'changes.field': { $in: ['KH Thanh Toán', 'Ngày KH thanh toán'] }
    }).select('orderId changedAt changedBy changes').sort({ changedAt: -1 }).limit(500).lean() : [];
    const paymentHistoryByOrder = new Map();
    histories.forEach(history => {
      const entries = history.changes.filter(change => ['KH Thanh Toán', 'Ngày KH thanh toán'].includes(change.field))
        .map(change => ({ date: history.changedAt, by: history.changedBy, field: change.field, from: change.from, to: change.to }));
      const key = String(history.orderId);
      paymentHistoryByOrder.set(key, [...(paymentHistoryByOrder.get(key) || []), ...entries]);
    });
    const result = orders.map(order => {
      const due = Math.max(0, Number(order['Thực Thu']) || 0);
      const paid = Math.max(0, Number(order['KH Thanh Toán']) || 0);
      return {
        id: order._id,
        orderCode: order['Mã Đơn Hàng'] || '',
        date: order['Ngày Đăng Ký'] || order[ORDER_DATE] || null,
        product: order['Gói '] || order['Loại Sản Phẩm'] || '',
        sales: Number(order['Thành Tiền']) || 0,
        customerPrice: due,
        paid,
        remaining: Math.max(0, due - paid),
        status: order['TÌNH TRẠNG'] || '',
        mst: order.MST || '',
        employee: order[EMPLOYEE_NAME] || '',
        paymentHistory: paymentHistoryByOrder.get(String(order._id)) || []
      };
    });
    res.json({ success: true, data: {
      customer: { name: customerName, mst: result.find(order => order.mst)?.mst || '', employee: result.find(order => order.employee)?.employee || '' },
      summary,
      orders: result,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    } });
  } catch (error) {
    sendRouteError(res, error, 'Không thể tải chi tiết công nợ khách hàng');
  }
});

router.get('/nhan-vien/options', async (req, res) => {
  try {
    const employeeName = await scopedEmployee(req, req.query.employeeId);
    const employeeRecords = employeeName
      ? [{ _id: req.debtAccess.employeeId, name: employeeName }]
      : await Employee.find({ isActive: { $ne: false } }).select('name').sort({ name: 1 }).limit(500).lean();
    const employees = employeeRecords.map(item => ({ id: String(item._id), name: item.name }));
    res.json({ success: true, data: { employees } });
  } catch (error) {
    sendRouteError(res, error, 'Không thể tải bộ lọc công nợ nhân viên');
  }
});

require('./employee-settlement')(router, { Order, EmployeePayment, scopedEmployee, requestError, sendRouteError, dateExpression, validYear, pageParams, ORDER_DATE, EMPLOYEE_NAME, ACTIVE_ORDER });

module.exports = router;
