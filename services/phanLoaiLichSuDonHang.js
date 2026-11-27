const NHOM_LICH_SU = ['tong', 'thanh_toan', 'kich_hoat', 'giao_nhan', 'ho_so'];

const NHAN_BUOC_GIAO_NHAN = {
  da_kich_hoat: 'Đã Kích Hoạt',
  dang_giao: 'Đang Trên Đường Giao',
  da_giao: 'Đã Giao'
};

const NHAN_BUOC_HO_SO = {
  khach_hang: 'Khách hàng',
  hi_nhan: 'Hi nhận',
  xu_ly_noi_bo: 'Xử lý nội bộ',
  nop_ncc: 'Nộp NCC'
};

const TRUONG_THANH_TOAN = new Set([
  'KH Thanh Toán', 'Còn lại', 'Thực Thu', 'Thành Tiền', 'Hình Thức Thanh Toán', 'Ngày KH thanh toán',
  'Số Tiền UNC', 'Ngày Thanh Toán UNC', 'Nội Dung UNC', 'Ảnh UNC', 'Tên File UNC', 'Ngày Upload UNC',
  'Trạng Thái UNC', 'Ghi Chú Từ Chối UNC', 'Thanh toán', 'QR chuyển khoản',
  'Thực Đóng Công Ty', 'Thực Đóng NCC', 'THỰC CÔNG NỢ CTY', 'Lợi Nhuận Dự Kiến'
]);

const TRUONG_GIAO_NHAN = new Set([
  'Tình  Trạng Giao Nhận', 'Tình Trạng Giao Nhận', 'Địa Chỉ Giao Nhận', 'Ghi Chú Giao Nhận',
  'Mã Vận Đơn', 'Đơn Vị Vận Chuyển', 'ĐƠN VỊ CPN', 'SỐ  BILL', 'Ngày Giao Nhận'
]);

const TRUONG_HO_SO = new Set([
  'Hợp Đồng / GDK', 'Xác Nhận/ BBBG', 'GPKD', 'CCCD', 'File tong', 'FILE ĐÍNH KÈM',
  'TÌNH TRẠNG HỒ SƠ', 'Hồ Sơ', 'Mã Hồ Sơ', 'Ngày Nhận Hồ Sơ', 'Ngày Nộp', 'Nơi Nộp'
]);

const TRUONG_KICH_HOAT = new Set([
  'TÌNH TRẠNG', 'Ngày Kích Hoạt', 'Ngày Hết Hạn', 'SmartSign MBMat',
  'Xuất Hóa Đơn', 'Hóa đơn', 'Quốc An Check', 'Tình Trạng Kích Hoạt'
]);

function chuanHoaChuoi(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function phanLoaiThayDoi(change = {}) {
  const fieldRaw = String(change.field || '').trim();
  const fieldNorm = chuanHoaChuoi(fieldRaw);
  const toNorm = chuanHoaChuoi(change.to || '');

  if (fieldRaw === 'Thao tác') {
    if (/(unc|thanh toan|chuyen khoan|thu tien)/.test(toNorm)) return 'thanh_toan';
    if (/(giao nhan|dang giao|da giao|van don|cpn)/.test(toNorm)) return 'giao_nhan';
    if (/(ho so|nop ncc)/.test(toNorm)) return 'ho_so';
    if (/(kich hoat|hoa don)/.test(toNorm)) return 'kich_hoat';
    return 'khac';
  }

  if (
    TRUONG_THANH_TOAN.has(fieldRaw)
    || /^chiTietSanPham\.[^.]+\.(thanhToanKhach|thanhToanNcc|phaiThuKhach|giaBan|giaDongCongTy|giaNoNcc)$/.test(fieldRaw)
    || /(thanh toan|unc|cong no|thuc thu|thanh tien|con lai|qr chuyen khoan)/.test(fieldNorm)
  ) {
    return 'thanh_toan';
  }

  if (
    TRUONG_GIAO_NHAN.has(fieldRaw)
    || /(giao nhan|van don|cpn|chuyen phat)/.test(fieldNorm)
  ) {
    return 'giao_nhan';
  }

  if (
    TRUONG_HO_SO.has(fieldRaw)
    || /(ho so|hop dong|gdk|bbbg|gpkd|cccd|dinh kem|file tong)/.test(fieldNorm)
  ) {
    return 'ho_so';
  }

  if (
    TRUONG_KICH_HOAT.has(fieldRaw)
    || /^chiTietSanPham\.[^.]+\.trangThai$/.test(fieldRaw)
    || /(kich hoat|trang thai|tinh trang|hoa don|smartsign)/.test(fieldNorm)
  ) {
    return 'kich_hoat';
  }

  return 'khac';
}

function chuanHoaLichSuGiaoNhan(danhSachPhieu = []) {
  const ketQua = [];
  for (const phieu of danhSachPhieu) {
    if (!phieu || typeof phieu !== 'object') continue;
    const maPhieu = String(phieu.ID || phieu.maSheet || '').trim();
    const lichSu = Array.isArray(phieu.quyTrinhGiaoNhan?.lichSu) ? phieu.quyTrinhGiaoNhan.lichSu : [];

    if (lichSu.length) {
      for (const buoc of lichSu) {
        if (!buoc) continue;
        const nhanBuoc = NHAN_BUOC_GIAO_NHAN[buoc.buoc] || buoc.buoc || 'Cập nhật giao nhận';
        const chiTiet = [nhanBuoc];
        if (buoc.nguoiGiao) chiTiet.push(`Người giao: ${buoc.nguoiGiao}`);
        if (maPhieu) chiTiet.push(`Phiếu: ${maPhieu}`);
        ketQua.push({
          _id: `gn-${phieu._id || maPhieu}-${buoc.thoiGian || ''}-${buoc.buoc || ''}`,
          orderId: null,
          changedBy: buoc.nguoiThaoTac || buoc.nguoiGiao || 'Hệ thống',
          changedAt: buoc.thoiGian || phieu.updatedAt || phieu.createdAt || new Date(),
          action: 'GIAO_NHAN',
          module: 'giao_nhan',
          nhom: ['giao_nhan'],
          changes: [{ field: 'Giao nhận', from: '', to: chiTiet.join(' · '), nhom: 'giao_nhan' }]
        });
      }
    } else if (phieu['TÌNH TRẠNG']) {
      const chiTiet = [String(phieu['TÌNH TRẠNG']).trim()];
      if (phieu['Nhân Viên Thực Hiện']) chiTiet.push(`Người giao: ${phieu['Nhân Viên Thực Hiện']}`);
      if (phieu['ĐƠN VỊ CPN']) chiTiet.push(`CPN: ${phieu['ĐƠN VỊ CPN']}`);
      if (phieu['SỐ  BILL']) chiTiet.push(`Bill: ${phieu['SỐ  BILL']}`);
      if (maPhieu) chiTiet.push(`Phiếu: ${maPhieu}`);
      ketQua.push({
        _id: `gn-${phieu._id || maPhieu}`,
        orderId: null,
        changedBy: phieu['Nhân Viên Thực Hiện'] || phieu['TÊN NHÂN VIÊN'] || 'Hệ thống',
        changedAt: phieu.ngayThucHienDate || phieu.ngayGuiDate || phieu.updatedAt || phieu.createdAt || new Date(),
        action: 'GIAO_NHAN',
        module: 'giao_nhan',
        nhom: ['giao_nhan'],
        changes: [{ field: 'Giao nhận', from: '', to: chiTiet.join(' · '), nhom: 'giao_nhan' }]
      });
    }
  }
  return ketQua;
}

function chuanHoaLichSuHoSo(danhSachHoSo = []) {
  const ketQua = [];
  for (const hoSo of danhSachHoSo) {
    if (!hoSo || typeof hoSo !== 'object') continue;
    const maHoSo = String(hoSo.ID || '').trim();
    const lichSu = Array.isArray(hoSo.quyTrinhHoSo?.lichSu) ? hoSo.quyTrinhHoSo.lichSu : [];

    if (lichSu.length) {
      for (const buoc of lichSu) {
        if (!buoc) continue;
        const tuNhan = NHAN_BUOC_HO_SO[buoc.tuBuoc] || buoc.tuBuoc || '';
        const denNhan = NHAN_BUOC_HO_SO[buoc.denBuoc] || buoc.denBuoc || 'Cập nhật hồ sơ';
        const chiTiet = [denNhan];
        if (buoc.nguoiNhan) chiTiet.push(`Người nhận: ${buoc.nguoiNhan}`);
        if (maHoSo) chiTiet.push(`Hồ sơ: ${maHoSo}`);
        if (buoc.ghiChu) chiTiet.push(`Ghi chú: ${buoc.ghiChu}`);
        ketQua.push({
          _id: `hs-${hoSo._id || maHoSo}-${buoc.thoiGian || ''}-${buoc.denBuoc || ''}`,
          orderId: null,
          changedBy: buoc.nguoiThaoTac || 'Hệ thống',
          changedAt: buoc.thoiGian || hoSo.updatedAt || hoSo.createdAt || new Date(),
          action: 'HO_SO',
          module: 'ho_so',
          nhom: ['ho_so'],
          changes: [{ field: 'Quy trình hồ sơ', from: tuNhan, to: chiTiet.join(' · '), nhom: 'ho_so' }]
        });
      }
    } else if (hoSo['TÌNH TRẠNG HỒ SƠ'] || hoSo['Nơi Nộp']) {
      const chiTiet = [];
      if (hoSo['TÌNH TRẠNG HỒ SƠ']) chiTiet.push(String(hoSo['TÌNH TRẠNG HỒ SƠ']).trim());
      if (hoSo['Nơi Nộp']) chiTiet.push(`Nơi nộp: ${hoSo['Nơi Nộp']}`);
      if (hoSo['Ngày Nộp']) chiTiet.push(`Ngày nộp: ${hoSo['Ngày Nộp']}`);
      if (maHoSo) chiTiet.push(`Hồ sơ: ${maHoSo}`);
      ketQua.push({
        _id: `hs-${hoSo._id || maHoSo}`,
        orderId: null,
        changedBy: 'Hệ thống',
        changedAt: hoSo.updatedAt || hoSo.createdAt || new Date(),
        action: 'HO_SO',
        module: 'ho_so',
        nhom: ['ho_so'],
        changes: [{ field: 'Hồ sơ', from: '', to: chiTiet.join(' · '), nhom: 'ho_so' }]
      });
    }
  }
  return ketQua;
}

function phanNhomLichSuDonHang(orderEntries = [], giaoNhanEntries = [], hoSoEntries = []) {
  const ganNhom = entry => {
    const changes = (entry.changes || []).map(change => ({
      ...change,
      nhom: change.nhom || phanLoaiThayDoi(change)
    }));
    const nhom = [...new Set(changes.map(c => c.nhom))];
    return { ...entry, changes, nhom };
  };

  const tatCa = [
    ...orderEntries.map(ganNhom),
    ...giaoNhanEntries.map(ganNhom),
    ...hoSoEntries.map(ganNhom)
  ].filter(entry => entry.changes.length > 0);

  tatCa.sort((a, b) => new Date(a.changedAt || 0).getTime() - new Date(b.changedAt || 0).getTime());

  const counts = {
    tong: tatCa.length,
    thanh_toan: 0,
    kich_hoat: 0,
    giao_nhan: 0,
    ho_so: 0
  };
  for (const entry of tatCa) {
    if (entry.nhom.includes('thanh_toan')) counts.thanh_toan += 1;
    if (entry.nhom.includes('kich_hoat')) counts.kich_hoat += 1;
    if (entry.nhom.includes('giao_nhan')) counts.giao_nhan += 1;
    if (entry.nhom.includes('ho_so')) counts.ho_so += 1;
  }

  return { items: tatCa, counts };
}

function locLichSuTheoNhom(entries = [], category = 'tong') {
  if (!category || category === 'tong') return entries;
  return entries
    .map(entry => {
      const changes = (entry.changes || []).filter(c => c.nhom === category);
      if (!changes.length) return null;
      return { ...entry, changes, nhom: [category] };
    })
    .filter(Boolean);
}

module.exports = {
  NHOM_LICH_SU,
  phanLoaiThayDoi,
  chuanHoaLichSuGiaoNhan,
  chuanHoaLichSuHoSo,
  phanNhomLichSuDonHang,
  locLichSuTheoNhom
};
