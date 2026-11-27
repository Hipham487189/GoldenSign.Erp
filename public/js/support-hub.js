(function () {
  const apiBase = () => `${window.API_BASE_URL || ''}/api/support`;
  const customerApi = () => `${window.API_BASE_URL || ''}/api/customers`;
  const GMAIL_ICON = '<svg class="sh-gmail-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffffff" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>';

  const state = {
    host: null,
    perms: { canCreate: false, canEdit: false, canDelete: false, canDownload: true },
    folders: [],
    meta: { totalFolders: 0, totalFiles: 0, unassignedCount: 0 },
    files: [],
    folderId: 'all',
    query: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    loading: false,
    error: '',
    searchSeq: 0,
    searchTimer: null,
    customerTimer: null,
    customerSeq: 0,
    keyHandlerBound: false
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

  function formatSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(value) {
    if (!value) return '--';
    try {
      return new Date(value).toLocaleDateString('vi-VN');
    } catch (_) {
      return '--';
    }
  }

  function formatLabel(mimeType, name) {
    const mime = String(mimeType || '').toLowerCase();
    const ext = String(name || '').split('.').pop().toUpperCase();
    if (mime.includes('pdf') || ext === 'PDF') return 'PDF';
    if (mime.includes('word') || mime.includes('wordprocessingml') || ext === 'DOC' || ext === 'DOCX') return 'DOCX';
    if (mime.includes('sheet') || mime.includes('excel') || ext === 'XLS' || ext === 'XLSX') return 'XLSX';
    if (mime.includes('video') || ['MP4', 'MOV', 'WEBM'].includes(ext)) return 'VIDEO';
    if (mime.includes('image') || ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF'].includes(ext)) return 'IMAGE';
    if (mime.includes('zip') || mime.includes('rar') || ['ZIP', 'RAR', '7Z'].includes(ext)) return 'ZIP';
    return ext && ext.length <= 5 ? ext : 'FILE';
  }

  function docCode(file, idx) {
    const raw = String(file._id || '').slice(-4).toUpperCase();
    return raw ? `DOC-${raw}` : `DOC-${String(idx + 1).padStart(3, '0')}`;
  }

  function kitTone(index) {
    const tones = ['tone-emerald', 'tone-amber', 'tone-sky'];
    return tones[index % tones.length];
  }

  function showToast(message) {
    document.querySelectorAll('.sh-toast').forEach(el => el.remove());
    const toast = document.createElement('div');
    toast.className = 'sh-toast';
    toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i><span>${esc(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Không thể xử lý yêu cầu hỗ trợ.');
    }
    return result;
  }

  async function loadFolders() {
    const res = await requestJson(`${apiBase()}/folders`);
    state.folders = Array.isArray(res.data) ? res.data : [];
    state.meta = res.meta || { totalFolders: state.folders.length, totalFiles: 0, unassignedCount: 0 };
  }

  async function loadFiles() {
    const seq = ++state.searchSeq;
    state.loading = true;
    state.error = '';
    draw();
    try {
      const params = new URLSearchParams({
        page: String(state.page),
        limit: String(state.limit)
      });
      if (state.folderId && state.folderId !== 'all') params.set('folderId', state.folderId);
      if (state.query) params.set('q', state.query);
      const res = await requestJson(`${apiBase()}/files?${params.toString()}`);
      if (seq !== state.searchSeq) return;
      state.files = Array.isArray(res.data) ? res.data : [];
      state.total = Number(res.meta?.total || state.files.length);
      state.page = Number(res.meta?.page || 1);
      state.totalPages = Number(res.meta?.totalPages || 1);
    } catch (error) {
      if (seq !== state.searchSeq) return;
      state.files = [];
      state.error = error.message || 'Không thể tải danh sách tài liệu.';
    } finally {
      if (seq === state.searchSeq) {
        state.loading = false;
        draw();
      }
    }
  }

  async function refreshAll() {
    try {
      await loadFolders();
      await loadFiles();
      updateHeaderStats();
    } catch (error) {
      state.error = error.message || 'Không thể tải dữ liệu hỗ trợ.';
      state.loading = false;
      draw();
    }
  }

  function updateHeaderStats() {
    const monthEl = document.getElementById('currentMonthRevenue');
    const countEl = document.getElementById('totalOrdersCount');
    if (monthEl) monthEl.innerText = `${state.folders.length} bộ tài liệu`;
    if (countEl) countEl.innerText = `${state.meta.totalFiles || state.total} tài liệu`;
  }

  function folderNameById(folderId) {
    if (!folderId) return 'Chưa phân loại';
    const found = state.folders.find(f => String(f._id) === String(folderId));
    return found ? found.name : 'Chưa phân loại';
  }

  function draw() {
    if (!state.host) return;
    updateHeaderStats();

    const kitsHtml = state.folders.length
      ? state.folders.map((folder, index) => {
          const isActive = String(state.folderId) === String(folder._id);
          const formatsText = (folder.formats || []).slice(0, 2).join(' + ');
          const metaLabel = `${folder.fileCount || 0} tài liệu • ${formatSize(folder.totalSize || 0)}${formatsText ? ` • ${formatsText}` : ''}`;
          return `
            <article class="sh-kit-card ${isActive ? 'active' : ''}">
              <div class="sh-kit-top">
                <span class="sh-kit-code ${kitTone(index)}">${esc(folder.kitCode || `KIT-${index + 1}`)}</span>
                <div class="sh-kit-meta">
                  <span>${esc(metaLabel)}</span>
                  ${(state.perms.canEdit || state.perms.canDelete) ? `
                    <span class="sh-kit-manage">
                      ${state.perms.canEdit ? `<button class="sh-icon-mini" title="Sửa bộ tài liệu" onclick="SupportHub.openFolderModal('${folder._id}')"><i class="fa-solid fa-pen"></i></button>` : ''}
                      ${state.perms.canDelete ? `<button class="sh-icon-mini danger" title="Xóa bộ tài liệu" onclick="SupportHub.deleteFolder('${folder._id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </span>
                  ` : ''}
                </div>
              </div>
              <h3 class="sh-kit-title" onclick="SupportHub.selectFolder('${folder._id}')">${esc(folder.name)}</h3>
              <p class="sh-kit-desc">${esc(folder.description || 'Bộ tài liệu hỗ trợ chuẩn dành cho khách hàng theo tình huống.')}</p>
              <div class="sh-kit-actions">
                <button class="sh-btn-zalo" onclick="SupportHub.openSendModal('zalo', { folderId: '${folder._id}' })">
                  <i class="fa-solid fa-comment-dots"></i> Gửi Zalo
                </button>
                <button class="sh-btn-email" onclick="SupportHub.openSendModal('email', { folderId: '${folder._id}' })">
                  ${GMAIL_ICON} Gửi Gmail
                </button>
              </div>
            </article>
          `;
        }).join('')
      : `<div class="sh-empty-box" style="grid-column:1/-1;"><i class="fa-solid fa-layer-group"></i>Chưa có bộ tài liệu tình huống nào. ${state.perms.canCreate ? 'Bấm "+ Bộ tài liệu" để tạo bộ gửi nhanh.' : ''}</div>`;

    const pillsHtml = [
      `<button class="sh-pill ${state.folderId === 'all' ? 'active' : ''}" onclick="SupportHub.selectFolder('all')">Tất cả (${state.meta.totalFiles || 0})</button>`,
      ...state.folders.map(folder => `
        <button class="sh-pill ${String(state.folderId) === String(folder._id) ? 'active' : ''}" onclick="SupportHub.selectFolder('${folder._id}')">
          ${esc(folder.name)} (${folder.fileCount || 0})
        </button>
      `),
      `<button class="sh-pill ${state.folderId === 'none' ? 'active' : ''}" onclick="SupportHub.selectFolder('none')">Chưa phân loại (${state.meta.unassignedCount || 0})</button>`
    ].join('');

    let tbodyHtml = '';
    if (state.loading) {
      tbodyHtml = `<tr><td colspan="5"><div class="sh-empty-box"><i class="fa-solid fa-spinner fa-spin"></i>Đang tải danh sách tài liệu...</div></td></tr>`;
    } else if (state.error) {
      tbodyHtml = `<tr><td colspan="5"><div class="sh-empty-box" style="color:#f87171;"><i class="fa-solid fa-triangle-exclamation" style="color:#f87171;"></i>${esc(state.error)}<div style="margin-top:.75rem;"><button class="sh-btn-ghost" onclick="SupportHub.reload()">Thử lại</button></div></div></td></tr>`;
    } else if (!state.files.length) {
      tbodyHtml = `<tr><td colspan="5"><div class="sh-empty-box"><i class="fa-regular fa-folder-open"></i>Không tìm thấy tài liệu phù hợp.</div></td></tr>`;
    } else {
      tbodyHtml = state.files.map((file, idx) => `
        <tr>
          <td>
            <div class="sh-doc-cell">
              <span class="sh-doc-code">${esc(docCode(file, idx))}</span>
              <div>
                <div class="sh-doc-name" onclick="viewSupportFile('${file._id}')">${esc(file.name)}</div>
                ${file.description ? `<div class="sh-doc-desc">${esc(file.description)}</div>` : ''}
              </div>
            </div>
          </td>
          <td class="sh-muted">${esc(folderNameById(file.folderId))}</td>
          <td class="sh-muted">${esc(formatLabel(file.mimeType, file.name))} • ${esc(formatSize(file.size))}</td>
          <td class="sh-muted">${esc(formatDate(file.updatedAt || file.createdAt))}</td>
          <td>
            <div class="sh-row-actions">
              <button class="sh-btn-row-zalo" title="Gửi qua Zalo" onclick="SupportHub.openSendModal('zalo', { fileId: '${file._id}' })">
                <i class="fa-solid fa-comment-dots"></i> Zalo
              </button>
              <button class="sh-btn-row-email" title="Gửi qua Gmail" onclick="SupportHub.openSendModal('email', { fileId: '${file._id}' })">
                ${GMAIL_ICON} Gmail
              </button>
              <button class="sh-btn-row-icon" title="Sao chép liên kết tải" onclick="SupportHub.copyShareLink('${file._id}')">
                <i class="fa-solid fa-link"></i>
              </button>
              <button class="sh-btn-row-icon" title="Xem tài liệu" onclick="viewSupportFile('${file._id}')">
                <i class="fa-regular fa-eye"></i>
              </button>
              <button class="sh-btn-row-icon" title="Tải về máy" onclick="downloadSupportFile('${file._id}')">
                <i class="fa-solid fa-download"></i>
              </button>
              ${state.perms.canDelete ? `
                <button class="sh-btn-row-icon danger" title="Xóa tài liệu" onclick="SupportHub.deleteFile('${file._id}')">
                  <i class="fa-solid fa-trash"></i>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `).join('');
    }

    state.host.innerHTML = `
      <div class="sh-shell">
        <header class="sh-topbar">
          <div class="sh-brand">
            <div class="sh-brand-badge"><i class="fa-solid fa-layer-group"></i></div>
            <div>
              <h2 class="sh-brand-title">DATAGS Hỗ Trợ</h2>
              <p class="sh-brand-sub">Điều phối &amp; gửi tài liệu khách hàng</p>
            </div>
          </div>
          <div class="sh-search-wrap">
            <i class="fa-solid fa-magnifying-glass sh-search-icon"></i>
            <input
              id="shSearchInput"
              class="sh-search-input"
              type="search"
              value="${esc(state.query)}"
              placeholder="Gõ tên tài liệu, mô tả hoặc từ khóa (VD: Hóa đơn, Kho)..."
              oninput="SupportHub.onSearchInput(this.value)"
            >
            <span class="sh-search-kbd">Ctrl K</span>
          </div>
          <div class="sh-topbar-actions">
            ${state.perms.canCreate ? `
              <button class="sh-btn-ghost" onclick="SupportHub.openFolderModal()">
                <i class="fa-solid fa-folder-plus"></i> Bộ tài liệu
              </button>
              <button class="sh-btn-ghost" onclick="SupportHub.triggerUpload()">
                <i class="fa-solid fa-cloud-arrow-up"></i> Tải tệp lên
              </button>
              <input type="file" id="shFileInput" multiple style="display:none;" onchange="SupportHub.handleFileInput(event)">
            ` : ''}
            <button class="sh-btn-cta" onclick="SupportHub.openQuickSend()">
              <i class="fa-solid fa-paper-plane"></i> Gửi nhanh cho khách
            </button>
          </div>
        </header>

        <section>
          <div class="sh-section-head">
            <div>
              <h3 class="sh-section-title">Bộ tài liệu gửi nhanh theo tình huống</h3>
              <p class="sh-section-sub">Gửi trọn bộ hướng dẫn chuẩn cho khách hàng chỉ với 1 lần bấm qua Zalo hoặc Email.</p>
            </div>
            <span class="sh-section-badge">${state.folders.length} bộ tài liệu sẵn sàng</span>
          </div>
          <div class="sh-kits-grid">${kitsHtml}</div>
        </section>

        <section class="sh-filter-bar">
          <div class="sh-pills">${pillsHtml}</div>
          <span class="sh-total-count">${state.total} tài liệu</span>
        </section>

        <section class="sh-table-card" id="shDropzone"
          ondragover="SupportHub.onDragOver(event)"
          ondragleave="SupportHub.onDragLeave(event)"
          ondrop="SupportHub.onDrop(event)">
          ${state.perms.canCreate ? `
            <div class="sh-drop-strip">
              <span><i class="fa-solid fa-cloud-arrow-up"></i> Kéo thả tệp vào bảng này để tải lên vào <strong>${esc(state.folderId === 'all' || state.folderId === 'none' ? 'Chưa phân loại' : folderNameById(state.folderId))}</strong> (tối đa 15MB/tệp).</span>
              <span>Hỗ trợ PDF, Word, Excel, Ảnh, Video</span>
            </div>
          ` : ''}
          <div class="sh-table-scroll">
            <table class="sh-table">
              <thead>
                <tr>
                  <th>Mã &amp; Tên tài liệu</th>
                  <th>Phân hệ / Bộ</th>
                  <th>Định dạng</th>
                  <th>Cập nhật</th>
                  <th style="text-align:right;">Chuyển cho khách</th>
                </tr>
              </thead>
              <tbody>${tbodyHtml}</tbody>
            </table>
          </div>
          <div class="sh-pagination">
            <span>Trang ${state.page} / ${state.totalPages} (${state.total} tài liệu)</span>
            <div class="sh-page-controls">
              <select class="sh-page-select" aria-label="Số dòng mỗi trang" onchange="SupportHub.changeLimit(this.value)">
                ${[20, 50, 100].map(n => `<option value="${n}" ${state.limit === n ? 'selected' : ''}>${n} / trang</option>`).join('')}
              </select>
              <button class="sh-btn-ghost" style="height:30px;padding:0 .65rem;" ${state.page <= 1 ? 'disabled' : ''} onclick="SupportHub.changePage(-1)">Trước</button>
              <button class="sh-btn-ghost" style="height:30px;padding:0 .65rem;" ${state.page >= state.totalPages ? 'disabled' : ''} onclick="SupportHub.changePage(1)">Sau</button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function onSearchInput(val) {
    state.query = String(val || '').trim();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.page = 1;
      loadFiles();
    }, 350);
  }

  function selectFolder(folderId) {
    state.folderId = folderId || 'all';
    state.page = 1;
    loadFiles();
  }

  function changePage(delta) {
    const next = Math.max(1, Math.min(state.totalPages, state.page + delta));
    if (next === state.page) return;
    state.page = next;
    loadFiles();
  }

  function changeLimit(val) {
    const next = Math.min(100, Math.max(1, Number.parseInt(val, 10) || 20));
    state.limit = next;
    state.page = 1;
    loadFiles();
  }

  function triggerUpload() {
    document.getElementById('shFileInput')?.click();
  }

  async function uploadFiles(fileList) {
    if (!state.perms.canCreate) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const targetFolder = state.folderId && state.folderId !== 'all' && state.folderId !== 'none' ? state.folderId : null;
    try {
      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) {
          showToast(`Bỏ qua "${file.name}" vì vượt quá 15MB.`);
          continue;
        }
        const fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await requestJson(`${apiBase()}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folderId: targetFolder,
            name: file.name,
            mimeType: file.type,
            size: file.size,
            fileData
          })
        });
      }
      showToast(`Đã tải lên ${files.length} tài liệu.`);
      await refreshAll();
    } catch (error) {
      alert('Không thể tải lên tệp: ' + error.message);
    }
  }

  async function handleFileInput(event) {
    const files = event.target.files;
    event.target.value = '';
    await uploadFiles(files);
  }

  function onDragOver(event) {
    if (!state.perms.canCreate) return;
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
  }

  function onDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    event.currentTarget.classList.remove('dragover');
  }

  async function onDrop(event) {
    if (!state.perms.canCreate) return;
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    await uploadFiles(event.dataTransfer?.files);
  }

  async function deleteFile(fileId) {
    if (!confirm('Xóa tài liệu này?')) return;
    try {
      await requestJson(`${apiBase()}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
      showToast('Đã xóa tài liệu.');
      await refreshAll();
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteFolder(folderId) {
    if (!confirm('Xóa bộ tài liệu này? (Chỉ xóa được khi bộ không còn tài liệu nào)')) return;
    try {
      await requestJson(`${apiBase()}/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
      if (String(state.folderId) === String(folderId)) state.folderId = 'all';
      showToast('Đã xóa bộ tài liệu.');
      await refreshAll();
    } catch (error) {
      alert(error.message);
    }
  }

  function openFolderModal(folderId) {
    const existing = folderId ? state.folders.find(f => String(f._id) === String(folderId)) : null;
    const modal = document.createElement('div');
    modal.className = 'sh-modal-backdrop';
    modal.innerHTML = `
      <div class="sh-modal" role="dialog" aria-modal="true" style="width:min(500px,100%);">
        <div class="sh-modal-head">
          <h3><i class="fa-solid fa-folder-plus" style="color:#10b981;"></i> ${existing ? 'Cập nhật bộ tài liệu' : 'Tạo bộ tài liệu mới'}</h3>
          <button class="sh-btn-row-icon" onclick="this.closest('.sh-modal-backdrop').remove()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="shFolderForm">
          <div class="sh-form-grid">
            <div class="sh-field full">
              <label>Tên bộ tài liệu *</label>
              <input class="sh-input" name="name" maxlength="100" required value="${esc(existing?.name || '')}" placeholder="VD: Bộ Khởi động Khách hàng Mới">
            </div>
            <div class="sh-field full">
              <label>Mô tả tình huống sử dụng</label>
              <textarea class="sh-textarea" name="description" maxlength="300" style="min-height:85px;" placeholder="Gồm phân quyền người dùng, hướng dẫn hóa đơn điện tử...">${esc(existing?.description || '')}</textarea>
            </div>
          </div>
          <div class="sh-modal-status" id="shFolderStatus"></div>
          <div class="sh-modal-foot">
            <button type="button" class="sh-btn-ghost" onclick="this.closest('.sh-modal-backdrop').remove()">Hủy</button>
            <button type="submit" class="sh-btn-cta">${existing ? 'Lưu thay đổi' : 'Tạo bộ tài liệu'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('[name="name"]').focus();
    modal.querySelector('#shFolderForm').onsubmit = async e => {
      e.preventDefault();
      const status = modal.querySelector('#shFolderStatus');
      const name = modal.querySelector('[name="name"]').value.trim();
      const description = modal.querySelector('[name="description"]').value.trim();
      status.className = 'sh-modal-status';
      status.textContent = 'Đang lưu...';
      try {
        await requestJson(`${apiBase()}/folders${existing ? `/${encodeURIComponent(existing._id)}` : ''}`, {
          method: existing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description })
        });
        modal.remove();
        showToast(existing ? 'Đã cập nhật bộ tài liệu.' : 'Đã tạo bộ tài liệu mới.');
        await refreshAll();
      } catch (err) {
        status.className = 'sh-modal-status error';
        status.textContent = err.message;
      }
    };
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  async function copyShareLink(fileId) {
    try {
      const res = await requestJson(`${apiBase()}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: [fileId] })
      });
      const url = res.data?.[0]?.shareUrl;
      if (!url) throw new Error('Không tạo được liên kết tải.');
      await copyText(url);
      showToast('Đã sao chép liên kết tải tài liệu (hạn 7 ngày).');
    } catch (error) {
      alert(error.message);
    }
  }

  async function resolveFilesForSend({ fileId, folderId }) {
    if (fileId) {
      const found = state.files.find(f => String(f._id) === String(fileId));
      if (found) return [found];
    }
    if (folderId) {
      const params = new URLSearchParams({ folderId, page: '1', limit: '20' });
      const res = await requestJson(`${apiBase()}/files?${params.toString()}`);
      return Array.isArray(res.data) ? res.data : [];
    }
    return state.files.slice(0, 5);
  }

  function openQuickSend() {
    if (state.folderId && state.folderId !== 'all' && state.folderId !== 'none') {
      openSendModal('zalo', { folderId: state.folderId });
      return;
    }
    if (state.files.length) {
      openSendModal('zalo', { fileId: state.files[0]._id });
      return;
    }
    alert('Chưa có tài liệu nào để gửi cho khách.');
  }

  async function openSendModal(channel, target = {}) {
    let selectedFiles = [];
    try {
      selectedFiles = await resolveFilesForSend(target);
    } catch (error) {
      alert(error.message);
      return;
    }
    if (!selectedFiles.length) {
      alert('Bộ tài liệu này chưa có tệp nào để gửi.');
      return;
    }

    const isZalo = channel === 'zalo';
    const folderLabel = target.folderId ? folderNameById(target.folderId) : '';
    const defaultTitle = folderLabel
      ? `[DATAGS] Gửi bộ tài liệu: ${folderLabel}`
      : `[DATAGS] Gửi tài liệu: ${selectedFiles[0].name}`;

    const modal = document.createElement('div');
    modal.className = 'sh-modal-backdrop';
    modal.innerHTML = `
      <div class="sh-modal" role="dialog" aria-modal="true">
        <div class="sh-modal-head">
          <h3>
            <i class="${isZalo ? 'fa-solid fa-comment-dots' : 'fa-solid fa-envelope'}" style="color:${isZalo ? '#3b82f6' : '#ea4335'};"></i>
            ${isZalo ? 'Gửi tài liệu qua Zalo Khách' : 'Gửi Gmail tài liệu cho Khách'}
          </h3>
          <button class="sh-btn-row-icon" onclick="this.closest('.sh-modal-backdrop').remove()"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="sh-form-grid">
          <div class="sh-field full">
            <label>Tìm khách hàng nhanh (tên, công ty, SĐT, email, MST)</label>
            <input class="sh-input" id="shCustomerLookup" placeholder="Gõ để tìm khách hàng trong hệ thống..." autocomplete="off">
            <div class="sh-autocomplete-list" id="shCustomerSuggest" style="display:none;"></div>
          </div>

          <div class="sh-field">
            <label>Tên khách hàng / Công ty</label>
            <input class="sh-input" id="shSendCustomerName" placeholder="VD: Anh Minh - Công ty ABC">
          </div>

          ${isZalo ? `
            <div class="sh-field">
              <label>Số điện thoại Zalo khách</label>
              <input class="sh-input" id="shSendPhone" placeholder="VD: 0901234567">
            </div>
          ` : `
            <div class="sh-field">
              <label>Email khách hàng *</label>
              <input class="sh-input" id="shSendEmail" type="email" placeholder="khachhang@congty.vn" required>
            </div>
          `}

          ${!isZalo ? `
            <div class="sh-field full">
              <label>Tiêu đề Email *</label>
              <input class="sh-input" id="shSendSubject" value="${esc(defaultTitle)}">
            </div>
          ` : ''}

          <div class="sh-field full">
            <label>Tài liệu sẽ gửi (<span id="shSelectedCount">${selectedFiles.length}</span>)</label>
            <div class="sh-attachment-chips" id="shAttachmentChips"></div>
          </div>

          <div class="sh-field full">
            <label>${isZalo ? 'Nội dung tin nhắn Zalo (tự kèm link tải 7 ngày)' : 'Lời nhắn gửi khách hàng'}</label>
            <textarea class="sh-textarea" id="shSendMessage" style="min-height:135px;"></textarea>
          </div>
        </div>

        <div class="sh-modal-status" id="shSendStatus"></div>

        <div class="sh-modal-foot">
          ${!isZalo ? `
            <button type="button" class="sh-btn-ghost" id="shBtnSwitchZalo" style="margin-right:auto;">
              <i class="fa-solid fa-comment-dots"></i> Chuyển sang Zalo
            </button>
            <button type="button" class="sh-btn-ghost" id="shBtnMailto">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Mở Gmail
            </button>
            <button type="button" class="sh-btn-cta" id="shBtnSendEmail">
              <i class="fa-solid fa-paper-plane"></i> Gửi Email ngay
            </button>
          ` : `
            <button type="button" class="sh-btn-ghost" id="shBtnSwitchEmail" style="margin-right:auto;">
              <i class="fa-regular fa-envelope"></i> Chuyển sang Email
            </button>
            <button type="button" class="sh-btn-ghost" id="shBtnCopyZalo">
              <i class="fa-regular fa-copy"></i> Sao chép nội dung
            </button>
            <button type="button" class="sh-btn-zalo" id="shBtnOpenZalo">
              <i class="fa-solid fa-comment-dots"></i> Sao chép &amp; Mở Zalo
            </button>
          `}
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let activeFiles = [...selectedFiles];
    let shareLinks = [];

    const chipsEl = modal.querySelector('#shAttachmentChips');
    const countEl = modal.querySelector('#shSelectedCount');
    const msgEl = modal.querySelector('#shSendMessage');
    const statusEl = modal.querySelector('#shSendStatus');
    const lookupEl = modal.querySelector('#shCustomerLookup');
    const suggestEl = modal.querySelector('#shCustomerSuggest');
    const nameEl = modal.querySelector('#shSendCustomerName');

    function renderChips() {
      countEl.textContent = String(activeFiles.length);
      chipsEl.innerHTML = activeFiles.map(f => `
        <span class="sh-chip">
          <i class="fa-regular fa-file"></i>
          <span>${esc(f.name)} (${esc(formatSize(f.size))})</span>
          ${activeFiles.length > 1 ? `<button type="button" title="Bỏ tệp này" data-remove="${esc(f._id)}">&times;</button>` : ''}
        </span>
      `).join('');
      chipsEl.querySelectorAll('[data-remove]').forEach(btn => {
        btn.onclick = () => {
          activeFiles = activeFiles.filter(f => String(f._id) !== btn.dataset.remove);
          renderChips();
          if (isZalo) refreshZaloLinks();
        };
      });
    }

    function buildDefaultMessage(links) {
      const kh = nameEl.value.trim();
      const chao = kh ? `Chào ${kh},` : 'Chào Anh/Chị,';
      if (isZalo) {
        const lines = links.length
          ? links.map((l, i) => `${i + 1}. ${l.name}: ${l.shareUrl}`).join('\n')
          : activeFiles.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
        return `${chao}\nDATAGS xin gửi Anh/Chị tài liệu hỗ trợ${folderLabel ? ` (${folderLabel})` : ''}:\n${lines}\n\n(Liên kết tải trực tiếp có hiệu lực trong 7 ngày. Cần hỗ trợ thêm Anh/Chị nhắn lại giúp em nhé!)`;
      }
      return `${chao}\n\nDATAGS xin gửi Quý khách tài liệu hỗ trợ đính kèm trong email này${folderLabel ? ` (${folderLabel})` : ''}.\nNếu cần hướng dẫn chi tiết hơn, Quý khách vui lòng phản hồi email hoặc liên hệ đội ngũ hỗ trợ DATAGS.`;
    }

    async function refreshZaloLinks() {
      statusEl.className = 'sh-modal-status';
      statusEl.textContent = 'Đang tạo liên kết tải tài liệu...';
      try {
        const res = await requestJson(`${apiBase()}/share-links`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds: activeFiles.map(f => f._id) })
        });
        shareLinks = Array.isArray(res.data) ? res.data : [];
        msgEl.value = buildDefaultMessage(shareLinks);
        statusEl.textContent = '';
      } catch (err) {
        statusEl.className = 'sh-modal-status error';
        statusEl.textContent = err.message;
      }
    }

    renderChips();
    if (isZalo) {
      refreshZaloLinks();
    } else {
      msgEl.value = buildDefaultMessage([]);
    }

    // Autocomplete customer
    lookupEl.oninput = () => {
      const q = lookupEl.value.trim();
      clearTimeout(state.customerTimer);
      if (q.length < 2) {
        suggestEl.style.display = 'none';
        return;
      }
      state.customerTimer = setTimeout(async () => {
        const seq = ++state.customerSeq;
        try {
          const res = await requestJson(`${customerApi()}?q=${encodeURIComponent(q)}&limit=15`);
          if (seq !== state.customerSeq) return;
          const items = Array.isArray(res.data) ? res.data : [];
          if (!items.length) {
            suggestEl.innerHTML = '<div class="sh-autocomplete-item"><small>Không tìm thấy khách hàng phù hợp.</small></div>';
            suggestEl.style.display = 'block';
            return;
          }
          suggestEl.innerHTML = items.map(c => `
            <button type="button" class="sh-autocomplete-item" data-id="${esc(c._id)}">
              <strong>${esc(c.name || c.company || 'Khách hàng')} ${c.company ? `· ${esc(c.company)}` : ''}</strong>
              <small>SĐT: ${esc(c.phone || '--')} · Email: ${esc(c.email || '--')} · MST: ${esc(c.mst || '--')}</small>
            </button>
          `).join('');
          suggestEl.style.display = 'block';
          suggestEl.querySelectorAll('[data-id]').forEach((btn, idx) => {
            btn.onclick = () => {
              const c = items[idx];
              nameEl.value = c.name || c.company || '';
              if (isZalo) {
                modal.querySelector('#shSendPhone').value = c.phone || '';
                msgEl.value = buildDefaultMessage(shareLinks);
              } else {
                modal.querySelector('#shSendEmail').value = c.email || '';
                msgEl.value = buildDefaultMessage([]);
              }
              suggestEl.style.display = 'none';
              lookupEl.value = c.name || c.company || '';
            };
          });
        } catch (_) {
          suggestEl.style.display = 'none';
        }
      }, 350);
    };

    if (isZalo) {
      modal.querySelector('#shBtnSwitchEmail').onclick = () => {
        modal.remove();
        openSendModal('email', { fileId: activeFiles[0]?._id, folderId: target.folderId });
      };
      modal.querySelector('#shBtnCopyZalo').onclick = async () => {
        await copyText(msgEl.value);
        statusEl.className = 'sh-modal-status success';
        statusEl.textContent = 'Đã sao chép nội dung tin nhắn Zalo.';
        showToast('Đã sao chép nội dung gửi Zalo.');
      };
      modal.querySelector('#shBtnOpenZalo').onclick = async () => {
        await copyText(msgEl.value);
        const phone = String(modal.querySelector('#shSendPhone').value || '').replace(/\D/g, '');
        const zaloUrl = phone ? `https://zalo.me/${phone}` : 'https://chat.zalo.me/';
        window.open(zaloUrl, '_blank', 'noopener,noreferrer');
        statusEl.className = 'sh-modal-status success';
        statusEl.textContent = 'Đã sao chép nội dung và mở Zalo. Hãy dán (Ctrl+V) vào khung chat của khách.';
      };
    } else {
      modal.querySelector('#shBtnSwitchZalo').onclick = () => {
        modal.remove();
        openSendModal('zalo', { fileId: activeFiles[0]?._id, folderId: target.folderId });
      };
      modal.querySelector('#shBtnMailto').onclick = async () => {
        const toEmail = modal.querySelector('#shSendEmail').value.trim();
        const subject = modal.querySelector('#shSendSubject').value.trim();
        statusEl.className = 'sh-modal-status';
        statusEl.textContent = 'Đang tạo liên kết tải để mở Gmail...';
        try {
          const res = await requestJson(`${apiBase()}/share-links`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds: activeFiles.map(f => f._id) })
          });
          const links = (res.data || []).map((l, i) => `${i + 1}. ${l.name}: ${l.shareUrl}`).join('\n');
          const body = `${msgEl.value}\n\nLiên kết tải tài liệu:\n${links}`;
          const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          window.open(gmailUrl, '_blank', 'noopener,noreferrer');
          statusEl.textContent = '';
        } catch (err) {
          statusEl.className = 'sh-modal-status error';
          statusEl.textContent = err.message;
        }
      };
      modal.querySelector('#shBtnSendEmail').onclick = async () => {
        const toEmail = modal.querySelector('#shSendEmail').value.trim();
        const customerName = nameEl.value.trim();
        const subject = modal.querySelector('#shSendSubject').value.trim();
        const message = msgEl.value.trim();
        statusEl.className = 'sh-modal-status';
        statusEl.textContent = 'Đang gửi email kèm tài liệu...';
        try {
          const res = await requestJson(`${apiBase()}/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail,
              customerName,
              subject,
              message,
              fileIds: activeFiles.map(f => f._id)
            })
          });
          modal.remove();
          showToast(res.message || `Đã gửi email đến ${toEmail}.`);
        } catch (err) {
          statusEl.className = 'sh-modal-status error';
          statusEl.textContent = err.message;
        }
      };
    }
  }

  function bindGlobalShortcut() {
    if (state.keyHandlerBound) return;
    state.keyHandlerBound = true;
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        const input = document.getElementById('shSearchInput');
        if (input && document.body.contains(input)) {
          event.preventDefault();
          input.focus();
          input.select();
        }
      }
    });
  }

  function render(container, options = {}) {
    state.host = container;
    state.perms = {
      canCreate: Boolean(options.canCreate),
      canEdit: Boolean(options.canEdit),
      canDelete: Boolean(options.canDelete),
      canDownload: options.canDownload !== false
    };
    state.page = 1;
    bindGlobalShortcut();
    refreshAll();
  }

  window.SupportHub = {
    render,
    reload: refreshAll,
    onSearchInput,
    selectFolder,
    changePage,
    changeLimit,
    triggerUpload,
    handleFileInput,
    onDragOver,
    onDragLeave,
    onDrop,
    deleteFile,
    deleteFolder,
    openFolderModal,
    openSendModal,
    openQuickSend,
    copyShareLink
  };
})();
