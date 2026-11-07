const { randomUUID } = require('node:crypto');
const { kiemTraNgay, kiemTraPhanBoUnc, duyetPhieuUnc } = require('./chiTietDonHang');

function kiemTraTepUnc(duLieu) {
  if (typeof duLieu !== 'string') throw new Error('Dữ liệu tệp UNC không hợp lệ.');
  const khop = /^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(duLieu);
  if (!khop || khop[2].length % 4 !== 0) throw new Error('Dữ liệu tệp UNC không hợp lệ.');
  if (Buffer.byteLength(khop[2], 'base64') > 3 * 1024 * 1024) throw new Error('Tệp UNC không được vượt quá 3MB.');
  if (Buffer.from(khop[2], 'base64').toString('base64') !== khop[2]) throw new Error('Dữ liệu tệp UNC không hợp lệ.');
}

function kiemTraDanhSach(phieu) {
  if (!Array.isArray(phieu)) throw new Error('Danh sách phiếu UNC không hợp lệ.');
  const maDaDung = new Set();
  phieu.forEach(item => {
    if (!item || typeof item.maPhieu !== 'string' || !item.maPhieu.trim() || item.maPhieu !== item.maPhieu.trim() || maDaDung.has(item.maPhieu)) {
      throw new Error('Mã phiếu UNC không hợp lệ hoặc bị trùng.');
    }
    if (!['Chờ Duyệt', 'Đã Duyệt', 'Từ Chối'].includes(item.trangThai)) throw new Error('Trạng thái phiếu UNC không hợp lệ.');
    maDaDung.add(item.maPhieu);
  });
}

function taoPhieuUnc(danhSach, thongTin) {
  if (!Array.isArray(danhSach) || !danhSach.length) throw new Error('Đơn hàng phải có ít nhất một sản phẩm.');
  if (!thongTin || typeof thongTin !== 'object' || Array.isArray(thongTin)) throw new Error('Thông tin phiếu UNC không hợp lệ.');
  if (!kiemTraNgay(thongTin.ngay)) throw new Error('Ngày thanh toán UNC không hợp lệ.');
  if (thongTin.ghiChu !== undefined && (typeof thongTin.ghiChu !== 'string' || thongTin.ghiChu.trim().length > 1000)) {
    throw new Error('Ghi chú UNC không hợp lệ.');
  }
  let tep;
  if (thongTin.tep !== undefined && thongTin.tep !== null) {
    if (!thongTin.tep || typeof thongTin.tep !== 'object' || Array.isArray(thongTin.tep)
        || typeof thongTin.tep.ten !== 'string' || !thongTin.tep.ten.trim() || thongTin.tep.ten.trim().length > 255
        || typeof thongTin.tep.duLieu !== 'string') throw new Error('Tệp UNC không hợp lệ.');
    kiemTraTepUnc(thongTin.tep.duLieu);
    tep = { ten: thongTin.tep.ten.trim(), duLieu: thongTin.tep.duLieu };
  }
  const { phanBo, chuaPhanBo } = kiemTraPhanBoUnc(thongTin.soTien, thongTin.phanBo, danhSach.map(dong => dong && dong.maDong));
  if (!phanBo.length) throw new Error('Vui lòng chọn ít nhất một dòng sản phẩm và nhập số tiền thanh toán.');
  return {
    maPhieu: randomUUID(),
    soTien: thongTin.soTien,
    ngay: thongTin.ngay,
    ghiChu: (thongTin.ghiChu || '').trim(),
    ...(tep ? { tep } : {}),
    phanBo,
    chuaPhanBo,
    trangThai: 'Chờ Duyệt',
    lyDoTuChoi: ''
  };
}

function xuLyPhieuUnc(danhSach, phieu, maPhieu, trangThai, lyDoTuChoi = '') {
  kiemTraDanhSach(phieu);
  if (typeof maPhieu !== 'string' || !maPhieu.trim()) throw new Error('Mã phiếu UNC không hợp lệ.');
  const viTri = phieu.findIndex(item => item.maPhieu === maPhieu);
  if (viTri < 0) throw new Error('Không tìm thấy phiếu UNC.');
  if (phieu[viTri].trangThai !== 'Chờ Duyệt') throw new Error('Chỉ xử lý phiếu UNC đang chờ duyệt.');
  if (!['Đã Duyệt', 'Từ Chối'].includes(trangThai)) throw new Error('Trạng thái xử lý UNC không hợp lệ.');
  if (typeof lyDoTuChoi !== 'string' || lyDoTuChoi.trim().length > 500) throw new Error('Lý do từ chối UNC không hợp lệ.');
  if (trangThai === 'Từ Chối' && !lyDoTuChoi.trim()) throw new Error('Vui lòng nhập lý do từ chối UNC.');
  const ketQua = trangThai === 'Đã Duyệt'
    ? duyetPhieuUnc(danhSach, phieu[viTri])
    : { chiTietSanPham: danhSach, phieu: { ...phieu[viTri], trangThai, lyDoTuChoi: lyDoTuChoi.trim() } };
  return {
    chiTietSanPham: ketQua.chiTietSanPham,
    phieuUnc: phieu.map((item, index) => index === viTri ? ketQua.phieu : item)
  };
}

function tongUncDaDuyet(phieu) {
  kiemTraDanhSach(phieu);
  return phieu.reduce((tong, item) => {
    if (item.trangThai !== 'Đã Duyệt') return tong;
    if (!Number.isSafeInteger(item.soTien) || item.soTien <= 0 || !kiemTraNgay(item.ngay)) throw new Error('Phiếu UNC đã duyệt không hợp lệ.');
    const giaTri = (tong[item.ngay] || 0) + item.soTien;
    if (!Number.isSafeInteger(giaTri)) throw new Error('Tổng UNC vượt giới hạn cho phép.');
    tong[item.ngay] = giaTri;
    return tong;
  }, {});
}

module.exports = { kiemTraDanhSach, kiemTraTepUnc, taoPhieuUnc, xuLyPhieuUnc, tongUncDaDuyet };
