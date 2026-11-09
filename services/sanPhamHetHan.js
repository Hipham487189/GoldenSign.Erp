function taoBoLocSanPhamHetHan(ngayHienTai = new Date()) {
  const nam = ngayHienTai.getFullYear();
  const thang = ngayHienTai.getMonth();
  const ngay = ngayHienTai.getDate();
  const ngayBatDau = new Date(nam, thang, ngay);
  const ngayISO = `${nam}-${String(thang + 1).padStart(2, '0')}-${String(ngay).padStart(2, '0')}`;
  const ngaySerialExcel = Math.floor((Date.UTC(nam, thang, ngay) - Date.UTC(1899, 11, 30)) / 86400000);
  const cacTenCot = [
    'Ngày kết thúc',
    'Ngày Kết Thúc',
    'NGÀY KẾT THÚC',
    'Ngày kết thúc ',
    ' NGÀY KẾT THÚC ',
    'Ngay ket thuc'
  ];

  return {
    $or: cacTenCot.flatMap(tenCot => [
      { [tenCot]: { $type: 'string', $regex: /^\d{4}-\d{2}-\d{2}/, $lt: ngayISO } },
      { [tenCot]: { $type: 'date', $lt: ngayBatDau } },
      { [tenCot]: { $type: 'number', $lt: ngaySerialExcel } }
    ])
  };
}

function taoBoLocSanPhamConApDung(ngayHienTai = new Date()) {
  return { $nor: [taoBoLocSanPhamHetHan(ngayHienTai)] };
}

module.exports = { taoBoLocSanPhamHetHan, taoBoLocSanPhamConApDung };
