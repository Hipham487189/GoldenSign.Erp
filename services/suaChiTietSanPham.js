const mongoose = require('mongoose');
const { tinhTongChiTiet } = require('./chiTietDonHang');
const { cacTrangThai, layGiaDanhMuc, layThongTinDanhMuc } = require('../public/js/chi-tiet-san-pham-tao-don');

async function chuanBiSuaChiTiet(don, dauVao, SanPham) {
  const { maDong, phienBan, maSanPham, soLuong, donViTinh, trangThai, phaiThuKhach } = dauVao || {};
  const loi = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
  if (typeof maDong !== 'string' || !maDong || !mongoose.isValidObjectId(maSanPham)
      || !Number.isSafeInteger(soLuong) || soLuong < 1 || !Number.isSafeInteger(phaiThuKhach) || phaiThuKhach < 0
      || typeof donViTinh !== 'string' || donViTinh.trim().length > 200
      || !cacTrangThai.includes(trangThai)
      || !phienBan || typeof phienBan !== 'object') throw loi('Thông tin sản phẩm không hợp lệ.');
  if (!Array.isArray(don.chiTietSanPham)) throw loi('Đơn không có chi tiết sản phẩm.', 409);
  const viTri = don.chiTietSanPham.findIndex(dong => dong.maDong === maDong);
  if (viTri < 0 || don.chiTietSanPham.filter(dong => dong.maDong === maDong).length !== 1) throw loi('Dòng sản phẩm đã thay đổi. Vui lòng tải lại.', 409);
  const cu = don.chiTietSanPham[viTri];
  if (['maSanPham', 'tenSanPham', 'loaiSanPham', 'ncc', 'hinhThuc', 'soLuong', 'donViTinh', 'trangThai', 'phaiThuKhach', 'giaBan', 'giaDongCongTy', 'giaNoNcc', 'thanhToanKhach', 'thanhToanNcc']
    .some(key => JSON.stringify(cu[key]) !== JSON.stringify(phienBan[key]))) {
    throw loi('Dòng sản phẩm đã thay đổi. Vui lòng tải lại.', 409);
  }
  const moi = { ...cu, soLuong, donViTinh: donViTinh.trim(), trangThai, phaiThuKhach };
  if (maSanPham !== cu.maSanPham) {
    if (!Array.isArray(cu.thanhToanKhach) || !Array.isArray(cu.thanhToanNcc)) throw loi('Lịch sử thanh toán không hợp lệ.', 409);
    if (cu.thanhToanKhach.length || cu.thanhToanNcc.length) throw loi('Sản phẩm đã có thanh toán, không thể đổi gói.', 409);
    if (don.phieuUnc !== undefined && !Array.isArray(don.phieuUnc)) throw loi('Danh sách phiếu UNC không hợp lệ.', 409);
    if ((don.phieuUnc || []).some(phieu => phieu.trangThai === 'Chờ Duyệt' && Array.isArray(phieu.phanBo) && phieu.phanBo.some(item => item.maDong === maDong))) {
      throw loi('Sản phẩm có UNC chờ duyệt, không thể đổi gói.', 409);
    }
    const goi = await SanPham.findById(maSanPham).select({
      'TÊN SẢN PHẨM': 1, 'Tên Sản Phẩm': 1, 'Gói ': 1, Gói: 1,
      'LOẠI SẢN PHẨM': 1, 'Loại Sản Phẩm': 1, NCC: 1, 'HÌnh Thức': 1, 'Hình Thức': 1,
      'GIÁ SAU THUẾ': 1, 'SAU THUẾ': 1, 'Giá Sau Thuế': 1, 'Gia Sau Thuế': 1, 'Gia Sau Thue': 1,
      'THỰC ĐÓNG CÔNG TY': 1, 'Thực Đóng Công Ty': 1, 'Thực Đóng Cty': 1,
      'THỰC CÔNG NỢ CTY': 1, 'THỰC CÔNG NỢ CTY (VNĐ)': 1
    }).maxTimeMS(10000).lean();
    if (!goi) throw loi('Không tìm thấy gói sản phẩm.', 404);
    try {
      Object.assign(moi, {
        maSanPham: String(goi._id), tenSanPham: goi['TÊN SẢN PHẨM'] || goi['Tên Sản Phẩm'] || goi['Gói '] || goi.Gói || 'Gói cước',
        ...layThongTinDanhMuc(goi), ...layGiaDanhMuc(goi)
      });
    } catch (error) { throw loi(error.message); }
  }
  const chiTiet = don.chiTietSanPham.map((dong, i) => i === viTri ? moi : dong);
  const tong = tinhTongChiTiet(chiTiet).tatCa;
  if (!Number.isSafeInteger(don['KH Thanh Toán']) || don['KH Thanh Toán'] !== tong.khachDaThanhToan) {
    throw loi('Thanh toán tổng không khớp chi tiết. Vui lòng kiểm tra trước khi cập nhật.', 409);
  }
  return { cu, moi, chiTiet, tong };
}

module.exports = { chuanBiSuaChiTiet };
