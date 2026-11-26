const mongoose = require('mongoose');
const HoSo = require('../models/HoSo');
const { ngayHienTaiVietNam } = require('./ngayThongKe');

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
    .filter(([cot]) => !['tuKhoaChuanHoa', 'loaiChuanHoa', 'tinhTrangChuanHoa', 'ngayNhanDate', 'tepDinhKem', 'coTepDinhKem', 'quyTrinhHoSo', '_id', '__v', 'createdAt', 'updatedAt'].includes(cot))
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

async function taoMaHoSo(ngay = new Date()) {
  const nam = ngayHienTaiVietNam(ngay).getUTCFullYear();
  const tienTo = `HS${nam}-`;
  const cuoi = await HoSo.findOne({ ID: new RegExp(`^${tienTo}\\d{5}$`) })
    .select('ID').sort({ ID: -1 }).lean();
  const soCaoNhat = cuoi ? Number(cuoi.ID.slice(-5)) : 0;
  const boDem = mongoose.connection.collection('hoso_code_counters');
  try {
    await boDem.updateOne({ _id: nam }, { $max: { value: soCaoNhat } }, { upsert: true });
  } catch (loi) {
    if (loi.code !== 11000) throw loi;
    await boDem.updateOne({ _id: nam }, { $max: { value: soCaoNhat } });
  }
  const ketQua = await boDem.findOneAndUpdate({ _id: nam }, { $inc: { value: 1 } }, { returnDocument: 'after' });
  const banGhi = ketQua?.value && typeof ketQua.value === 'object' ? ketQua.value : ketQua;
  const soThuTu = Number(banGhi?.value);
  if (!Number.isInteger(soThuTu) || soThuTu < 1 || soThuTu > 99999) {
    const loi = new Error('Không thể cấp mã hồ sơ: đã hết số thứ tự trong năm hoặc bộ đếm không hợp lệ.');
    loi.statusCode = 409;
    throw loi;
  }
  return `${tienTo}${String(soThuTu).padStart(5, '0')}`;
}

const BUOC_QUY_TRINH = ['khach_hang', 'hi_nhan', 'xu_ly_noi_bo', 'nop_ncc'];
const NGUOI_XU_LY_HO_SO = ['Thắng', 'Nguyên'];
const NGUOI_NHAN_DAU_TIEN = ['Hi', 'Thắng', 'Nguyên'];
const NCC_NOP_MAC_DINH = ['VINA', 'ONE', 'Khánh Linh', 'FPT'];

function khoiTaoQuyTrinhHoSo(nguoiThaoTac = 'Hệ thống', nguoiNhanDauTien = 'Hi') {
  const bayGio = new Date();
  const nguoiNhan = NGUOI_NHAN_DAU_TIEN.find(t => chuanHoaTimKiem(t) === chuanHoaTimKiem(nguoiNhanDauTien)) || 'Hi';
  const quaHi = nguoiNhan === 'Hi';
  const buocHienTai = quaHi ? 'hi_nhan' : 'xu_ly_noi_bo';
  return {
    buocHienTai,
    nguoiGiu: nguoiNhan,
    nguoiXuLy: quaHi ? '' : nguoiNhan,
    nccNop: '',
    quaHi,
    capNhatLuc: bayGio,
    lichSu: [{
      tuBuoc: 'khach_hang',
      denBuoc: buocHienTai,
      nguoiNhan,
      thoiGian: bayGio,
      nguoiThaoTac: String(nguoiThaoTac || 'Hệ thống').trim(),
      ghiChu: `Khách hàng chuyển hồ sơ, ${nguoiNhan} tiếp nhận`
    }]
  };
}

function laNguoiGiuBuocHienTai(userRecord, quyTrinh) {
  if (!userRecord || !userRecord.isActive) return false;
  if (userRecord.roleId?.name === 'Admin') return true;
  const hoTen = chuanHoaTimKiem(userRecord.employeeId?.name || '');
  const tuCuoi = hoTen ? hoTen.split(/\s+/).filter(Boolean).pop() : '';
  const username = chuanHoaTimKiem(userRecord.username || '');
  if (quyTrinh?.buocHienTai === 'khach_hang') {
    return NGUOI_NHAN_DAU_TIEN.some(ten => {
      const chuan = chuanHoaTimKiem(ten);
      return (tuCuoi && tuCuoi === chuan) || (username && username === chuan);
    });
  }
  const nguoiGiu = chuanHoaTimKiem(quyTrinh?.nguoiGiu || '');
  if (!nguoiGiu) return false;
  return (tuCuoi && tuCuoi === nguoiGiu) || (username && username === nguoiGiu);
}

module.exports = {
  cacCotHoSo,
  chuanHoaTimKiem,
  thoiDiemNhanHoSo,
  taoTruongTimKiem,
  escapeRegex,
  taoMaHoSo,
  BUOC_QUY_TRINH,
  NGUOI_XU_LY_HO_SO,
  NGUOI_NHAN_DAU_TIEN,
  NCC_NOP_MAC_DINH,
  khoiTaoQuyTrinhHoSo,
  laNguoiGiuBuocHienTai
};
