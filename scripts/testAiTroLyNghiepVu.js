const assert = require('assert');
const {
  AI_ACTION_MARKER,
  boSungNguCanhThongMinh,
  xayDungPromptTroLy,
  tachHanhDongTuPhanHoi
} = require('../services/aiTroLyNghiepVu');

function mockChain(items) {
  return {
    select() { return this; },
    limit() { return this; },
    lean: async () => items
  };
}

async function run() {
  // 1. Prompt chứa đủ 4 nhóm nghiệp vụ, lịch sử và người dùng
  const prompt = xayDungPromptTroLy({
    message: 'Nhập đơn cho anh Minh 0909123456',
    context: JSON.stringify({ orders: [] }),
    history: [
      { role: 'user', text: 'Chào AI' },
      { role: 'assistant', text: 'Chào bạn, tôi có thể giúp gì?' }
    ],
    userInfo: { username: 'minh', role: 'Nhân Viên', employeeName: 'Nguyễn Văn Minh' }
  });
  assert.ok(prompt.includes('create_order'));
  assert.ok(prompt.includes('update_order'));
  assert.ok(prompt.includes('upload_unc'));
  assert.ok(prompt.includes('create_hoso'));
  assert.ok(prompt.includes('create_giao_nhan'));
  assert.ok(prompt.includes('create_invoice'));
  assert.ok(prompt.includes('Nguyễn Văn Minh'));
  assert.ok(prompt.includes('Nhân viên: Chào AI'));

  // 2. Tách __AI_ACTION_JSON__ cho create_order
  const res1 = tachHanhDongTuPhanHoi(
    `Tôi đã chuẩn bị đơn hàng mới.\n${AI_ACTION_MARKER}{"type":"create_order","summary":"Đơn anh Minh","data":{"tenKhachHang":"Anh Minh","sdt":"0909123456","ncc":"VIETTEL"}}`
  );
  assert.strictEqual(res1.answer, 'Tôi đã chuẩn bị đơn hàng mới.');
  assert.strictEqual(res1.action.type, 'create_order');
  assert.strictEqual(res1.action.data.tenKhachHang, 'Anh Minh');

  // 3. Tách __AI_ACTION_JSON__ cho upload_unc
  const res2 = tachHanhDongTuPhanHoi(
    `Đã đọc phiếu UNC 1.500.000đ.\n${AI_ACTION_MARKER}{"type":"upload_unc","summary":"Up UNC DH-1126-00001","data":{"orderCode":"DH-1126-00001","soTien":1500000,"ngayThanhToan":"2026-11-27"}}`
  );
  assert.strictEqual(res2.action.type, 'upload_unc');
  assert.strictEqual(res2.action.data.soTien, 1500000);

  // 4. Không có JSON hợp lệ hoặc type lạ -> action null
  const res3 = tachHanhDongTuPhanHoi(
    `Xin lỗi.\n${AI_ACTION_MARKER}{"type":"delete_database","data":{}}`
  );
  assert.strictEqual(res3.answer, 'Xin lỗi.');
  assert.strictEqual(res3.action, null);

  // 5. Tương thích ngược __INVOICE_JSON__
  const res4 = tachHanhDongTuPhanHoi(
    'Đã tìm thấy đơn.\n__INVOICE_JSON__{"orderId":"abc","orderCode":"DH-1126-00002","company":"ABC"}'
  );
  assert.strictEqual(res4.action.type, 'create_invoice');
  assert.strictEqual(res4.action.data.orderCode, 'DH-1126-00002');

  // 6. Test tra cứu thông minh: MST + Khách hàng + Gói viết tắt & sai chính tả
  const CustomerMock = {
    find: () => mockChain([
      { _id: 'cust-ngoc-1', code: 'KH001', name: 'Chị Ngọc KTDV', phone: '0909888777', email: 'ngoc@ktdv.vn', mst: '', company: 'KTDV Ngọc' },
      { _id: 'cust-other', code: 'KH002', name: 'Anh Hùng', phone: '0911222333', email: '', mst: '', company: 'Công ty B' }
    ])
  };
  const SanPhamMock = {
    find: () => mockChain([
      { 'TÊN SẢN PHẨM': 'Chữ Ký Số Khởi Nghiệp 3 Năm', 'LOẠI SẢN PHẨM': 'Chữ Ký Số', NCC: 'VINA', 'Hình Thức': 'Cấp mới', 'GIÁ SAU THUẾ': 1850000, 'THỰC ĐÓNG CÔNG TY': 900000 },
      { 'TÊN SẢN PHẨM': 'Hóa Đơn Điện Tử 300 Số', 'LOẠI SẢN PHẨM': 'Hóa Đơn Điện Tử', NCC: 'VIETTEL', 'Hình Thức': 'Cấp mới', 'GIÁ SAU THUẾ': 500000, 'THỰC ĐÓNG CÔNG TY': 250000 }
    ])
  };
  const mockVietQrFetch = async (url) => {
    assert.ok(url.includes('0315505043'));
    return {
      ok: true,
      async json() {
        return {
          code: '00',
          data: { name: 'CÔNG TY TNHH MẪU 0315505043', address: 'Quận 1, TP. Hồ Chí Minh' }
        };
      }
    };
  };

  const smart = await boSungNguCanhThongMinh({
    message: 'Nhập Đơn Hàng Mới MST: 0315505043\nGói CKS khởi ngiệp 3 năm\nChị Ngọc KTDV',
    Customer: CustomerMock,
    SanPham: SanPhamMock,
    canViewCustomers: true,
    canViewFinancials: true,
    fetchImpl: mockVietQrFetch
  });

  assert.strictEqual(smart.mstLookup.tenCongTy, 'CÔNG TY TNHH MẪU 0315505043');
  assert.strictEqual(smart.mstLookup.diaChiCongTy, 'Quận 1, TP. Hồ Chí Minh');
  assert.strictEqual(smart.matchedCustomers[0].id, 'cust-ngoc-1');
  assert.strictEqual(smart.matchedCustomers[0].phone, '0909888777');
  assert.strictEqual(smart.matchedPackages[0].tenGoi, 'Chữ Ký Số Khởi Nghiệp 3 Năm');
  assert.strictEqual(smart.matchedPackages[0].ncc, 'VINA');
  assert.strictEqual(smart.matchedPackages[0].giaSauThue, 1850000);

  console.log('✅ Tất cả kiểm thử AI Trợ Lý Nghiệp Vụ (bao gồm tra cứu thông minh) đã đạt!');
}

run().catch(err => {
  console.error('❌ Test thất bại:', err);
  process.exit(1);
});
