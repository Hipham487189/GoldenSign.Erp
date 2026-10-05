const financialFields = new Set([
  'Thành Tiền',
  'Thực Thu',
  'KH Thanh Toán',
  'Còn lại',
  'Thực Đóng Công Ty',
  'THỰC CÔNG NỢ CTY',
  'Lợi Nhuận Dự Kiến'
]);

function normalizedHistoryValue(field, value) {
  if (financialFields.has(field)) {
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return 0;
    const number = typeof value === 'number' ? value : Number(String(value).replace(/[\s,]/g, ''));
    if (Number.isFinite(number)) return number;
  }
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && !value.trim()) return '';
  if (typeof value === 'string') return value.trim();
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function areHistoryValuesEqual(field, from, to) {
  return normalizedHistoryValue(field, from) === normalizedHistoryValue(field, to);
}

function buildOrderHistoryChanges(before, after, ignoredFields = new Set()) {
  return Object.keys(after).filter(field => !ignoredFields.has(field) && !areHistoryValuesEqual(field, before[field], after[field])).map(field => ({
    field,
    from: String(before[field] ?? ''),
    to: String(after[field] ?? '')
  }));
}

function filterMeaningfulOrderHistoryChanges(changes = []) {
  return changes.filter(change => change?.field && !areHistoryValuesEqual(change.field, change.from, change.to));
}

module.exports = { areHistoryValuesEqual, buildOrderHistoryChanges, filterMeaningfulOrderHistoryChanges };