// Nút "Kiểm Tra": đơn chưa kích hoạt và đơn đã kích hoạt nhưng chưa thanh toán, có sửa nhanh.
(function () {
  const state = { type: 'inactive', items: [], total: 0 };
  const money = value => (Number(value) || 0).toLocaleString('vi-VN');
  const esc = value => (typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? ''));
  const el = id => document.getElementById(id);

  function ensureButton() {
    document.getElementById('btnOrderCheck')?.closest('#actionButtonsGroup') && el('btnOrderCheck').remove();
    const form = el('cdFilters');
    if (!form || form.querySelector('#btnOrderCheck')) return;
    form.insertAdjacentHTML('beforeend', '<button class="cd-report-button cd-check-button" id="btnOrderCheck" type="button" onclick="openOrderCheck()"><i class="fa-solid fa-clipboard-check"></i> Kiểm Tra</button>');
  }

  const selected = new Set();
  function nextMonthFirst(value) {
    const match = String(value || '').match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    const base = match ? new Date(Number(match[3]), Number(match[2]) - 1, 1) : new Date();
    base.setMonth(base.getMonth() + 1, 1);
    return `01/${String(base.getMonth() + 1).padStart(2, '0')}/${base.getFullYear()}`;
  }

  function bulkStatusOptions() {
    const list = typeof getProductStatusOptions === 'function' ? getProductStatusOptions('') : [];
    return list.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }

  function employeeOptions() {
    const names = [...document.querySelectorAll('#cdEmployee option')].map(o => o.textContent.trim()).filter((n, i) => o_valid(n));
    return [...new Set(names)].map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  }
  const o_valid = name => name && !/^tất cả/i.test(name);

  function initialFilters() {
    const emp = el('cdEmployee');
    const employee = emp && emp.value ? emp.options[emp.selectedIndex].textContent.trim() : '';
    return { employee, customer: (el('cdCustomer')?.value || '').trim(), year: el('cdYear')?.value || String(new Date().getFullYear()), month: el('cdMonth')?.value || '' };
  }

  window.openOrderCheck = function () {
    const initial = initialFilters();
    el('orderCheckModal')?.remove();
    const now = new Date().getFullYear();
    const years = Array.from({ length: 7 }, (_, i) => now - 5 + i).reverse();
    document.body.insertAdjacentHTML('beforeend', `<div class="modal order-check-modal active" id="orderCheckModal" onclick="if(event.target === this) closeOrderCheck()"><div class="modal-content">
      <div class="modal-header"><h3><i class="fa-solid fa-clipboard-check"></i> Kiểm tra đơn hàng</h3><button type="button" class="modal-close-btn" onclick="closeOrderCheck()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="order-check-tabs"><button type="button" data-type="inactive" class="is-active">Chưa kích hoạt</button><button type="button" data-type="unpaid">Đã kích hoạt - chưa thanh toán</button></div>
      <div class="order-check-bar">
        <select id="ocYear" class="form-select"><option value="ALL">Tất cả năm</option>${years.map(y => `<option value="${y}" ${String(y) === String(initial.year) ? 'selected' : ''}>Năm ${y}</option>`).join('')}</select>
        <select id="ocMonth" class="form-select"><option value="ALL">Tất cả tháng</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${String(i + 1) === String(initial.month) ? 'selected' : ''}>Tháng ${i + 1}</option>`).join('')}</select>
        <select id="ocEmployee" class="form-select"><option value="ALL">Tất cả nhân viên</option>${employeeOptions()}</select>
        <label class="order-check-toggle"><input type="checkbox" id="ocHideCancelled" checked> Bỏ hủy</label>
        <input id="ocCustomer" class="form-input" placeholder="Khách hàng..." value="${esc(initial.customer)}">
        <input id="ocSearch" class="form-input" placeholder="Lọc theo mã/khách/NV...">
        <button type="button" class="btn btn-primary" id="ocRun"><i class="fa-solid fa-magnifying-glass"></i> Kiểm tra</button>
        <span class="order-check-summary" id="ocSummary"></span>
      </div>
      <div class="order-check-bulk" id="ocBulk" hidden><strong id="ocSelCount"></strong><select id="ocBulkStatus" class="form-select"><option value="">Đổi trạng thái...</option>${bulkStatusOptions()}</select><button type="button" class="btn btn-primary" id="ocBulkApply">Áp dụng</button><button type="button" class="btn btn-success" id="ocBulkPaid">Thanh toán đủ</button><button type="button" class="btn btn-secondary" id="ocBulkMonth"><i class="fa-solid fa-calendar-arrow-down"></i> Chuyển tháng</button></div>
      <div class="order-check-body" id="ocBody"><div class="order-check-empty">Bấm "Kiểm tra" để xem kết quả.</div></div></div></div>`);
    const modal = el('orderCheckModal');
    modal.querySelectorAll('.order-check-tabs button').forEach(btn => btn.addEventListener('click', () => {
      state.type = btn.dataset.type;
      selected.clear();
      modal.querySelectorAll('.order-check-tabs button').forEach(b => b.classList.toggle('is-active', b === btn));
      run();
    }));
    el('ocRun').addEventListener('click', run);
    ['ocYear', 'ocMonth', 'ocEmployee', 'ocHideCancelled'].forEach(id => el(id).addEventListener('change', run));
    el('ocSearch').addEventListener('input', render);
    el('ocCustomer').addEventListener('keydown', event => { if (event.key === 'Enter') run(); });
    el('ocCustomer').addEventListener('change', run);
    if (initial.employee) el('ocEmployee').value = initial.employee;
    state.type = 'inactive';
    selected.clear();
    run();
  };
  window.closeOrderCheck = () => el('orderCheckModal')?.remove();

  async function run() {
    const body = el('ocBody');
    body.innerHTML = '<div class="order-check-empty"><i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...</div>';
    try {
      const params = new URLSearchParams({ type: state.type, year: el('ocYear').value, month: el('ocMonth').value, employee: el('ocEmployee').value, customer: el('ocCustomer').value.trim(), excludeCancelled: el('ocHideCancelled').checked ? '1' : '0' });
      const response = await fetch(`${API_URL}/check?${params}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể kiểm tra.');
      state.items = result.data.items;
      state.total = result.data.total;
      render();
    } catch (error) { body.innerHTML = `<div class="order-check-empty">Lỗi: ${esc(error.message)}</div>`; }
  }

  function visibleItems() {
    const q = (el('ocSearch')?.value || '').trim().toLowerCase();
    if (!q) return state.items;
    return state.items.filter(o => [o['Mã Đơn Hàng'], o['Tên Khách Hàng'], o['Tên Công Ty '], o['Nhân Viên Đăng Ký']].some(v => String(v || '').toLowerCase().includes(q)));
  }

  function debtOf(order) {
    return (Number(order['Thực Thu']) || 0) - (Number(order['KH Thanh Toán']) || 0);
  }

  function payOptions(current) {
    const list = typeof getOrderPaymentMethodOptions === 'function' ? [...getOrderPaymentMethodOptions(current || '')] : [];
    if (current && !list.includes(current)) list.unshift(current);
    return list.includes('') ? list : ['', ...list];
  }

  function statusColorClass(value) {
    const status = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (status.includes('tu choi')) return 'oc-status--rejected';
    if (status.includes('hoan tat') || status.includes('thanh toan') || status.includes('kich hoat')) return 'oc-status--success';
    if (status.includes('dang xu ly')) return 'oc-status--processing';
    if (status.includes('da duyet')) return 'oc-status--approved';
    if (status.includes('da dang ky')) return 'oc-status--registered';
    if (status.includes('soan ho so')) return 'oc-status--draft';
    return 'oc-status--default';
  }

  function render() {
    const items = visibleItems();
    const totalDebt = state.type === 'unpaid' ? items.reduce((sum, o) => sum + debtOf(o), 0) : 0;
    el('ocSummary').textContent = `${state.total} đơn${state.total > state.items.length ? ` (hiện ${state.items.length})` : ''}${state.type === 'unpaid' ? ` • Còn nợ ${money(totalDebt)} đ` : ''}`;
    if (!items.length) { el('ocBody').innerHTML = '<div class="order-check-empty"><i class="fa-solid fa-circle-check"></i> Không có đơn nào cần xử lý.</div>'; return; }
    const rows = items.map(o => {
      const id = esc(o._id);
      const current = o['TÌNH TRẠNG'] || 'Soạn Hồ Sơ';
      const options = typeof getProductStatusOptions === 'function' ? getProductStatusOptions(o['LOẠI SẢN PHẨM'] || '') : [current];
      if (!options.includes(current)) options.unshift(current);
      return `<tr data-id="${id}"><td><input type="checkbox" class="oc-select" ${selected.has(String(o._id)) ? 'checked' : ''}></td><td><strong>${esc(o['Mã Đơn Hàng'] || '--')}</strong><br><small>${esc(o['Ngày Đăng Ký'] || '--')}</small></td><td><strong>${esc(o.MST || '--')}</strong><br><small>${esc(o['Tên Công Ty '] || '')}</small></td><td>${esc(o['Tên Khách Hàng'] || '--')}<br><small>${esc(o['Nhân Viên Đăng Ký'] || '--')}</small></td><td><strong>${esc(o.NCC || '--')}</strong><br><small>${esc(o['Gói '] || '')}</small></td><td class="num">${money(o['Thành Tiền'])}</td><td><input class="form-input oc-paid oc-actual" type="number" min="0" value="${Number(o['Thực Thu']) || 0}"></td><td><input class="form-input oc-paid" type="number" min="0" value="${Number(o['KH Thanh Toán']) || 0}"></td><td class="num" style="color:#f43f5e;font-weight:700;">${money(debtOf(o))}</td><td><select class="form-select oc-status ${statusColorClass(current)}">${options.map(s => `<option value="${esc(s)}" ${s === current ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select><select class="form-select oc-pay" style="margin-top:.35rem">${payOptions(o['Hình Thức Thanh Toán']).map(s => `<option value="${esc(s)}" ${s === (o['Hình Thức Thanh Toán'] || '') ? 'selected' : ''}>${esc(s || '-- Chọn hình thức --')}</option>`).join('')}</select></td><td><div class="oc-actions"><button type="button" class="btn btn-primary oc-save" title="Lưu thanh toán"><i class="fa-solid fa-floppy-disk"></i></button><button type="button" class="btn btn-success oc-full" title="Thanh toán đủ"><i class="fa-solid fa-check-double"></i></button></div></td></tr>`;
    }).join('');
    el('ocBody').innerHTML = `<table><thead><tr><th><input type="checkbox" id="ocSelectAll" title="Chọn tất cả"></th><th>Mã đơn / Ngày ĐK</th><th>MST / Tên công ty</th><th>Khách hàng / Nhân viên</th><th>NCC / Gói cước</th><th style="text-align:right">Thành tiền</th><th style="text-align:right">Thực thu</th><th>Đã thanh toán</th><th style="text-align:right">Còn nợ</th><th>Trạng thái / Hình thức TT</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    syncBulk(items);
  }

  function syncBulk(items = visibleItems()) {
    const ids = new Set(items.map(o => String(o._id)));
    [...selected].forEach(id => { if (!ids.has(id)) selected.delete(id); });
    el('ocBulk').hidden = selected.size === 0;
    el('ocSelCount').textContent = `Đã chọn ${selected.size} đơn`;
    const all = el('ocSelectAll');
    if (all) { all.checked = items.length > 0 && selected.size === items.length; all.indeterminate = selected.size > 0 && selected.size < items.length; }
  }

  async function bulkSave(buildPatch, label) {
    const targets = state.items.filter(o => selected.has(String(o._id)));
    if (!targets.length || !confirm(`${label} cho ${targets.length} đơn?`)) return;
    let failed = 0;
    for (const order of targets) {
      try {
        const patch = buildPatch(order);
        const response = await fetch(`${API_URL}/update/${order._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, historyReason: 'Sửa hàng loạt từ nút Kiểm Tra' }) });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message);
        Object.assign(order, patch);
        const cached = (typeof allOrders !== 'undefined' ? allOrders : []).find(o => String(o._id) === String(order._id));
        if (cached) Object.assign(cached, patch);
        selected.delete(String(order._id));
      } catch (error) { failed++; console.error('Chuyển hàng loạt lỗi:', error); }
    }
    state.items = state.items.filter(o => state.type === 'inactive' ? !/kích hoạt/i.test(o['TÌNH TRẠNG'] || '') : (/kích hoạt/i.test(o['TÌNH TRẠNG'] || '') && /^\s*chưa\s+thanh\s+toán\s*$/i.test(o['Hình Thức Thanh Toán'] || '')));
    state.total = Math.max(state.items.length, state.total - (targets.length - failed));
    render();
    if (failed) alert(`Có ${failed} đơn không lưu được.`);
    else if (typeof showAppToast === 'function') showAppToast('Đã cập nhật hàng loạt.');
  }

  document.addEventListener('change', event => {
    if (event.target.id === 'ocSelectAll') {
      visibleItems().forEach(o => event.target.checked ? selected.add(String(o._id)) : selected.delete(String(o._id)));
      render();
    } else if (event.target.matches?.('#orderCheckModal .oc-select')) {
      const id = event.target.closest('tr').dataset.id;
      event.target.checked ? selected.add(id) : selected.delete(id);
      syncBulk();
    }
  });
  document.addEventListener('click', event => {
    if (event.target.closest?.('#ocBulkApply')) {
      const status = el('ocBulkStatus').value;
      if (!status) return alert('Vui lòng chọn trạng thái.');
      bulkSave(() => ({ 'TÌNH TRẠNG': status }), `Đổi trạng thái thành "${status}"`);
    } else if (event.target.closest?.('#ocBulkMonth')) {
      bulkSave(o => ({ 'Ngày Đăng Ký': nextMonthFirst(o['Ngày Đăng Ký']) }), 'Chuyển ngày đăng ký sang ngày 01 tháng sau');
    } else if (event.target.closest?.('#ocBulkPaid')) {
      bulkSave(o => ({ 'KH Thanh Toán': Number(o['Thành Tiền']) || 0, 'Còn lại': 0 }), 'Đánh dấu thanh toán đủ');
    }
  });

  async function save(row, patch) {
    const order = state.items.find(o => String(o._id) === row.dataset.id);
    if (!order) return;
    try {
      const response = await fetch(`${API_URL}/update/${order._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, historyReason: 'Sửa nhanh từ nút Kiểm Tra' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể lưu.');
      Object.assign(order, patch);
      const cached = (typeof allOrders !== 'undefined' ? allOrders : []).find(o => String(o._id) === row.dataset.id);
      if (cached) Object.assign(cached, patch);
      const stillMatches = state.type === 'inactive' ? !/kích hoạt/i.test(order['TÌNH TRẠNG'] || '') : (/kích hoạt/i.test(order['TÌNH TRẠNG'] || '') && /^\s*chưa\s+thanh\s+toán\s*$/i.test(order['Hình Thức Thanh Toán'] || ''));
      if (!stillMatches) { state.items = state.items.filter(o => o !== order); state.total = Math.max(0, state.total - 1); }
      render();
      try { if (typeof renderPagedTable === 'function') renderPagedTable(); } catch (e) { /* tab đơn hàng chưa mở */ }
      if (typeof showAppToast === 'function') showAppToast('Đã lưu thay đổi.');
    } catch (error) { alert(`Không thể lưu: ${error.message}`); }
  }

  document.addEventListener('change', event => {
    const select = event.target.closest?.('#orderCheckModal .oc-status');
    if (select) {
      select.className = `form-select oc-status ${statusColorClass(select.value)}`;
      return save(select.closest('tr'), { 'TÌNH TRẠNG': select.value });
    }
    const pay = event.target.closest?.('#orderCheckModal .oc-pay');
    if (pay) save(pay.closest('tr'), { 'Hình Thức Thanh Toán': pay.value });
  });
  document.addEventListener('click', event => {
    const row = event.target.closest?.('#orderCheckModal tr[data-id]');
    if (!row) return;
    const order = state.items.find(o => String(o._id) === row.dataset.id);
    if (!order) return;
    if (event.target.closest('.oc-save')) {
      const paid = Math.max(0, Number(row.querySelector('.oc-paid:not(.oc-actual)').value) || 0);
      const actual = Math.max(0, Number(row.querySelector('.oc-actual').value) || 0);
      save(row, { 'Thực Thu': actual, 'KH Thanh Toán': paid, 'Còn lại': Math.max(0, (Number(order['Thành Tiền']) || 0) - paid) });
    } else if (event.target.closest('.oc-full')) {
      save(row, { 'KH Thanh Toán': Number(order['Thành Tiền']) || 0, 'Còn lại': 0 });
    }
  });

  ensureButton();
  new MutationObserver(ensureButton).observe(document.body, { childList: true, subtree: true });
})();