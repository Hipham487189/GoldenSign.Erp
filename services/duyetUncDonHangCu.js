function loiTrangThai(message, statusCode) {
  const loi = new Error(message);
  loi.statusCode = statusCode;
  return loi;
}

function dieuKienPhienBan(don, truong) {
  return don[truong] === undefined ? { [truong]: { $exists: false } } : { [truong]: don[truong] };
}

function tinhThanhToanSauDuyet(don) {
  const soTienUnc = Number(don['Số Tiền UNC']);
  const daThanhToan = Number(don['KH Thanh Toán'] ?? 0);
  const thucThu = Number(don['Thực Thu'] ?? 0);
  if (!Number.isFinite(soTienUnc) || soTienUnc <= 0 || !Number.isFinite(daThanhToan) || !Number.isFinite(thucThu)) {
    throw loiTrangThai('Dữ liệu thanh toán không hợp lệ; vui lòng kiểm tra đơn hàng.', 409);
  }
  const tongDaThanhToan = daThanhToan + soTienUnc;
  if (!Number.isFinite(tongDaThanhToan)) throw loiTrangThai('Tổng thanh toán vượt giới hạn cho phép.', 409);
  return {
    'KH Thanh Toán': tongDaThanhToan,
    'Còn lại': Math.max(0, thucThu - tongDaThanhToan)
  };
}

async function luuKetQuaUncDonHangCu(Order, don, trangThai, lyDoTuChoi) {
  if (don['Trạng Thái UNC'] === 'Đã Duyệt') {
    throw loiTrangThai('Phiếu UNC đã được duyệt và không thể xử lý lại.', 409);
  }
  const capNhat = {
    'Trạng Thái UNC': trangThai,
    'Ghi Chú Từ Chối UNC': trangThai === 'Từ Chối' ? lyDoTuChoi : ''
  };
  if (trangThai === 'Đã Duyệt') Object.assign(capNhat, tinhThanhToanSauDuyet(don));

  const dieuKien = [
    { _id: don._id },
    { 'Số Tiền UNC': don['Số Tiền UNC'] },
    ...['Trạng Thái UNC', 'KH Thanh Toán', 'Thực Thu', 'Còn lại'].map(truong => dieuKienPhienBan(don, truong))
  ];
  return Order.findOneAndUpdate({ $and: dieuKien }, { $set: capNhat }, { new: true });
}

module.exports = { luuKetQuaUncDonHangCu };
