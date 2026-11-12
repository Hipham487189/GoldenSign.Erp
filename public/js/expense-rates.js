(function () {
  const api = () => `${window.API_BASE_URL}/api/nhap-so-lieu`;
  const money = value => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const ngayHienThi = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : 'Không thời hạn';
  const ngayHomNay = () => new Date().toISOString().slice(0, 10);
  const state = { host: null, page: 1, hasMore: false, items: [], loadRequest: 0, modal: null, onBack: null };

  function injectStyles() {
    [['customerDebtStyles', 'public/css/customer-debts.css'], ['employeeDebtStyles', 'public/css/employee-debts.css']].forEach(([id, href]) => {
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    });
  }

  async function request(path, options = {}) {
    const response = await fetch(`${api()}${path}`, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể xử lý số liệu chi phí.');
    return result.data;
  }

  function drawShell() {
    state.host.innerHTML = `<section class="cd-card">
      <div class="cd-section-heading"><div><h3><i class="fa-solid fa-file-invoice-dollar"></i> Nhập Số liệu</h3>
      <p>Ghi nhận đơn giá chi phí theo thời gian áp dụng. HS Tạm Giữ NCC One dùng đơn giá “Phí Tạm giữ HS one” và vẫn nhận khoản cũ “Phí Tạm Giũ HS ONE”; đơn giá áp dụng theo ngày đăng ký hồ sơ. Các khoản khác chỉ dùng để quản lý và tra cứu.</p></div>
      <div class="cd-section-actions"><button type="button" class="btn btn-secondary" data-er="back"><i class="fa-solid fa-arrow-left"></i> Quay lại Công Cụ</button>
      <button type="button" class="edb-save" data-er="add"><i class="fa-solid fa-plus"></i> Thêm chi phí</button></div></div>
      <div id="erBody"><div class="cd-loading">Đang tải...</div></div></section>`;
  }

  function drawRows() {
    const rows = state.items.length ? state.items.map((item, index) => `<tr>
      <td><strong>${esc(item.tenChiPhi)}</strong></td><td>${money(item.donGia)}</td><td>${esc(item.donVi)}</td>
      <td>${ngayHienThi(item.tuNgay)}</td><td>${ngayHienThi(item.denNgay)}</td><td>${esc(item.ghiChu || '—')}</td>
      <td><button type="button" class="cd-link-button" data-er="edit" data-index="${index}"><i class="fa-solid fa-pen"></i> Sửa</button>
      <button type="button" class="cd-link-button" data-er="delete" data-index="${index}" aria-label="Xóa ${esc(item.tenChiPhi)}"><i class="fa-solid fa-trash"></i> Xóa</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="cd-empty">Chưa có khoản chi phí nào. Chọn “Thêm chi phí” để nhập mới.</td></tr>';
    state.host.querySelector('#erBody').innerHTML = `<div class="cd-table-scroll"><table class="cd-table"><thead><tr>
      <th>Khoản chi phí</th><th>Đơn giá</th><th>Đơn vị</th><th>Áp dụng từ</th><th>Đến ngày</th><th>Ghi chú</th><th>Thao tác</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
      <div class="edb-pager"><span>Trang ${state.page}</span><span>
      <button type="button" data-er="page" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>Trước</button>
      <button type="button" data-er="page" data-page="${state.page + 1}" ${!state.hasMore ? 'disabled' : ''}>Sau</button>
      </span></div>`;
  }

  async function loadPage(page) {
    const requestId = ++state.loadRequest;
    state.page = page;
    state.host.querySelector('#erBody').innerHTML = '<div class="cd-loading">Đang tải...</div>';
    try {
      const data = await request(`/?page=${page}&limit=50`);
      if (requestId !== state.loadRequest) return;
      state.items = data.items || [];
      state.hasMore = Boolean(data.hasMore);
      drawRows();
    } catch (error) {
      if (requestId !== state.loadRequest) return;
      state.host.querySelector('#erBody').innerHTML = `<div class="cd-error">${esc(error.message)}</div>`;
    }
  }

  function closeModal() {
    state.modal?.remove();
    state.modal = null;
  }

  function openForm(item) {
    closeModal();
    const body = document.createElement('div');
    body.className = 'edb-modal';
    body.innerHTML = `<div class="edb-card" role="dialog" aria-modal="true" aria-labelledby="erFormTitle">
      <button type="button" class="edb-close" aria-label="Đóng">&times;</button>
      <h3 id="erFormTitle">${item ? 'Sửa' : 'Thêm'} khoản chi phí</h3>
      <form class="edb-form">
        <label>Tên khoản chi phí<input name="tenChiPhi" required maxlength="100" placeholder="Ví dụ: Phí Tạm Giữ Hồ Sơ" value="${esc(item?.tenChiPhi || '')}"></label>
        <label>Đơn giá (đồng)<input name="donGia" type="number" min="0" max="1000000000000" step="1" required value="${item?.donGia ?? ''}"></label>
        <label>Đơn vị tính<input name="donVi" required maxlength="40" placeholder="Ví dụ: hồ sơ" value="${esc(item?.donVi || '')}"></label>
        <label>Áp dụng từ<input name="tuNgay" type="date" required value="${esc(item ? String(item.tuNgay).slice(0, 10) : ngayHomNay())}"></label>
        <label>Đến ngày (để trống nếu chưa có hạn)<input name="denNgay" type="date" value="${esc(item?.denNgay ? String(item.denNgay).slice(0, 10) : '')}"></label>
        <label>Ghi chú<input name="ghiChu" maxlength="300" value="${esc(item?.ghiChu || '')}"></label>
        <div class="edb-actions"><button type="submit" class="edb-save">Lưu</button></div>
        <div class="edb-error" hidden></div>
      </form></div>`;
    body.addEventListener('click', event => {
      if (event.target === body || event.target.closest('.edb-close')) closeModal();
    });
    document.body.appendChild(body);
    state.modal = body;
    const form = body.querySelector('form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      const errorBox = form.querySelector('.edb-error');
      button.disabled = true;
      errorBox.hidden = true;
      const payload = Object.fromEntries(new FormData(form).entries());
      const path = item ? `/${encodeURIComponent(item._id)}` : '/';
      try {
        await request(path, {
          method: item ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        closeModal();
        await loadPage(1);
      } catch (error) {
        button.disabled = false;
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      }
    });
  }

  async function deleteItem(item) {
    if (!window.confirm(`Xóa khoản chi phí "${item.tenChiPhi}" áp dụng từ ${ngayHienThi(item.tuNgay)}?`)) return;
    try {
      await request(`/${encodeURIComponent(item._id)}`, { method: 'DELETE' });
      await loadPage(state.page);
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function render(container, options = {}) {
    injectStyles();
    state.host = container;
    state.page = 1;
    state.items = [];
    state.onBack = options.onBack;
    drawShell();
    state.host.onclick = event => {
      const button = event.target.closest('[data-er]');
      if (!button) return;
      const item = state.items[Number(button.dataset.index)];
      if (button.dataset.er === 'back') state.onBack?.();
      else if (button.dataset.er === 'add') openForm(null);
      else if (button.dataset.er === 'edit' && item) openForm(item);
      else if (button.dataset.er === 'delete' && item) deleteItem(item);
      else if (button.dataset.er === 'page') loadPage(Number(button.dataset.page));
    };
    await loadPage(1);
  }

  window.ExpenseRates = { render };
})();
