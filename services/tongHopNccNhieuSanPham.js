const { TRANG_THAI_KICH_HOAT } = require('./chiTietDonHang');
const { dongDaKichHoat } = require('./tongHopChiTietDonHang');

function dieuKienDonCoSanPhamKichHoat() {
  return { $or: [
    { chiTietSanPham: { $not: { $type: 'array' } }, 'TÌNH TRẠNG': TRANG_THAI_KICH_HOAT },
    { chiTietSanPham: { $elemMatch: { trangThai: TRANG_THAI_KICH_HOAT } } }
  ] };
}

function taoCacBuocDongNcc(chiPhiCu, doanhThuCu) {
  return [
    { $addFields: { laDonNhieuSanPham: { $isArray: '$chiTietSanPham' }, dongNcc: {
      $cond: [
        { $isArray: '$chiTietSanPham' },
        { $map: { input: dongDaKichHoat(), as: 'dong', in: {
          maDong: '$$dong.maDong',
          ncc: '$$dong.ncc',
          tenSanPham: '$$dong.tenSanPham',
          hinhThuc: '$$dong.hinhThuc',
          soLuong: '$$dong.soLuong',
          chiPhi: { $multiply: ['$$dong.giaNoNcc', '$$dong.soLuong'] },
          chiPhiCongTy: { $multiply: ['$$dong.giaDongCongTy', '$$dong.soLuong'] },
          doanhThu: { $multiply: ['$$dong.giaBan', '$$dong.soLuong'] }
        } } },
        [{ maDong: '', ncc: { $ifNull: ['$NCC', 'Khác'] }, tenSanPham: '$Gói ', hinhThuc: '$Hình Thức', soLuong: 1, chiPhi: chiPhiCu, chiPhiCongTy: '$Thực Đóng Công Ty', doanhThu: doanhThuCu }]
      ]
    } } },
    { $unwind: '$dongNcc' },
    { $addFields: {
      NCC: '$dongNcc.ncc',
      'Gói ': '$dongNcc.tenSanPham',
      'Hình Thức': '$dongNcc.hinhThuc',
      'Thực Đóng Công Ty': '$dongNcc.chiPhiCongTy',
      supplierCost: '$dongNcc.chiPhi',
      revenue: '$dongNcc.doanhThu'
    } }
  ];
}

module.exports = { dieuKienDonCoSanPhamKichHoat, taoCacBuocDongNcc };
