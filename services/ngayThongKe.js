function ngayHienTaiVietNam(thoiDiem = new Date()) {
  const ngay = new Date(thoiDiem.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(ngay.getUTCFullYear(), ngay.getUTCMonth(), ngay.getUTCDate()));
}

module.exports = { ngayHienTaiVietNam };
