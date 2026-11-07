const mongoose = require('mongoose');
const { chuanHoaChiTiet, tinhTongChiTiet } = require('./chiTietDonHang');
const { cacTrangThai, layGiaDanhMuc, layThongTinDanhMuc } = require('../public/js/chi-tiet-san-pham-tao-don');

async function chuanBiDonNhieuSanPham(SanPham, danhSach) {
  if (!Array.isArray(danhSach) || !danhSach.length || danhSach.length > 100) {
    throw new Error('Đơn hàng cần từ 1 đến 100 dòng sản phẩm.');
  }
  const ids = danhSach.map(dong => {
    if (!dong || typeof dong !== 'object' || Array.isArray(dong) || typeof dong.maSanPham !== 'string'
        || !mongoose.isValidObjectId(dong.maSanPham)) throw new Error('Mã sản phẩm không hợp lệ.');
    if (dong.maDong !== undefined || !Array.isArray(dong.thanhToanNcc) || dong.thanhToanNcc.length
        || !Array.isArray(dong.thanhToanKhach) || dong.thanhToanKhach.some(lan => lan && lan.maPhieuUnc !== undefined)) {
      throw new Error('Thông tin phiếu hoặc mã dòng không hợp lệ khi tạo đơn.');
    }
    return new mongoose.Types.ObjectId(dong.maSanPham);
  });
  const sanPham = await SanPham.find({ _id: { $in: ids } }).select({
    'TÊN SẢN PHẨM': 1, 'Tên Sản Phẩm': 1, 'Gói ': 1, Gói: 1,
    'LOẠI SẢN PHẨM': 1, 'Loại Sản Phẩm': 1, NCC: 1, 'HÌnh Thức': 1, 'Hình Thức': 1,
    'GIÁ SAU THUẾ': 1, 'SAU THUẾ': 1, 'Giá Sau Thuế': 1, 'Gia Sau Thuế': 1, 'Gia Sau Thue': 1,
    'THỰC ĐÓNG CÔNG TY': 1, 'Thực Đóng Công Ty': 1, 'Thực Đóng Cty': 1,
    'THỰC CÔNG NỢ CTY': 1, 'THỰC CÔNG NỢ CTY (VNĐ)': 1
  }).maxTimeMS(10000).lean();
  const theoMa = new Map(sanPham.map(item => [String(item._id), item]));
  const chiTiet = danhSach.map(dong => {
    const goi = theoMa.get(dong.maSanPham.toLowerCase());
    if (!goi) throw new Error('Không tìm thấy sản phẩm trong danh mục.');
    const tenSanPham = goi['TÊN SẢN PHẨM'] || goi['Tên Sản Phẩm'] || goi['Gói '] || goi.Gói || 'Gói cước';
    const thongTin = { tenSanPham, ...layThongTinDanhMuc(goi), ...layGiaDanhMuc(goi) };
    for (const [truong, giaTri] of Object.entries(thongTin)) {
      if (dong[truong] !== giaTri) throw new Error('Thông tin hoặc giá sản phẩm đã thay đổi. Vui lòng chọn lại gói.');
    }
    if (!cacTrangThai.includes(dong.trangThai)) throw new Error('Trạng thái sản phẩm không hợp lệ.');
    return { ...dong, maSanPham: String(goi._id), ...thongTin };
  });
  const chuanHoa = chuanHoaChiTiet(chiTiet);
  return { chiTietSanPham: chuanHoa, tong: tinhTongChiTiet(chuanHoa) };
}

module.exports = { chuanBiDonNhieuSanPham };
