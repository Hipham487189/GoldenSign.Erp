const cacCotHoSo = [
  'NGÀY NHẬN', 'TÊN NHÂN VIÊN NHẬN', 'MST', 'TÊN CÔNG TY', 'LOẠI', 'NCC',
  'HĐ/ Phiếu ĐK', 'Giấy XN/ BBBG', 'ĐKKD', 'CMND', 'GCN DK THUẾ', 'Giấy ủy quyền',
  'Giấy DK cũ', 'PDK (HDDT)', 'BBCK', 'Giấy QĐ', 'TÌNH TRẠNG HỒ SƠ',
  'NGƯỜI GỬI', 'SDT NGƯỜI GỪI', 'ĐỊA CHỈ', 'GHI CHÚ', 'Nơi Nộp', 'Ngày Nộp'
];

function chuanHoaTimKiem(giaTri) {
  return String(giaTri || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function thoiDiemNhanHoSo(giaTri) {
  const khop = String(giaTri || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!khop) return null;

  const [, ngayText, thangText, namText] = khop;
  const ngay = Number(ngayText);
  const thang = Number(thangText);
  const nam = Number(namText);
  const thoiDiem = new Date(Date.UTC(nam, thang - 1, ngay));
  if (thoiDiem.getUTCFullYear() !== nam || thoiDiem.getUTCMonth() !== thang - 1 || thoiDiem.getUTCDate() !== ngay) return null;
  return thoiDiem;
}

function taoTruongTimKiem(duLieu) {
  const duLieuChuoi = Object.fromEntries(Object.entries(duLieu)
    .filter(([cot]) => !['tuKhoaChuanHoa', 'loaiChuanHoa', 'tinhTrangChuanHoa', 'ngayNhanDate', '_id', '__v', 'createdAt', 'updatedAt'].includes(cot))
    .map(([cot, giaTri]) => [cot, String(giaTri || '').trim()]));
  return {
    tuKhoaChuanHoa: chuanHoaTimKiem(Object.values(duLieuChuoi).join(' ')),
    loaiChuanHoa: chuanHoaTimKiem(duLieuChuoi['LOẠI']),
    tinhTrangChuanHoa: chuanHoaTimKiem(duLieuChuoi['TÌNH TRẠNG HỒ SƠ']),
    ngayNhanDate: thoiDiemNhanHoSo(duLieuChuoi['NGÀY NHẬN'])
  };
}

function escapeRegex(giaTri) {
  return String(giaTri).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { cacCotHoSo, chuanHoaTimKiem, thoiDiemNhanHoSo, taoTruongTimKiem, escapeRegex };
