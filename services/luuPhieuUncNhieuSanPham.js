const { kiemTraDanhSach, taoPhieuUnc, xuLyPhieuUnc } = require('./quanLyPhieuUncNhieuSanPham');
const { luuTepUnc, xoaTepUnc } = require('./tepUncMongo');
const { tinhTongChiTiet } = require('./chiTietDonHang');

function loiTrangThai(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function xuLyDuLieu(ham) {
  try { return ham(); }
  catch (loi) { loi.statusCode = 400; throw loi; }
}

async function docDon(Order, boLoc) {
  const don = await Order.findOne(boLoc).select({
    chiTietSanPham: 1, phieuUnc: 1, 'Số Tiền UNC': 1, 'KH Thanh Toán': 1, 'Còn lại': 1
  }).lean();
  if (!don) throw loiTrangThai('Không tìm thấy đơn hàng.', 404);
  if (!Array.isArray(don.chiTietSanPham) || !don.chiTietSanPham.length) {
    throw loiTrangThai('Đơn hàng không có chi tiết sản phẩm hợp lệ.', 400);
  }
  if (don.phieuUnc !== undefined && !Array.isArray(don.phieuUnc)) {
    throw loiTrangThai('Danh sách phiếu UNC của đơn không hợp lệ.', 409);
  }
  return don;
}

function dieuKienPhienBan(boLoc, don) {
  return {
    $and: [
      boLoc,
      { chiTietSanPham: don.chiTietSanPham },
      don.phieuUnc === undefined ? { phieuUnc: { $exists: false } } : { phieuUnc: don.phieuUnc },
      don['Số Tiền UNC'] === undefined ? { 'Số Tiền UNC': { $exists: false } } : { 'Số Tiền UNC': don['Số Tiền UNC'] },
      ...['KH Thanh Toán', 'Còn lại'].map(truong => don[truong] === undefined
        ? { [truong]: { $exists: false } } : { [truong]: don[truong] })
    ]
  };
}

async function ghiDon(Order, boLoc, don, capNhat) {
  const ketQua = await Order.findOneAndUpdate(dieuKienPhienBan(boLoc, don), { $set: capNhat }, { new: true, projection: { _id: 1 } }).lean();
  if (!ketQua) throw loiTrangThai('Đơn hoặc phiếu UNC đã thay đổi. Vui lòng tải lại và thử lại.', 409);
}

async function luuPhieuUnc(Order, boLoc, thongTin) {
  const don = await docDon(Order, boLoc);
  const phieu = xuLyDuLieu(() => {
    kiemTraDanhSach(don.phieuUnc || []);
    if ((don.phieuUnc || []).length + (Number(don['Số Tiền UNC']) > 0 ? 1 : 0) >= 5) {
      throw new Error('Mỗi đơn hàng chỉ được có tối đa 5 phiếu UNC.');
    }
    return taoPhieuUnc(don.chiTietSanPham, thongTin);
  });
  if (phieu.tep) phieu.tep = await luuTepUnc(Order, phieu.tep);
  const danhSach = [...(don.phieuUnc || []), phieu];
  try {
    await ghiDon(Order, boLoc, don, { phieuUnc: danhSach });
  } catch (loi) {
    if (phieu.tep?.maTep && loi.statusCode === 409) {
      try { await xoaTepUnc(Order, phieu.tep.maTep); }
      catch (loiXoa) { console.error('Không thể dọn tệp UNC sau lỗi lưu phiếu:', loiXoa.message); }
    } else if (phieu.tep?.maTep) {
      console.error('Chưa xác định kết quả lưu phiếu UNC; giữ tệp để đối chiếu:', String(phieu.tep.maTep));
    }
    throw loi;
  }
  const { tep, ...ketQua } = phieu;
  return { ...ketQua, coTep: Boolean(tep) };
}

async function luuKetQuaDuyetUnc(Order, boLoc, maPhieu, trangThai, lyDoTuChoi) {
  const don = await docDon(Order, boLoc);
  const ketQua = xuLyDuLieu(() => xuLyPhieuUnc(don.chiTietSanPham, don.phieuUnc || [], maPhieu, trangThai, lyDoTuChoi));
  if (trangThai === 'Đã Duyệt') {
    const tong = tinhTongChiTiet(ketQua.chiTietSanPham).tatCa;
    ketQua['KH Thanh Toán'] = tong.khachDaThanhToan;
    ketQua['Còn lại'] = Math.max(0, tong.phaiThuKhach - tong.khachDaThanhToan);
  }
  await ghiDon(Order, boLoc, don, ketQua);
  const phieu = ketQua.phieuUnc.find(item => item.maPhieu === maPhieu);
  const { tep, ...anTep } = phieu;
  return { ...anTep, coTep: Boolean(tep) };
}

module.exports = { luuPhieuUnc, luuKetQuaDuyetUnc };
