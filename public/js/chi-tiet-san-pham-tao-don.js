(function () {
  const cacTrangThai = Object.freeze(['Soạn Hồ Sơ', 'Chưa Kích Hoạt', 'Đã Đăng Ký', 'Đang Xử Lý', 'Đã Duyệt', 'Đã Kích Hoạt', 'Hoàn Tất', 'Đã Thanh Toán', 'Từ Chối', 'Hủy']);
  function soNguyen(giaTri, ten, toiThieu = 0) {
    const chuoi = String(giaTri ?? '').trim();
    if (!/^\d+$/.test(chuoi)) throw new Error(`${ten} phải là số nguyên hợp lệ.`);
    const so = Number(chuoi);
    if (!Number.isSafeInteger(so) || so < toiThieu) throw new Error(`${ten} phải từ ${toiThieu} trở lên và trong giới hạn cho phép.`);
    return so;
  }

  function taoThanhToan(ngay, soTien) {
    const chuoiNgay = String(ngay ?? '').trim();
    const ngayKiemTra = new Date(`${chuoiNgay}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chuoiNgay) || Number.isNaN(ngayKiemTra.getTime()) || ngayKiemTra.toISOString().slice(0, 10) !== chuoiNgay) {
      throw new Error('Ngày khách thanh toán không hợp lệ.');
    }
    return { ngay: chuoiNgay, soTien: soNguyen(soTien, 'Số tiền khách thanh toán', 1) };
  }

  function docGiaDanhMuc(giaTri, ten) {
    if (typeof giaTri === 'number') {
      if (!Number.isSafeInteger(giaTri) || giaTri < 0) throw new Error(`${ten} trong danh mục không hợp lệ.`);
      return giaTri;
    }
    if (typeof giaTri !== 'string') throw new Error(`${ten} trong danh mục bị thiếu.`);
    const chuoi = giaTri.trim();
    if (!chuoi) throw new Error(`${ten} trong danh mục bị thiếu.`);
    if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(chuoi)) throw new Error(`${ten} trong danh mục không hợp lệ.`);
    const gia = Number(chuoi.replace(/[.,]/g, ''));
    if (!Number.isSafeInteger(gia)) throw new Error(`${ten} trong danh mục vượt giới hạn cho phép.`);
    return gia;
  }

  function layGiaDongCongTy(sanPham) {
    return docGiaDanhMuc(sanPham['THỰC ĐÓNG CÔNG TY'] ?? sanPham['Thực Đóng Công Ty'] ?? sanPham['Thực Đóng Cty'], 'Thực đóng công ty');
  }

  function layGiaNoNcc(sanPham) {
    return docGiaDanhMuc(sanPham['THỰC CÔNG NỢ CTY'] ?? sanPham['THỰC CÔNG NỢ CTY (VNĐ)'], 'Công nợ NCC');
  }

  function layGiaDanhMuc(sanPham) {
    return {
      giaBan: docGiaDanhMuc(sanPham['GIÁ SAU THUẾ'] ?? sanPham['SAU THUẾ'] ?? sanPham['Giá Sau Thuế'] ?? sanPham['Gia Sau Thuế'] ?? sanPham['Gia Sau Thue'], 'Giá bán'),
      giaDongCongTy: layGiaDongCongTy(sanPham),
      giaNoNcc: layGiaNoNcc(sanPham)
    };
  }

  function layThongTinDanhMuc(sanPham) {
    function docTruong(cacTen, nhan) {
      for (const ten of cacTen) {
        const giaTri = sanPham[ten];
        if (typeof giaTri === 'string' && giaTri.trim()) return giaTri.trim();
      }
      throw new Error(`${nhan} trong danh mục bị thiếu hoặc không hợp lệ.`);
    }
    return {
      loaiSanPham: docTruong(['LOẠI SẢN PHẨM', 'Loại Sản Phẩm'], 'Loại sản phẩm'),
      ncc: docTruong(['NCC'], 'NCC'),
      hinhThuc: docTruong(['HÌnh Thức', 'Hình Thức'], 'Hình thức')
    };
  }

  function taoDong(dauVao) {
    const ten = String(dauVao.tenSanPham || '').trim();
    const ma = String(dauVao.maSanPham || '').trim();
    const ncc = String(dauVao.ncc || '').trim();
    const loai = String(dauVao.loaiSanPham || '').trim();
    const hinhThuc = String(dauVao.hinhThuc || '').trim();
    const trangThai = String(dauVao.trangThai || '').trim();
    const donViTinh = String(dauVao.donViTinh || '').trim();
    if (!ten || !ma || !ncc || !loai || !hinhThuc || !trangThai) throw new Error('Vui lòng chọn đầy đủ sản phẩm, NCC, hình thức và trạng thái.');
    if ([ten, ma, ncc, loai, hinhThuc, trangThai, donViTinh].some(chuoi => chuoi.length > 200)) throw new Error('Thông tin sản phẩm vượt quá 200 ký tự.');
    const soLuong = soNguyen(dauVao.soLuong, 'Số lượng', 1);
    const giaBan = soNguyen(dauVao.giaBan, 'Đơn giá');
    const giaDongCongTy = soNguyen(dauVao.giaDongCongTy, 'Thực đóng công ty');
    const giaNoNcc = soNguyen(dauVao.giaNoNcc, 'Công nợ NCC');
    const phaiThuKhach = String(dauVao.phaiThuKhach ?? '').trim() === ''
      ? 0
      : soNguyen(dauVao.phaiThuKhach, 'Phải thu khách');
    for (const gia of [giaBan, giaDongCongTy, giaNoNcc]) {
      if (!Number.isSafeInteger(gia * soLuong)) throw new Error('Thành tiền vượt giới hạn cho phép.');
    }
    const ngay = String(dauVao.ngayThanhToan || '').trim();
    const tien = String(dauVao.tienThanhToan ?? '').trim();
    const thanhToanKhach = [];
    if (ngay || tien) {
      thanhToanKhach.push(taoThanhToan(ngay, tien));
    }
    return { maSanPham: ma, tenSanPham: ten, loaiSanPham: loai, ncc, hinhThuc, donViTinh, trangThai, soLuong, giaBan, giaDongCongTy, giaNoNcc, phaiThuKhach, thanhToanKhach, thanhToanNcc: [] };
  }

  function tinhTong(danhSach) {
    return danhSach.reduce((tong, dong) => {
      for (const [truong, giaTri] of [
        ['thanhTien', dong.giaBan * dong.soLuong],
        ['phaiThuKhach', dong.phaiThuKhach],
        ['khachDaThanhToan', dong.thanhToanKhach.reduce((soTien, lan) => soTien + lan.soTien, 0)]
      ]) {
        tong[truong] += giaTri;
        if (!Number.isSafeInteger(tong[truong])) throw new Error('Tổng tiền vượt giới hạn cho phép.');
      }
      return tong;
    }, { thanhTien: 0, phaiThuKhach: 0, khachDaThanhToan: 0 });
  }

  function capNhatDong(dong, thayDoi) {
    const daKiemTra = taoDong({
      ...dong,
      soLuong: thayDoi.soLuong,
      phaiThuKhach: thayDoi.phaiThuKhach,
      trangThai: thayDoi.trangThai,
      ngayThanhToan: '',
      tienThanhToan: ''
    });
    return { ...dong, ...daKiemTra, thanhToanKhach: dong.thanhToanKhach, thanhToanNcc: dong.thanhToanNcc };
  }

  function doiGoi(dong, sanPham) {
    const daKiemTra = taoDong({ ...dong, ...sanPham, ngayThanhToan: '', tienThanhToan: '' });
    return { ...dong, ...daKiemTra, thanhToanKhach: dong.thanhToanKhach, thanhToanNcc: dong.thanhToanNcc };
  }

  const giaoDien = { cacTrangThai, taoDong, taoThanhToan, tinhTong, capNhatDong, layGiaDanhMuc, layGiaDongCongTy, layGiaNoNcc, layThongTinDanhMuc, doiGoi };
  if (typeof module !== 'undefined' && module.exports) module.exports = giaoDien;
  if (typeof window !== 'undefined') window.ChiTietSanPhamTaoDon = giaoDien;
})();
