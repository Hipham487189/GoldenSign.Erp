(function () {
  const history = [];
  let pendingAttachment = null; // { name, mimeType, dataUrl, uncExtracted }
  let actionSeq = 0;
  const pendingActions = new Map();

  const ACTION_META = {
    create_order: { label: 'Nhập đơn hàng mới', icon: 'fa-solid fa-cart-plus' },
    update_order: { label: 'Chỉnh sửa đơn hàng', icon: 'fa-solid fa-pen-to-square' },
    upload_unc: { label: 'Cập nhật phiếu UNC', icon: 'fa-solid fa-file-invoice-dollar' },
    create_hoso: { label: 'Tạo hồ sơ nộp', icon: 'fa-solid fa-folder-plus' },
    advance_hoso: { label: 'Chuyển bước hồ sơ', icon: 'fa-solid fa-share-nodes' },
    create_giao_nhan: { label: 'Tạo phiếu giao nhận', icon: 'fa-solid fa-truck-fast' },
    advance_giao_nhan: { label: 'Cập nhật giao nhận', icon: 'fa-solid fa-truck-ramp-box' },
    create_invoice: { label: 'Xuất hóa đơn', icon: 'fa-solid fa-file-invoice' },
    create_task: { label: 'Tạo công việc', icon: 'fa-solid fa-list-check' }
  };

  const TEMPLATES = {
    create_order: 'Nhập đơn mới: Khách hàng [Tên KH], SĐT [SĐT], Công ty [Tên công ty], MST [MST], NCC [VIETTEL/VINA/BKAV...], Gói [Tên gói], Thành tiền [Số tiền].',
    update_order: 'Sửa đơn [Mã đơn DH...]: đổi [trường cần sửa] thành [giá trị mới].',
    upload_unc: 'Up UNC cho đơn [Mã đơn DH...] (hãy đính kèm ảnh/PDF UNC bằng nút kẹp ghim hoặc Ctrl+V).',
    create_hoso: 'Nộp hồ sơ cho MST [MST], Công ty [Tên công ty], loại [Chữ ký số/Hóa đơn...], NCC [NCC].',
    create_giao_nhan: 'Tạo giao nhận cho khách [Tên KH], SĐT [SĐT], địa chỉ nhận [Địa chỉ], nội dung [Bàn giao token/hồ sơ...].',
    create_invoice: 'Xuất hóa đơn cho đơn [Mã đơn DH... hoặc MST].'
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function baseUrl() {
    return window.API_BASE_URL || '';
  }

  function todayVn() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  async function safeGetJson(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (_) {
      return null;
    }
  }

  function extractLookupTerm(message) {
    const text = String(message || '');
    const orderCode = text.match(/DH-?\d{4}-\d{4,6}/i)?.[0];
    if (orderCode) return orderCode;
    const hoSoCode = text.match(/HS-[A-Za-z0-9-]+/i)?.[0];
    if (hoSoCode) return hoSoCode;
    const mst = text.match(/\b\d{10}(?:-\d{3})?\b/)?.[0];
    if (mst) return mst;
    return '';
  }

  async function gatherAgentContext(message, uncExtracted) {
    const term = extractLookupTerm(message) || extractLookupTerm(uncExtracted?.noiDungChuyenKhoan || '');
    const jobs = [];

    if (term) {
      jobs.push(safeGetJson(`${baseUrl()}/api/orders?${new URLSearchParams({ q: term, page: '1', limit: '15' })}`));
    } else {
      jobs.push(Promise.resolve(null));
    }

    if (/hồ sơ|ho so|nộp|nop|HS-/i.test(message)) {
      const qHs = term || '';
      jobs.push(safeGetJson(`${baseUrl()}/api/hoso?${new URLSearchParams({ q: qHs, page: '1', limit: '10' })}`));
    } else {
      jobs.push(Promise.resolve(null));
    }

    if (/giao nhận|giao nhan|cpn|ship|bill|GN/i.test(message)) {
      jobs.push(safeGetJson(`${baseUrl()}/api/giao-nhan?${new URLSearchParams({ q: term || '', page: '1', limit: '10' })}`));
    } else {
      jobs.push(Promise.resolve(null));
    }

    if (/nhập đơn|tạo đơn|lên đơn|sửa đơn|gói|ncc/i.test(message)) {
      jobs.push(safeGetJson(`${baseUrl()}/api/sanpham?${new URLSearchParams({ page: '1', limit: '25' })}`));
    } else {
      jobs.push(Promise.resolve(null));
    }

    const [ordersRes, hosoRes, giaoNhanRes, sanPhamRes] = await Promise.all(jobs);

    const localOrders = typeof window.allOrders !== 'undefined' && Array.isArray(window.allOrders)
      ? window.allOrders.slice(-25)
      : [];
    const fetchedOrders = ordersRes?.data?.items || [];
    const mergedOrders = [...new Map([...localOrders, ...fetchedOrders].map(o => [String(o._id), o])).values()]
      .slice(0, 25)
      .map(o => ({
        id: o._id,
        ma: o['Mã Đơn Hàng'],
        ngay: o['Ngày Đăng Ký'],
        khachHang: o['Tên Khách Hàng'],
        congTy: o['Tên Công Ty '],
        mst: o['MST'],
        sdt: o['SĐT'],
        ncc: o['NCC'],
        goi: o['Gói '],
        thanhTien: o['Thành Tiền'],
        tinhTrang: o['TÌNH TRẠNG'],
        trangThaiUnc: o['Trạng Thái UNC']
      }));

    const hoSoList = (hosoRes?.data?.items || []).slice(0, 10).map(h => ({
      ID: h.ID,
      MST: h.MST,
      tenCongTy: h['TÊN CÔNG TY'],
      loai: h['LOẠI'],
      ncc: h.NCC,
      buoc: h.quyTrinhHoSo?.buocHienTai || '',
      nguoiGiu: h.quyTrinhHoSo?.nguoiGiu || ''
    }));

    const giaoNhanList = (giaoNhanRes?.data?.items || []).slice(0, 10).map(g => ({
      id: g._id,
      ma: g.ID,
      khachHang: g['TÊN KHÁCH HÀNG'],
      congTy: g['TÊN CÔNG TY'],
      mst: g.MST,
      tinhTrang: g['TÌNH TRẠNG'],
      nguoiGiao: g['Nhân Viên Thực Hiện']
    }));

    const sanPhamList = (sanPhamRes?.data?.items || sanPhamRes?.data || []).slice(0, 25).map(p => ({
      ncc: p.NCC,
      loai: p['LOẠI SẢN PHẨM'] || p['Loại Sản Phẩm'],
      goi: p['TÊN SẢN PHẨM'] || p['Tên Sản Phẩm'] || p['Gói '],
      gia: p['GIÁ SAU THUẾ'] || p['Giá Sau Thuế'] || p['SAU THUẾ']
    }));

    const employees = (window.allEmployees || [])
      .filter(e => e.isActive !== false)
      .slice(0, 40)
      .map(e => e.name);

    return JSON.stringify({
      orders: mergedOrders,
      hoSoList,
      giaoNhanList,
      sanPhamList,
      employees,
      uncExtracted: uncExtracted || null
    });
  }

  function renderAttachmentBar() {
    const bar = document.getElementById('aiChatAttachBar');
    const nameEl = document.getElementById('aiChatAttachName');
    if (!bar || !nameEl) return;
    if (!pendingAttachment) {
      bar.hidden = true;
      nameEl.textContent = '';
      return;
    }
    bar.hidden = false;
    nameEl.textContent = pendingAttachment.name || 'tep-unc';
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function attachUncFile(file) {
    if (!file) return;
    const isOkType = /^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type) || file.type === 'application/pdf';
    if (!isOkType) {
      alert('Chỉ hỗ trợ ảnh (PNG, JPG, WEBP, GIF) hoặc tệp PDF cho phiếu UNC.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      alert('Tệp UNC đính kèm tối đa 6MB.');
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    pendingAttachment = {
      name: file.name || `unc-${Date.now()}.png`,
      mimeType: file.type,
      dataUrl,
      uncExtracted: null
    };
    renderAttachmentBar();
  }

  function clearAttachment() {
    pendingAttachment = null;
    renderAttachmentBar();
  }

  function renderActionCard(action, uncFileSnapshot) {
    const id = `act-${++actionSeq}`;
    pendingActions.set(id, { action, uncFileSnapshot });
    const meta = ACTION_META[action.type] || { label: 'Thực hiện tác vụ', icon: 'fa-solid fa-bolt' };
    const entries = flattenFields(action.data || {});

    const fieldsHtml = entries.length
      ? `<dl class="ai-action-fields">${entries.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
      : '';

    return `
      <div class="ai-action-card" id="${id}">
        <div class="ai-action-title"><i class="${meta.icon}"></i> ${esc(meta.label)}</div>
        ${action.summary ? `<div class="ai-action-summary">${esc(action.summary)}</div>` : ''}
        ${fieldsHtml}
        <div class="ai-action-buttons">
          <button type="button" class="ai-action-btn-confirm" onclick="AiAgentChat.confirmAction('${id}')">
            <i class="fa-solid fa-check"></i> Xác nhận thực hiện
          </button>
          <button type="button" class="ai-action-btn-cancel" onclick="AiAgentChat.cancelAction('${id}')">Hủy</button>
        </div>
        <div class="ai-action-result" id="${id}-result"></div>
      </div>
    `;
  }

  function flattenFields(obj, prefix = '') {
    const out = [];
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (typeof v === 'object' && !Array.isArray(v)) {
        out.push(...flattenFields(v, prefix ? `${prefix}.${k}` : k));
      } else {
        out.push([prefix ? `${prefix}.${k}` : k, Array.isArray(v) ? v.join(', ') : String(v)]);
      }
    });
    return out.slice(0, 12);
  }

  async function apiPostJson(url, method, payload) {
    const resp = await fetch(`${baseUrl()}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await resp.json().catch(() => ({}));
    if (!resp.ok || !res.success) {
      throw new Error(res.message || `Lỗi máy chủ (HTTP ${resp.status})`);
    }
    return res;
  }

  async function resolveOrderId(data) {
    if (data.orderId) return data.orderId;
    if (!data.orderCode) throw new Error('Thiếu mã đơn hàng để xác định đơn.');
    const res = await safeGetJson(`${baseUrl()}/api/orders?${new URLSearchParams({ q: data.orderCode, page: '1', limit: '5' })}`);
    const match = (res?.data?.items || []).find(o => String(o['Mã Đơn Hàng'] || '').toUpperCase() === String(data.orderCode).toUpperCase());
    if (!match?._id) throw new Error(`Không tìm thấy đơn hàng ${data.orderCode}.`);
    return match._id;
  }

  async function executeAction(action, uncFileSnapshot) {
    const d = action.data || {};
    switch (action.type) {
      case 'create_order': {
        const payload = {
          ...(d.customerId ? { customerId: d.customerId } : {}),
          'Ngày Đăng Ký': d.ngayDangKy || todayVn(),
          'Tên Khách Hàng': d.tenKhachHang || d.tenCongTy || '',
          'SĐT': d.sdt || '',
          'Tên Công Ty ': d.tenCongTy || '',
          'MST': d.mst || '',
          'Địa Chỉ Công Ty': d.diaChiCongTy || '',
          'Email': d.email || '',
          'Loại Sản Phẩm': d.loaiSanPham || 'Chữ Ký Số',
          'NCC': d.ncc || '',
          'Hình Thức': d.hinhThuc || 'Cấp mới',
          'Gói ': d.goi || '',
          'Thành Tiền': Number(d.thanhTien || 0),
          'Thực Đóng Công Ty': Number(d.thucDongCongTy || 0),
          'Hình Thức Thanh Toán': d.hinhThucThanhToan || 'Chưa Thanh Toán',
          'Ghi Chú': d.ghiChu || ''
        };
        const res = await apiPostJson('/api/orders/create', 'POST', payload);
        if (typeof window.loadOrders === 'function' && window.currentTab === 'orders') window.loadOrders();
        return `Đã tạo đơn hàng mới: ${res.data?.['Mã Đơn Hàng'] || 'Thành công'}.`;
      }

      case 'update_order': {
        const orderId = await resolveOrderId(d);
        if (!d.updates || !Object.keys(d.updates).length) {
          throw new Error('Không có trường thông tin nào cần cập nhật.');
        }
        await apiPostJson(`/api/orders/update/${encodeURIComponent(orderId)}`, 'PUT', d.updates);
        if (typeof window.loadOrders === 'function' && window.currentTab === 'orders') window.loadOrders();
        return `Đã cập nhật đơn hàng ${d.orderCode || orderId}.`;
      }

      case 'upload_unc': {
        const orderId = await resolveOrderId(d);
        const payload = {
          'Số Tiền UNC': Number(d.soTien || 0),
          'Ngày Thanh Toán UNC': d.ngayThanhToan || todayIso(),
          'Nội Dung UNC': d.noiDung || '',
          'Tên Ngân Hàng UNC': d.tenNganHang || '',
          'Mã Giao Dịch UNC': d.maGiaoDich || ''
        };
        if (uncFileSnapshot?.dataUrl) {
          payload['Ảnh UNC'] = uncFileSnapshot.dataUrl;
          payload['Tên File UNC'] = uncFileSnapshot.name || 'unc.png';
        }
        await apiPostJson(`/api/orders/unc/${encodeURIComponent(orderId)}`, 'PATCH', payload);
        if (typeof window.loadOrders === 'function' && window.currentTab === 'orders') window.loadOrders();
        return `Đã cập nhật phiếu UNC (Chờ Duyệt) cho đơn ${d.orderCode || orderId}.`;
      }

      case 'create_hoso': {
        const res = await apiPostJson('/api/hoso', 'POST', {
          data: {
            MST: d.mst || '',
            'TÊN CÔNG TY': d.tenCongTy || '',
            'LOẠI': d.loai || 'Chữ Ký Số',
            NCC: d.ncc || '',
            'GÓI': d.goi || '',
            'GHI CHÚ': d.ghiChu || ''
          }
        });
        return res.message || `Đã tạo hồ sơ ${res.data?.ID || ''}.`;
      }

      case 'advance_hoso': {
        if (!d.hoSoId) throw new Error('Thiếu mã hồ sơ (ID).');
        const res = await apiPostJson(`/api/hoso/${encodeURIComponent(d.hoSoId)}/quy-trinh`, 'PATCH', {
          hanhDong: d.hanhDong || 'chuyen',
          nccNop: d.nccNop || '',
          ghiChu: d.ghiChu || ''
        });
        return res.message || `Đã cập nhật quy trình hồ sơ ${d.hoSoId}.`;
      }

      case 'create_giao_nhan': {
        const res = await apiPostJson('/api/giao-nhan', 'POST', {
          'NGÀY GỬI': d.ngayGui || todayVn(),
          'TÊN KHÁCH HÀNG': d.tenKhachHang || d.tenCongTy || '',
          'TÊN CÔNG TY': d.tenCongTy || '',
          'SỐ ĐIỆN THOẠI': d.sdt || '',
          MST: d.mst || '',
          'ĐỊA CHỈ NGƯỜI NHẬN': d.diaChiNguoiNhan || '',
          'LOẠI CÔNG VIỆC': d.loaiCongViec || 'Giao hồ sơ / Token',
          'MỤC ĐÍCH CPN': d.mucDichCpn || '',
          'ĐƠN VỊ CPN': d.donViCpn || '',
          'GHI CHÚ NHU CẦU KHÁCH HÀNG': d.ghiChu || ''
        });
        return `Đã tạo phiếu giao nhận ${res.data?.ID || ''}.`;
      }

      case 'advance_giao_nhan': {
        if (!d.giaoNhanId) throw new Error('Thiếu ID phiếu giao nhận.');
        const res = await apiPostJson(`/api/giao-nhan/${encodeURIComponent(d.giaoNhanId)}/quy-trinh`, 'PATCH', {
          buoc: d.buoc || 'dang_giao',
          nguoiGiao: d.nguoiGiao || '',
          donViCpn: d.donViCpn || '',
          soBill: d.soBill || '',
          chiPhi: d.chiPhi || '',
          ghiChu: d.ghiChu || ''
        });
        return res.message || 'Đã cập nhật bước giao nhận.';
      }

      case 'create_invoice': {
        const orderId = await resolveOrderId(d);
        if (typeof window.xuatHoaDonVina === 'function') {
          await window.xuatHoaDonVina(orderId);
          return `Đã gửi yêu cầu xuất hóa đơn cho đơn ${d.orderCode || orderId}.`;
        }
        const res = await apiPostJson('/api/invoice/push-smartsign', 'POST', { orderId });
        return res.message || 'Đã xuất hóa đơn thành công.';
      }

      case 'create_task': {
        if (typeof window.addAiTaskDraft === 'function') {
          window.addAiTaskDraft(d);
          return 'Đã xử lý tạo công việc.';
        }
        throw new Error('Không tìm thấy trình tạo công việc.');
      }

      default:
        throw new Error(`Tác vụ "${action.type}" chưa được hỗ trợ.`);
    }
  }

  async function confirmAction(id) {
    const entry = pendingActions.get(id);
    const card = document.getElementById(id);
    const resultEl = document.getElementById(`${id}-result`);
    if (!entry || !card || !resultEl) return;

    const btn = card.querySelector('.ai-action-btn-confirm');
    const cancelBtn = card.querySelector('.ai-action-btn-cancel');
    if (btn) btn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    resultEl.className = 'ai-action-result';
    resultEl.textContent = 'Đang thực thi...';

    try {
      const msg = await executeAction(entry.action, entry.uncFileSnapshot);
      resultEl.textContent = msg;
      if (btn) btn.remove();
      if (cancelBtn) cancelBtn.remove();
      pendingActions.delete(id);
    } catch (error) {
      resultEl.className = 'ai-action-result error';
      resultEl.textContent = error.message || 'Thực hiện thất bại.';
      if (btn) btn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  function cancelAction(id) {
    pendingActions.delete(id);
    const card = document.getElementById(id);
    if (card) {
      card.querySelector('.ai-action-buttons')?.remove();
      const res = document.getElementById(`${id}-result`);
      if (res) {
        res.className = 'ai-action-result error';
        res.textContent = 'Đã hủy thao tác.';
      }
    }
  }

  function useTemplate(type) {
    const input = document.getElementById('aiChatInput');
    if (!input) return;
    input.value = TEMPLATES[type] || '';
    input.focus();
  }

  function resetChat() {
    history.length = 0;
    pendingActions.clear();
    clearAttachment();
    const body = document.getElementById('aiChatBody');
    if (body) {
      body.innerHTML = '<div class="ai-chat-message bot">Xin chào! Tôi là AI Trợ Lý Nghiệp Vụ DATAGS. Bạn có thể yêu cầu tôi: <b>Nhập đơn hàng</b>, <b>Sửa đơn sai</b>, <b>Up UNC</b> (kèm ảnh/PDF), <b>Nộp hồ sơ</b>, <b>Giao nhận</b> hoặc <b>Xuất hóa đơn</b>.</div>';
    }
  }

  async function sendAiChatAgent() {
    const input = document.getElementById('aiChatInput');
    const body = document.getElementById('aiChatBody');
    const message = input?.value.trim();
    if ((!message && !pendingAttachment) || !body) return;

    const finalMsg = message || `Đọc phiếu UNC đính kèm (${pendingAttachment?.name || 'UNC'}) và chuẩn bị Up UNC.`;
    const fileSnapshot = pendingAttachment ? { ...pendingAttachment } : null;

    body.insertAdjacentHTML(
      'beforeend',
      `<div class="ai-chat-message user">${esc(finalMsg)}${fileSnapshot ? `<div style="margin-top:4px;font-size:.72rem;opacity:.85;"><i class="fa-solid fa-paperclip"></i> ${esc(fileSnapshot.name)}</div>` : ''}</div>`
    );
    input.value = '';
    clearAttachment();

    body.insertAdjacentHTML('beforeend', '<div class="ai-chat-message bot" id="aiTyping"><i class="fa-solid fa-spinner fa-spin"></i> Đang phân tích yêu cầu...</div>');
    body.scrollTop = body.scrollHeight;

    try {
      let uncExtracted = null;
      if (fileSnapshot?.dataUrl) {
        const uncRes = await fetch(`${baseUrl()}/api/orders/unc/doc-ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: fileSnapshot.dataUrl })
        });
        const uncJson = await uncRes.json().catch(() => ({}));
        if (uncRes.ok && uncJson.success) {
          uncExtracted = uncJson.data || null;
        } else {
          throw new Error(uncJson.message || 'Không thể đọc tệp UNC bằng AI.');
        }
      }

      const context = await gatherAgentContext(finalMsg, uncExtracted);
      const response = await fetch(`${baseUrl()}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: finalMsg,
          context,
          history: history.slice(-10)
        })
      });
      const result = await response.json().catch(() => ({}));
      document.getElementById('aiTyping')?.remove();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'AI không phản hồi.');
      }

      const answerText = result.answer || '';
      history.push({ role: 'user', text: finalMsg });
      history.push({ role: 'assistant', text: answerText });

      const actionHtml = result.action ? renderActionCard(result.action, fileSnapshot) : '';
      body.insertAdjacentHTML('beforeend', `<div class="ai-chat-message bot">${esc(answerText).replace(/\n/g, '<br>')}${actionHtml}</div>`);
    } catch (error) {
      document.getElementById('aiTyping')?.remove();
      body.insertAdjacentHTML('beforeend', `<div class="ai-chat-message bot" style="color:#f43f5e;">${esc(error.message)}</div>`);
    }
    body.scrollTop = body.scrollHeight;
  }

  function bindPasteAndFile() {
    const input = document.getElementById('aiChatInput');
    if (input && !input.dataset.agentBound) {
      input.dataset.agentBound = '1';
      input.addEventListener('paste', e => {
        const items = Array.from(e.clipboardData?.items || []);
        const imgItem = items.find(it => it.type && it.type.startsWith('image/'));
        if (imgItem) {
          e.preventDefault();
          attachUncFile(imgItem.getAsFile());
        }
      });
    }
    const fileInput = document.getElementById('aiChatFileInput');
    if (fileInput && !fileInput.dataset.agentBound) {
      fileInput.dataset.agentBound = '1';
      fileInput.addEventListener('change', e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) attachUncFile(file);
      });
    }
  }

  window.sendAiChat = sendAiChatAgent;
  window.AiAgentChat = {
    confirmAction,
    cancelAction,
    useTemplate,
    resetChat,
    clearAttachment,
    triggerFile: () => document.getElementById('aiChatFileInput')?.click()
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPasteAndFile);
  } else {
    bindPasteAndFile();
  }
})();
