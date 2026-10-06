(function () {
  const money = value => `${Math.round(Number(value || 0)).toLocaleString('vi-VN')} đ`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const monthName = month => `Tháng ${String(month).padStart(2, '0')}`;
  const apiBase = () => `${window.API_BASE_URL}/api/cong-no/nhan-vien`;
  const FEES = [['salary', 'Lương'], ['advance', 'Tạm ứng (được trừ)'], ['dossierFee', 'Trả phí hồ sơ'], ['otherFee', 'Phí khác'], ['deliveryFee', 'Trả phí giao nhận']];
  let ctx = null;
  let data = null;
  let modal = null;

  async function call(path, params = {}, options = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    const response = await fetch(`${apiBase()}/${path}${query ? `?${query}` : ''}`, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể xử lý yêu cầu công nợ nhân viên.');
    return result;
  }

  const tone = value => (value > 0 ? 'cd-warning' : 'cd-positive');
  const netClass = net => (net > 0 ? 'cd-positive' : net < 0 ? 'cd-warning' : '');

  function kpis(s) {
    const items = [
      ['Công nợ phát sinh', s.incurred, `${s.orderCount} đơn • Thực Đóng Công Ty`, 'cd-kpi-sales'],
      ['Nợ cũ', s.opening, 'Còn nợ tháng trước', 'cd-kpi-debt'],
      ['Tổng phải thu', s.totalDue, 'Nợ cũ + phát sinh', 'cd-kpi-debt'],
      ['Đã thanh toán', s.paid, `UNC ${money(s.uncPaid)} + trực tiếp ${money(s.directPaid)}`, 'cd-kpi-paid'],
      ['Còn nợ', s.remaining, s.overpay ? `Thanh toán dư ${money(s.overpay)}` : 'Nhân viên phải nộp công ty', s.remaining ? 'cd-kpi-open' : 'cd-kpi-clear'],
      ['Công ty phải trả NV', s.payable, 'Lương + phí − tạm ứng', 'cd-kpi-sales'],
      ['Đối soát ròng', s.net, s.status, s.net < 0 ? 'cd-kpi-open' : 'cd-kpi-clear']
    ];
    return `<div class="cd-kpis">${items.map(([label, value, note, cls]) => `<article class="cd-kpi ${cls}"><span class="cd-kpi-label">${esc(label)}</span><strong>${money(value)}</strong><small>${esc(note)}</small></article>`).join('')}</div>`;
  }

  function debtTable(months) {
    const sum = key => months.reduce((total, row) => total + row[key], 0);
    const rows = months.map(row => `<tr class="${row.month === data.month ? 'edb-current' : ''}"><td class="cd-month">${monthName(row.month)}</td><td>${money(row.opening)}${row.adjustment ? ' <span class="edb-over" title="Đã điều chỉnh">đã chỉnh</span>' : ''}${data.canEdit ? ` <button type="button" class="cd-link-button" data-edb="opening" data-month="${row.month}" title="Điều chỉnh nợ đầu kỳ" aria-label="Điều chỉnh nợ đầu kỳ"><i class="fa-solid fa-pen"></i></button>` : ''}</td>
      <td><button type="button" class="cd-link-button" data-edb="orders" data-month="${row.month}">${money(row.incurred)}</button></td><td>${money(row.totalDue)}</td>
      <td><button type="button" class="cd-link-button" data-edb="payments" data-month="${row.month}">${money(row.paid)}</button></td>
      <td class="${tone(row.remaining)}">${money(row.remaining)}</td><td>${row.overpay ? `<span class="edb-over">${money(row.overpay)}</span>` : '—'}</td></tr>`).join('');
    return `<section class="cd-card"><div class="cd-section-heading"><div><h3>Công nợ nhân viên phải nộp công ty</h3><p>Bấm số “Phát sinh” hoặc “Đã thanh toán” để xem chi tiết</p></div></div>
      <div class="cd-table-scroll"><table class="cd-table"><thead><tr><th>Tháng</th><th>Nợ cũ</th><th>Công nợ phát sinh</th><th>Tổng phải thu</th><th>Đã thanh toán</th><th>Còn nợ</th><th>Thanh toán dư</th></tr></thead>
      <tbody>${rows}<tr class="cd-total-row"><th>TỔNG NĂM</th><th>—</th><th><button type="button" class="cd-link-button" data-edb="orders" data-month="0">${money(sum('incurred'))}</button></th><th>—</th><th><button type="button" class="cd-link-button" data-edb="payments" data-month="0">${money(sum('paid'))}</button></th><th>—</th><th>${money(sum('overpay'))}</th></tr></tbody></table></div></section>`;
  }

  function payableTable(months) {
    const sum = key => months.reduce((total, row) => total + row[key], 0);
    const rows = months.map(row => `<tr class="${row.month === data.month ? 'edb-current' : ''}"><td class="cd-month">${monthName(row.month)}</td><td>${money(row.salary)}</td><td>${money(row.advance)}</td><td>${money(row.dossierFee)}</td><td>${money(row.otherFee)}</td><td>${money(row.deliveryFee)}</td>
      <td class="${netClass(row.payable)}"><strong>${money(row.payable)}</strong></td>${data.canEdit ? `<td><button type="button" class="cd-link-button" data-edb="edit" data-month="${row.month}"><i class="fa-solid fa-pen"></i> Nhập</button></td>` : ''}</tr>`).join('');
    return `<section class="cd-card"><div class="cd-section-heading"><div><h3>Các khoản công ty phải trả nhân viên</h3><p>Công ty phải trả = Lương + Phí hồ sơ + Phí khác + Phí giao nhận − Tạm ứng${data.canEdit ? '' : (ctx.isAdmin ? ' • Chọn một nhân viên để nhập số liệu' : '')}</p></div></div>
      <div class="cd-table-scroll"><table class="cd-table"><thead><tr><th>Tháng</th><th>Lương</th><th>Tạm ứng</th><th>Phí hồ sơ</th><th>Phí khác</th><th>Phí giao nhận</th><th>Công ty phải trả</th>${data.canEdit ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows}<tr class="cd-total-row"><th>TỔNG NĂM</th><th>${money(sum('salary'))}</th><th>${money(sum('advance'))}</th><th>${money(sum('dossierFee'))}</th><th>${money(sum('otherFee'))}</th><th>${money(sum('deliveryFee'))}</th><th>${money(sum('payable'))}</th>${data.canEdit ? '<th></th>' : ''}</tr></tbody></table></div></section>`;
  }

  function settlementTable(months) {
    const rows = months.map(row => `<tr class="${row.month === data.month ? 'edb-current' : ''}"><td class="cd-month">${monthName(row.month)}</td><td class="${tone(row.remaining)}">${money(row.remaining)}</td><td>${money(row.payable)}</td>
      <td class="${netClass(row.net)}"><strong>${money(row.net)}</strong></td><td class="${netClass(row.net)}">${esc(row.status)}</td></tr>`).join('');
    return `<section class="cd-card"><div class="cd-section-heading"><div><h3>Đối soát</h3><p>Đối soát ròng = Công ty phải trả NV − NV còn nợ. Dương: công ty còn phải trả • Âm: nhân viên còn phải nộp</p></div></div>
      <div class="cd-table-scroll"><table class="cd-table"><thead><tr><th>Tháng</th><th>NV còn nợ</th><th>Công ty phải trả NV</th><th>Đối soát ròng</th><th>Trạng thái</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  function draw() {
    const { container, notice } = ctx;
    if (notice) {
      notice.hidden = false;
      notice.textContent = 'Công nợ phát sinh tính theo “Thực Đóng Công Ty” của đơn đã kích hoạt (theo ngày đăng ký). Đã thanh toán = UNC đã duyệt + thanh toán trực tiếp. Nợ cũ của tháng = Còn nợ tháng trước; thanh toán dư không cộng sang tháng sau.';
    }
    const label = data.employee || 'Tất cả nhân viên';
    container.innerHTML = `<div class="cd-period"><span><i class="fa-regular fa-calendar"></i> ${esc(label)} • ${monthName(data.month)}/${data.year}</span><span>${data.summary.orderCount} đơn trong tháng</span></div>
      ${kpis(data.summary)}${debtTable(data.months)}${payableTable(data.months)}${settlementTable(data.months)}`;
  }

  function closeModal() { modal?.remove(); modal = null; }
  function openModal(html) {
    closeModal();
    modal = document.createElement('div');
    modal.className = 'edb-modal';
    modal.innerHTML = `<div class="edb-card" role="dialog" aria-modal="true"><button type="button" class="edb-close" aria-label="Đóng">&times;</button>${html}</div>`;
    modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('.edb-close')) closeModal(); });
    document.body.appendChild(modal);
    return modal;
  }

  const periodText = month => (month ? `${monthName(month)}/${data.year}` : `Năm ${data.year}`);

  async function showOrders(month, ncc = '', page = 1) {
    const body = openModal('<div class="cd-loading">Đang tải...</div>');
    try {
      const { data: d } = await call('orders', { employeeId: ctx.filters.employeeId, year: data.year, month: month || '', ncc, page, limit: 50 });
      const summary = data.months[month - 1];
      const matches = d.totalCost === summary.incurred || ncc;
      body.querySelector('.edb-card').innerHTML = `<button type="button" class="edb-close" aria-label="Đóng">&times;</button>
        <h3>Công nợ phát sinh • ${periodText(month)}</h3>
        <div class="edb-toolbar"><label>NCC <select id="edbNcc"><option value="">Tất cả NCC (${d.suppliers.reduce((s, x) => s + x.count, 0)})</option>${d.suppliers.map(s => `<option value="${esc(s.ncc)}" ${s.ncc === ncc ? 'selected' : ''}>${esc(s.ncc || 'Không rõ NCC')} — ${s.count} đơn — ${money(s.cost)}</option>`).join('')}</select></label>
        <span class="edb-total">Tổng: <strong>${money(d.totalCost)}</strong> ${matches ? '' : '<em class="edb-warn">(không khớp số phát sinh)</em>'}</span></div>
        <div class="cd-table-scroll"><table class="cd-table"><thead><tr><th>Mã đơn</th><th>Ngày đơn</th><th>NCC</th><th>Nhân viên</th><th>Thực Đóng Công Ty</th><th>UNC đã thanh toán</th><th>Còn phải thu</th></tr></thead>
        <tbody>${d.items.length ? d.items.map(o => `<tr><td>${esc(o.code)}</td><td>${esc(o.date)}</td><td>${esc(o.ncc)}</td><td>${esc(o.employee)}</td><td>${money(o.cost)}</td><td class="cd-positive">${money(o.uncPaid)}</td><td class="${tone(o.remaining)}">${money(o.remaining)}</td></tr>`).join('') : '<tr><td colspan="7" class="cd-empty">Không có đơn hàng.</td></tr>'}</tbody></table></div>
        <div class="edb-pager"><span>${d.total} đơn • Trang ${d.page}/${d.totalPages}</span><span><button type="button" data-p="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''}>Trước</button> <button type="button" data-p="${d.page + 1}" ${d.page >= d.totalPages ? 'disabled' : ''}>Sau</button></span></div>`;
      body.querySelector('#edbNcc').addEventListener('change', event => showOrders(month, event.target.value, 1));
      body.querySelectorAll('[data-p]').forEach(button => button.addEventListener('click', () => showOrders(month, ncc, Number(button.dataset.p))));
    } catch (error) {
      body.querySelector('.edb-card').insertAdjacentHTML('beforeend', `<div class="cd-error">${esc(error.message)}</div>`);
    }
  }

  async function showPayments(month) {
    const body = openModal('<div class="cd-loading">Đang tải...</div>');
    try {
      const { data: d } = await call('payments', { employeeId: ctx.filters.employeeId, year: data.year, month: month || '', limit: 100 });
      body.querySelector('.edb-card').innerHTML = `<button type="button" class="edb-close" aria-label="Đóng">&times;</button>
        <h3>Chi tiết thanh toán • ${periodText(month)}</h3>
        <h4>UNC trên đơn hàng đã duyệt — ${money(d.uncTotal)}</h4>
        <div class="cd-table-scroll"><table class="cd-table"><thead><tr><th>Mã đơn</th><th>Ngày</th><th>Số tiền UNC</th><th>NCC</th><th>Thông tin UNC</th></tr></thead>
        <tbody>${d.unc.length ? d.unc.map(u => `<tr><td>${esc(u.code)}</td><td>${esc(u.date ? new Date(u.date).toLocaleDateString('vi-VN') : '—')}</td><td class="cd-positive">${money(u.amount)}</td><td>${esc(u.ncc || '—')}</td><td>${esc([u.fileName, u.content].filter(Boolean).join(' • ') || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="cd-empty">Không có UNC đã duyệt.</td></tr>'}</tbody></table></div>
        <h4>Thanh toán trực tiếp (Thanh toán → Thanh toán Nhân Viên) — ${money(d.directTotal)}</h4>
        <div class="cd-table-scroll"><table class="cd-table"><thead><tr><th>Ngày thanh toán</th><th>Nhân viên</th><th>Số tiền</th><th>Phương thức</th><th>Nội dung</th><th>Người ghi nhận</th></tr></thead>
        <tbody>${d.items.length ? d.items.map(p => `<tr><td>${esc(p.paymentDate)}</td><td>${esc(p.employee)}</td><td class="cd-positive">${money(p.amount)}</td><td>${esc(p.paymentMethod || '—')}</td><td>${esc(p.note || '—')}</td><td>${esc(p.enteredBy || p.createdBy || '—')}</td></tr>`).join('') : '<tr><td colspan="6" class="cd-empty">Không có thanh toán trực tiếp.</td></tr>'}</tbody></table></div>
        <p class="edb-total">Tổng đã thanh toán: <strong>${money(d.uncTotal + d.directTotal)}</strong>${d.total > d.items.length ? ` • Hiển thị ${d.items.length}/${d.total} phiếu trực tiếp` : ''}</p>`;
    } catch (error) {
      body.querySelector('.edb-card').insertAdjacentHTML('beforeend', `<div class="cd-error">${esc(error.message)}</div>`);
    }
  }

  function showEdit(month) {
    const row = data.months[month - 1];
    const body = openModal(`<h3>Các khoản công ty phải trả • ${esc(data.employee)} • ${periodText(month)}</h3>
      <form class="edb-form">${FEES.map(([key, label]) => `<label>${label}<input type="number" name="${key}" min="0" step="1" value="${row[key] || 0}"></label>`).join('')}
      <p class="edb-hint">Công ty phải trả = Lương + Phí hồ sơ + Phí khác + Phí giao nhận − Tạm ứng: <strong id="edbPreview"></strong></p>
      <div class="edb-actions"><button type="button" class="edb-delete">Xóa dữ liệu tháng</button><button type="submit" class="edb-save">Lưu</button></div><div class="edb-error" hidden></div></form>`);
    const form = body.querySelector('form');
    const value = name => Number(form.elements[name].value) || 0;
    const preview = () => { body.querySelector('#edbPreview').textContent = money(value('salary') + value('dossierFee') + value('otherFee') + value('deliveryFee') - value('advance')); };
    preview();
    form.addEventListener('input', preview);
    const fail = error => { const box = form.querySelector('.edb-error'); box.hidden = false; box.textContent = error.message; };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await call('khoan-phai-tra', {}, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: ctx.filters.employeeId, year: data.year, month, ...Object.fromEntries(FEES.map(([key]) => [key, value(key)])) }) });
        closeModal();
        ctx.reload();
      } catch (error) { fail(error); }
    });
    form.querySelector('.edb-delete').addEventListener('click', async () => {
      if (!window.confirm(`Xóa các khoản phải trả ${periodText(month)} của ${data.employee}?`)) return;
      try {
        await call('khoan-phai-tra', { employeeId: ctx.filters.employeeId, year: data.year, month }, { method: 'DELETE' });
        closeModal();
        ctx.reload();
      } catch (error) { fail(error); }
    });
  }

  function showOpening(month) {
    const row = data.months[month - 1];
    const body = openModal(`<h3>Điều chỉnh nợ cũ • ${esc(data.employee)} • ${periodText(month)}</h3>
      <form class="edb-form"><p class="edb-hint">Nợ cũ hệ thống tính: <strong>${money(row.baseOpening)}</strong>. Nhập số nợ cũ muốn bắt đầu kỳ mới; các tháng sau sẽ tính tiếp từ số này.</p>
      <label>Nợ cũ mới (VNĐ)<input type="number" name="target" min="0" step="1" value="${row.opening}"></label>
      <label>Ghi chú<input type="text" name="note" maxlength="300" placeholder="Ví dụ: chốt sổ dữ liệu cũ"></label>
      <div class="edb-actions"><button type="button" class="edb-delete">Bỏ điều chỉnh</button><button type="submit" class="edb-save">Lưu</button></div><div class="edb-error" hidden></div></form>`);
    const form = body.querySelector('form');
    const fail = error => { const box = form.querySelector('.edb-error'); box.hidden = false; box.textContent = error.message; };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await call('no-dau-ky', {}, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: ctx.filters.employeeId, year: data.year, month, target: Number(form.elements.target.value) || 0, note: form.elements.note.value }) });
        closeModal();
        ctx.reload();
      } catch (error) { fail(error); }
    });
    form.querySelector('.edb-delete').addEventListener('click', async () => {
      try {
        await call('no-dau-ky', { employeeId: ctx.filters.employeeId, year: data.year, month }, { method: 'DELETE' });
        closeModal();
        ctx.reload();
      } catch (error) { fail(error); }
    });
  }

  function bind(container) {
    if (container.dataset.edbBound) return;
    container.dataset.edbBound = '1';
    container.addEventListener('click', event => {
      const button = event.target.closest('[data-edb]');
      if (!button || !data) return;
      const month = Number(button.dataset.month);
      if (button.dataset.edb === 'orders') {
        if (!month) { openModal(`<h3>Công nợ phát sinh</h3><p>Vui lòng bấm vào số của một tháng cụ thể để xem chi tiết đơn hàng.</p>`); return; }
        showOrders(month);
      } else if (button.dataset.edb === 'payments') showPayments(month);
      else if (button.dataset.edb === 'edit') showEdit(month);
      else if (button.dataset.edb === 'opening') showOpening(month);
    });
  }

  async function render(context) {
    ctx = context;
    bind(ctx.container);
    const filters = ctx.filters;
    const result = await call('settlement', { employeeId: filters.employeeId, year: filters.year, month: filters.month });
    data = result.data;
    draw();
  }

  window.EmployeeDebtReport = { render };
})();
