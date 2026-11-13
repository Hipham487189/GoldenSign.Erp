const EmployeePayable = require('../models/EmployeePayable');
const EmployeeOpeningAdjustment = require('../models/EmployeeOpeningAdjustment');
const ThietLapLuongNhanVien = require('../models/ThietLapLuongNhanVien');
const ExpenseRate = require('../models/ExpenseRate');
const { dongDaKichHoat, tongHopDongKichHoat } = require('../services/tongHopChiTietDonHang');
const { ghiSauCapNhat } = require('../services/nhatKyCongCu');

const UNC_APPROVED = 'Đã Duyệt';
const PAYABLE_FIELDS = ['salary', 'advance', 'dossierFee', 'otherFee', 'deliveryFee'];
const MAX_AMOUNT = 1e12;
const CAC_TEN_PHI_HS_ONE_KEY = ['phí tạm giữ hs one', 'phí tạm giũ hs one'];
const GIOI_HAN_MUC_PHI_HS_ONE = 100;

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round = value => Math.round(Number(value) || 0);

module.exports = function registerEmployeeSettlement(router, h) {
  const { Order, EmployeePayment, scopedEmployee, requestError, sendRouteError, dateExpression, validYear, pageParams, ORDER_DATE, EMPLOYEE_NAME, ACTIVE_ORDER, hoTroNhieuSanPham, dieuKienDonKhach } = h;

  const money = field => ({ $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: [`$${field}`, ''] } }, find: ',', replacement: '' } }, to: 'double', onError: 0, onNull: 0 } });
  const nameCondition = name => ({ $regex: `^${escapeRegex(name)}$`, $options: 'i' });
  const kyThanhToanNhanVien = {
    $cond: [
      { $ne: [{ $ifNull: ['$paymentPeriod', ''] }, ''] },
      '$paymentPeriod',
      { $substrBytes: [{ $convert: { input: '$paymentDate', to: 'string', onError: '', onNull: '' } }, 0, 7] }
    ]
  };
  const ngayTheoKyThanhToan = {
    $dateFromString: { dateString: { $concat: ['$kyThanhToan', '-01'] }, format: '%Y-%m-%d', onError: null, onNull: null }
  };
  const orderBase = name => ({ ...(hoTroNhieuSanPham ? dieuKienDonKhach() : ACTIVE_ORDER), ...(name ? { [EMPLOYEE_NAME]: nameCondition(name) } : {}) });
  const paymentBase = name => (name ? { employee: nameCondition(name) } : {});
  const uncPaidAt = { $ifNull: [dateExpression('Ngày Thanh Toán UNC'), { $ifNull: [dateExpression('Ngày Upload UNC'), `$${ORDER_DATE}`] }] };
  const uncCu = {
    $cond: [{ $eq: ['$Trạng Thái UNC', UNC_APPROVED] },
      [{ amount: money('Số Tiền UNC'), date: uncPaidAt, fileName: '$Tên File UNC', content: '$Nội Dung UNC', status: '$Trạng Thái UNC' }],
      []]
  };
  const phieuDaDuyet = {
    $filter: {
      input: { $cond: [{ $isArray: '$phieuUnc' }, '$phieuUnc', []] },
      as: 'phieu', cond: { $eq: ['$$phieu.trangThai', UNC_APPROVED] }
    }
  };
  const uncMoi = {
    $map: { input: phieuDaDuyet, as: 'phieu', in: {
      amount: '$$phieu.soTien',
      date: { $dateFromString: { dateString: '$$phieu.ngay', format: '%Y-%m-%d', onError: null, onNull: null } },
      fileName: '$$phieu.tep.ten', content: '$$phieu.ghiChu', status: '$$phieu.trangThai',
      maPhieu: '$$phieu.maPhieu'
    } }
  };
  const cacPhieuUnc = hoTroNhieuSanPham ? { $concatArrays: [uncCu, uncMoi] } : uncCu;
  const tongUncDon = {
    $reduce: { input: cacPhieuUnc, initialValue: 0, in: { $add: ['$$value', '$$this.amount'] } }
  };
  const cacBuocUnc = hoTroNhieuSanPham ? [
    { $project: {
      phieu: cacPhieuUnc, 'Mã Đơn Hàng': 1, NCC: 1, [EMPLOYEE_NAME]: 1,
      laNhieuSanPham: { $isArray: '$chiTietSanPham' }
    } },
    { $unwind: '$phieu' },
    { $addFields: { uncAmount: '$phieu.amount', paidAt: '$phieu.date' } }
  ] : [{ $addFields: { uncAmount: money('Số Tiền UNC'), paidAt: uncPaidAt } }];
  const dieuKienUnc = name => hoTroNhieuSanPham
    ? orderBase(name) : { ...orderBase(name), 'Trạng Thái UNC': UNC_APPROVED };
  const costExpression = hoTroNhieuSanPham
    ? { $cond: [{ $isArray: '$chiTietSanPham' }, tongHopDongKichHoat().thucDongCongTy, money('Thực Đóng Công Ty')] }
    : money('Thực Đóng Công Ty');
  const khoaNcc = field => ({
    $replaceAll: {
      input: { $toUpper: { $trim: { input: { $convert: { input: { $ifNull: [field, ''] }, to: 'string', onError: '', onNull: '' } } } } },
      find: ' ', replacement: ''
    }
  });
  const loaiDangKyCu = { $ifNull: ['$Hình Thức', { $ifNull: ['$HÌnh Thức', { $ifNull: ['$Hình Thức ', '$HÌnh Thức '] }] }] };
  const cacDangKyNcc = hoTroNhieuSanPham
    ? { $cond: [
      { $isArray: '$chiTietSanPham' },
      { $map: { input: dongDaKichHoat(), as: 'dong', in: {
        ncc: '$$dong.ncc',
        soLuong: '$$dong.soLuong',
        hinhThuc: { $ifNull: ['$$dong.hinhThuc', loaiDangKyCu] }
      } } },
      [{ ncc: '$NCC', soLuong: 1, hinhThuc: loaiDangKyCu }]
    ] }
    : [{ ncc: '$NCC', soLuong: 1, hinhThuc: loaiDangKyCu }];
  const pipelineDangKyNccOne = (name, start, end) => [
    { $match: { ...orderBase(name), [ORDER_DATE]: { $lt: end } } },
    { $addFields: { cacDangKyNcc: cacDangKyNcc, ngayDangKy: dateExpression(ORDER_DATE) } },
    { $unwind: '$cacDangKyNcc' },
    { $addFields: {
      khoaNccDangKy: khoaNcc('$cacDangKyNcc.ncc'),
      loaiDangKy: { $convert: { input: { $ifNull: ['$cacDangKyNcc.hinhThuc', ''] }, to: 'string', onError: '', onNull: '' } }
    } },
    { $match: {
      khoaNccDangKy: 'ONE-CA',
      loaiDangKy: { $regex: '(đăng ký mới|dang ky moi|gia hạn|gia han)', $options: 'i' },
      ngayDangKy: { $gte: start, $lt: end }
    } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$ngayDangKy' } },
      soLuong: { $sum: { $convert: { input: '$cacDangKyNcc.soLuong', to: 'double', onError: 1, onNull: 1 } } }
    } }
  ];

  const tongChiPhi = input => ({
    $reduce: { input, initialValue: 0, in: { $add: ['$$value', { $multiply: ['$$this.giaDongCongTy', '$$this.soLuong'] }] } }
  });
  const noiChuoi = input => ({
    $reduce: { input, initialValue: '', in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ', '] }, '$$this'] } }
  });

  function chiTietNhieuSanPham(ncc, page, limit) {
    const locDong = ncc ? { $filter: { input: '$dongKichHoat', as: 'dong', cond: { $eq: ['$$dong.ncc', ncc] } } } : '$dongKichHoat';
    const dieuKienNcc = ncc ? [{ $match: { $or: [{ laNhieuSanPham: false, NCC: ncc }, { laNhieuSanPham: true, 'dongChon.0': { $exists: true } }] } }] : [];
    return [
      { $addFields: { laNhieuSanPham: { $isArray: '$chiTietSanPham' }, dongKichHoat: dongDaKichHoat(), cost: costExpression } },
      { $addFields: { dongChon: locDong } },
      { $facet: {
        allOrders: [{ $count: 'count' }],
        suppliers: [
          { $project: { dong: { $cond: ['$laNhieuSanPham', '$dongKichHoat', [{ ncc: '$NCC', giaDongCongTy: '$cost', soLuong: 1 }]] } } },
          { $unwind: '$dong' },
          { $group: { _id: { don: '$_id', ncc: '$dong.ncc' }, cost: { $sum: { $multiply: ['$dong.giaDongCongTy', '$dong.soLuong'] } } } },
          { $group: { _id: '$_id.ncc', cost: { $sum: '$cost' }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ],
        totals: [
          ...dieuKienNcc,
          { $group: { _id: null, cost: { $sum: { $cond: ['$laNhieuSanPham', tongChiPhi('$dongChon'), '$cost'] } }, count: { $sum: 1 } } }
        ],
        items: [
          ...dieuKienNcc,
          { $sort: { [ORDER_DATE]: 1, 'Mã Đơn Hàng': 1, _id: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
          { $addFields: {
            chiPhiChon: { $cond: ['$laNhieuSanPham', tongChiPhi('$dongChon'), '$cost'] },
            khongPhanBoUnc: { $and: ['$laNhieuSanPham', Boolean(ncc), { $gt: [{ $size: '$dongKichHoat' }, { $size: '$dongChon' }] }] },
            uncPaid: tongUncDon
          } },
          { $project: {
            _id: 1, code: '$Mã Đơn Hàng', date: '$Ngày Đăng Ký', company: '$Tên Công Ty ', mst: '$MST',
            pack: { $cond: ['$laNhieuSanPham', noiChuoi({ $map: { input: '$dongChon', as: 'dong', in: '$$dong.tenSanPham' } }), '$Gói '] },
            ncc: { $cond: ['$laNhieuSanPham', noiChuoi({ $setUnion: [{ $map: { input: '$dongChon', as: 'dong', in: '$$dong.ncc' } }, []] }), '$NCC'] },
            employee: `$${EMPLOYEE_NAME}`, cost: '$chiPhiChon', khongPhanBoUnc: 1,
            uncPaid: { $cond: ['$khongPhanBoUnc', null, '$uncPaid'] },
            remaining: { $cond: ['$khongPhanBoUnc', null, { $max: [0, { $subtract: ['$chiPhiChon', '$uncPaid'] }] }] }
          } }
        ]
      } }
    ];
  }

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
    const start = new Date(Date.UTC(year, 0, 1));
    const group = dateField => ({ _id: { y: { $year: dateField }, m: { $month: dateField } } });
    const [incurredRows, uncRows, directRows, payableRows, adjustmentRows, setupRows, nccOneRows, mucPhiHsOneRows] = await Promise.all([
      Order.aggregate([
        { $match: { ...orderBase(name), [ORDER_DATE]: { $lt: end } } },
        { $group: { ...group(`$${ORDER_DATE}`), amount: { $sum: costExpression }, count: { $sum: 1 } } }
      ]).option({ maxTimeMS: 20000 }),
      Order.aggregate([
        { $match: dieuKienUnc(name) },
        ...cacBuocUnc,
        { $match: { uncAmount: { $gt: 0 }, paidAt: { $lt: end } } },
        { $group: { ...group('$paidAt'), amount: { $sum: '$uncAmount' } } }
      ]).option({ maxTimeMS: 20000 }),
      EmployeePayment.aggregate([
        { $match: paymentBase(name) },
        { $addFields: { kyThanhToan: kyThanhToanNhanVien } },
        { $addFields: { paidAt: ngayTheoKyThanhToan } },
        { $match: { paidAt: { $lt: end } } },
        { $group: { ...group('$paidAt'), amount: { $sum: money('amount') } } }
      ]).option({ maxTimeMS: 20000 }),
      EmployeePayable.find({ year, ...(name ? { employeeKey: name.toUpperCase() } : {}) }).lean(),
      EmployeeOpeningAdjustment.find({ year: { $lte: year }, ...(name ? { employeeKey: name.toUpperCase() } : {}) }).lean(),
      ThietLapLuongNhanVien.find({ tuNam: { $lte: year }, ...(name ? { employeeKey: name.toUpperCase() } : {}) }).lean(),
      Order.aggregate(pipelineDangKyNccOne(name, start, end)).option({ maxTimeMS: 20000 }),
      ExpenseRate.find({
        tenChiPhiKey: { $in: CAC_TEN_PHI_HS_ONE_KEY },
        tuNgay: { $lt: end },
        $or: [{ denNgay: null }, { denNgay: { $gte: start } }]
      }).select('donGia tuNgay denNgay').sort({ tuNgay: 1 }).limit(GIOI_HAN_MUC_PHI_HS_ONE + 1).lean()
    ]);
    if (mucPhiHsOneRows.length > GIOI_HAN_MUC_PHI_HS_ONE) {
      throw new Error(`Có quá ${GIOI_HAN_MUC_PHI_HS_ONE} mức phí HS One áp dụng trong năm ${year}; không thể tính báo cáo đầy đủ.`);
    }
    const phiHoSoTamGiuOneTheoThang = {};
    const soHoSoThieuPhiTheoThang = {};
    nccOneRows.forEach(row => {
      const ngayDangKy = new Date(`${row._id}T00:00:00.000Z`);
      const soLuong = round(Number(row.soLuong));
      const mucPhi = mucPhiHsOneRows.find(item => item.tuNgay <= ngayDangKy && (!item.denNgay || item.denNgay >= ngayDangKy));
      const khoaKy = `${ngayDangKy.getUTCFullYear()}-${ngayDangKy.getUTCMonth() + 1}`;
      if (!mucPhi) {
        soHoSoThieuPhiTheoThang[khoaKy] = (soHoSoThieuPhiTheoThang[khoaKy] || 0) + soLuong;
        return;
      }
      phiHoSoTamGiuOneTheoThang[khoaKy] = (phiHoSoTamGiuOneTheoThang[khoaKy] || 0) + round(soLuong * Number(mucPhi.donGia));
    });
    const adjustments = {};
    adjustmentRows.forEach(item => {
      const key = `${item.year}-${item.month}`;
      adjustments[key] = (adjustments[key] || 0) + item.delta;
    });
    const incurred = byKey(incurredRows);
    const unc = byKey(uncRows);
    const direct = byKey(directRows);
    const payables = {};
    const payableByEmployee = new Map(payableRows.map(item => [`${item.employeeKey}|${item.month}`, item]));
    const setupByEmployee = {};
    setupRows.forEach(item => { (setupByEmployee[item.employeeKey] ||= []).push(item); });
    const employeeKeys = new Set([...payableRows.map(item => item.employeeKey), ...Object.keys(setupByEmployee)]);
    for (let m = 1; m <= 12; m += 1) {
      const sum = payables[m] = { salary: 0, advance: 0, dossierFee: 0, otherFee: 0, deliveryFee: 0, fromSetup: false };
      employeeKeys.forEach(employeeKey => {
        const manual = payableByEmployee.get(`${employeeKey}|${m}`);
        if (manual) {
          PAYABLE_FIELDS.forEach(field => { sum[field] += Number(manual[field]) || 0; });
          return;
        }
        const setup = (setupByEmployee[employeeKey] || []).filter(item => item.tuNam * 12 + item.tuThang <= year * 12 + m)
          .reduce((latest, item) => (!latest || item.tuNam * 12 + item.tuThang > latest.tuNam * 12 + latest.tuThang ? item : latest), null);
        if (!setup) return;
        sum.salary += Number(setup.luongCoBan) || 0;
        sum.otherFee += Number(setup.phuCap) || 0;
        sum.deliveryFee += Number(setup.phiGiaoNhan) || 0;
        sum.dossierFee += Number(setup.phiHoSo) || 0;
        sum.fromSetup = true;
      });
    }

    const keys = [...Object.keys(incurred), ...Object.keys(unc), ...Object.keys(direct), ...Object.keys(phiHoSoTamGiuOneTheoThang), ...Object.keys(soHoSoThieuPhiTheoThang)].map(key => key.split('-').map(Number));
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
      const dossierHold = round(phiHoSoTamGiuOneTheoThang[key]);
      const dossierHoldMissingCount = round(soHoSoThieuPhiTheoThang[key]);
      const uncPaid = round(unc[key]?.amount);
      const directPaid = round(direct[key]?.amount);
      const paid = uncPaid + directPaid;
      const totalDue = opening + incurredAmount;
      const remaining = Math.max(0, totalDue - paid);
      if (cursorYear === year) {
        const fees = payables[cursorMonth];
        const payable = round(fees.salary + fees.dossierFee + fees.otherFee + fees.deliveryFee - fees.advance);
        const net = payable - remaining;
        months.push({
          month: cursorMonth, opening, baseOpening, adjustment, incurred: incurredAmount, dossierHold, dossierHoldMissingCount, orderCount: incurred[key]?.count || 0, totalDue,
          uncPaid, directPaid, paid, remaining, overpay: Math.max(0, paid - totalDue),
          salary: round(fees.salary), advance: round(fees.advance), dossierFee: round(fees.dossierFee), otherFee: round(fees.otherFee), deliveryFee: round(fees.deliveryFee),
          fromSetup: fees.fromSetup,
          payable, net, status: statusOf(net)
        });
      }
      opening = remaining;
      cursorMonth += 1;
      if (cursorMonth > 12) { cursorMonth = 1; cursorYear += 1; }
    }
    return months;
  }

  const monthlyView = row => ({ month: row.month, opening: row.opening, adjustment: row.adjustment, incurred: row.incurred, dossierHold: row.dossierHold, dossierHoldMissingCount: row.dossierHoldMissingCount, totalDue: row.totalDue, paid: row.paid, uncPaid: row.uncPaid, directPaid: row.directPaid, remaining: row.remaining, overpay: row.overpay });

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
      const pipeline = [
        { $match: { ...orderBase(name), [ORDER_DATE]: { $gte: start, $lt: end } } },
        ...(hoTroNhieuSanPham ? chiTietNhieuSanPham(ncc, page, limit) : [
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
        ])
      ];
      const [result] = await Order.aggregate(pipeline).option({ maxTimeMS: 20000 });
      const total = result?.totals?.[0]?.count || 0;
      res.json({ success: true, data: {
        year, month, items: result?.items || [], page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
        totalCost: round(result?.totals?.[0]?.cost),
        ...(hoTroNhieuSanPham ? { totalOrders: result?.allOrders?.[0]?.count || 0 } : {}),
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
      const { page: trangUnc } = pageParams({ page: req.query.uncPage, limit });
      const [directResult, ketQuaUnc] = await Promise.all([
        EmployeePayment.aggregate([
          { $match: paymentBase(name) },
          { $addFields: { kyThanhToan: kyThanhToanNhanVien } },
          { $addFields: { paidAt: ngayTheoKyThanhToan } },
          { $addFields: { parsedPaymentDate: dateExpression('paymentDate') } },
          { $match: { paidAt: { $gte: range.start, $lt: range.end } } },
          { $sort: { parsedPaymentDate: -1, createdAt: -1 } },
          { $facet: {
            items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 1, employee: 1, amount: 1, paymentDate: 1, paymentPeriod: '$kyThanhToan', paymentMethod: 1, note: 1, enteredBy: 1, createdBy: 1 } }],
            totals: [{ $group: { _id: null, count: { $sum: 1 }, amount: { $sum: money('amount') } } }]
          } }
        ]).option({ maxTimeMS: 20000 }),
        Order.aggregate([
          { $match: dieuKienUnc(name) },
          ...cacBuocUnc,
          { $match: { uncAmount: { $gt: 0 }, paidAt: { $gte: range.start, $lt: range.end } } },
          { $facet: {
            items: [
              { $sort: { paidAt: -1, _id: 1, 'phieu.maPhieu': 1 } },
              { $skip: (trangUnc - 1) * limit }, { $limit: limit },
              { $project: { _id: 1, code: '$Mã Đơn Hàng', date: '$paidAt', amount: '$uncAmount',
                ncc: hoTroNhieuSanPham ? { $cond: ['$laNhieuSanPham', null, '$NCC'] } : '$NCC', employee: `$${EMPLOYEE_NAME}`,
                ...(hoTroNhieuSanPham ? { fileName: '$phieu.fileName', content: '$phieu.content', status: '$phieu.status', maPhieu: '$phieu.maPhieu' }
                  : { fileName: '$Tên File UNC', content: '$Nội Dung UNC', status: '$Trạng Thái UNC' }) } }
            ],
            totals: [{ $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$uncAmount' } } }]
          } }
        ]).option({ maxTimeMS: 20000 })
      ]);
      const total = directResult[0]?.totals?.[0]?.count || 0;
      const tongSoUnc = ketQuaUnc[0]?.totals?.[0]?.count || 0;
      res.json({ success: true, data: {
        items: directResult[0]?.items || [], page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
        directTotal: round(directResult[0]?.totals?.[0]?.amount),
        unc: ketQuaUnc[0]?.items || [], uncTotal: round(ketQuaUnc[0]?.totals?.[0]?.amount),
        uncPage: trangUnc, uncCount: tongSoUnc, uncTotalPages: Math.max(1, Math.ceil(tongSoUnc / limit))
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

  router.get('/nhan-vien/thiet-lap-luong', async (req, res) => {
    try {
      const name = await scopedEmployee(req, req.query.employeeId);
      if (!name) throw requestError('Vui lòng chọn một nhân viên cụ thể.');
      const items = await ThietLapLuongNhanVien.find({ employeeKey: name.toUpperCase() })
        .select('tuNam tuThang luongCoBan phuCap phiGiaoNhan phiHoSo ghiChu updatedBy updatedAt')
        .sort({ tuNam: -1, tuThang: -1 }).limit(120).lean();
      res.json({ success: true, data: { employee: name, canEdit: Boolean(req.debtAccess.isAdmin), items } });
    } catch (error) {
      sendRouteError(res, error, 'Không thể tải thiết lập lương nhân viên');
    }
  });

  router.put('/nhan-vien/thiet-lap-luong', async (req, res) => {
    try {
      const name = await adminEmployee(req);
      const tuNam = Number.parseInt(req.body.tuNam, 10);
      const tuThang = Number.parseInt(req.body.tuThang, 10);
      if (!Number.isInteger(tuNam) || tuNam < 2000 || tuNam > 2100) throw requestError('Năm áp dụng không hợp lệ.');
      if (!Number.isInteger(tuThang) || tuThang < 1 || tuThang > 12) throw requestError('Tháng áp dụng không hợp lệ.');
      const values = {};
      for (const field of ['luongCoBan', 'phuCap', 'phiGiaoNhan', 'phiHoSo']) {
        const value = Number(req.body[field] ?? 0);
        if (!Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) throw requestError('Số tiền thiết lập lương phải là số không âm hợp lệ.');
        values[field] = Math.round(value);
      }
      const saved = await ThietLapLuongNhanVien.findOneAndUpdate(
        { employeeKey: name.toUpperCase(), tuNam, tuThang },
        { $set: { ...values, employee: name, ghiChu: String(req.body.ghiChu || '').trim().slice(0, 300), updatedBy: req.auth?.username || 'Hệ thống' } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      ).lean();
      await ghiSauCapNhat(req, res, 'thiet-lap-luong', 'cap-nhat', `${name} (${tuThang}/${tuNam})`);
      res.json({ success: true, data: saved });
    } catch (error) {
      sendRouteError(res, error, 'Không thể lưu thiết lập lương nhân viên');
    }
  });

  router.delete('/nhan-vien/thiet-lap-luong', async (req, res) => {
    try {
      const name = await adminEmployee(req);
      const tuNam = Number.parseInt(req.query.tuNam, 10);
      const tuThang = Number.parseInt(req.query.tuThang, 10);
      if (!Number.isInteger(tuNam) || !Number.isInteger(tuThang)) throw requestError('Kỳ áp dụng không hợp lệ.');
      const result = await ThietLapLuongNhanVien.deleteOne({ employeeKey: name.toUpperCase(), tuNam, tuThang });
      if (result.deletedCount) await ghiSauCapNhat(req, res, 'thiet-lap-luong', 'xoa', `${name} (${tuThang}/${tuNam})`);
      res.json({ success: true, deleted: result.deletedCount });
    } catch (error) {
      sendRouteError(res, error, 'Không thể xóa thiết lập lương nhân viên');
    }
  });

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
