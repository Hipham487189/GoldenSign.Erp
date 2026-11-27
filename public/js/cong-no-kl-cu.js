(function () {
  const apiBase = () => `${window.API_BASE_URL || ''}/api/cong-no-kl-cu`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const formatMoney = value => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
  const formatDate = value => {
    if (!value) return 'Chưa có';
    const iso = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Chưa có';
    return iso.split('-').reverse().join('/');
  };
  const todayIso = () => new Date().toISOString().slice(0, 10);

  const state = {
    host: null,
    onBack: null,
    canEdit: false,
    page: 1,
    limit: 50,
    sort: 'desc',
    q: '',
    hasMore: false,
    loadId: 0,
    searchTimer: null,
    modal: null,
    data: null
  };

  function injectStyles() {
    if (document.getElementById('congNoKlCuStyles')) return;
    const link = document.createElement('link');
    link.id = 'congNoKlCuStyles';
    link.rel = 'stylesheet';
    link.href = 'public/css/cong-no-kl-cu.css';
    document.head.appendChild(link);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase()}${path}`, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Không thể xử lý yêu cầu công nợ KL cũ.');
    }
    return result.data;
  }

  function closeModal() {
    if (state.modal?._pasteHandler) {
      document.removeEventListener('paste', state.modal._pasteHandler);
    }
    state.modal?.remove();
    state.modal = null;
  }

  function renderTimeline() {
    const timelineEl = state.host?.querySelector('[data-klc="timeline"]');
    const pagerEl = state.host?.querySelector('[data-klc="pager"]');
    if (!timelineEl || !pagerEl || !state.data) return;

    const { cauHinh, items, page, hasMore, sort } = state.data;
    const originHtml = `<article class="klc-node klc-node-origin">
      <div class="klc-node-head">
        <div class="klc-node-date-sender">
          <span class="klc-date-pill"><i class="fa-solid fa-flag"></i> Nợ gốc ban đầu</span>
          <span class="klc-sender">${esc(cauHinh.tenCongTy || 'Công Ty KHÁNH LINH')}</span>
        </div>
        ${cauHinh.ngayChotNo ? `<span class="klc-meta-small">Chốt ngày ${formatDate(cauHinh.ngayChotNo)}</span>` : ''}
      </div>
      <div class="klc-amount" style="color: var(--status-warning, #f59e0b);">${formatMoney(cauHinh.soNoBanDau)}</div>
      ${cauHinh.ghiChu ? `<p class="klc-node-note">${esc(cauHinh.ghiChu)}</p>` : ''}
    </article>`;

    if (!items.length) {
      timelineEl.innerHTML = `${state.q
        ? '<div class="klc-empty">Không tìm thấy đợt chuyển khoản nào phù hợp với từ khóa.</div>'
        : `<div class="klc-empty">Chưa có đợt chuyển khoản nào được ghi nhận.</div>${originHtml}`}`;
    } else {
      const nodesHtml = items.map((item, idx) => {
        const balanceHtml = item.duNoTruoc !== null && item.duNoSau !== null
          ? `<div class="klc-balance-flow">
              <span>Còn nợ trước: <strong>${formatMoney(item.duNoTruoc)}</strong></span>
              <i class="fa-solid fa-arrow-right"></i>
              <span>Còn lại: <strong>${formatMoney(item.duNoSau)}</strong></span>
            </div>`
          : '';
        return `<article class="klc-node">
          <div class="klc-node-head">
            <div class="klc-node-date-sender">
              <span class="klc-date-pill"><i class="fa-regular fa-calendar"></i> ${formatDate(item.ngayChuyen)}</span>
              <span class="klc-sender">${esc(item.nguoiChuyen)} chuyển khoản</span>
            </div>
            ${state.canEdit ? `<div class="klc-node-actions">
              <button type="button" class="klc-btn-ghost" data-klc-action="edit" data-index="${idx}" title="Sửa đợt chuyển"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="klc-btn-ghost" data-klc-action="delete" data-index="${idx}" title="Xóa đợt chuyển"><i class="fa-solid fa-trash"></i></button>
            </div>` : ''}
          </div>
          <div class="klc-amount">- ${formatMoney(item.soTien)}</div>
          ${balanceHtml}
          ${item.ghiChu ? `<p class="klc-node-note">${esc(item.ghiChu)}</p>` : ''}
          <div class="klc-node-foot">
            <div>
              ${item.coAnhChungTu ? `<button type="button" class="klc-photo-btn" data-klc-action="photo" data-id="${esc(item._id)}">
                <i class="fa-regular fa-image"></i> Xem ảnh chụp chuyển khoản
              </button>` : '<span class="klc-meta-small">Không có ảnh chụp</span>'}
            </div>
            <span class="klc-meta-small">${item.nguoiCapNhat ? `Cập nhật: ${esc(item.nguoiCapNhat)}` : ''}</span>
          </div>
        </article>`;
      }).join('');

      if (!state.q && !hasMore && sort === 'desc') {
        timelineEl.innerHTML = `${nodesHtml}${originHtml}`;
      } else if (!state.q && page === 1 && sort === 'asc') {
        timelineEl.innerHTML = `${originHtml}${nodesHtml}`;
      } else {
        timelineEl.innerHTML = nodesHtml;
      }
    }

    pagerEl.innerHTML = `<span class="klc-meta-small">Trang ${page}</span>
      <div style="display:flex;gap:0.5rem;">
        <button type="button" class="klc-btn-ghost" data-klc-action="page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Trước</button>
        <button type="button" class="klc-btn-ghost" data-klc-action="page" data-page="${page + 1}" ${!hasMore ? 'disabled' : ''}>Sau</button>
      </div>`;
  }

  function renderSummary() {
    const heroEl = state.host?.querySelector('[data-klc="hero"]');
    if (!heroEl || !state.data) return;
    const { cauHinh, tongQuan } = state.data;
    const settled = tongQuan.conNoHienTai <= 0 && tongQuan.soNoBanDau > 0;
    heroEl.innerHTML = `
      <div class="klc-hero-head">
        <div>
          <span class="klc-company-badge"><i class="fa-solid fa-building"></i> ${esc(cauHinh.tenCongTy || 'Công Ty KHÁNH LINH')}</span>
        </div>
        ${state.canEdit ? `<button type="button" class="klc-btn-ghost" data-klc-action="config">
          <i class="fa-solid fa-sliders"></i> Thiết lập nợ gốc
        </button>` : ''}
      </div>
      <div class="klc-debt-main">
        <span class="klc-debt-label">Số nợ còn lại hiện tại</span>
        <div class="klc-debt-value ${settled ? 'is-settled' : ''}">${formatMoney(tongQuan.conNoHienTai)}</div>
      </div>
      <div class="klc-progress-wrap">
        <div class="klc-progress-meta">
          <span>Đã thanh toán ${tongQuan.phanTramDaTra}%</span>
          <span>${tongQuan.soDotChuyen} đợt chuyển khoản</span>
        </div>
        <div class="klc-progress-bar"><div class="klc-progress-fill" style="width:${tongQuan.phanTramDaTra}%"></div></div>
      </div>
      <div class="klc-stats-vertical">
        <div class="klc-stat-box"><span>Nợ gốc ban đầu</span><strong>${formatMoney(tongQuan.soNoBanDau)}</strong></div>
        <div class="klc-stat-box"><span>Tổng đã chuyển</span><strong style="color:var(--status-success,#10b981);">${formatMoney(tongQuan.tongDaChuyen)}</strong></div>
        <div class="klc-stat-box"><span>Còn phải trả</span><strong style="color:${settled ? 'var(--status-success,#10b981)' : 'var(--status-danger,#ef4444)'};">${formatMoney(tongQuan.conNoHienTai)}</strong></div>
      </div>
      ${state.canEdit ? `<div class="klc-hero-actions">
        <button type="button" class="klc-btn-primary" data-klc-action="add">
          <i class="fa-solid fa-plus"></i> Cập nhật tiền chuyển khoản
        </button>
      </div>` : ''}`;
  }

  async function loadData(page = state.page) {
    const currentId = ++state.loadId;
    state.page = page;
    const timelineEl = state.host?.querySelector('[data-klc="timeline"]');
    if (timelineEl) timelineEl.innerHTML = '<div class="klc-loading">Đang tải dữ liệu công nợ...</div>';
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(state.limit),
        sort: state.sort
      });
      if (state.q) params.set('q', state.q);
      const data = await request(`/?${params.toString()}`);
      if (currentId !== state.loadId || !state.host?.isConnected) return;
      state.data = data;
      state.hasMore = Boolean(data.hasMore);
      renderSummary();
      renderTimeline();
    } catch (error) {
      if (currentId !== state.loadId || !state.host?.isConnected) return;
      if (timelineEl) timelineEl.innerHTML = `<div class="klc-error">${esc(error.message)}</div>`;
    }
  }

  function openConfigModal() {
    closeModal();
    const cauHinh = state.data?.cauHinh || {};
    const backdrop = document.createElement('div');
    backdrop.className = 'klc-modal-backdrop';
    backdrop.innerHTML = `<div class="klc-modal" role="dialog" aria-modal="true">
      <div class="klc-modal-head">
        <h3>Thiết lập số nợ gốc ban đầu</h3>
        <button type="button" class="klc-modal-close" aria-label="Đóng">&times;</button>
      </div>
      <form class="klc-form">
        <label class="klc-field">Tên công ty
          <input name="tenCongTy" required maxlength="150" value="${esc(cauHinh.tenCongTy || 'Công Ty KHÁNH LINH')}">
        </label>
        <label class="klc-field">Số nợ ban đầu (VNĐ)
          <input name="soNoBanDau" type="number" min="0" max="10000000000000" step="1" required value="${Number(cauHinh.soNoBanDau || 0)}">
        </label>
        <label class="klc-field">Ngày chốt nợ (tùy chọn)
          <input name="ngayChotNo" type="date" value="${cauHinh.ngayChotNo ? String(cauHinh.ngayChotNo).slice(0, 10) : ''}">
        </label>
        <label class="klc-field">Ghi chú
          <textarea name="ghiChu" rows="2" maxlength="500">${esc(cauHinh.ghiChu || '')}</textarea>
        </label>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
          <button type="button" class="klc-btn-ghost klc-cancel">Hủy</button>
          <button type="submit" class="klc-btn-primary">Lưu cấu hình</button>
        </div>
        <div class="klc-error" data-err hidden style="padding:0.6rem;"></div>
      </form>
    </div>`;
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop || e.target.closest('.klc-modal-close') || e.target.closest('.klc-cancel')) closeModal();
    });
    document.body.appendChild(backdrop);
    state.modal = backdrop;

    const form = backdrop.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      const errBox = form.querySelector('[data-err]');
      btn.disabled = true;
      errBox.hidden = true;
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.soNoBanDau = Number(payload.soNoBanDau);
      try {
        await request('/cau-hinh', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        closeModal();
        await loadData(1);
      } catch (error) {
        btn.disabled = false;
        errBox.textContent = error.message;
        errBox.hidden = false;
      }
    });
  }

  function openTransactionModal(item = null) {
    closeModal();
    let anhDataUrl = '';
    let tenAnh = item?.tenAnhChungTu || '';
    let xoaAnhCu = false;
    const conNoHienTai = Number(state.data?.tongQuan?.conNoHienTai || 0);
    const conNoTruocKhiSua = item ? conNoHienTai + Number(item.soTien || 0) : conNoHienTai;

    const backdrop = document.createElement('div');
    backdrop.className = 'klc-modal-backdrop';
    backdrop.innerHTML = `<div class="klc-modal" role="dialog" aria-modal="true">
      <div class="klc-modal-head">
        <h3>${item ? 'Sửa đợt chuyển khoản' : 'Cập nhật tiền chuyển khoản'}</h3>
        <button type="button" class="klc-modal-close" aria-label="Đóng">&times;</button>
      </div>
      <form class="klc-form">
        <label class="klc-field">Ngày chuyển khoản
          <input name="ngayChuyen" type="date" required value="${item ? String(item.ngayChuyen).slice(0, 10) : todayIso()}">
        </label>
        <label class="klc-field">Người chuyển khoản
          <input name="nguoiChuyen" required maxlength="100" placeholder="Ví dụ: Hi" value="${esc(item?.nguoiChuyen || '')}">
        </label>
        <label class="klc-field">Số tiền chuyển (VNĐ)
          <input name="soTien" type="number" min="1" max="10000000000000" step="1" required placeholder="Ví dụ: 20000000" value="${item ? Number(item.soTien) : ''}">
        </label>
        <div class="klc-preview-debt" data-preview></div>
        <label class="klc-field">Ghi chú (tùy chọn)
          <textarea name="ghiChu" rows="2" maxlength="500" placeholder="Nội dung chuyển khoản hoặc ghi chú thêm...">${esc(item?.ghiChu || '')}</textarea>
        </label>
        <div class="klc-field">
          <span>Ảnh chụp chuyển khoản (chọn ảnh hoặc dán Ctrl+V)</span>
          <div class="klc-dropzone">
            <input type="file" accept="image/*" data-file style="max-width:100%;">
            <div data-img-preview>${item?.coAnhChungTu ? `<span>Đã có ảnh: <strong>${esc(item.tenAnhChungTu || 'chung-tu')}</strong></span>` : '<span>Chưa có ảnh chụp</span>'}</div>
            <button type="button" class="klc-btn-ghost" data-clear-img ${item?.coAnhChungTu ? '' : 'hidden'}>Gỡ ảnh</button>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
          <button type="button" class="klc-btn-ghost klc-cancel">Hủy</button>
          <button type="submit" class="klc-btn-primary">${item ? 'Lưu thay đổi' : 'Xác nhận chuyển khoản'}</button>
        </div>
        <div class="klc-error" data-err hidden style="padding:0.6rem;"></div>
      </form>
    </div>`;

    const form = backdrop.querySelector('form');
    const soTienInput = form.querySelector('input[name="soTien"]');
    const previewBox = form.querySelector('[data-preview]');
    const fileInput = form.querySelector('[data-file]');
    const imgPreview = form.querySelector('[data-img-preview]');
    const clearImgBtn = form.querySelector('[data-clear-img]');

    function capNhatDuKien() {
      const tien = Number(soTienInput.value || 0);
      const sau = conNoTruocKhiSua - (Number.isFinite(tien) ? tien : 0);
      previewBox.innerHTML = `Còn nợ trước đợt này: <strong>${formatMoney(conNoTruocKhiSua)}</strong><br>Dự kiến còn lại sau chuyển: <strong>${formatMoney(sau)}</strong>`;
    }
    capNhatDuKien();
    soTienInput.addEventListener('input', capNhatDuKien);

    async function xuLyTepAnh(file) {
      if (!file || !String(file.type || '').startsWith('image/')) return;
      imgPreview.textContent = 'Đang xử lý ảnh...';
      try {
        if (typeof window.nenTepTruocKhiTaiLen === 'function') {
          anhDataUrl = await window.nenTepTruocKhiTaiLen(file, { maxDimension: 1800, quality: 0.8 });
        } else {
          anhDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Không thể đọc ảnh.'));
            reader.readAsDataURL(file);
          });
        }
        tenAnh = file.name || `chung-tu-${Date.now()}.jpg`;
        xoaAnhCu = false;
        imgPreview.innerHTML = `<img class="klc-thumb" src="${anhDataUrl}" alt="Ảnh xem trước">`;
        clearImgBtn.hidden = false;
      } catch (err) {
        imgPreview.textContent = err.message || 'Không thể xử lý ảnh.';
      }
    }

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) xuLyTepAnh(file);
    });

    clearImgBtn.addEventListener('click', () => {
      anhDataUrl = '';
      tenAnh = '';
      xoaAnhCu = true;
      fileInput.value = '';
      imgPreview.innerHTML = '<span>Chưa có ảnh chụp</span>';
      clearImgBtn.hidden = true;
    });

    backdrop._pasteHandler = event => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const entry of items) {
        if (entry.type && entry.type.startsWith('image/')) {
          const file = entry.getAsFile();
          if (file) xuLyTepAnh(file);
          break;
        }
      }
    };
    document.addEventListener('paste', backdrop._pasteHandler);

    backdrop.addEventListener('click', e => {
      if (e.target === backdrop || e.target.closest('.klc-modal-close') || e.target.closest('.klc-cancel')) closeModal();
    });
    document.body.appendChild(backdrop);
    state.modal = backdrop;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      const errBox = form.querySelector('[data-err]');
      btn.disabled = true;
      errBox.hidden = true;
      const fd = new FormData(form);
      const payload = {
        ngayChuyen: fd.get('ngayChuyen'),
        nguoiChuyen: fd.get('nguoiChuyen'),
        soTien: Number(fd.get('soTien')),
        ghiChu: fd.get('ghiChu'),
        anhChungTuDataUrl: anhDataUrl,
        tenAnhChungTu: tenAnh,
        xoaAnh: xoaAnhCu
      };
      try {
        await request(item ? `/giao-dich/${encodeURIComponent(item._id)}` : '/giao-dich', {
          method: item ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        closeModal();
        await loadData(1);
      } catch (error) {
        btn.disabled = false;
        errBox.textContent = error.message;
        errBox.hidden = false;
      }
    });
  }

  async function openPhotoModal(id) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'klc-modal-backdrop';
    backdrop.innerHTML = `<div class="klc-modal klc-modal-wide" role="dialog" aria-modal="true">
      <div class="klc-modal-head">
        <h3>Ảnh chụp chuyển khoản</h3>
        <button type="button" class="klc-modal-close" aria-label="Đóng">&times;</button>
      </div>
      <div data-body class="klc-loading">Đang tải ảnh chứng từ...</div>
    </div>`;
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop || e.target.closest('.klc-modal-close')) closeModal();
    });
    document.body.appendChild(backdrop);
    state.modal = backdrop;
    const bodyEl = backdrop.querySelector('[data-body]');
    try {
      const data = await request(`/giao-dich/${encodeURIComponent(id)}/anh`);
      if (!backdrop.isConnected) return;
      bodyEl.className = '';
      bodyEl.innerHTML = `<img class="klc-lightbox-img" src="${data.dataUrl}" alt="${esc(data.fileName || 'Ảnh chụp chuyển khoản')}">`;
    } catch (error) {
      if (!backdrop.isConnected) return;
      bodyEl.className = 'klc-error';
      bodyEl.textContent = error.message;
    }
  }

  async function deleteTransaction(item) {
    if (!window.confirm(`Xóa đợt chuyển ${formatMoney(item.soTien)} của "${item.nguoiChuyen}" ngày ${formatDate(item.ngayChuyen)}?`)) return;
    try {
      await request(`/giao-dich/${encodeURIComponent(item._id)}`, { method: 'DELETE' });
      await loadData(state.page);
    } catch (error) {
      window.alert(error.message);
    }
  }

  function drawShell() {
    state.host.innerHTML = `<section class="klc-wrap">
      <div class="klc-topbar">
        <div class="klc-topbar-title">
          <button type="button" class="klc-btn-ghost" data-klc-action="back"><i class="fa-solid fa-arrow-left"></i> Quay lại Công Cụ</button>
          <h2>Theo Dõi Công Nợ KL Cũ</h2>
        </div>
      </div>
      <div class="klc-hero" data-klc="hero"><div class="klc-loading">Đang tải tổng quan...</div></div>
      <div class="klc-toolbar">
        <label class="klc-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="search" data-klc="search" maxlength="100" placeholder="Tìm theo người chuyển hoặc ghi chú...">
        </label>
        <div class="klc-toolbar-right">
          <button type="button" class="klc-btn-ghost" data-klc-action="toggle-sort">
            <i class="fa-solid fa-arrow-down-wide-short"></i> ${state.sort === 'desc' ? 'Mới nhất trước' : 'Cũ nhất trước'}
          </button>
          <select class="klc-select" data-klc="limit" aria-label="Số dòng mỗi trang">
            <option value="20" ${state.limit === 20 ? 'selected' : ''}>20 / trang</option>
            <option value="50" ${state.limit === 50 ? 'selected' : ''}>50 / trang</option>
            <option value="100" ${state.limit === 100 ? 'selected' : ''}>100 / trang</option>
          </select>
        </div>
      </div>
      <div class="klc-timeline" data-klc="timeline"></div>
      <div class="klc-pager" data-klc="pager"></div>
    </section>`;
  }

  async function render(container, options = {}) {
    injectStyles();
    closeModal();
    state.host = container;
    state.onBack = options.onBack || null;
    state.canEdit = Boolean(options.canEdit);
    state.page = 1;
    state.limit = 50;
    state.sort = 'desc';
    state.q = '';
    state.data = null;
    drawShell();

    const searchInput = state.host.querySelector('[data-klc="search"]');
    const limitSelect = state.host.querySelector('[data-klc="limit"]');
    searchInput.addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.q = searchInput.value.trim();
        loadData(1);
      }, 350);
    });
    limitSelect.addEventListener('change', () => {
      state.limit = Number(limitSelect.value) || 50;
      loadData(1);
    });

    state.host.onclick = event => {
      const btn = event.target.closest('[data-klc-action]');
      if (!btn) return;
      const action = btn.dataset.klcAction;
      if (action === 'back') state.onBack?.();
      else if (action === 'config') openConfigModal();
      else if (action === 'add') openTransactionModal(null);
      else if (action === 'edit') {
        const item = state.data?.items?.[Number(btn.dataset.index)];
        if (item) openTransactionModal(item);
      } else if (action === 'delete') {
        const item = state.data?.items?.[Number(btn.dataset.index)];
        if (item) deleteTransaction(item);
      } else if (action === 'photo') {
        if (btn.dataset.id) openPhotoModal(btn.dataset.id);
      } else if (action === 'page') {
        const next = Number(btn.dataset.page);
        if (next >= 1) loadData(next);
      } else if (action === 'toggle-sort') {
        state.sort = state.sort === 'desc' ? 'asc' : 'desc';
        btn.innerHTML = `<i class="fa-solid ${state.sort === 'desc' ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'}"></i> ${state.sort === 'desc' ? 'Mới nhất trước' : 'Cũ nhất trước'}`;
        loadData(1);
      }
    };

    await loadData(1);
  }

  window.TheoDoiCongNoKlCu = { render };
})();
