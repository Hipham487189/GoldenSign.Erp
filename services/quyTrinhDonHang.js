const TRUONG_TEP_DON = ['Hợp Đồng / GDK', 'Xác Nhận/ BBBG', 'GPKD', 'CCCD', 'File tong', 'FILE ĐÍNH KÈM'];

function chuanHoa(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function laDaKichHoat(statusText) {
  const s = chuanHoa(statusText);
  if (!s) return false;
  if (s.includes('chua kich hoat')) return false;
  return s.includes('kich hoat') || s.includes('hoan tat') || s.includes('da thanh toan');
}

function soTien(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const n = Number(String(val ?? '').replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function tinhQuyTrinhDonHang(order = {}, phieuGiaoNhan = null, hoSo = null) {
  const chiTiet = Array.isArray(order.chiTietSanPham) ? order.chiTietSanPham : [];
  const tinhTrangDon = String(order['TÌNH TRẠNG'] || 'Soạn Hồ Sơ').trim();
  const tinhTrangNorm = chuanHoa(tinhTrangDon);

  // 1. Soạn Hồ Sơ
  let coSanPhamKichHoat = false;
  let soSpKichHoat = 0;
  if (chiTiet.length > 0) {
    soSpKichHoat = chiTiet.filter(sp => laDaKichHoat(sp?.trangThai)).length;
    coSanPhamKichHoat = soSpKichHoat > 0;
  }
  const daQuaSoanHoSo = laDaKichHoat(tinhTrangDon) || coSanPhamKichHoat || tinhTrangNorm.includes('cho kich hoat');
  const nodeSoanHoSo = {
    ma: 'soan_ho_so',
    nhan: 'Soạn Hồ Sơ',
    trangThai: daQuaSoanHoSo ? 'hoan_thanh' : 'dang_xu_ly',
    moTa: daQuaSoanHoSo ? 'Đã hoàn tất soạn hồ sơ' : (tinhTrangDon || 'Đang soạn hồ sơ'),
    nhomLichSu: 'tong'
  };

  // 2. Kích Hoạt
  let kichHoatStatus = 'chua_bat_dau';
  let kichHoatMoTa = 'Chưa kích hoạt';
  if (chiTiet.length > 0) {
    if (soSpKichHoat >= chiTiet.length) {
      kichHoatStatus = 'hoan_thanh';
      kichHoatMoTa = `Đã kích hoạt ${soSpKichHoat}/${chiTiet.length} SP`;
    } else if (soSpKichHoat > 0) {
      kichHoatStatus = 'dang_xu_ly';
      kichHoatMoTa = `Kích hoạt ${soSpKichHoat}/${chiTiet.length} SP`;
    } else if (tinhTrangNorm.includes('cho kich hoat') || tinhTrangNorm.includes('dang xu ly')) {
      kichHoatStatus = 'dang_xu_ly';
      kichHoatMoTa = tinhTrangDon;
    }
  } else if (laDaKichHoat(tinhTrangDon)) {
    kichHoatStatus = 'hoan_thanh';
    kichHoatMoTa = tinhTrangDon;
  } else if (tinhTrangNorm.includes('cho kich hoat') || tinhTrangNorm.includes('dang xu ly')) {
    kichHoatStatus = 'dang_xu_ly';
    kichHoatMoTa = tinhTrangDon;
  }
  const nodeKichHoat = {
    ma: 'kich_hoat',
    nhan: 'Kích Hoạt',
    trangThai: kichHoatStatus,
    moTa: kichHoatMoTa,
    nhomLichSu: 'kich_hoat'
  };

  // 3. Xuất Hóa Đơn
  const hoaDonRaw = String(order['Xuất Hóa Đơn'] || '').trim();
  const hoaDonNorm = chuanHoa(hoaDonRaw);
  let hoaDonStatus = 'chua_bat_dau';
  let hoaDonMoTa = hoaDonRaw || 'Chưa xuất hóa đơn';
  if (/(da xuat|da phat hanh|hoan thanh|co hoa don)/.test(hoaDonNorm)) {
    hoaDonStatus = 'hoan_thanh';
  } else if (/(cho xuat|dang xuat|yeu cau)/.test(hoaDonNorm)) {
    hoaDonStatus = 'dang_xu_ly';
  }
  const nodeHoaDon = {
    ma: 'xuat_hoa_don',
    nhan: 'Xuất Hóa Đơn',
    trangThai: hoaDonStatus,
    moTa: hoaDonMoTa,
    nhomLichSu: 'kich_hoat'
  };

  // 4. Thanh Toán
  const thucThu = soTien(order['Thực Thu']) || soTien(order['Thành Tiền']);
  const daTra = soTien(order['KH Thanh Toán']);
  const conLai = order['Còn lại'] !== undefined && order['Còn lại'] !== ''
    ? soTien(order['Còn lại'])
    : Math.max(0, thucThu - daTra);
  const trangThaiUncNorm = chuanHoa(order['Trạng Thái UNC']);
  let thanhToanStatus = 'chua_bat_dau';
  let thanhToanMoTa = 'Chưa thanh toán';
  if ((thucThu > 0 && daTra >= thucThu) || (daTra > 0 && conLai <= 0)) {
    thanhToanStatus = 'hoan_thanh';
    thanhToanMoTa = 'Đã thanh toán đủ';
  } else if (daTra > 0 || trangThaiUncNorm.includes('cho duyet')) {
    thanhToanStatus = 'dang_xu_ly';
    thanhToanMoTa = trangThaiUncNorm.includes('cho duyet') && daTra <= 0
      ? 'UNC đang chờ duyệt'
      : `Đã trả ${daTra.toLocaleString('vi-VN')} đ`;
  }
  const nodeThanhToan = {
    ma: 'thanh_toan',
    nhan: 'Thanh Toán',
    trangThai: thanhToanStatus,
    moTa: thanhToanMoTa,
    nhomLichSu: 'thanh_toan'
  };

  // 5. Giao Nhận
  const buocGn = phieuGiaoNhan?.quyTrinhGiaoNhan?.buocHienTai || '';
  const ttGnRaw = String(phieuGiaoNhan?.['TÌNH TRẠNG'] || order['Tình  Trạng Giao Nhận'] || '').trim();
  const ttGnNorm = chuanHoa(ttGnRaw);
  let giaoNhanStatus = 'chua_bat_dau';
  let giaoNhanMoTa = 'Chưa giao nhận';
  if (buocGn === 'da_giao' || /(da giao|hoan tat|da nhan)/.test(ttGnNorm)) {
    giaoNhanStatus = 'hoan_thanh';
    giaoNhanMoTa = 'Đã giao';
  } else if (buocGn === 'dang_giao' || /(dang giao|dang tren duong|da gui)/.test(ttGnNorm)) {
    giaoNhanStatus = 'dang_xu_ly';
    giaoNhanMoTa = 'Đang giao';
  } else if (phieuGiaoNhan || buocGn === 'da_kich_hoat') {
    giaoNhanStatus = 'dang_xu_ly';
    giaoNhanMoTa = 'Chờ giao nhận';
  }
  const nodeGiaoNhan = {
    ma: 'giao_nhan',
    nhan: 'Giao Nhận',
    trangThai: giaoNhanStatus,
    moTa: giaoNhanMoTa,
    nhomLichSu: 'giao_nhan'
  };

  // 6. Hồ Sơ
  const buocHs = hoSo?.quyTrinhHoSo?.buocHienTai || '';
  const ttHsRaw = String(hoSo?.['TÌNH TRẠNG HỒ SƠ'] || '').trim();
  const ttHsNorm = chuanHoa(ttHsRaw);
  const coTepDon = TRUONG_TEP_DON.some(truong => Boolean(order[truong]));
  let hoSoStatus = 'chua_bat_dau';
  let hoSoMoTa = 'Chưa có hồ sơ';
  if (buocHs === 'nop_ncc' || /(da nop|hoan tat|du ho so)/.test(ttHsNorm)) {
    hoSoStatus = 'hoan_thanh';
    hoSoMoTa = hoSo?.['Nơi Nộp'] ? `Đã nộp ${hoSo['Nơi Nộp']}` : (ttHsRaw || 'Đã nộp hồ sơ');
  } else if (hoSo || coTepDon) {
    hoSoStatus = 'dang_xu_ly';
    hoSoMoTa = ttHsRaw || (hoSo ? 'Đang xử lý hồ sơ' : 'Đã đính kèm chứng từ');
  }
  const nodeHoSo = {
    ma: 'ho_so',
    nhan: 'Hồ Sơ',
    trangThai: hoSoStatus,
    moTa: hoSoMoTa,
    nhomLichSu: 'ho_so'
  };

  return [nodeSoanHoSo, nodeKichHoat, nodeHoaDon, nodeThanhToan, nodeGiaoNhan, nodeHoSo];
}

module.exports = { tinhQuyTrinhDonHang };
