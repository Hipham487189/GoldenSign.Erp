const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'import', 'download', 'print', 'approve', 'configure'];

const CONG_CU = {
  'nhap-ho-so': { ten: 'Nhập Hồ Sơ', quyen: ['manage_orders'] },
  'kiem-tra-cong-no': { ten: 'Kiểm Tra Công Nợ', quyen: ['view_debts'] },
  'thiet-lap-luong': { ten: 'Thiết Lập Lương', admin: true },
  'nhap-so-lieu': { ten: 'Nhập Số liệu', admin: true },
  'cap-nhat-khach-hang': { ten: 'Cập Nhật TT Khách hàng', quyen: ['view_orders', 'view_customers', 'manage_customers'] }
};

const RESOURCES = {
  dashboard: { label: 'Dashboard', actions: ['view'], scopeKey: 'orders' },
  orders: {
    label: 'Đơn hàng',
    actions: ACTIONS,
    scopeKey: 'orders',
    columns: [
      { key: 'STT', label: 'Số thứ tự' },
      { key: 'Mã Đơn Hàng', label: 'Mã đơn hàng' },
      { key: 'Ngày Đăng Ký', label: 'Ngày đăng ký' },
      { key: 'Nhân Viên Đăng Ký', label: 'Nhân viên phụ trách' },
      { key: 'Nhân Viên Nhập Liệu', label: 'Nhân viên nhập liệu' },
      { key: 'Bộ Phận', label: 'Bộ phận' },
      { key: 'Tên Khách Hàng', label: 'Khách hàng' },
      { key: 'SĐT', label: 'Số điện thoại' },
      { key: 'Tên Công Ty ', label: 'Công ty' },
      { key: 'MST', label: 'Mã số thuế' },
      { key: 'Loại Sản Phẩm', label: 'Loại sản phẩm' },
      { key: 'NCC', label: 'Nhà cung cấp' },
      { key: 'Hình Thức', label: 'Hình thức' },
      { key: 'Gói ', label: 'Gói dịch vụ' },
      { key: 'Thành Tiền', label: 'Thành tiền', nhayCam: true },
      { key: 'Thực Thu', label: 'Thực thu', nhayCam: true },
      { key: 'KH Thanh Toán', label: 'Khách hàng thanh toán', nhayCam: true },
      { key: 'Còn lại', label: 'Còn lại', nhayCam: true },
      { key: 'Thực Đóng Công Ty', label: 'Thực đóng công ty', nhayCam: true },
      { key: 'Thực Đóng NCC', label: 'Thực đóng nhà cung cấp', nhayCam: true },
      { key: 'THỰC CÔNG NỢ CTY', label: 'Thực công nợ công ty', nhayCam: true },
      { key: 'Lợi Nhuận Dự Kiến', label: 'Lợi nhuận dự kiến', nhayCam: true },
      { key: 'Thực Đóng NCC', label: 'Thực đóng nhà cung cấp', nhayCam: true },
      { key: 'TÌNH TRẠNG', label: 'Trạng thái đơn hàng' },
      { key: 'Tình  Trạng Giao Nhận', label: 'Trạng thái giao nhận' },
      { key: 'FILE ĐÍNH KÈM', label: 'Tệp đính kèm' },
      { key: 'Quốc An Check', label: 'Đã kiểm tra' },
      { key: 'Hình Thức Thanh Toán', label: 'Hình thức thanh toán' },
      { key: 'Ngày KH thanh toán', label: 'Ngày khách thanh toán' },
      { key: 'Xuất Hóa Đơn', label: 'Xuất hóa đơn' },
      { key: 'Số Tiền UNC', label: 'Số tiền UNC', nhayCam: true },
      { key: 'Ngày Thanh Toán UNC', label: 'Ngày thanh toán UNC', nhayCam: true },
      { key: 'Nội Dung UNC', label: 'Nội dung UNC', nhayCam: true },
      { key: 'Ảnh UNC', label: 'Tệp UNC', nhayCam: true },
      { key: 'Tên File UNC', label: 'Tên tệp UNC', nhayCam: true },
      { key: 'Trạng Thái UNC', label: 'Trạng thái UNC', nhayCam: true },
      { key: 'Ghi Chú Từ Chối UNC', label: 'Lý do từ chối UNC', nhayCam: true },
      { key: 'laDonNhieuSanPham', label: 'Đơn nhiều sản phẩm' },
      { key: 'priceSnapshot', label: 'Ảnh chụp giá vốn', nhayCam: true },
      { key: 'lockedAt', label: 'Thời gian khóa' },
      { key: 'lockedReason', label: 'Lý do khóa', nhayCam: true },
      { key: 'archivedAt', label: 'Thời gian lưu trữ', nhayCam: true },
      { key: 'archivedBy', label: 'Người lưu trữ', nhayCam: true },
      { key: 'chiTietSanPham', label: 'Chi tiết sản phẩm' },
      { key: 'chiTietSanPham.maDong', label: 'Chi tiết: mã dòng' },
      { key: 'chiTietSanPham.maSanPham', label: 'Chi tiết: mã sản phẩm' },
      { key: 'chiTietSanPham.tenSanPham', label: 'Chi tiết: tên sản phẩm' },
      { key: 'chiTietSanPham.loaiSanPham', label: 'Chi tiết: loại sản phẩm' },
      { key: 'chiTietSanPham.ncc', label: 'Chi tiết: nhà cung cấp' },
      { key: 'chiTietSanPham.hinhThuc', label: 'Chi tiết: hình thức' },
      { key: 'chiTietSanPham.trangThai', label: 'Chi tiết: trạng thái' },
      { key: 'chiTietSanPham.donViTinh', label: 'Chi tiết: đơn vị tính' },
      { key: 'chiTietSanPham.soLuong', label: 'Chi tiết: số lượng' },
      { key: 'chiTietSanPham.giaBan', label: 'Chi tiết: giá bán', nhayCam: true },
      { key: 'chiTietSanPham.giaDongCongTy', label: 'Chi tiết: giá công ty', nhayCam: true },
      { key: 'chiTietSanPham.giaNoNcc', label: 'Chi tiết: công nợ nhà cung cấp', nhayCam: true },
      { key: 'chiTietSanPham.phaiThuKhach', label: 'Chi tiết: phải thu khách', nhayCam: true },
      { key: 'chiTietSanPham.thanhToanKhach', label: 'Chi tiết: khách đã thanh toán', nhayCam: true },
      { key: 'chiTietSanPham.thanhToanNcc', label: 'Chi tiết: nhà cung cấp đã thanh toán', nhayCam: true }
    ]
  },
  customers: { label: 'Khách hàng', actions: ACTIONS, scopeKey: 'customers' },
  products: {
    label: 'Sản phẩm',
    actions: ACTIONS,
    scopeKey: 'products',
    columns: [
      { key: 'MÃ SẢN PHẨM', label: 'Mã sản phẩm' },
      { key: 'Mã SP', label: 'Mã sản phẩm' },
      { key: 'TÊN SẢN PHẨM', label: 'Tên sản phẩm' },
      { key: 'Tên Sản Phẩm', label: 'Tên sản phẩm' },
      { key: 'Gói ', label: 'Gói dịch vụ' },
      { key: 'Gói', label: 'Gói dịch vụ' },
      { key: 'LOẠI SẢN PHẨM', label: 'Loại sản phẩm' },
      { key: 'Loại Sản Phẩm', label: 'Loại sản phẩm' },
      { key: 'NCC', label: 'Nhà cung cấp' },
      { key: 'Hình Thức', label: 'Hình thức' },
      { key: 'HÌnh Thức', label: 'Hình thức' },
      { key: 'GIÁ SAU THUẾ', label: 'Giá sau thuế' },
      { key: 'SAU THUẾ', label: 'Giá sau thuế' },
      { key: 'Giá Sau Thuế', label: 'Giá sau thuế' },
      { key: 'Gia Sau Thue', label: 'Giá sau thuế' },
      { key: 'GIÁ', label: 'Giá' },
      { key: 'Giá', label: 'Giá' },
      { key: 'THỰC ĐÓNG CÔNG TY', label: 'Thực đóng công ty', nhayCam: true },
      { key: 'Thực Đóng Công Ty', label: 'Thực đóng công ty', nhayCam: true },
      { key: 'Thực Đóng Cty', label: 'Thực đóng công ty', nhayCam: true },
      { key: 'THỰC CÔNG NỢ CTY', label: 'Thực công nợ công ty', nhayCam: true },
      { key: 'THỰC CÔNG NỢ CTY (VNĐ)', label: 'Thực công nợ công ty', nhayCam: true },
      { key: 'VAT', label: 'VAT' },
      { key: 'Ngày áp dụng', label: 'Ngày áp dụng' },
      { key: 'Ngày Áp Dụng', label: 'Ngày áp dụng' },
      { key: 'NGÀY ÁP DỤNG', label: 'Ngày áp dụng' },
      { key: 'Ngày kết thúc', label: 'Ngày kết thúc' },
      { key: 'Ngày Kết Thúc', label: 'Ngày kết thúc' },
      { key: 'NGÀY KẾT THÚC', label: 'Ngày kết thúc' }
    ]
  },
  employees: { label: 'Nhân viên', actions: ACTIONS, scopeKey: 'employees' },
  debts: { label: 'Công nợ nghiệp vụ', actions: ACTIONS, scopeKey: 'debts' },
  internalFinance: { label: 'Tài chính nội bộ', actions: ACTIONS, scopeKey: 'internalFinance' },
  notifications: { label: 'Thông báo', actions: ACTIONS, scopeKey: 'notifications' },
  tasks: { label: 'Ghi chú công việc', actions: ACTIONS, scopeKey: 'tasks' },
  support: { label: 'Hỗ trợ', actions: ACTIONS, scopeKey: 'support' },
  chat: { label: 'Trò chuyện', actions: ACTIONS, scopeKey: 'chat' },
  profiles: { label: 'Hồ sơ', actions: ACTIONS, scopeKey: 'profiles' },
  audit: { label: 'Nhật ký', actions: ['view', 'export'], scopeKey: 'audit' },
  configuration: { label: 'Cấu hình hệ thống', actions: ['view', 'edit', 'configure'], scopeKey: 'configuration' },
  permissions: { label: 'Quản lý phân quyền', actions: ['view', 'edit', 'configure'], scopeKey: 'permissions' }
};

RESOURCES.congCu = { label: 'Công Cụ', actions: ['view'], scopeKey: 'congCu', maCongCu: 'menu' };
Object.entries(CONG_CU).forEach(([ma, thongTin]) => {
  RESOURCES[`congCu_${ma}`] = { label: `Công Cụ · ${thongTin.ten}`, actions: ['view'], scopeKey: 'congCu', maCongCu: ma };
});

const LEGACY_PERMISSIONS = {
  view_orders: ['dashboard:view', 'orders:view', 'orders:export', 'products:view', 'tasks:view', 'chat:view', 'profiles:view'],
  manage_orders: ['orders:create', 'orders:edit', 'orders:delete', 'orders:import', 'orders:approve', 'products:create', 'products:edit', 'products:delete', 'products:import', 'tasks:create', 'tasks:edit', 'chat:create'],
  view_debts: ['debts:view', 'debts:export'],
  view_customers: ['customers:view', 'profiles:view', 'support:view', 'support:download'],
  manage_customers: ['customers:create', 'customers:edit', 'customers:delete', 'support:create', 'support:edit', 'support:delete'],
  view_employees: ['employees:view'],
  manage_employees: ['employees:create', 'employees:edit', 'employees:delete'],
  view_notifications: ['notifications:view'],
  manage_notifications: ['notifications:create', 'notifications:edit', 'notifications:delete'],
  manage_users: ['permissions:view', 'permissions:edit', 'permissions:configure'],
  manage_roles: ['permissions:view', 'permissions:edit', 'permissions:configure'],
  manage_financials: ['internalFinance:view', 'internalFinance:edit', 'internalFinance:approve', 'internalFinance:export'],
  view_internal_finance: ['internalFinance:view', 'internalFinance:export'],
  manage_internal_finance: ['internalFinance:create', 'internalFinance:edit', 'internalFinance:delete', 'internalFinance:approve', 'internalFinance:import']
};

const API_RESOURCES = [
  ['/api/orders/ncc-debts', 'internalFinance'],
  ['/api/orders/debts', 'debts'],
  ['/api/supplier-payments', 'internalFinance'],
  ['/api/employee-payments', 'internalFinance'],
  ['/api/payments', 'internalFinance'],
  ['/api/orders/unc', 'orders'],
  ['/api/orders', 'orders'],
  ['/api/sanpham', 'products'],
  ['/api/customers', 'customers'],
  ['/api/cong-no', 'debts'],
  ['/api/nhap-so-lieu', 'configuration'],
  ['/api/nhat-ky-cong-cu', 'audit'],
  ['/api/notifications', 'notifications'],
  ['/api/employees', 'employees'],
  ['/api/tasks', 'tasks'],
  ['/api/notes', 'tasks'],
  ['/api/giao-nhan', 'orders'],
  ['/api/hoso', 'profiles'],
  ['/api/chat', 'chat'],
  ['/api/support-documents', 'support'],
  ['/api/support', 'support'],
  ['/api/support-logs', 'support'],
  ['/api/invoice', 'orders'],
  ['/api/mst-lookup', 'orders'],
  ['/api/ai/chat', 'dashboard'],
  ['/api/sync', 'orders']
].sort((a, b) => b[0].length - a[0].length);

const MODEL_RESOURCES = {
  Order: 'orders',
  ChuyenPhatNhanh: 'orders',
  Customer: 'customers',
  CustomerGroup: 'customers',
  CustomerRelationship: 'customers',
  SanPham: 'products',
  Employee: 'employees',
  Notification: 'notifications',
  Task: 'tasks',
  ChatMessage: 'chat',
  SupportFile: 'support',
  SupportFolder: 'support',
  SupportLog: 'support',
  TaiLieuHoTro: 'support',
  ChuDeTaiLieu: 'support',
  HoSo: 'profiles',
  AuditLog: 'audit',
  User: 'permissions',
  Role: 'permissions',
  EmployeePayment: 'internalFinance',
  EmployeePayable: 'internalFinance',
  EmployeeDebtCharge: 'internalFinance',
  EmployeeOpeningAdjustment: 'internalFinance',
  SupplierPayment: 'internalFinance',
  SupplierDebtAdjustment: 'internalFinance',
  SupplierDebtSnapshot: 'internalFinance',
  ThietLapLuongNhanVien: 'internalFinance',
  ExpenseRate: 'internalFinance',
  SoGhiChu: 'tasks'
};

const COLUMN_ALIASES = {
  products: {
    productCode: ['MÃ SẢN PHẨM', 'Mã SP'],
    productName: ['TÊN SẢN PHẨM', 'Tên Sản Phẩm', 'Gói ', 'Gói'],
    supplierCost: ['THỰC ĐÓNG CÔNG TY', 'Thực Đóng Công Ty', 'Thực Đóng Cty', 'THỰC CÔNG NỢ CTY', 'THỰC CÔNG NỢ CTY (VNĐ)']
  },
  orders: {
    order: ['Mã Đơn Hàng', 'Ngày Đăng Ký'],
    employee: ['Nhân Viên Đăng Ký'],
    customer: ['Tên Khách Hàng', 'SĐT'],
    company: ['Tên Công Ty ', 'MST'],
    product: ['NCC', 'Gói ', 'Loại Sản Phẩm'],
    amount: ['Thành Tiền'],
    finalCost: ['THỰC CÔNG NỢ CTY', 'Thực Đóng Công Ty'],
    status: ['TÌNH TRẠNG'],
    invoice: ['Xuất Hóa Đơn', 'Trạng Thái Hóa Đơn'],
    qr: ['QR chuyển khoản'],
    'Địa Chỉ Công Ty': ['Tên Công Ty ', 'MST'],
    'Địa Chỉ Giao Nhận': ['Tên Khách Hàng', 'SĐT'],
    Email: ['Tên Khách Hàng', 'SĐT'],
    'Hợp Đồng / GDK': ['FILE ĐÍNH KÈM'],
    'Xác Nhận/ BBBG': ['FILE ĐÍNH KÈM'],
    GPKD: ['FILE ĐÍNH KÈM'],
    CCCD: ['FILE ĐÍNH KÈM'],
    'File tong': ['FILE ĐÍNH KÈM'],
    actions: []
  },
  debts: {
    order: ['Mã Đơn Hàng', 'Ngày Đăng Ký'],
    employee: ['Nhân Viên Đăng Ký'],
    customer: ['Tên Khách Hàng', 'SĐT'],
    mst: ['MST'],
    company: ['Tên Công Ty '],
    product: ['NCC', 'Gói '],
    amount: ['Thành Tiền'],
    paid: ['KH Thanh Toán', 'Thực Thu'],
    debt: ['Còn lại'],
    status: ['TÌNH TRẠNG']
  }
};

const FIELD_FINANCIAL = new Set([
  'Thành Tiền', 'Thực Thu', 'KH Thanh Toán', 'Còn lại', 'Thực Đóng Công Ty',
  'Thực Đóng NCC', 'THỰC CÔNG NỢ CTY', 'Lợi Nhuận Dự Kiến'
]);

function cotTuongUng(bang, cot) {
  return COLUMN_ALIASES[bang]?.[cot] || [cot];
}

function quyenCuChoVaiTro(vaiTro, maQuyen) {
  return Array.isArray(vaiTro?.permissions) && vaiTro.permissions.includes(maQuyen);
}

function duocXemCongCu(vaiTro) {
  return Boolean(vaiTro && (vaiTro.name === 'Admin' || vaiTro.quyenCongCu?.menu !== false));
}

function choPhepCongCuTheoCauHinh(vaiTro, ma) {
  return Boolean(vaiTro && Object.prototype.hasOwnProperty.call(CONG_CU, ma)
    && (vaiTro.name === 'Admin' || (duocXemCongCu(vaiTro) && vaiTro.quyenCongCu?.[ma] !== false)));
}

function duocDungCongCu(vaiTro, ma) {
  if (!choPhepCongCuTheoCauHinh(vaiTro, ma)) return false;
  if (vaiTro.name === 'Admin') return true;
  const congCu = CONG_CU[ma];
  return !congCu.admin && congCu.quyen.every(quyen => quyenCuChoVaiTro(vaiTro, quyen));
}

function loiQuyenCongCu(quyen) {
  if (!quyen || typeof quyen !== 'object' || Array.isArray(quyen)) return 'Cấu hình Công Cụ không hợp lệ.';
  for (const [ma, giaTri] of Object.entries(quyen)) {
    if ((ma !== 'menu' && !Object.prototype.hasOwnProperty.call(CONG_CU, ma)) || typeof giaTri !== 'boolean') return 'Cấu hình Công Cụ không hợp lệ.';
  }
  return '';
}

function quyenTheoChinhSach(vaiTro, taiNguyen, thaoTac) {
  if (!vaiTro) return false;
  if (vaiTro.name === 'Admin') return true;
  const cauHinh = vaiTro.accessControl;
  if (cauHinh?.version === 1) {
    const quyTac = cauHinh.resources?.[taiNguyen];
    return Boolean(quyTac?.actions?.includes('full') || quyTac?.actions?.includes(thaoTac));
  }
  return Object.entries(LEGACY_PERMISSIONS).some(([maQuyen, cap]) =>
    quyenCuChoVaiTro(vaiTro, maQuyen) && cap.includes(`${taiNguyen}:${thaoTac}`)
  );
}

function quyenMa(vaiTro, maQuyen) {
  if (!vaiTro) return false;
  if (vaiTro.name === 'Admin') return true;
  if (maQuyen.includes(':')) {
    const [taiNguyen, thaoTac] = maQuyen.split(':');
    return quyenTheoChinhSach(vaiTro, taiNguyen, thaoTac);
  }
  const cacQuyenTuongDuong = LEGACY_PERMISSIONS[maQuyen];
  if (vaiTro.accessControl?.version === 1) {
    return Boolean(cacQuyenTuongDuong?.some(ma => {
      const [taiNguyen, thaoTac] = ma.split(':');
      return quyenTheoChinhSach(vaiTro, taiNguyen, thaoTac);
    }));
  }
  return quyenCuChoVaiTro(vaiTro, maQuyen);
}

function quyenCot(vaiTro, bang, cot, userColumns = {}) {
  if (!vaiTro) return false;
  if (vaiTro.name === 'Admin') return true;
  const cotThuc = cotTuongUng(bang, cot);
  const cotCam = new Set([
    ...(vaiTro.hiddenColumns?.[bang] || []),
    ...(userColumns?.[bang] || [])
  ]);
  if (cotCam.has(cot) || cotThuc.some(ma => cotCam.has(ma))) return false;
  if (vaiTro.accessControl?.version === 1) {
    return [cot, ...cotThuc].some(khoa => {
      const quyen = vaiTro.accessControl.resources?.[bang]?.columns?.[khoa];
      return quyen === true || quyen === 'view' || quyen === 'edit' || (Array.isArray(quyen) && (quyen.includes('view') || quyen.includes('edit'))) || Boolean(quyen?.view || quyen?.edit);
    });
  }
  const danhSachCot = RESOURCES[bang]?.columns || [];
  const thongTinCot = danhSachCot.find(item => item.key === cot);
  const laTaiChinh = thongTinCot?.nhayCam || FIELD_FINANCIAL.has(cot) || cotThuc.some(field => FIELD_FINANCIAL.has(field));
  if (thongTinCot?.configured === false) return false;
  if (!thongTinCot && !cotThuc.some(ma => danhSachCot.some(item => item.key === ma))) return false;
  if (laTaiChinh && !['manage_financials', 'manage_orders_financial', 'view_internal_finance'].some(ma => quyenCuChoVaiTro(vaiTro, ma))) return false;
  return !cotThuc.some(ma => cotCam.has(ma)) && !cotCam.has(cot);
}

function quyenSuaCot(vaiTro, bang, cot) {
  if (!vaiTro) return false;
  if (vaiTro.name === 'Admin') return true;
  const cacQuyen = [cot, ...cotTuongUng(bang, cot)].map(khoa => vaiTro.accessControl?.resources?.[bang]?.columns?.[khoa]);
  if (cacQuyen.some(quyen => quyen === 'edit' || (Array.isArray(quyen) ? quyen.includes('edit') : quyen && typeof quyen === 'object' && quyen.edit === true))) return true;
  if (vaiTro.accessControl?.version === 1) return false;
  const thongTinCot = RESOURCES[bang]?.columns?.find(item => item.key === cot);
  if (thongTinCot?.nhayCam || FIELD_FINANCIAL.has(cot) || cotTuongUng(bang, cot).some(field => FIELD_FINANCIAL.has(field))) {
    return quyenCuChoVaiTro(vaiTro, 'manage_internal_finance') || quyenCuChoVaiTro(vaiTro, 'manage_financials');
  }
  return quyenTheoChinhSach(vaiTro, bang, 'edit');
}

function phamViDuLieu(vaiTro, taiNguyen) {
  if (vaiTro?.name === 'Admin') return 'all';
  if (vaiTro?.accessControl?.version === 1) {
    return vaiTro.accessControl.resources?.[taiNguyen]?.scope || 'none';
  }
  const khoaPhamVi = RESOURCES[taiNguyen]?.scopeKey || taiNguyen;
  return vaiTro?.dataScopes?.[khoaPhamVi]
    || (taiNguyen === 'tasks' ? vaiTro?.dataScopes?.orders : null)
    || 'none';
}

function chinhSachApi(path, method) {
  const duongDan = String(path || '').split('?')[0].replace(/\/+$/, '') || '/';
  const match = API_RESOURCES.find(([prefix]) => duongDan === prefix || duongDan.startsWith(`${prefix}/`));
  if (!match) return null;
  const taiNguyen = match[1];
  if (taiNguyen === 'internalFinance') {
    return { taiNguyen, thaoTac: method === 'GET' ? (duongDan.includes('/export') ? 'export' : 'view') : method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'edit' };
  }
  let thaoTac = method === 'GET' ? 'view' : method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'edit';
  if (duongDan.endsWith('/export')) thaoTac = 'export';
  else if (duongDan.includes('/import')) thaoTac = 'import';
  else if (duongDan.endsWith('/sync') || duongDan.endsWith('/approve') || duongDan.endsWith('/duyet')) thaoTac = 'approve';
  else if (duongDan.includes('/history')) thaoTac = method === 'GET' ? 'view' : 'edit';
  if (taiNguyen === 'configuration' || taiNguyen === 'audit' || taiNguyen === 'permissions') {
    if (method === 'GET') thaoTac = 'view';
    else if (method === 'POST') thaoTac = 'configure';
    else thaoTac = 'edit';
  }
  if (taiNguyen === 'orders' && duongDan.includes('/thanh-toan-san-pham')) return { taiNguyen: 'internalFinance', thaoTac: method === 'GET' ? 'view' : 'edit' };
  if (taiNguyen === 'orders' && duongDan.includes('/ncc-debts')) return { taiNguyen: 'internalFinance', thaoTac: method === 'GET' ? 'view' : 'edit' };
  return { taiNguyen, thaoTac };
}

function layRegistry() {
  const mongoose = require('mongoose');
  const cacCotChuaCauHinh = [];
  const cacBangChuaCauHinh = [];
  const cacTaiNguyen = layDanhSachTaiNguyen();
  const cotDaTim = new Set();
  for (const tenModel of mongoose.modelNames()) {
    const model = mongoose.model(tenModel);
    const taiNguyen = MODEL_RESOURCES[tenModel];
    if (!taiNguyen) {
      cacBangChuaCauHinh.push({ model: tenModel, collection: model.collection.name });
      continue;
    }
    const cotDaDangKy = new Set((RESOURCES[taiNguyen]?.columns || []).map(cot => cot.key));
    for (const cot of Object.keys(model.schema.paths)) {
      if (!['_id', '__v', 'createdAt', 'updatedAt'].includes(cot) && !cotDaDangKy.has(cot)) {
        cacCotChuaCauHinh.push({ model: tenModel, resource: taiNguyen, column: cot });
        const khoa = `${taiNguyen}:${cot}`;
        if (!cotDaTim.has(khoa)) {
          cacTaiNguyen[taiNguyen].columns.push({ key: cot, label: cot, configured: false });
          cotDaTim.add(khoa);
        }
      }
    }
  }
  return {
    actions: [...ACTIONS],
    resources: cacTaiNguyen,
    legacyPermissions: Object.fromEntries(Object.entries(LEGACY_PERMISSIONS).map(([ma, cap]) => [ma, [...cap]])),
    unconfigured: { models: cacBangChuaCauHinh, columns: cacCotChuaCauHinh }
  };
}

function loiAccessControl(cauHinh) {
  if (!cauHinh || cauHinh.version !== 1 || !cauHinh.resources || typeof cauHinh.resources !== 'object' || Array.isArray(cauHinh.resources)) {
    return 'Cấu hình phân quyền không hợp lệ.';
  }
  const registry = layRegistry().resources;
  for (const [taiNguyen, quyTac] of Object.entries(cauHinh.resources)) {
    const resource = registry[taiNguyen];
    if (!resource || !quyTac || typeof quyTac !== 'object' || Array.isArray(quyTac)) return `Tài nguyên "${taiNguyen}" chưa được đăng ký.`;
    if (quyTac.actions !== undefined && (!Array.isArray(quyTac.actions) || quyTac.actions.some(action => action !== 'full' && !resource.actions.includes(action)))) {
      return `Thao tác của "${taiNguyen}" không hợp lệ.`;
    }
    if (quyTac.scope !== undefined && !['none', 'own', 'department', 'all'].includes(quyTac.scope)) {
      return `Phạm vi dữ liệu của "${taiNguyen}" không hợp lệ.`;
    }
    if (quyTac.columns !== undefined) {
      if (!quyTac.columns || typeof quyTac.columns !== 'object' || Array.isArray(quyTac.columns)) return `Quyền cột của "${taiNguyen}" không hợp lệ.`;
      const cacCot = new Set(resource.columns.map(column => column.key));
      for (const [cot, quyen] of Object.entries(quyTac.columns)) {
        if (!cacCot.has(cot)) return `Cột "${cot}" chưa được đăng ký cho "${taiNguyen}".`;
        const danhSachQuyen = Array.isArray(quyen) ? quyen : typeof quyen === 'object' && quyen ? Object.keys(quyen).filter(action => quyen[action]) : [quyen];
        if (danhSachQuyen.some(action => !['view', 'edit'].includes(action) && action !== true)) return `Quyền cột "${cot}" không hợp lệ.`;
      }
    }
  }
  return '';
}

function layDanhSachTaiNguyen() {
  return Object.fromEntries(Object.entries(RESOURCES).map(([ma, cauHinh]) => [
    ma,
    {
      label: cauHinh.label,
      actions: [...cauHinh.actions],
      scopeKey: cauHinh.scopeKey,
      ...(cauHinh.maCongCu ? { maCongCu: cauHinh.maCongCu } : {}),
      columns: (cauHinh.columns || []).map(cot => ({ ...cot }))
    }
  ]));
}

module.exports = { RESOURCES, LEGACY_PERMISSIONS, CONG_CU, duocXemCongCu, duocDungCongCu, choPhepCongCuTheoCauHinh, loiQuyenCongCu, quyenTheoChinhSach, quyenMa, quyenCot, quyenSuaCot, cotTuongUng, phamViDuLieu, chinhSachApi, layRegistry, loiAccessControl };
