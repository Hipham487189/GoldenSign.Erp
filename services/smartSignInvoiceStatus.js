const statusLabels = {
  0: 'Chưa ký',
  1: 'Đã ký',
  2: 'Đã gửi',
  3: 'Đã cấp mã',
  4: 'Không hợp lệ'
};

function extractSmartSignInvoice(responseData) {
  let data = responseData;
  for (let depth = 0; depth < 3; depth += 1) {
    if (Array.isArray(data)) return data[0] || {};
    const nested = data?.data ?? data?.Data ?? data?.HDon ?? data?.Invoice;
    if (!nested || nested === data) break;
    data = nested;
  }
  return data && typeof data === 'object' ? data : {};
}

function smartSignStatusLabel(code) {
  const normalizedCode = Number(code);
  return statusLabels[normalizedCode] || `Không xác định (${code ?? '--'})`;
}

module.exports = { extractSmartSignInvoice, smartSignStatusLabel };