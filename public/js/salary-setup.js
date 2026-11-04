(function () {
  const money = value => `${Math.round(Number(value || 0)).toLocaleString('vi-VN')} đ`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const monthName = month => `Tháng ${String(month).padStart(2, '0')}`;
  const apiBase = () => `${window.API_BASE_URL}/api/cong-no/nhan-vien`;
  let host = null;
  let employees = [];
  let employeeId = '';
  let setup = null;
  let modal = null;
  let onBack = null;

  async function call(path, params = {}, options = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    const response = await fetch(`${apiBase()}/${path}${query ? `?${query}` : ''}`, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể xử lý thiết lập lương.');
    return result;
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

  function drawShell() {
    host.innerHTML = `<div class="cd-card">
      <div class="cd-section-heading"><div><h3><i class="fa-solid fa-sack-dollar"></i> Thiết lập lương nhân viên</h3>
      <p>Mỗi dòng là một mức lương áp dụng từ tháng đã chọn cho đến khi có dòng mới hơn. Muốn tăng lương, thêm dòng mới với tháng bắt đầu tăng. Công nợ nhân viên hàng tháng tự lấy số liệu từ đây (tháng nào đã nhập tay trong Công nợ nhân viên thì ưu tiên số nhập tay).</p></div>
      <button type="button" class="btn btn-secondary" data-ss="back"><i class="fa-solid fa-arrow-left"></i> Quay lại Công Cụ</button></div>
      <div class="edb-toolbar"><label>Nhân viên <select id="ssEmployee"><option value="">-- Chọn nhân viên --</option>${employees.map(item => `<option value="${esc(item.id)}" ${item.id === employeeId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label></div>
      <div id="ssBody"><div class="cd-empty">Chọn một nhân viên để xem và thiết lập lương.</div></div></div>`;
  }

  async function loadSetup() {
    const body = host.querySelector('#ssBody');
    if (!employeeId) { setup = null; body.innerHTML = '<div class="cd-empty">Chọn một nhân viên để xem và thiết lập lương.</div>'; return; }
    body.innerHTML = '<div class="cd-loading">Đang tải...</div>';
    try {
      setup = (await call('thiet-lap-luong', { employeeId })).data;
      drawSetup();
    } catch (error) {
      body.innerHTML = `<div class="cd-error">${esc(error.message)}</div>`;
    }
  }

  function drawSetup() {
    const rows = setup.items.map((item, index) => {
      const total = item.luongCoBan + item.phuCap + item.phiGiaoNhan + item.phiHoSo;
      return `<tr><td class="cd-month">Từ ${monthName(item.tuThang)}/${item.tuNam}${index === 0 ? ' <span class="edb-over">đang áp dụng mới nhất</span>' : ''}</td><td>${money(item.luongCoBan)}</td><td>${money(item.phuCap)}</td><td>${money(item.phiGiaoNhan)}</td><td>${money(item.phiHoSo)}</td><td><strong>${money(total)}</strong></td><td>${esc(item.ghiChu || '—')}</td>${setup.canEdit ? `<td><button type="button" class="cd-link-button" data-ss="edit" data-index="${index}"><i class="fa-solid fa-pen"></i> Sửa</button> <button type="button" class="cd-link-button" data-ss="delete" data-index="${index}" aria-label="Xóa"><i class="fa-solid fa-trash"></i></button></td>` : ''}</tr>`;
    }).join('') || `<tr><td colspan="${setup.canEdit ? 8 : 7}" class="cd-empty">Chưa thiết lập lương cho nhân viên này.</td></tr>`;
    host.querySelector('#ssBody').innerHTML = `<div class="cd-section-heading"><div><h3>${esc(setup.employee)}</h3></div>${setup.canEdit ? '<button type="button" class="edb-save" data-ss="add"><i class="fa-solid fa-plus"></i> Thêm mức lương</button>' : ''}</div>
      <div class="cd-table-scroll"><table class="cd-table"><thead><tr><th>Áp dụng từ</th><th>Lương cơ bản</th><th>Phụ cấp</th><th>Phí giao nhận</th><th>Phí hồ sơ</th><th>Tổng/tháng</th><th>Ghi chú</th>${setup.canEdit ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function showForm(item) {
    const now = new Date();
    const body = openModal(`<h3>${item ? 'Sửa' : 'Thêm'} mức lương • ${esc(setup.employee)}</h3>
      <form class="edb-form">
        <p class="edb-hint">Mức lương này có hiệu lực <strong>từ tháng được chọn</strong> trở đi, cho tới khi có mức mới hơn.</p>
        <label>Áp dụng từ tháng<input type="number" name="tuThang" min="1" max="12" step="1" value="${item?.tuThang || now.getMonth() + 1}" ${item ? 'readonly' : ''}></label>
        <label>Năm<input type="number" name="tuNam" min="2000" max="2100" step="1" value="${item?.tuNam || now.getFullYear()}" ${item ? 'readonly' : ''}></label>
        <label>Lương cơ bản<input type="number" name="luongCoBan" min="0" step="1" value="${item?.luongCoBan || 0}"></label>
        <label>Phụ cấp (tính vào “Phí khác”)<input type="number" name="phuCap" min="0" step="1" value="${item?.phuCap || 0}"></label>
        <label>Phí giao nhận<input type="number" name="phiGiaoNhan" min="0" step="1" value="${item?.phiGiaoNhan || 0}"></label>
        <label>Phí hồ sơ<input type="number" name="phiHoSo" min="0" step="1" value="${item?.phiHoSo || 0}"></label>
        <label>Ghi chú<input type="text" name="ghiChu" maxlength="300" placeholder="Ví dụ: tăng lương theo quyết định..." value="${esc(item?.ghiChu || '')}"></label>
        <p class="edb-hint">Tổng mỗi tháng: <strong id="ssTotal"></strong></p>
        <div class="edb-actions"><button type="submit" class="edb-save">Lưu</button></div><div class="edb-error" hidden></div></form>`);
    const form = body.querySelector('form');
    const value = name => Number(form.elements[name].value) || 0;
    const preview = () => { body.querySelector('#ssTotal').textContent = money(value('luongCoBan') + value('phuCap') + value('phiGiaoNhan') + value('phiHoSo')); };
    preview();
    form.addEventListener('input', preview);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const payload = { employeeId, ghiChu: form.elements.ghiChu.value };
        ['tuThang', 'tuNam', 'luongCoBan', 'phuCap', 'phiGiaoNhan', 'phiHoSo'].forEach(name => { payload[name] = value(name); });
        await call('thiet-lap-luong', {}, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        closeModal();
        loadSetup();
      } catch (error) { const box = form.querySelector('.edb-error'); box.hidden = false; box.textContent = error.message; }
    });
  }

  async function deleteItem(item) {
    if (!window.confirm(`Xóa mức lương áp dụng từ ${monthName(item.tuThang)}/${item.tuNam}?`)) return;
    try {
      await call('thiet-lap-luong', { employeeId, tuNam: item.tuNam, tuThang: item.tuThang }, { method: 'DELETE' });
      loadSetup();
    } catch (error) { window.alert(error.message); }
  }

  async function render(container, options = {}) {
    host = container;
    onBack = options.onBack;
    employeeId = '';
    setup = null;
    host.innerHTML = '<div class="cd-loading">Đang tải...</div>';
    try {
      employees = (await call('options')).data.employees || [];
    } catch (error) {
      host.innerHTML = `<div class="cd-error">${esc(error.message)}</div>`;
      return;
    }
    drawShell();
    host.onchange = event => { if (event.target.id === 'ssEmployee') { employeeId = event.target.value; loadSetup(); } };
    host.onclick = event => {
      const button = event.target.closest('[data-ss]');
      if (!button) return;
      const item = setup?.items[Number(button.dataset.index)];
      if (button.dataset.ss === 'back') onBack?.();
      else if (button.dataset.ss === 'add' && setup) showForm(null);
      else if (button.dataset.ss === 'edit' && item) showForm(item);
      else if (button.dataset.ss === 'delete' && item) deleteItem(item);
    };
  }

  window.SalarySetup = { render };
})();
