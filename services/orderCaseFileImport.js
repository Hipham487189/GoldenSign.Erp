function normalizeCaseFileMst(value) {
  const digits = String(value ?? '').trim().replace(/\D/g, '');
  return digits.length === 9 ? `0${digits}` : digits;
}

function getCaseFileMstQueryValues(values) {
  const queryValues = new Set();
  values.map(normalizeCaseFileMst).filter(Boolean).forEach(mst => {
    queryValues.add(mst);
    const withoutLeadingZeroes = mst.replace(/^0+(?=\d)/, '');
    queryValues.add(withoutLeadingZeroes);
    const numericMst = Number(mst);
    if (Number.isSafeInteger(numericMst)) queryValues.add(numericMst);
  });
  return [...queryValues];
}

function isValidCaseFileDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.toISOString().slice(0, 10) === value;
}

function buildCaseFilePreview(rows, orders) {
  const ordersByMst = new Map();
  orders.forEach(order => {
    const mst = normalizeCaseFileMst(order.MST);
    if (!mst) return;
    if (!ordersByMst.has(mst)) ordersByMst.set(mst, []);
    ordersByMst.get(mst).push({
      orderId: String(order._id),
      orderCode: String(order['Mã Đơn Hàng'] || ''),
      companyName: String(order['Tên Công Ty '] || ''),
      employeeName: String(order['Nhân Viên Đăng Ký'] || ''),
      registeredAt: String(order['Ngày Đăng Ký'] || '')
    });
  });

  return rows.map((row, index) => {
    const source = row && typeof row === 'object' ? row : { issue: 'Dòng Excel không hợp lệ' };
    const excelMst = normalizeCaseFileMst(source.excelMst);
    const ngayHoSo = String(source.ngayHoSo || '');
    const base = {
      rowNumber: Number(source.rowNumber) || index + 1,
      excelMst,
      companyName: String(source.companyName || '').trim(),
      ngayHoSo,
      orderOptions: [],
      selectedOrderId: '',
      status: 'invalid',
      reason: ''
    };

    if (source.issue) return { ...base, reason: String(source.issue) };
    if (!excelMst) return { ...base, reason: 'Thiếu MST' };
    if (!isValidCaseFileDate(ngayHoSo)) return { ...base, reason: 'Ngày hồ sơ không hợp lệ' };

    const orderOptions = ordersByMst.get(excelMst) || [];
    if (!orderOptions.length) return { ...base, status: 'not-found', reason: 'Không tìm thấy đơn hàng' };
    if (orderOptions.length === 1) {
      return { ...base, orderOptions, selectedOrderId: orderOptions[0].orderId, status: 'ready' };
    }
    return { ...base, orderOptions, status: 'needs-selection', reason: 'Cần chọn đơn hàng' };
  });
}

function buildCaseFileUpdateOperations(updates, toObjectId) {
  return updates.map(row => ({
    updateOne: {
      filter: { _id: toObjectId(row.orderId) },
      update: { $set: { 'Ngày hồ sơ': row.ngayHoSo } }
    }
  }));
}

module.exports = { normalizeCaseFileMst, getCaseFileMstQueryValues, isValidCaseFileDate, buildCaseFilePreview, buildCaseFileUpdateOperations };