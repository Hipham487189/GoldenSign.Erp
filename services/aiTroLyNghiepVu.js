const AI_ACTION_MARKER = '__AI_ACTION_JSON__';
const LEGACY_TASK_MARKER = '__TASK_JSON__';
const LEGACY_INVOICE_MARKER = '__INVOICE_JSON__';

const ALLOWED_ACTION_TYPES = new Set([
  'create_order',
  'update_order',
  'upload_unc',
  'create_hoso',
  'advance_hoso',
  'create_giao_nhan',
  'advance_giao_nhan',
  'create_invoice',
  'create_task'
]);

const STOP_WORDS = new Set([
  'nhap', 'tao', 'len', 'sua', 'chinh', 'don', 'hang', 'moi', 'cu', 'mst',
  'ma', 'so', 'thue', 'goi', 'san', 'pham', 'khach', 'cong', 'ty', 'cty',
  'cho', 'giup', 'dum', 'anh', 'chi', 'em', 'co', 'chu', 'bac', 'ten',
  'dia', 'chi', 'sdt', 'so', 'dien', 'thoai', 'email', 'up', 'unc',
  'xuat', 'hoa', 'nop', 'ho', 'giao', 'nhan', 'ncc', 'thanh', 'tien'
]);

function chuanHoaKhongDau(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function moRongVietTat(normText) {
  return String(normText || '')
    .replace(/\bcks\b/g, 'chu ky so')
    .replace(/\bhddt\b/g, 'hoa don dien tu')
    .replace(/\bbhxh\b/g, 'bao hiem xa hoi')
    .replace(/\bpmkt\b/g, 'phan mem ke toan')
    .replace(/\bktdv\b/g, 'ktdv')
    .replace(/\bkn\b/g, 'khoi nghiep')
    .replace(/\b([1-5])n\b/g, '$1 nam')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(str) {
  const s = String(str || '').replace(/\s+/g, '');
  const set = new Map();
  for (let i = 0; i < s.length - 1; i += 1) {
    const bg = s.slice(i, i + 2);
    set.set(bg, (set.get(bg) || 0) + 1);
  }
  return set;
}

function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  const s1 = a.replace(/\s+/g, '');
  const s2 = b.replace(/\s+/g, '');
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const map1 = bigrams(s1);
  const map2 = bigrams(s2);
  let overlap = 0;
  for (const [bg, count1] of map1.entries()) {
    const count2 = map2.get(bg) || 0;
    overlap += Math.min(count1, count2);
  }
  return (2 * overlap) / (s1.length - 1 + (s2.length - 1));
}

function tinhDiemKhopGanDung(queryNorm, candidateNorm) {
  if (!queryNorm || !candidateNorm) return 0;
  const qTokens = queryNorm.split(' ').filter(t => t.length >= 1);
  const cTokens = candidateNorm.split(' ').filter(t => t.length >= 1);
  if (!qTokens.length || !cTokens.length) return 0;

  let matchedOnCandidate = 0;
  for (const ct of cTokens) {
    let best = 0;
    for (const qt of qTokens) {
      if (ct === qt) { best = 1; break; }
      if (ct.includes(qt) || qt.includes(ct)) {
        best = Math.max(best, 0.88);
      } else if (qt.length >= 3 && ct.length >= 3) {
        const sim = diceSimilarity(qt, ct);
        if (sim >= 0.52) best = Math.max(best, sim * 0.85);
      }
    }
    matchedOnCandidate += best;
  }

  const candidateCoverage = matchedOnCandidate / cTokens.length;
  const matchedCountBonus = Math.min(0.4, matchedOnCandidate * 0.08);
  const phraseBonus = candidateNorm.includes(queryNorm) ? 0.35 : 0;
  return candidateCoverage * 0.75 + matchedCountBonus + phraseBonus;
}

function trichXuatTuKhoa(message) {
  const norm = moRongVietTat(chuanHoaKhongDau(message));
  const tokens = norm
    .split(' ')
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t) && !/^\d{9,14}$/.test(t));
  return { norm, tokens: [...new Set(tokens)] };
}

function parseSoTien(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const num = Number(String(val ?? '').replace(/[^0-9-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

async function traCuuMstVietQr(mst, fetchImpl = fetch) {
  const cleanMst = String(mst || '').replace(/[^0-9-]/g, '').trim();
  if (!cleanMst || cleanMst.replace(/\D/g, '').length < 10) return null;
  try {
    const resp = await fetchImpl(`https://api.vietqr.io/v2/business/${encodeURIComponent(cleanMst)}`, {
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(4500) : undefined
    });
    if (!resp.ok) return null;
    const json = await resp.json().catch(() => ({}));
    if (json?.code === '00' && json?.data) {
      return {
        mst: cleanMst,
        tenCongTy: String(json.data.name || '').trim(),
        diaChiCongTy: String(json.data.address || json.data.diaChi || json.data.addresses || '').trim()
      };
    }
    return null;
  } catch (_) {
    return null;
  }
}

async function boSungNguCanhThongMinh({
  message,
  Customer,
  SanPham,
  canViewCustomers = false,
  canViewFinancials = false,
  fetchImpl = fetch
} = {}) {
  const text = String(message || '').trim();
  const mstMatch = text.match(/\b\d{10}(?:-\d{3})?\b/)?.[0] || '';
  const { norm, tokens } = trichXuatTuKhoa(text);

  const tasks = [];

  // 1. Tra cứu MST doanh nghiệp qua VietQR
  tasks.push(mstMatch ? traCuuMstVietQr(mstMatch, fetchImpl) : Promise.resolve(null));

  // 2. Tìm khách hàng trong MongoDB theo MST hoặc từ khóa tên
  if (canViewCustomers && Customer && typeof Customer.find === 'function') {
    const orConds = [];
    if (mstMatch) {
      const safeMst = mstMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      orConds.push({ mst: new RegExp(safeMst, 'i') });
    }
    const nameTokens = tokens.filter(t => t.length >= 2 && !/^\d+$/.test(t)).slice(0, 6);
    nameTokens.forEach(t => {
      const safeT = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      orConds.push({ name: new RegExp(safeT, 'i') });
      orConds.push({ company: new RegExp(safeT, 'i') });
      orConds.push({ notes: new RegExp(safeT, 'i') });
    });

    if (orConds.length) {
      tasks.push(
        Customer.find({ isActive: { $ne: false }, $or: orConds })
          .select('_id code name phone email mst company deliveryAddress')
          .limit(40)
          .lean()
          .catch(() => [])
      );
    } else {
      tasks.push(Promise.resolve([]));
    }
  } else {
    tasks.push(Promise.resolve([]));
  }

  // 3. Tìm gói sản phẩm (hỗ trợ viết tắt & sai chính tả nhẹ)
  if (SanPham && typeof SanPham.find === 'function') {
    const pkgTokens = tokens.filter(t => t.length >= 2).slice(0, 8);
    const pkgFilter = pkgTokens.length
      ? {
          $or: pkgTokens.flatMap(t => {
            const safeT = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp(safeT, 'i');
            return [
              { 'TÊN SẢN PHẨM': rx },
              { 'Tên Sản Phẩm': rx },
              { 'Gói ': rx },
              { Gói: rx },
              { NCC: rx },
              { 'LOẠI SẢN PHẨM': rx },
              { 'Loại Sản Phẩm': rx }
            ];
          })
        }
      : {};

    tasks.push(
      SanPham.find(pkgFilter)
        .select({
          'TÊN SẢN PHẨM': 1, 'Tên Sản Phẩm': 1, 'Gói ': 1, Gói: 1,
          'LOẠI SẢN PHẨM': 1, 'Loại Sản Phẩm': 1, NCC: 1,
          'HÌnh Thức': 1, 'Hình Thức': 1,
          'GIÁ SAU THUẾ': 1, 'SAU THUẾ': 1, 'Giá Sau Thuế': 1, 'Gia Sau Thuế': 1, 'Gia Sau Thue': 1,
          'THỰC ĐÓNG CÔNG TY': 1, 'Thực Đóng Công Ty': 1, 'Thực Đóng Cty': 1,
          'THỰC CÔNG NỢ CTY': 1, 'THỰC CÔNG NỢ CTY (VNĐ)': 1
        })
        .limit(120)
        .lean()
        .catch(() => [])
    );
  } else {
    tasks.push(Promise.resolve([]));
  }

  const [mstLookup, rawCustomers, rawProducts] = await Promise.all(tasks);

  const queryKeywords = tokens.join(' ') || norm;

  // Chấm điểm & xếp hạng khách hàng khớp nhất
  const matchedCustomers = (rawCustomers || [])
    .map(c => {
      const fullStr = chuanHoaKhongDau(`${c.name || ''} ${c.company || ''} ${c.code || ''}`);
      let score = tinhDiemKhopGanDung(queryKeywords, fullStr);
      if (mstMatch && String(c.mst || '').includes(mstMatch)) score += 1.5;
      return {
        score,
        id: String(c._id),
        code: c.code || '',
        name: c.name || '',
        phone: c.phone || '',
        email: c.email || '',
        mst: c.mst || '',
        company: c.company || '',
        deliveryAddress: c.deliveryAddress || ''
      };
    })
    .filter(c => c.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score, ...rest }) => rest);

  // Chấm điểm & xếp hạng gói sản phẩm khớp nhất
  const matchedPackages = (rawProducts || [])
    .map(p => {
      const tenGoi = String(p['TÊN SẢN PHẨM'] || p['Tên Sản Phẩm'] || p['Gói '] || p.Gói || '').trim();
      const loaiSanPham = String(p['LOẠI SẢN PHẨM'] || p['Loại Sản Phẩm'] || '').trim();
      const ncc = String(p.NCC || '').trim();
      const hinhThuc = String(p['Hình Thức'] || p['HÌnh Thức'] || '').trim();
      const giaSauThue = parseSoTien(p['GIÁ SAU THUẾ'] ?? p['SAU THUẾ'] ?? p['Giá Sau Thuế'] ?? p['Gia Sau Thuế'] ?? p['Gia Sau Thue']);
      const thucDongCongTy = canViewFinancials
        ? parseSoTien(p['THỰC ĐÓNG CÔNG TY'] ?? p['Thực Đóng Công Ty'] ?? p['Thực Đóng Cty'] ?? p['THỰC CÔNG NỢ CTY'] ?? p['THỰC CÔNG NỢ CTY (VNĐ)'])
        : undefined;

      const candidateNorm = moRongVietTat(chuanHoaKhongDau(`${loaiSanPham} ${ncc} ${tenGoi} ${hinhThuc}`));
      const score = tinhDiemKhopGanDung(queryKeywords, candidateNorm);

      return {
        score,
        tenGoi,
        loaiSanPham,
        ncc,
        hinhThuc,
        giaSauThue,
        ...(thucDongCongTy !== undefined ? { thucDongCongTy } : {})
      };
    })
    .filter(p => p.tenGoi && p.score >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ score, ...rest }) => rest);

  return { mstLookup, matchedCustomers, matchedPackages };
}

function chuanHoaLichSu(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-10)
    .map(item => ({
      role: item?.role === 'assistant' || item?.role === 'bot' ? 'Trợ lý' : 'Nhân viên',
      text: String(item?.text || '').trim().slice(0, 1200)
    }))
    .filter(item => item.text);
}

function xayDungPromptTroLy({ message, context = '', history = [], userInfo = {} } = {}) {
  const lichSu = chuanHoaLichSu(history);
  const lichSuText = lichSu.length
    ? lichSu.map(item => `${item.role}: ${item.text}`).join('\n')
    : 'Chưa có lịch sử trước đó.';

  const nhanVienTen = String(userInfo.employeeName || userInfo.username || '').trim();
  const vaiTro = String(userInfo.role || '').trim();

  return [
    'Bạn là AI Trợ Lý Nghiệp Vụ nội bộ của hệ thống DATAGS (GoldenSign ERP).',
    'Luôn trả lời bằng tiếng Việt ngắn gọn, rõ ràng, thân thiện, chính xác.',
    'TUYỆT ĐỐI chỉ sử dụng dữ liệu được cung cấp trong ngữ cảnh; không tự bịa mã đơn, MST, số tiền hoặc ID.',
    'QUY TẮC TỰ ĐỘNG TRA CỨU KHI NHẬP ĐƠN:',
    '- Nếu context có "mstLookup" (từ VietQR/hệ thống), tự động lấy "tenCongTy" và "diaChiCongTy" từ đó.',
    '- Nếu context có "matchedCustomers", tự động chọn khách hàng khớp nhất để điền "customerId", "tenKhachHang", "sdt", "email" (nếu có).',
    '- Nếu context có "matchedPackages", hãy tự động đối chiếu gói người dùng nói (kể cả viết tắt như CKS, HDDT, BHXH hoặc sai chính tả nhẹ) với gói khớp nhất trong "matchedPackages" để điền chuẩn "goi", "ncc", "loaiSanPham", "hinhThuc", "thanhTien" (giaSauThue), "thucDongCongTy".',
    '- Khi đã có MST/khách hàng và gói khớp từ dữ liệu tra cứu, HÃY XUẤT NGAY thẻ hành động create_order (không cần hỏi lại nếu chỉ thiếu email hoặc địa chỉ giao nhận phụ). Chỉ hỏi lại khi thật sự không tìm thấy khách hàng/gói hoặc có nhiều kết quả mơ hồ.',
    '',
    `Người dùng hiện tại: ${nhanVienTen || 'Nhân viên'} (Vai trò: ${vaiTro || 'Chưa rõ'}).`,
    '',
    'KHI ĐÃ ĐỦ THÔNG TIN ĐỂ THỰC HIỆN MỘT TRONG CÁC TÁC VỤ SAU, hãy trả lời ngắn gọn xác nhận tóm tắt, rồi thêm ĐÚNG MỘT dòng cuối cùng theo mẫu (không bọc ```json, không markdown):',
    `${AI_ACTION_MARKER}{"type":"...","summary":"...","data":{...}}`,
    '',
    'Danh sách các type được hỗ trợ và cấu trúc data:',
    '1) "create_order" (Nhập đơn mới vào Quản lý đơn hàng):',
    '   data: {"ngayDangKy":"DD/MM/YYYY","customerId":"<id nếu khớp matchedCustomers>","tenKhachHang":"...","sdt":"...","tenCongTy":"...","mst":"...","diaChiCongTy":"...","email":"...","loaiSanPham":"Chữ Ký Số|Hóa Đơn Điện Tử|BHXH|Phần Mềm Kế Toán|Khác","ncc":"...","hinhThuc":"Cấp mới|Gia hạn|Chuyển đổi","goi":"...","thanhTien":number,"thucDongCongTy":number,"hinhThucThanhToan":"Chưa Thanh Toán|Chuyển Khoản|Tiền Mặt","ghiChu":"..."}',
    '   Bắt buộc tối thiểu: tenKhachHang (hoặc tenCongTy), và ncc hoặc goi.',
    '2) "update_order" (Chỉnh sửa đơn hàng bị sai):',
    '   data: {"orderId":"<ObjectId trong context>","orderCode":"DH...","updates":{"Tên Khách Hàng":"...","SĐT":"...","Tên Công Ty ":"...","MST":"...","NCC":"...","Gói ":"...","Thành Tiền":number,"TÌNH TRẠNG":"...","Hình Thức Thanh Toán":"...","Email":"..."}}',
    '   Bắt buộc xác định được duy nhất orderId (hoặc orderCode) từ dữ liệu và ít nhất 1 trường cần sửa trong updates.',
    '3) "upload_unc" (Up phiếu UNC cho đơn hàng):',
    '   data: {"orderId":"<ObjectId trong context>","orderCode":"DH...","soTien":number,"ngayThanhToan":"YYYY-MM-DD","tenNganHang":"...","maGiaoDich":"...","noiDung":"..."}',
    '   Lưu ý: Nếu context đã có uncExtracted (từ ảnh/PDF đính kèm), ưu tiên lấy số liệu từ uncExtracted; bắt buộc xác định được duy nhất đơn hàng và soTien > 0, ngayThanhToan.',
    '4) "create_hoso" (Tạo hồ sơ mới để Nộp Hồ Sơ):',
    '   data: {"mst":"...","tenCongTy":"...","loai":"...","ncc":"...","goi":"...","ghiChu":"..."}',
    '5) "advance_hoso" (Chuyển bước / xử lý quy trình Nộp Hồ Sơ):',
    '   data: {"hoSoId":"<ID hồ sơ như HS-...>","hanhDong":"chuyen|lui","nccNop":"...","ghiChu":"..."}',
    '6) "create_giao_nhan" (Tạo phiếu Giao nhận / CPN mới):',
    '   data: {"ngayGui":"DD/MM/YYYY","tenKhachHang":"...","tenCongTy":"...","sdt":"...","mst":"...","diaChiNguoiNhan":"...","loaiCongViec":"...","mucDichCpn":"...","donViCpn":"...","ghiChu":"..."}',
    '   Bắt buộc: tenKhachHang hoặc tenCongTy, và diaChiNguoiNhan.',
    '7) "advance_giao_nhan" (Cập nhật bước Giao nhận):',
    '   data: {"giaoNhanId":"<ObjectId trong context>","maPhieu":"GN...","buoc":"da_kich_hoat|dang_giao|da_giao","nguoiGiao":"...","donViCpn":"...","soBill":"...","chiPhi":number,"ghiChu":"..."}',
    '8) "create_invoice" (Xuất hóa đơn cho đơn hàng):',
    '   data: {"orderId":"<ObjectId trong context>","orderCode":"DH...","company":"..."}',
    '   Chỉ xuất khi xác định được duy nhất 1 đơn hàng từ dữ liệu.',
    '9) "create_task" (Giao việc / tạo ghi chú công việc):',
    '   data: {"title":"...","description":"...","owner":"...","due":"YYYY-MM-DD hoặc để trống","priority":"Cao|Trung bình|Thấp"}',
    '',
    'Lịch sử hội thoại gần đây:',
    lichSuText,
    '',
    'Dữ liệu hệ thống hiện tại (JSON):',
    String(context || '{}').slice(0, 16000),
    '',
    'Yêu cầu mới nhất của người dùng:',
    String(message || '').trim()
  ].join('\n');
}

function parseJsonSafe(raw) {
  try {
    const cleaned = String(raw || '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function tachHanhDongTuPhanHoi(rawAnswer) {
  const text = String(rawAnswer || '').trim();
  if (!text) return { answer: '', action: null };

  const aiIndex = text.lastIndexOf(AI_ACTION_MARKER);
  if (aiIndex >= 0) {
    const rawJson = text.slice(aiIndex + AI_ACTION_MARKER.length).trim().split('\n')[0];
    const parsed = parseJsonSafe(rawJson);
    const cleanAnswer = text.slice(0, aiIndex).trim();
    if (parsed && ALLOWED_ACTION_TYPES.has(parsed.type)) {
      return {
        answer: cleanAnswer || 'Tôi đã chuẩn bị thông tin tác vụ. Vui lòng kiểm tra và bấm Xác nhận thực hiện.',
        action: {
          type: parsed.type,
          summary: String(parsed.summary || '').trim(),
          data: parsed.data && typeof parsed.data === 'object' ? parsed.data : {}
        }
      };
    }
    return { answer: cleanAnswer, action: null };
  }

  const taskIndex = text.lastIndexOf(LEGACY_TASK_MARKER);
  if (taskIndex >= 0) {
    const parsed = parseJsonSafe(text.slice(taskIndex + LEGACY_TASK_MARKER.length).trim().split('\n')[0]);
    const cleanAnswer = text.slice(0, taskIndex).trim();
    return {
      answer: cleanAnswer,
      action: parsed ? { type: 'create_task', summary: parsed.title || 'Tạo công việc', data: parsed } : null
    };
  }

  const invIndex = text.lastIndexOf(LEGACY_INVOICE_MARKER);
  if (invIndex >= 0) {
    const parsed = parseJsonSafe(text.slice(invIndex + LEGACY_INVOICE_MARKER.length).trim().split('\n')[0]);
    const cleanAnswer = text.slice(0, invIndex).trim();
    return {
      answer: cleanAnswer,
      action: parsed ? { type: 'create_invoice', summary: `Xuất hóa đơn ${parsed.orderCode || ''}`.trim(), data: parsed } : null
    };
  }

  return { answer: text, action: null };
}

module.exports = {
  AI_ACTION_MARKER,
  ALLOWED_ACTION_TYPES,
  chuanHoaKhongDau,
  moRongVietTat,
  tinhDiemKhopGanDung,
  boSungNguCanhThongMinh,
  xayDungPromptTroLy,
  tachHanhDongTuPhanHoi
};
