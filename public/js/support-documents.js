(function () {
  const api = `${window.API_BASE_URL}/api/support-documents`;
  const allowed = new Set(['P','DIV','BR','SPAN','B','STRONG','I','EM','U','S','STRIKE','SUB','SUP','H1','H2','H3','H4','UL','OL','LI','A','TABLE','THEAD','TBODY','TR','TD','TH','HR','BLOCKQUOTE','IMG']);
  const styles = ['color','background-color','font-family','font-size','font-weight','font-style','text-decoration','text-align','margin','margin-top','margin-bottom','margin-left','line-height','border','border-left','border-radius','border-collapse','width','padding','vertical-align','max-width','display'];
  let host, canManage = false, page = 1, totalPages = 1, query = '', items = [], topics = [], selected = null, dirty = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  async function request(path, options) {
    const response = await fetch(`${api}${path}`, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể xử lý tài liệu hỗ trợ.');
    return result;
  }

  function cleanHtml(source) {
    if (!/<[a-z][\s\S]*>/i.test(String(source || ''))) return esc(source).replace(/\n/g, '<br>');
    const doc = new DOMParser().parseFromString(String(source), 'text/html');
    [...doc.body.querySelectorAll('*')].forEach(el => {
      if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','FORM'].includes(el.tagName)) { el.remove(); return; }
      if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      const style = styles.map(name => {
        const value = el.style.getPropertyValue(name);
        return value && /^[\w\s#%.,()'"\/-]+$/.test(value) && !/url|expression|javascript/i.test(value) ? `${name}:${value}` : '';
      }).filter(Boolean);
      const href = el.tagName === 'A' ? el.getAttribute('href') || '' : '';
      const src = el.tagName === 'IMG' ? el.getAttribute('src') || '' : '';
      if (el.tagName === 'IMG' && !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(src)) { el.remove(); return; }
      const attrs = ['colspan','rowspan'].map(name => [name, el.getAttribute(name)]).filter(([,v]) => /^\d{1,2}$/.test(v || ''));
      [...el.attributes].forEach(attr => el.removeAttribute(attr.name));
      if (style.length) el.setAttribute('style', style.join(';'));
      if (el.tagName === 'A' && /^(https?:|mailto:)/i.test(href)) { el.setAttribute('href', href); el.target='_blank'; el.rel='noopener noreferrer'; }
      if (el.tagName === 'IMG') el.setAttribute('src', src);
      attrs.forEach(([name,value]) => el.setAttribute(name,value));
    });
    return doc.body.innerHTML;
  }

  function empty(message) { return `<div class="support-document-empty"><div><i class="fa-solid fa-book-open"></i><div>${esc(message)}</div></div></div>`; }

  async function render() {
    host.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải tài liệu...</div>';
    try {
      const params = new URLSearchParams({page:String(page),limit:'50'});
      if (query) params.set('q',query);
      const [docs, cats] = await Promise.all([request(`/documents?${params}`),request('/topics')]);
      items=docs.data.items; page=docs.data.page; totalPages=docs.data.totalPages; topics=cats.data;
      draw();
    } catch (error) {
      host.innerHTML=`<div class="loading-state" style="color:#dc2626;">${esc(error.message)} <button class="btn btn-secondary" onclick="window.SupportDocuments.render(document.getElementById('mainContainerBox'),window.SupportDocuments.options)">Thử lại</button></div>`;
    }
  }

  function draw() {
    const groups=new Map();
    topics.forEach(topic=>groups.set(topic.ten,[]));
    items.forEach(item=>{const name=(item.chuDe||'Chung').trim()||'Chung';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(item);});
    const selectedTopic=selected?.chuDe;
    const list=[...groups].map(([name,docs])=>`<details class="support-document-group" ${query||name===selectedTopic?'open':''}><summary><span><i class="fa-solid fa-folder"></i> ${esc(name)}</span><em>${docs.length}${canManage&&!docs.length&&topics.some(t=>t.ten===name)?` <button class="support-document-row-delete support-topic-delete" title="Xóa chủ đề" onclick="event.preventDefault();SupportDocuments.deleteTopic('${topics.find(t=>t.ten===name)._id}')"><i class="fa-solid fa-trash"></i></button>`:''}</em></summary>${docs.map(doc=>`<div class="support-document-row"><button class="support-document-card ${selected?._id===doc._id?'active':''}" onclick="SupportDocuments.open('${doc._id}')"><strong><i class="fa-regular fa-file-lines"></i> ${esc(doc.tieuDe)}</strong><small>Cập nhật ${doc.updatedAt?new Date(doc.updatedAt).toLocaleDateString('vi-VN'):'--'}</small></button>${canManage?`<button class="support-document-row-delete" title="Xóa tài liệu" onclick="SupportDocuments.deleteDoc('${doc._id}')"><i class="fa-solid fa-trash"></i></button>`:''}</div>`).join('')||'<div class="support-document-meta" style="padding:.7rem;">Chưa có tài liệu trong chủ đề này.</div>'}</details>`).join('');
    host.innerHTML=`<div class="support-documents"><section class="support-documents-list"><form class="support-documents-search" onsubmit="event.preventDefault();SupportDocuments.search()"><input class="form-input" id="supportDocSearch" value="${esc(query)}" placeholder="Tìm tài liệu..." aria-label="Tìm tài liệu"><button class="btn btn-secondary"><i class="fa-solid fa-magnifying-glass"></i></button></form>${list||empty('Chưa có chủ đề hoặc tài liệu.') }<div class="support-documents-pagination"><button class="btn btn-secondary" ${page<=1?'disabled':''} onclick="SupportDocuments.page(-1)">Trước</button><span class="support-document-meta">Trang ${page}/${totalPages}</span><button class="btn btn-secondary" ${page>=totalPages?'disabled':''} onclick="SupportDocuments.page(1)">Sau</button></div></section><section class="support-document-detail">${selected?detailHtml(selected):empty('Chọn một tài liệu để xem nội dung.')}</section></div>`;
  }

  function detailHtml(doc) {
    return `<div class="support-document-meta">${esc(doc.chuDe||'Chung')} · Cập nhật ${doc.updatedAt?new Date(doc.updatedAt).toLocaleString('vi-VN'):'--'}</div><h2>${esc(doc.tieuDe)}</h2><div class="support-document-content tl-doc-rich">${cleanHtml(doc.noiDung)}</div>${canManage?`<div class="support-documents-header-actions" style="margin-top:1rem;"><button class="btn btn-secondary" onclick="SupportDocuments.edit('${doc._id}')"><i class="fa-solid fa-pen"></i> Chỉnh sửa</button><button class="btn btn-danger" onclick="SupportDocuments.deleteDoc('${doc._id}')"><i class="fa-solid fa-trash"></i> Xóa</button></div>`:''}`;
  }

  async function open(id) {
    try { const result=await request(`/documents/${encodeURIComponent(id)}`);selected=result.data;draw(); }
    catch(error) { alert(error.message); }
  }

  async function createTopic() {
    const modal=document.createElement('div');modal.className='tl-topic-modal';modal.innerHTML=`<section class="tl-topic-dialog" role="dialog" aria-modal="true"><div class="modal-header"><h3><i class="fa-solid fa-folder-plus"></i> Tạo chủ đề mới</h3><button class="btn btn-secondary" onclick="this.closest('.tl-topic-modal').remove()">×</button></div><div class="tl-topic-note"><i class="fa-solid fa-circle-info"></i><div><strong>Chủ đề là thư mục chứa các tài liệu cùng nhóm.</strong><p>Tạo chủ đề trước, sau đó chọn chủ đề khi tạo tài liệu. Ví dụ: Hướng dẫn bán hàng, Quy trình công nợ.</p></div></div><form><label class="form-label">Tên chủ đề *</label><input class="form-input" name="ten" maxlength="80" placeholder="Nhập tên chủ đề"><div class="tl-topic-error" role="alert"></div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="this.closest('.tl-topic-modal').remove()">Hủy</button><button class="btn btn-primary">Tạo chủ đề</button></div></form></section>`;
    document.body.append(modal);modal.querySelector('input').focus();modal.querySelector('form').onsubmit=async e=>{e.preventDefault();const error=modal.querySelector('.tl-topic-error');try{await request('/topics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ten:modal.querySelector('[name=ten]').value.trim()})});modal.remove();await render();}catch(err){error.textContent=err.message;}};
  }

  async function deleteTopic(id) { if(!confirm('Xóa chủ đề này?'))return;try{await request(`/topics/${encodeURIComponent(id)}`,{method:'DELETE'});await render();}catch(error){alert(error.message);} }
  async function deleteDoc(id) { if(!confirm('Xóa tài liệu này?'))return;try{await request(`/documents/${encodeURIComponent(id)}`,{method:'DELETE'});if(selected?._id===id)selected=null;await render();}catch(error){alert(error.message);} }

  function compressAndInsertImage(file, pageEl, markDirty) {
    if (!file || !String(file.type || '').startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) { alert('Ảnh tối đa 10MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        pageEl.focus();
        document.execCommand('insertHTML', false, `<img src="${canvas.toDataURL('image/jpeg', 0.85)}" style="max-width:100%"><p><br></p>`);
        markDirty();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function edit(id) {
    if (!canManage) return;
    const doc = selected?._id === id ? selected : null;
    dirty = false;
    let savedRange = null;
    let selectedImg = null;
    let previewMode = false;

    const palette = [
      '#0f172a','#334155','#64748b','#dc2626','#ea580c','#d97706',
      '#16a34a','#0d9488','#0284c7','#2563eb','#7c3aed','#db2777',
      '#ffffff','#f1f5f9','#fef08a','#bbf7d0','#bae6fd','#fbcfe8'
    ];

    const modal = document.createElement('div');
    modal.className = 'tl-doc-editor';
    modal.innerHTML = `
      <div class="tl-doc-topbar">
        <button type="button" class="tl-doc-back-btn" data-back><i class="fa-solid fa-arrow-left"></i> Quay lại</button>
        <input id="tlDocTitle" class="tl-doc-input tl-doc-title" maxlength="160" placeholder="Nhập tiêu đề tài liệu..." value="${esc(doc?.tieuDe || '')}">
        <span id="tlDocSaveBadge" class="tl-doc-save-badge">Đã đồng bộ</span>
        <select id="tlDocCategory" class="tl-doc-input tl-doc-category" aria-label="Chọn chủ đề">
          <option value="">-- Chọn chủ đề --</option>
          ${topics.map(t => `<option ${t.ten === doc?.chuDe ? 'selected' : ''}>${esc(t.ten)}</option>`).join('')}
        </select>
        <span id="tlDocError" role="alert"></span>
        <button type="button" class="tl-doc-preview-btn" data-preview><i class="fa-regular fa-eye"></i> Xem trước</button>
        <button type="button" class="tl-doc-save-btn" data-save><i class="fa-solid fa-floppy-disk"></i> Lưu tài liệu</button>
      </div>

      <div class="tl-doc-toolbar" id="tlDocToolbar">
        <div class="tl-tb-group">
          <button type="button" data-cmd="undo" title="Hoàn tác (Ctrl+Z)"><i class="fa-solid fa-rotate-left"></i></button>
          <button type="button" data-cmd="redo" title="Làm lại (Ctrl+Y)"><i class="fa-solid fa-rotate-right"></i></button>
        </div>
        <span class="tl-tb-sep"></span>

        <div class="tl-tb-group">
          <select data-block title="Kiểu đoạn">
            <option value="P">Văn bản thường</option>
            <option value="H1">Tiêu đề lớn (H1)</option>
            <option value="H2">Tiêu đề mục (H2)</option>
            <option value="H3">Tiêu đề phụ (H3)</option>
            <option value="H4">Tiêu đề nhỏ (H4)</option>
            <option value="BLOCKQUOTE">Khối ghi chú</option>
          </select>
          <select data-font title="Phông chữ">
            <option value="">Phông mặc định</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="'Segoe UI', sans-serif">Segoe UI</option>
            <option value="'Times New Roman', serif">Times New Roman</option>
            <option value="'Courier New', monospace">Monospace</option>
          </select>
          <select data-fontsize title="Cỡ chữ">
            <option value="">Cỡ chữ</option>
            <option value="2">Nhỏ (13px)</option>
            <option value="3">Chuẩn (16px)</option>
            <option value="4">Vừa (18px)</option>
            <option value="5">Lớn (24px)</option>
            <option value="6">Rất lớn (32px)</option>
          </select>
        </div>
        <span class="tl-tb-sep"></span>

        <div class="tl-tb-group">
          <button type="button" data-cmd="bold" title="In đậm (Ctrl+B)"><i class="fa-solid fa-bold"></i></button>
          <button type="button" data-cmd="italic" title="In nghiêng (Ctrl+I)"><i class="fa-solid fa-italic"></i></button>
          <button type="button" data-cmd="underline" title="Gạch chân (Ctrl+U)"><i class="fa-solid fa-underline"></i></button>
          <button type="button" data-cmd="strikeThrough" title="Gạch ngang"><i class="fa-solid fa-strikethrough"></i></button>
          <button type="button" data-cmd="removeFormat" title="Xóa định dạng"><i class="fa-solid fa-eraser"></i></button>
        </div>
        <span class="tl-tb-sep"></span>

        <div class="tl-tb-group">
          <div class="tl-tb-color-wrap">
            <button type="button" data-pop="foreColor" title="Màu chữ">
              <span style="display:flex;flex-direction:column;align-items:center;line-height:1;">
                <span style="font-weight:800;font-size:.82rem;">A</span>
                <span class="tl-tb-color-dot" id="tlForeDot" style="background:#0f172a;"></span>
              </span>
            </button>
          </div>
          <div class="tl-tb-color-wrap">
            <button type="button" data-pop="hiliteColor" title="Màu nền chữ">
              <span style="display:flex;flex-direction:column;align-items:center;line-height:1;">
                <i class="fa-solid fa-highlighter" style="font-size:.78rem;"></i>
                <span class="tl-tb-color-dot" id="tlHiliteDot" style="background:#fef08a;"></span>
              </span>
            </button>
          </div>
        </div>
        <span class="tl-tb-sep"></span>

        <div class="tl-tb-group">
          <button type="button" data-cmd="justifyLeft" title="Căn trái"><i class="fa-solid fa-align-left"></i></button>
          <button type="button" data-cmd="justifyCenter" title="Căn giữa"><i class="fa-solid fa-align-center"></i></button>
          <button type="button" data-cmd="justifyRight" title="Căn phải"><i class="fa-solid fa-align-right"></i></button>
          <button type="button" data-cmd="justifyFull" title="Căn đều"><i class="fa-solid fa-align-justify"></i></button>
        </div>
        <span class="tl-tb-sep"></span>

        <div class="tl-tb-group">
          <button type="button" data-cmd="insertUnorderedList" title="Danh sách chấm"><i class="fa-solid fa-list-ul"></i></button>
          <button type="button" data-cmd="insertOrderedList" title="Danh sách số"><i class="fa-solid fa-list-ol"></i></button>
          <button type="button" data-cmd="outdent" title="Giảm thụt lề"><i class="fa-solid fa-outdent"></i></button>
          <button type="button" data-cmd="indent" title="Tăng thụt lề"><i class="fa-solid fa-indent"></i></button>
        </div>
        <span class="tl-tb-sep"></span>

        <div class="tl-tb-group">
          <button type="button" data-image title="Chèn ảnh"><i class="fa-regular fa-image"></i> Ảnh</button>
          <div class="tl-tb-color-wrap">
            <button type="button" data-pop="table" title="Chèn bảng"><i class="fa-solid fa-table"></i> Bảng</button>
          </div>
          <div class="tl-tb-color-wrap">
            <button type="button" data-pop="link" title="Chèn liên kết"><i class="fa-solid fa-link"></i> Link</button>
          </div>
          <button type="button" data-callout title="Chèn hộp lưu ý"><i class="fa-regular fa-lightbulb"></i> Lưu ý</button>
          <button type="button" data-hr title="Chèn đường kẻ ngang"><i class="fa-solid fa-minus"></i></button>
        </div>
      </div>

      <div class="tl-doc-canvas" id="tlDocCanvas">
        <div id="tlDocPage" class="tl-doc-page tl-doc-rich" contenteditable="true" data-placeholder="Bắt đầu soạn nội dung tài liệu, hoặc dán ảnh trực tiếp (Ctrl+V)...">${doc ? cleanHtml(doc.noiDung) : ''}</div>
      </div>

      <div class="tl-doc-statusbar">
        <div class="tl-doc-status-left">
          <span id="tlDocCounts">0 từ · 0 ký tự</span>
          <span>Mẹo: <b>Ctrl+S</b> để lưu nhanh · <b>Ctrl+V</b> hoặc kéo thả ảnh trực tiếp vào trang</span>
        </div>
        <div class="tl-doc-status-right">
          <select id="tlDocWidth" title="Khổ trang">
            <option value="standard">Trang chuẩn (860px)</option>
            <option value="wide">Trang rộng (1120px)</option>
          </select>
          <select id="tlDocZoom" title="Thu phóng">
            <option value="0.9">90%</option>
            <option value="1" selected>100%</option>
            <option value="1.15">115%</option>
            <option value="1.25">125%</option>
          </select>
        </div>
      </div>
    `;
    document.body.append(modal);
    document.body.classList.add('tl-doc-editing');

    const pageEl = modal.querySelector('#tlDocPage');
    const canvasEl = modal.querySelector('#tlDocCanvas');
    const toolbarEl = modal.querySelector('#tlDocToolbar');
    const saveBadge = modal.querySelector('#tlDocSaveBadge');
    const countsEl = modal.querySelector('#tlDocCounts');
    const titleEl = modal.querySelector('#tlDocTitle');
    const catEl = modal.querySelector('#tlDocCategory');
    const errorEl = modal.querySelector('#tlDocError');

    function updateCounts() {
      const text = (pageEl.innerText || '').trim();
      const words = text ? text.split(/\s+/).length : 0;
      const chars = text.length;
      countsEl.textContent = `${words} từ · ${chars} ký tự`;
    }

    function markDirty() {
      dirty = true;
      saveBadge.textContent = 'Chưa lưu';
      saveBadge.classList.add('is-dirty');
      updateCounts();
    }

    function saveSelection() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (pageEl.contains(range.commonAncestorContainer)) {
          savedRange = range.cloneRange();
        }
      }
    }

    function restoreSelection() {
      pageEl.focus();
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    }

    function syncToolbarState() {
      ['bold','italic','underline','strikeThrough','justifyLeft','justifyCenter','justifyRight','justifyFull','insertUnorderedList','insertOrderedList'].forEach(cmd => {
        const btn = toolbarEl.querySelector(`[data-cmd="${cmd}"]`);
        if (btn) {
          try { btn.classList.toggle('is-active', document.queryCommandState(cmd)); } catch (_) {}
        }
      });
    }

    function closePopovers() {
      toolbarEl.querySelectorAll('.tl-tb-popover').forEach(p => p.remove());
    }

    function hideImgBar() {
      modal.querySelectorAll('.tl-img-bar').forEach(b => b.remove());
      if (selectedImg) {
        selectedImg.classList.remove('is-selected');
        selectedImg = null;
      }
    }

    function showImgBar(img) {
      hideImgBar();
      selectedImg = img;
      img.classList.add('is-selected');
      const rect = img.getBoundingClientRect();
      const bar = document.createElement('div');
      bar.className = 'tl-img-bar';
      bar.innerHTML = `
        <button type="button" data-w="50%">50%</button>
        <button type="button" data-w="75%">75%</button>
        <button type="button" data-w="100%">100%</button>
        <button type="button" class="danger" data-del><i class="fa-solid fa-trash"></i></button>
      `;
      modal.append(bar);
      bar.style.top = `${Math.max(60, rect.top - 36)}px`;
      bar.style.left = `${Math.max(12, rect.left)}px`;
      bar.querySelectorAll('[data-w]').forEach(btn => {
        btn.onclick = () => {
          img.style.width = btn.dataset.w;
          img.style.maxWidth = '100%';
          markDirty();
          showImgBar(img);
        };
      });
      bar.querySelector('[data-del]').onclick = () => {
        img.remove();
        hideImgBar();
        markDirty();
      };
    }

    updateCounts();

    pageEl.addEventListener('input', markDirty);
    titleEl.addEventListener('input', markDirty);
    catEl.addEventListener('change', markDirty);
    pageEl.addEventListener('keyup', () => { saveSelection(); syncToolbarState(); });
    pageEl.addEventListener('mouseup', () => { saveSelection(); syncToolbarState(); });
    pageEl.addEventListener('click', e => {
      closePopovers();
      if (e.target && e.target.tagName === 'IMG' && !previewMode) {
        showImgBar(e.target);
      } else {
        hideImgBar();
      }
    });

    // Paste & Drag-drop images directly
    pageEl.addEventListener('paste', e => {
      const itemsList = Array.from(e.clipboardData?.items || []);
      const imgItem = itemsList.find(it => it.type && it.type.startsWith('image/'));
      if (imgItem) {
        e.preventDefault();
        compressAndInsertImage(imgItem.getAsFile(), pageEl, markDirty);
      }
    });

    canvasEl.addEventListener('dragover', e => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        canvasEl.classList.add('dragover');
      }
    });
    canvasEl.addEventListener('dragleave', e => {
      if (!canvasEl.contains(e.relatedTarget)) canvasEl.classList.remove('dragover');
    });
    canvasEl.addEventListener('drop', e => {
      canvasEl.classList.remove('dragover');
      const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        files.forEach(f => compressAndInsertImage(f, pageEl, markDirty));
      }
    });

    // Standard toolbar commands
    toolbarEl.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.onmousedown = e => e.preventDefault();
      btn.onclick = () => {
        closePopovers();
        pageEl.focus();
        document.execCommand(btn.dataset.cmd, false, null);
        markDirty();
        syncToolbarState();
      };
    });

    toolbarEl.querySelector('[data-block]').onchange = e => {
      pageEl.focus();
      document.execCommand('formatBlock', false, e.target.value);
      markDirty();
    };
    toolbarEl.querySelector('[data-font]').onchange = e => {
      if (!e.target.value) return;
      pageEl.focus();
      document.execCommand('fontName', false, e.target.value);
      markDirty();
    };
    toolbarEl.querySelector('[data-fontsize]').onchange = e => {
      if (!e.target.value) return;
      pageEl.focus();
      document.execCommand('fontSize', false, e.target.value);
      markDirty();
    };

    toolbarEl.querySelector('[data-image]').onclick = () => {
      closePopovers();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/gif,image/webp';
      input.onchange = () => compressAndInsertImage(input.files[0], pageEl, markDirty);
      input.click();
    };

    toolbarEl.querySelector('[data-callout]').onclick = () => {
      closePopovers();
      pageEl.focus();
      document.execCommand('insertHTML', false, '<blockquote style="border-left:4px solid #0d9488;background-color:#f0fdfa;padding:12px 16px;border-radius:0 8px 8px 0;margin:12px 0;"><b>Lưu ý:</b> Nhập nội dung ghi chú quan trọng tại đây...</blockquote><p><br></p>');
      markDirty();
    };

    toolbarEl.querySelector('[data-hr]').onclick = () => {
      closePopovers();
      pageEl.focus();
      document.execCommand('insertHorizontalRule', false, null);
      markDirty();
    };

    // Popovers (Color, Table, Link)
    toolbarEl.querySelectorAll('[data-pop]').forEach(btn => {
      btn.onmousedown = e => { e.preventDefault(); saveSelection(); };
      btn.onclick = e => {
        e.stopPropagation();
        const type = btn.dataset.pop;
        const already = btn.parentElement.querySelector('.tl-tb-popover');
        closePopovers();
        if (already) return;

        const pop = document.createElement('div');
        pop.className = 'tl-tb-popover';
        pop.onclick = ev => ev.stopPropagation();

        if (type === 'foreColor' || type === 'hiliteColor') {
          pop.innerHTML = `
            <div class="tl-color-grid">
              ${palette.map(c => `<button type="button" class="tl-color-swatch" data-color="${c}" style="background:${c};"></button>`).join('')}
            </div>
            <div class="tl-popover-form">
              <label>Chọn màu tùy chỉnh <input type="color" value="${type === 'foreColor' ? '#0f172a' : '#fef08a'}"></label>
            </div>
          `;
          const applyColor = color => {
            restoreSelection();
            document.execCommand(type === 'hiliteColor' ? 'hiliteColor' : 'foreColor', false, color);
            const dot = modal.querySelector(type === 'foreColor' ? '#tlForeDot' : '#tlHiliteDot');
            if (dot) dot.style.background = color;
            markDirty();
            closePopovers();
          };
          pop.querySelectorAll('[data-color]').forEach(sw => {
            sw.onmousedown = ev => ev.preventDefault();
            sw.onclick = () => applyColor(sw.dataset.color);
          });
          pop.querySelector('input[type=color]').onchange = ev => applyColor(ev.target.value);
        } else if (type === 'table') {
          pop.innerHTML = `
            <div class="tl-popover-form">
              <label>Số dòng <input type="number" id="tlTblRows" min="1" max="20" value="3"></label>
              <label>Số cột <input type="number" id="tlTblCols" min="1" max="10" value="3"></label>
              <div class="tl-popover-actions">
                <button type="button" class="tl-popover-btn" data-close>Đóng</button>
                <button type="button" class="tl-popover-btn primary" data-insert>Chèn bảng</button>
              </div>
            </div>
          `;
          pop.querySelector('[data-close]').onclick = closePopovers;
          pop.querySelector('[data-insert]').onclick = () => {
            const rows = Math.max(1, Math.min(20, Number.parseInt(pop.querySelector('#tlTblRows').value, 10) || 3));
            const cols = Math.max(1, Math.min(10, Number.parseInt(pop.querySelector('#tlTblCols').value, 10) || 3));
            const thead = `<thead><tr>${Array.from({ length: cols }, (_, c) => `<th>Cột ${c + 1}</th>`).join('')}</tr></thead>`;
            const tbody = `<tbody>${Array.from({ length: Math.max(1, rows - 1) }, () => `<tr>${Array.from({ length: cols }, () => '<td>Nội dung</td>').join('')}</tr>`).join('')}</tbody>`;
            restoreSelection();
            document.execCommand('insertHTML', false, `<table>${thead}${tbody}</table><p><br></p>`);
            markDirty();
            closePopovers();
          };
        } else if (type === 'link') {
          pop.innerHTML = `
            <div class="tl-popover-form">
              <label>Đường dẫn URL * <input type="url" id="tlLinkUrl" placeholder="https://..."></label>
              <label>Chữ hiển thị <input type="text" id="tlLinkText" placeholder="Mở liên kết"></label>
              <div class="tl-popover-actions">
                <button type="button" class="tl-popover-btn" data-close>Đóng</button>
                <button type="button" class="tl-popover-btn primary" data-insert>Chèn link</button>
              </div>
            </div>
          `;
          pop.querySelector('[data-close]').onclick = closePopovers;
          pop.querySelector('[data-insert]').onclick = () => {
            const href = pop.querySelector('#tlLinkUrl').value.trim();
            if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
              alert('Liên kết phải bắt đầu bằng https://, http:// hoặc mailto:');
              return;
            }
            const label = pop.querySelector('#tlLinkText').value.trim() || href;
            restoreSelection();
            document.execCommand('insertHTML', false, `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`);
            markDirty();
            closePopovers();
          };
        }

        btn.parentElement.append(pop);
      };
    });

    // Width & Zoom
    modal.querySelector('#tlDocWidth').onchange = e => {
      pageEl.classList.toggle('is-wide', e.target.value === 'wide');
    };
    modal.querySelector('#tlDocZoom').onchange = e => {
      pageEl.style.zoom = e.target.value;
    };

    // Preview mode
    modal.querySelector('[data-preview]').onclick = e => {
      previewMode = !previewMode;
      e.currentTarget.classList.toggle('is-active', previewMode);
      pageEl.contentEditable = previewMode ? 'false' : 'true';
      toolbarEl.style.display = previewMode ? 'none' : 'flex';
      hideImgBar();
      closePopovers();
    };

    // Save function
    async function saveDocument() {
      errorEl.textContent = '';
      const payload = {
        tieuDe: titleEl.value.trim(),
        chuDe: catEl.value,
        noiDung: cleanHtml(pageEl.innerHTML)
      };
      try {
        if (!payload.tieuDe || !payload.chuDe || (!pageEl.innerText.trim() && !pageEl.querySelector('img,table,hr'))) {
          throw new Error('Vui lòng nhập tiêu đề, chọn chủ đề và nhập nội dung.');
        }
        saveBadge.textContent = 'Đang lưu...';
        const saved = await request(`/documents${doc ? `/${encodeURIComponent(doc._id)}` : ''}`, {
          method: doc ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        selected = saved.data;
        dirty = false;
        cleanupAndClose();
        await render();
      } catch (err) {
        errorEl.textContent = err.message;
        saveBadge.textContent = 'Lỗi khi lưu';
        saveBadge.classList.add('is-dirty');
      }
    }

    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveDocument();
      }
    }

    function cleanupAndClose() {
      document.removeEventListener('keydown', onKeyDown);
      hideImgBar();
      modal.remove();
      document.body.classList.remove('tl-doc-editing');
    }

    document.addEventListener('keydown', onKeyDown);
    modal.querySelector('[data-save]').onclick = saveDocument;
    modal.querySelector('[data-back]').onclick = () => {
      if (!dirty || confirm('Thoát khi chưa lưu các thay đổi?')) {
        cleanupAndClose();
      }
    };
  }

  function search(){query=document.getElementById('supportDocSearch').value.trim();page=1;render();}
  function changePage(delta){page=Math.max(1,Math.min(totalPages,page+delta));render();}
  function init(container, options={}) {
    host=container;canManage=Boolean(options.canManage);window.SupportDocuments.options=options;
    document.getElementById('supportDocumentsHeaderAction')?.remove();
    if (canManage) document.querySelector('.page-heading-copy')?.insertAdjacentHTML('beforeend','<div id="supportDocumentsHeaderAction" class="support-documents-header-actions"><button class="btn btn-secondary" onclick="SupportDocuments.createTopic()"><i class="fa-solid fa-folder-plus"></i> Tạo chủ đề</button><button class="btn btn-primary" onclick="SupportDocuments.edit()"><i class="fa-solid fa-plus"></i> Tạo tài liệu</button></div>');
    render();
  }
  window.SupportDocuments={render:init,open,edit,deleteTopic,deleteDoc,createTopic,search,page:changePage,options:{}};
})();
