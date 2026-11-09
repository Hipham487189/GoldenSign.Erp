const truongTheoTieuDe = new Map([
  ['MASANPHAM', 'maSanPham'],
  ['MASP', 'maSanPham'],
  ['TENSANPHAM', 'tenSanPham'],
  ['TENSANPHAMGOICUOC', 'tenSanPham'],
  ['TENGOICUOC', 'tenSanPham'],
  ['LOAISANPHAM', 'loaiSanPham'],
  ['NCC', 'ncc'],
  ['HINHTHUC', 'hinhThuc'],
  ['GIATRUOCTHUE', 'giaTruocThue'],
  ['GIATRUOCTHUEVND', 'giaTruocThue'],
  ['GIACHUATHUE', 'giaTruocThue'],
  ['VAT', 'vat'],
  ['THUESUAT', 'vat'],
  ['GIASAUTHUE', 'giaSauThue'],
  ['GIASAUTHUEVND', 'giaSauThue'],
  ['SAUTHUE', 'giaSauThue'],
  ['THUCDONGCONGTY', 'thucDongCongTy'],
  ['THUCDONGCONGTYVND', 'thucDongCongTy'],
  ['THUCDONGCTY', 'thucDongCongTy'],
  ['THUCDONGCTYVND', 'thucDongCongTy'],
  ['THUCCONGNOCTY', 'thucCongNoCty'],
  ['THUCCONGNOCTYVND', 'thucCongNoCty'],
  ['NGAYAPDUNG', 'ngayApDung'],
  ['NGAYBATDAU', 'ngayApDung'],
  ['NGAYKETTHUC', 'ngayKetThuc'],
  ['NGAYHETHAN', 'ngayKetThuc']
]);

const tieuDeTheoTruong = {
  maSanPham: 'MÃ SẢN PHẨM',
  tenSanPham: 'TÊN SẢN PHẨM',
  loaiSanPham: 'LOẠI SẢN PHẨM',
  ncc: 'NCC',
  hinhThuc: 'Hình Thức',
  giaTruocThue: 'GIÁ TRƯỚC THUẾ',
  vat: 'VAT',
  giaSauThue: 'GIÁ SAU THUẾ',
  thucDongCongTy: 'THỰC ĐÓNG CÔNG TY',
  thucCongNoCty: 'THỰC CÔNG NỢ CTY',
  ngayApDung: 'Ngày áp dụng',
  ngayKetThuc: 'Ngày kết thúc'
};

const truongBatBuoc = ['tenSanPham', 'loaiSanPham', 'ncc', 'hinhThuc', 'vat', 'giaSauThue', 'ngayApDung', 'ngayKetThuc'];
const SO_DONG_TOI_DA = 1000;

function chuanHoaTieuDe(giaTri) {
  return String(giaTri ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function giaTriTrong(giaTri) {
  return giaTri === null || giaTri === undefined || (typeof giaTri === 'string' && giaTri.trim() === '');
}

function docSo(giaTri, tenCot, loi, batBuoc = true, phanTram = false) {
  if (giaTriTrong(giaTri)) {
    if (batBuoc) loi.push(`${tenCot} không được để trống.`);
    return batBuoc ? null : 0;
  }

  let so;
  if (typeof giaTri === 'number') {
    so = giaTri;
  } else if (typeof giaTri === 'string') {
    let chuoi = giaTri.trim().replace(/\s/g, '');
    if (phanTram) chuoi = chuoi.replace(/%$/, '');
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(chuoi)) {
      so = Number(chuoi.replace(/[.,]/g, ''));
    } else if (/^\d+(?:[.,]\d+)?$/.test(chuoi)) {
      so = Number(chuoi.replace(',', '.'));
    }
  }

  if (!Number.isFinite(so) || so < 0 || (phanTram ? so > 100 : !Number.isSafeInteger(so))) {
    loi.push(`${tenCot} phải là số ${phanTram ? 'từ 0 đến 100' : 'nguyên không âm hợp lệ'}.`);
    return null;
  }
  return so;
}

function ngayHopLe(nam, thang, ngay) {
  const ngayUTC = new Date(Date.UTC(nam, thang - 1, ngay));
  return ngayUTC.getUTCFullYear() === nam && ngayUTC.getUTCMonth() === thang - 1 && ngayUTC.getUTCDate() === ngay;
}

function docNgay(giaTri, tenCot, loi) {
  let nam;
  let thang;
  let ngay;

  if (giaTri instanceof Date && !Number.isNaN(giaTri.getTime())) {
    return giaTri.toISOString().slice(0, 10);
  }

  if (typeof giaTri === 'number' && Number.isFinite(giaTri) && giaTri >= 1) {
    const ngayUTC = new Date(Date.UTC(1899, 11, 30) + Math.floor(giaTri) * 86400000);
    nam = ngayUTC.getUTCFullYear();
    thang = ngayUTC.getUTCMonth() + 1;
    ngay = ngayUTC.getUTCDate();
  } else {
    const text = String(giaTri ?? '').trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
    const dmy = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
    if (iso) {
      [, nam, thang, ngay] = iso.map(Number);
    } else if (dmy) {
      ngay = Number(dmy[1]);
      thang = Number(dmy[2]);
      nam = Number(dmy[3]);
    }
  }

  if (!nam || !thang || !ngay || !ngayHopLe(nam, thang, ngay)) {
    loi.push(`${tenCot} không phải ngày hợp lệ (dùng YYYY-MM-DD hoặc DD/MM/YYYY).`);
    return null;
  }
  return `${nam}-${String(thang).padStart(2, '0')}-${String(ngay).padStart(2, '0')}`;
}

function kiemTraDuLieuNhapSanPham(tieuDe, cacDong) {
  const loi = [];
  if (!Array.isArray(tieuDe) || !Array.isArray(cacDong)) {
    return { sanPham: [], loi: [{ dong: 1, cot: 'File', noiDung: 'Cấu trúc dữ liệu Excel không hợp lệ.' }] };
  }
  const dongSaiCauTruc = cacDong.findIndex(dong => !Array.isArray(dong));
  if (dongSaiCauTruc !== -1) {
    return { sanPham: [], loi: [{ dong: dongSaiCauTruc + 2, cot: 'Dữ liệu', noiDung: 'Dòng Excel không đúng cấu trúc.' }] };
  }
  const soDongCoDuLieu = cacDong.filter(dong => Array.isArray(dong) && dong.some(giaTri => !giaTriTrong(giaTri))).length;
  if (soDongCoDuLieu > SO_DONG_TOI_DA) {
    loi.push({ dong: 0, cot: 'File', noiDung: `Mỗi lần chỉ được nhập tối đa ${SO_DONG_TOI_DA} sản phẩm.` });
  }

  const chiSoTheoTruong = new Map();
  const loiTieuDe = [];
  tieuDe.forEach((giaTri, chiSo) => {
    const tieuDeGoc = String(giaTri ?? '').trim();
    const truong = truongTheoTieuDe.get(chuanHoaTieuDe(tieuDeGoc));
    if (!truong) {
      const coDuLieu = cacDong.some(dong => !giaTriTrong(dong?.[chiSo]));
      if (tieuDeGoc || coDuLieu) loiTieuDe.push({ dong: 1, cot: tieuDeGoc || `Cột ${chiSo + 1}`, noiDung: 'Tên cột không được hỗ trợ hoặc đang để trống.' });
      return;
    }
    if (chiSoTheoTruong.has(truong)) {
      loiTieuDe.push({ dong: 1, cot: tieuDeGoc, noiDung: `Cột bị lặp với "${tieuDeTheoTruong[truong]}".` });
      return;
    }
    chiSoTheoTruong.set(truong, chiSo);
  });

  truongBatBuoc.forEach(truong => {
    if (!chiSoTheoTruong.has(truong)) {
      loiTieuDe.push({ dong: 1, cot: tieuDeTheoTruong[truong], noiDung: 'Thiếu cột bắt buộc.' });
    }
  });
  if (loiTieuDe.length) return { sanPham: [], loi: [...loi, ...loiTieuDe] };

  const sanPham = [];
  let coDongDuLieu = false;
  cacDong.forEach((dong, chiSoDong) => {
    const cacGiaTri = Array.isArray(dong) ? dong : [];
    if (!cacGiaTri.some(giaTri => !giaTriTrong(giaTri))) return;
    coDongDuLieu = true;
    const soDongExcel = chiSoDong + 2;
    const loiDong = [];
    if (cacGiaTri.slice(tieuDe.length).some(giaTri => !giaTriTrong(giaTri))) {
      loiDong.push('Có dữ liệu ở cột không có tiêu đề.');
    }
    const lay = truong => chiSoTheoTruong.has(truong) ? cacGiaTri[chiSoTheoTruong.get(truong)] : null;
    const docChu = (truong, batBuoc) => {
      const giaTriGoc = lay(truong);
      const giaTri = giaTriTrong(giaTriGoc) ? '' : typeof giaTriGoc === 'string' || typeof giaTriGoc === 'number' ? String(giaTriGoc).trim() : '';
      if (!giaTriTrong(giaTriGoc) && !giaTri) loiDong.push(`${tieuDeTheoTruong[truong]} phải là văn bản.`);
      if (batBuoc && !giaTri) loiDong.push(`${tieuDeTheoTruong[truong]} không được để trống.`);
      return giaTri;
    };

    const giaSauThue = docSo(lay('giaSauThue'), tieuDeTheoTruong.giaSauThue, loiDong);
    const vat = docSo(lay('vat'), tieuDeTheoTruong.vat, loiDong, true, true);
    const giaTruocThueNhap = chiSoTheoTruong.has('giaTruocThue') ? lay('giaTruocThue') : null;
    const giaTruocThue = giaTriTrong(giaTruocThueNhap)
      ? (giaSauThue !== null && vat !== null ? Math.round(giaSauThue / (1 + vat / 100)) : null)
      : docSo(giaTruocThueNhap, tieuDeTheoTruong.giaTruocThue, loiDong);
    const thucDongCongTy = docSo(lay('thucDongCongTy'), tieuDeTheoTruong.thucDongCongTy, loiDong, false);
    const thucCongNoCty = docSo(lay('thucCongNoCty'), tieuDeTheoTruong.thucCongNoCty, loiDong, false);
    const coNgayApDung = !giaTriTrong(lay('ngayApDung'));
    const coNgayKetThuc = !giaTriTrong(lay('ngayKetThuc'));
    const ngayApDung = coNgayApDung ? docNgay(lay('ngayApDung'), tieuDeTheoTruong.ngayApDung, loiDong) : '';
    const ngayKetThuc = coNgayKetThuc ? docNgay(lay('ngayKetThuc'), tieuDeTheoTruong.ngayKetThuc, loiDong) : '';
    if (coNgayApDung !== coNgayKetThuc) {
      loiDong.push('Ngày áp dụng và Ngày kết thúc phải cùng có dữ liệu hoặc cùng để trống.');
    }

    if (ngayApDung && ngayKetThuc && ngayApDung > ngayKetThuc) {
      loiDong.push('Ngày áp dụng phải trước hoặc bằng ngày kết thúc.');
    }

    const sanPhamDong = {
      [tieuDeTheoTruong.maSanPham]: docChu('maSanPham', false),
      [tieuDeTheoTruong.tenSanPham]: docChu('tenSanPham', true),
      [tieuDeTheoTruong.loaiSanPham]: docChu('loaiSanPham', true),
      NCC: docChu('ncc', true),
      [tieuDeTheoTruong.hinhThuc]: docChu('hinhThuc', true),
      [tieuDeTheoTruong.giaTruocThue]: giaTruocThue,
      VAT: vat,
      [tieuDeTheoTruong.giaSauThue]: giaSauThue,
      [tieuDeTheoTruong.thucDongCongTy]: thucDongCongTy,
      [tieuDeTheoTruong.thucCongNoCty]: thucCongNoCty,
      [tieuDeTheoTruong.ngayApDung]: ngayApDung,
      [tieuDeTheoTruong.ngayKetThuc]: ngayKetThuc
    };

    if (loiDong.length) {
      loiDong.forEach(noiDung => loi.push({ dong: soDongExcel, cot: 'Dữ liệu', noiDung }));
    } else {
      sanPham.push(sanPhamDong);
    }
  });

  if (!coDongDuLieu) loi.push({ dong: 0, cot: 'File', noiDung: 'File Excel không có dòng sản phẩm.' });
  return { sanPham: loi.length ? [] : sanPham, loi };
}

module.exports = { kiemTraDuLieuNhapSanPham, SO_DONG_TOI_DA };
