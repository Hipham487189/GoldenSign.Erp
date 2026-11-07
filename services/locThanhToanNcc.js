function ngayHopLe(ngay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return false;
  const parsed = new Date(`${ngay}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === ngay;
}

function taoBoLocThanhToanNcc(query) {
  const nam = String(query.year || '').trim();
  const thang = String(query.month || '').trim();
  const tuNgay = String(query.fromDate || '').trim();
  const denNgay = String(query.toDate || '').trim();
  const dieuKien = [];
  const coNam = nam && nam !== 'ALL';
  const coThang = thang && thang !== 'ALL';

  if (coNam && (!/^\d{4}$/.test(nam) || Number(nam) < 2000 || Number(nam) > 2100)) throw new Error('Năm lọc công nợ NCC không hợp lệ.');
  if (coThang && (!/^\d{1,2}$/.test(thang) || Number(thang) < 1 || Number(thang) > 12)) throw new Error('Tháng lọc công nợ NCC không hợp lệ.');
  if (tuNgay && !ngayHopLe(tuNgay)) throw new Error('Ngày bắt đầu lọc công nợ NCC không hợp lệ.');
  if (denNgay && !ngayHopLe(denNgay)) throw new Error('Ngày kết thúc lọc công nợ NCC không hợp lệ.');
  if (tuNgay && denNgay && tuNgay > denNgay) throw new Error('Ngày bắt đầu phải trước ngày kết thúc.');

  if (coNam) {
    if (coThang) {
      const batDau = new Date(Date.UTC(Number(nam), Number(thang) - 1, 1));
      const ketThuc = new Date(Date.UTC(Number(nam), Number(thang), 1));
      dieuKien.push({ paymentDate: { $gte: batDau.toISOString().slice(0, 10), $lt: ketThuc.toISOString().slice(0, 10) } });
    } else {
      dieuKien.push({ paymentDate: { $gte: `${nam}-01-01`, $lt: `${Number(nam) + 1}-01-01` } });
    }
  } else if (coThang) {
    dieuKien.push({ $expr: { $eq: [{ $substrCP: [{ $convert: { input: '$paymentDate', to: 'string', onError: '', onNull: '' } }, 5, 2] }, String(Number(thang)).padStart(2, '0')] } });
  }
  if (tuNgay || denNgay) {
    const khoang = {};
    if (tuNgay) khoang.$gte = tuNgay;
    if (denNgay) khoang.$lte = denNgay;
    dieuKien.push({ paymentDate: khoang });
  }
  return dieuKien.length ? { $and: dieuKien } : {};
}

module.exports = { taoBoLocThanhToanNcc };
