const { randomUUID } = require('node:crypto');

const TRANG_THAI_KICH_HOAT = /^(?!.*chưa\s+kích\s+hoạt).*kích\s+hoạt/i;

function kiemTraChuoi(giaTri, tenTruong) {
  if (typeof giaTri !== 'string' || !giaTri.trim()) {
    throw new Error(`${tenTruong} không hợp lệ.`);
  }
  const ketQua = giaTri.trim();
  if (ketQua.length > 200) throw new Error(`${tenTruong} vượt quá 200 ký tự.`);
  return ketQua;
}

function kiemTraSoTien(giaTri, tenTruong) {
  if (!Number.isSafeInteger(giaTri) || giaTri < 0) {
    throw new Error(`${tenTruong} phải là số nguyên không âm hợp lệ.`);
  }
  return giaTri;
}

function congTien(a, b) {
  const ketQua = a + b;
  if (!Number.isSafeInteger(ketQua)) throw new Error('Tổng tiền vượt giới hạn cho phép.');
  return ketQua;
}

function nhanTien(soTien, soLuong) {
  const ketQua = soTien * soLuong;
  if (!Number.isSafeInteger(ketQua)) throw new Error('Thành tiền vượt giới hạn cho phép.');
  return ketQua;
}

function kiemTraNgay(ngay) {
  if (typeof ngay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return false;
  const date = new Date(`${ngay}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === ngay;
}

function kiemTraPhanBoUnc(soTienUnc, phanBo, danhSachMaDong) {
  kiemTraSoTien(soTienUnc, 'Số tiền UNC');
  if (!soTienUnc) throw new Error('Số tiền UNC phải lớn hơn 0.');
  if (!Array.isArray(phanBo)) throw new Error('Phân bổ UNC phải là danh sách.');
  if (!Array.isArray(danhSachMaDong) || !danhSachMaDong.length) throw new Error('Đơn hàng phải có mã dòng sản phẩm.');
  const maHopLe = new Set();
  danhSachMaDong.forEach(ma => {
    const maDong = kiemTraChuoi(ma, 'Mã dòng sản phẩm');
    if (maHopLe.has(maDong)) throw new Error('Mã dòng sản phẩm bị trùng.');
    maHopLe.add(maDong);
  });
  const maDaPhanBo = new Set();
  let tongPhanBo = 0;
  const danhSachPhanBo = phanBo.map((muc, index) => {
    if (!muc || typeof muc !== 'object' || Array.isArray(muc)) throw new Error(`Phân bổ UNC ${index + 1} không hợp lệ.`);
    const maDong = kiemTraChuoi(muc.maDong, `Phân bổ UNC ${index + 1}: mã dòng`);
    if (!maHopLe.has(maDong)) throw new Error(`Phân bổ UNC ${index + 1}: không tìm thấy dòng sản phẩm.`);
    if (maDaPhanBo.has(maDong)) throw new Error(`Phân bổ UNC ${index + 1}: mã dòng bị trùng.`);
    maDaPhanBo.add(maDong);
    const soTien = kiemTraSoTien(muc.soTien, `Phân bổ UNC ${index + 1}: số tiền`);
    if (!soTien) throw new Error(`Phân bổ UNC ${index + 1}: số tiền phải lớn hơn 0.`);
    tongPhanBo = congTien(tongPhanBo, soTien);
    if (tongPhanBo > soTienUnc) throw new Error('Tổng phân bổ vượt số tiền UNC.');
    return { maDong, soTien };
  });
  return { phanBo: danhSachPhanBo, tongPhanBo, chuaPhanBo: soTienUnc - tongPhanBo };
}

function duyetPhieuUnc(danhSach, phieu) {
  if (!Array.isArray(danhSach) || !danhSach.length) throw new Error('Đơn hàng phải có ít nhất một sản phẩm.');
  if (!phieu || typeof phieu !== 'object' || Array.isArray(phieu)) throw new Error('Phiếu UNC không hợp lệ.');
  const maPhieu = kiemTraChuoi(phieu.maPhieu, 'Mã phiếu UNC');
  if (phieu.trangThai !== 'Chờ Duyệt') throw new Error('Chỉ duyệt phiếu UNC đang chờ duyệt.');
  if (!kiemTraNgay(phieu.ngay)) throw new Error('Ngày thanh toán UNC không hợp lệ.');
  danhSach.forEach((dong, index) => {
    tinhDong(dong, index);
    if (dong.thanhToanKhach.some(lan => lan.maPhieuUnc === maPhieu)) {
      throw new Error('Phiếu UNC đã được ghi nhận thanh toán.');
    }
  });
  const { phanBo, chuaPhanBo } = kiemTraPhanBoUnc(phieu.soTien, phieu.phanBo, danhSach.map(dong => dong.maDong));
  const tienTheoDong = new Map(phanBo.map(muc => [muc.maDong, muc.soTien]));
  const chiTiet = danhSach.map(dong => {
    const soTien = tienTheoDong.get(dong.maDong.trim());
    return soTien === undefined ? { ...dong, thanhToanKhach: dong.thanhToanKhach.map(lan => ({ ...lan })) } : {
      ...dong,
      thanhToanKhach: [...dong.thanhToanKhach.map(lan => ({ ...lan })), { ngay: phieu.ngay, soTien, maPhieuUnc: maPhieu }]
    };
  });
  tinhTongChiTiet(chiTiet);
  return { chiTietSanPham: chiTiet, phieu: { ...phieu, maPhieu, phanBo, chuaPhanBo, trangThai: 'Đã Duyệt' } };
}

function tinhThanhToan(danhSach, tenTruong) {
  if (!Array.isArray(danhSach)) throw new Error(`${tenTruong} phải là danh sách thanh toán.`);
  return danhSach.reduce((tong, lanThanhToan, index) => {
    if (!lanThanhToan || typeof lanThanhToan !== 'object' || !kiemTraNgay(lanThanhToan.ngay)) {
      throw new Error(`${tenTruong}: ngày thanh toán dòng ${index + 1} không hợp lệ.`);
    }
    const soTien = kiemTraSoTien(lanThanhToan.soTien, `${tenTruong}: số tiền dòng ${index + 1}`);
    if (!soTien) throw new Error(`${tenTruong}: số tiền thanh toán phải lớn hơn 0.`);
    return congTien(tong, soTien);
  }, 0);
}

function tinhDong(dong, index) {
  if (!dong || typeof dong !== 'object' || Array.isArray(dong)) throw new Error(`Sản phẩm ${index + 1} không hợp lệ.`);
  if (!Number.isSafeInteger(dong.soLuong) || dong.soLuong < 1) throw new Error(`Sản phẩm ${index + 1}: số lượng phải là số nguyên dương.`);
  if (typeof dong.trangThai !== 'string' || !dong.trangThai.trim()) throw new Error(`Sản phẩm ${index + 1}: thiếu trạng thái.`);
  const giaBan = kiemTraSoTien(dong.giaBan, `Sản phẩm ${index + 1}: giá bán`);
  const giaDongCongTy = kiemTraSoTien(dong.giaDongCongTy, `Sản phẩm ${index + 1}: thực đóng công ty`);
  const giaNoNcc = kiemTraSoTien(dong.giaNoNcc, `Sản phẩm ${index + 1}: công nợ NCC`);
  if (dong.phaiThuKhach === null) throw new Error(`Sản phẩm ${index + 1}: phải thu khách chưa xác định, không thể tính công nợ.`);
  const phaiThuKhach = kiemTraSoTien(dong.phaiThuKhach, `Sản phẩm ${index + 1}: phải thu khách`);
  return {
    thanhTien: nhanTien(giaBan, dong.soLuong),
    thucDongCongTy: nhanTien(giaDongCongTy, dong.soLuong),
    congNoNcc: nhanTien(giaNoNcc, dong.soLuong),
    phaiThuKhach,
    khachDaThanhToan: tinhThanhToan(dong.thanhToanKhach, `Sản phẩm ${index + 1}: khách thanh toán`),
    daThanhToanNcc: tinhThanhToan(dong.thanhToanNcc, `Sản phẩm ${index + 1}: thanh toán NCC`),
    kichHoat: TRANG_THAI_KICH_HOAT.test(dong.trangThai.trim())
  };
}

function chuanHoaChiTiet(danhSach) {
  if (!Array.isArray(danhSach) || !danhSach.length) throw new Error('Đơn hàng phải có ít nhất một sản phẩm.');
  const maDaDung = new Set();
  const ketQua = danhSach.map((dong, index) => {
    const phaiThuKhach = dong && dong.phaiThuKhach == null ? 0 : dong?.phaiThuKhach;
    tinhDong(dong && !Array.isArray(dong) ? { ...dong, phaiThuKhach } : dong, index);
    const ten = `Sản phẩm ${index + 1}`;
    const maDong = dong.maDong === undefined ? randomUUID() : kiemTraChuoi(dong.maDong, `${ten}: mã dòng`);
    if (maDaDung.has(maDong)) throw new Error(`${ten}: mã dòng bị trùng.`);
    maDaDung.add(maDong);
    const saoChepThanhToan = (danhSachThanhToan, laNcc) => danhSachThanhToan.map((lan, viTri) => ({
      ngay: lan.ngay,
      soTien: lan.soTien,
      ...(laNcc ? { maPhieu: kiemTraChuoi(lan.maPhieu, `${ten}: mã phiếu NCC lần ${viTri + 1}`) }
        : lan.maPhieuUnc !== undefined ? { maPhieuUnc: kiemTraChuoi(lan.maPhieuUnc, `${ten}: mã phiếu UNC lần ${viTri + 1}`) } : {})
    }));
    if (dong.donViTinh !== undefined && (typeof dong.donViTinh !== 'string' || dong.donViTinh.trim().length > 200)) {
      throw new Error(`${ten}: đơn vị tính không hợp lệ.`);
    }
    return {
      maDong,
      maSanPham: kiemTraChuoi(dong.maSanPham, `${ten}: mã sản phẩm`),
      tenSanPham: kiemTraChuoi(dong.tenSanPham, `${ten}: tên sản phẩm`),
      loaiSanPham: kiemTraChuoi(dong.loaiSanPham, `${ten}: loại sản phẩm`),
      ncc: kiemTraChuoi(dong.ncc, `${ten}: nhà cung cấp`),
      hinhThuc: kiemTraChuoi(dong.hinhThuc, `${ten}: hình thức`),
      donViTinh: dong.donViTinh === undefined ? '' : dong.donViTinh.trim(),
      trangThai: kiemTraChuoi(dong.trangThai, `${ten}: trạng thái`),
      soLuong: dong.soLuong,
      giaBan: dong.giaBan,
      giaDongCongTy: dong.giaDongCongTy,
      giaNoNcc: dong.giaNoNcc,
      phaiThuKhach,
      thanhToanKhach: saoChepThanhToan(dong.thanhToanKhach, false),
      thanhToanNcc: saoChepThanhToan(dong.thanhToanNcc, true)
    };
  });
  tinhTongChiTiet(ketQua);
  return ketQua;
}

function tinhTongChiTiet(danhSach) {
  if (!Array.isArray(danhSach) || !danhSach.length) throw new Error('Đơn hàng phải có ít nhất một sản phẩm.');
  const ketQua = {
    tatCa: { thanhTien: 0, thucDongCongTy: 0, congNoNcc: 0, phaiThuKhach: 0, khachDaThanhToan: 0, daThanhToanNcc: 0 },
    daKichHoat: { thanhTien: 0, thucDongCongTy: 0, congNoNcc: 0, phaiThuKhach: 0, khachDaThanhToan: 0, daThanhToanNcc: 0 }
  };
  danhSach.forEach((dong, index) => {
    const giaTri = tinhDong(dong, index);
    Object.keys(ketQua.tatCa).forEach(truong => {
      ketQua.tatCa[truong] = congTien(ketQua.tatCa[truong], giaTri[truong]);
      if (giaTri.kichHoat) ketQua.daKichHoat[truong] = congTien(ketQua.daKichHoat[truong], giaTri[truong]);
    });
  });
  return ketQua;
}

function tinhCongNoNcc(danhSach, dieuChinh = {}) {
  if (!Array.isArray(danhSach) || !danhSach.length) throw new Error('Đơn hàng phải có ít nhất một sản phẩm.');
  const ketQua = new Map();
  danhSach.forEach((dong, index) => {
    const giaTri = tinhDong(dong, index);
    if (!giaTri.kichHoat) return;
    if (typeof dong.ncc !== 'string' || !dong.ncc.trim()) throw new Error(`Sản phẩm ${index + 1}: thiếu nhà cung cấp.`);
    const ncc = dong.ncc.trim();
    const dongMoi = typeof dong.hinhThuc === 'string' && /đăng ký mới/i.test(dong.hinhThuc);
    const maNcc = ncc.toUpperCase().replace(/ /g, '');
    const tokenMotSanPham = dongMoi ? ({ 'VINA-GS': 250000, 'ONE-CA': 169000 }[maNcc] || 0) : 0;
    const tong = ketQua.get(ncc) || { ncc, soDong: 0, soLuong: 0, congNo: 0, token: 0 };
    tong.soDong += 1;
    tong.soLuong = congTien(tong.soLuong, dong.soLuong);
    tong.congNo = congTien(tong.congNo, giaTri.congNoNcc);
    tong.token = congTien(tong.token, nhanTien(tokenMotSanPham, dong.soLuong));
    ketQua.set(ncc, tong);
  });
  return [...ketQua.values()].map(tong => {
    const chiPhi = dieuChinh[tong.ncc] || {};
    const phiHoSo = kiemTraSoTien(chiPhi.phiHoSo ?? 0, `${tong.ncc}: phí hồ sơ`);
    const dsQuy = kiemTraSoTien(chiPhi.dsQuy ?? 0, `${tong.ncc}: DS quý`);
    const daThanhToan = kiemTraSoTien(chiPhi.daThanhToan, `${tong.ncc}: tổng phiếu thanh toán`);
    const khoanTru = [tong.token, daThanhToan, phiHoSo, dsQuy].reduce(congTien, 0);
    return { ...tong, daThanhToan, phiHoSo, dsQuy, conLai: Math.max(0, tong.congNo - khoanTru) };
  });
}

function tinhCongNoKhach(danhSach) {
  const tong = tinhTongChiTiet(danhSach).daKichHoat;
  return {
    phaiThu: tong.phaiThuKhach,
    daThanhToan: tong.khachDaThanhToan,
    conLai: Math.max(0, tong.phaiThuKhach - tong.khachDaThanhToan)
  };
}

function tongThanhToanKhachTheoThang(danhSach) {
  if (!Array.isArray(danhSach) || !danhSach.length) throw new Error('Đơn hàng phải có ít nhất một sản phẩm.');
  const tongTheoThang = new Map();
  danhSach.forEach((dong, index) => {
    if (!tinhDong(dong, index).kichHoat) return;
    dong.thanhToanKhach.forEach(lan => {
      const thang = lan.ngay.slice(0, 7);
      tongTheoThang.set(thang, congTien(tongTheoThang.get(thang) || 0, lan.soTien));
    });
  });
  return Object.fromEntries([...tongTheoThang.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

module.exports = { TRANG_THAI_KICH_HOAT, chuanHoaChiTiet, tinhDong, tinhTongChiTiet, tinhCongNoNcc, tinhCongNoKhach, tongThanhToanKhachTheoThang, kiemTraNgay, kiemTraPhanBoUnc, duyetPhieuUnc };
