const assert = require('node:assert/strict');
const { tongHopDongKichHoat } = require('../services/tongHopChiTietDonHang');
const { tinhTongChiTiet, tongThanhToanKhachTheoThang } = require('../services/chiTietDonHang');

function tinhBieuThuc(bieuThuc, taiLieu, bien = {}) {
  if (typeof bieuThuc === 'string') {
    if (bieuThuc.startsWith('$$')) {
      const [ten, ...duongDan] = bieuThuc.slice(2).split('.');
      return duongDan.reduce((value, key) => value?.[key], bien[ten]);
    }
    if (bieuThuc.startsWith('$')) return bieuThuc.slice(1).split('.').reduce((value, key) => value?.[key], taiLieu);
    return bieuThuc;
  }
  if (Array.isArray(bieuThuc)) return bieuThuc.map(item => tinhBieuThuc(item, taiLieu, bien));
  if (!bieuThuc || typeof bieuThuc !== 'object') return bieuThuc;
  const [toanTu, giaTri] = Object.entries(bieuThuc)[0];
  const tinh = value => tinhBieuThuc(value, taiLieu, bien);
  if (!toanTu.startsWith('$')) return Object.fromEntries(Object.entries(bieuThuc).map(([key, value]) => [key, tinh(value)]));
  switch (toanTu) {
    case '$isArray': return Array.isArray(tinh(giaTri));
    case '$ifNull': { const [value, fallback] = giaTri; const ketQua = tinh(value); return ketQua == null ? tinh(fallback) : ketQua; }
    case '$cond': return tinh(giaTri[0]) ? tinh(giaTri[1]) : tinh(giaTri[2]);
    case '$and': return tinh(giaTri).every(Boolean);
    case '$eq': return tinh(giaTri[0]) === tinh(giaTri[1]);
    case '$gt': return tinh(giaTri[0]) > tinh(giaTri[1]);
    case '$size': return tinh(giaTri).length;
    case '$toString': { const value = tinh(giaTri); return value == null ? null : String(value); }
    case '$toUpper': return String(tinh(giaTri)).toUpperCase();
    case '$trim': return String(tinh(giaTri.input)).trim();
    case '$replaceAll': return String(tinh(giaTri.input)).split(tinh(giaTri.find)).join(tinh(giaTri.replacement));
    case '$switch': {
      const nhanh = giaTri.branches.find(item => tinh(item.case));
      return nhanh ? tinh(nhanh.then) : tinh(giaTri.default);
    }
    case '$convert': {
      const value = tinh(giaTri.input);
      if (value == null) return giaTri.onNull;
      if (giaTri.to === 'double') return Number(value);
      return String(value);
    }
    case '$dateFromString': { const value = tinh(giaTri.dateString); return value == null ? giaTri.onNull : new Date(`${value}T00:00:00.000Z`); }
    case '$regexMatch': return new RegExp(giaTri.regex, giaTri.options).test(tinh(giaTri.input));
    case '$filter': return tinh(giaTri.input).filter(item => tinhBieuThuc(giaTri.cond, taiLieu, { ...bien, [giaTri.as]: item }));
    case '$map': return tinh(giaTri.input).map(item => tinhBieuThuc(giaTri.in, taiLieu, { ...bien, [giaTri.as]: item }));
    case '$reduce': return tinh(giaTri.input).reduce((value, item) => tinhBieuThuc(giaTri.in, taiLieu, { ...bien, value, this: item }), tinh(giaTri.initialValue));
    case '$add': return tinh(giaTri).reduce((sum, item) => sum + item, 0);
    case '$multiply': return tinh(giaTri).reduce((product, item) => product * item, 1);
    case '$subtract': return tinh(giaTri[0]) - tinh(giaTri[1]);
    case '$max': return Math.max(...tinh(giaTri));
    case '$concatArrays': return tinh(giaTri).flat();
    case '$concat': return tinh(giaTri).join('');
    case '$setUnion': return [...new Set(tinh(giaTri).flat())];
    default: throw new Error(`Toán tử chưa được kiểm thử: ${toanTu}`);
  }
}

const dong = {
  trangThai: 'Đã Kích Hoạt', soLuong: 2, giaBan: 500000, giaDongCongTy: 300000,
  giaNoNcc: 250000, phaiThuKhach: 900000,
  thanhToanKhach: [{ ngay: '2026-01-31', soTien: 100000 }, { ngay: '2026-02-01', soTien: 200000 }],
  thanhToanNcc: []
};
const danhSach = [
  dong,
  { ...dong, soLuong: 3, trangThai: 'Chưa Kích Hoạt', phaiThuKhach: 700000 },
  { ...dong, soLuong: 1, trangThai: 'Đã Kích Hoạt', thanhToanKhach: [{ ngay: '2026-02-03', soTien: 50000 }] }
];
const bieuThuc = tongHopDongKichHoat();
const tinh = taiLieu => Object.fromEntries(Object.entries(bieuThuc).map(([key, value]) => [key, tinhBieuThuc(value, taiLieu)]));
const ketQua = tinh({ chiTietSanPham: danhSach });
const tong = tinhTongChiTiet(danhSach).daKichHoat;
for (const truong of ['thanhTien', 'thucDongCongTy', 'congNoNcc', 'phaiThuKhach', 'khachDaThanhToan']) {
  assert.equal(ketQua[truong], tong[truong], truong);
}
const theoThang = {};
ketQua.thanhToanKhach.forEach(lan => { const thang = lan.ngay.slice(0, 7); theoThang[thang] = (theoThang[thang] || 0) + lan.soTien; });
assert.deepEqual(theoThang, tongThanhToanKhachTheoThang(danhSach));
assert.deepEqual(tinh({}), { thanhTien: 0, thucDongCongTy: 0, congNoNcc: 0, phaiThuKhach: 0, khachDaThanhToan: 0, thanhToanKhach: [] });
assert.deepEqual(tinh({ chiTietSanPham: null }), tinh({}));
assert.deepEqual(tinh({ chiTietSanPham: [] }), tinh({}));
console.log('Đạt: biểu thức tổng hợp theo dòng khớp phép tính và lịch thanh toán đã kiểm thử.');

module.exports = { tinhBieuThuc };
