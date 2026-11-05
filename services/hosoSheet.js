const maBangTinh = process.env.GOOGLE_HOSO_SHEET_ID || '1OnNu_mKs4YevULzGXwF00x9-peHGaXk94QNNizu2Ug0';
const maTrangTinh = process.env.GOOGLE_HOSO_SHEET_GID || '14303315';
const tenTrangTinh = process.env.GOOGLE_HOSO_SHEET_NAME || 'Hoso';

function phanTichCsv(noiDung) {
  const cacDong = [];
  let dong = [];
  let truong = '';
  let dangTrongNgoacKep = false;

  for (let chiSo = 0; chiSo < noiDung.length; chiSo += 1) {
    const kyTu = noiDung[chiSo];
    if (kyTu === '"') {
      if (dangTrongNgoacKep && noiDung[chiSo + 1] === '"') {
        truong += '"';
        chiSo += 1;
      } else {
        dangTrongNgoacKep = !dangTrongNgoacKep;
      }
    } else if (kyTu === ',' && !dangTrongNgoacKep) {
      dong.push(truong);
      truong = '';
    } else if ((kyTu === '\n' || kyTu === '\r') && !dangTrongNgoacKep) {
      if (kyTu === '\r' && noiDung[chiSo + 1] === '\n') chiSo += 1;
      dong.push(truong);
      if (dong.some(giaTri => giaTri.trim())) cacDong.push(dong);
      dong = [];
      truong = '';
    } else {
      truong += kyTu;
    }
  }

  if (truong || dong.length) {
    dong.push(truong);
    if (dong.some(giaTri => giaTri.trim())) cacDong.push(dong);
  }
  return cacDong;
}

async function taiDongSheet() {
  const duongDan = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(maBangTinh)}/export`);
  duongDan.searchParams.set('format', 'csv');
  duongDan.searchParams.set('gid', maTrangTinh);
  const phanHoi = await fetch(duongDan, {
    headers: { Accept: 'text/csv' },
    signal: AbortSignal.timeout(15000)
  });
  if (!phanHoi.ok) throw new Error(`Google Sheets trả về lỗi HTTP ${phanHoi.status}.`);

  const noiDung = (await phanHoi.text()).replace(/^\uFEFF/, '');
  const [tieuDe, ...cacDong] = phanTichCsv(noiDung);
  if (!tieuDe?.includes('ID') || !tieuDe.includes('TÊN CÔNG TY') || !tieuDe.includes('TÌNH TRẠNG HỒ SƠ')) {
    throw new Error('Sheet Hoso thiếu cột ID, TÊN CÔNG TY hoặc TÌNH TRẠNG HỒ SƠ.');
  }

  return cacDong.map(dong => Object.fromEntries(tieuDe.map((cot, chiSo) => [cot, String(dong[chiSo] || '').trim()])));
}

module.exports = { taiDongSheet };
