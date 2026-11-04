(function () {
  const api = `${window.API_BASE_URL}/api/support-documents`;
  const allowed = new Set(['P','DIV','BR','SPAN','B','STRONG','I','EM','U','S','STRIKE','SUB','SUP','H1','H2','H3','H4','UL','OL','LI','A','TABLE','THEAD','TBODY','TR','TD','TH','HR','BLOCKQUOTE','IMG']);
  const styles = ['color','background-color','font-family','font-size','font-weight','font-style','text-decoration','text-align','margin-left','line-height','border','border-collapse','width','padding','vertical-align','max-width'];
  let host, canManage = false, page = 1, totalPages = 1, query = '', items = [], topics = [], selected = null, range = null, dirty = false;
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
    } catch (error) { host.innerHTML=`<div class="loading-state" style="color:#dc2626;">${esc(error.message)} <button class="btn btn-secondary" onclick="window.SupportDocuments.render(document.getElementById('mainContainerBox'),window.SupportDocuments.options)">Thử lại</button></div>`; }
  }
  function draw() {
    const groups=new Map();
    topics.forEach(topic=>groups.set(topic.ten,[]));
    items.forEach(item=>{const name=(item.chuDe||'Chung').trim()||'Chung';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(item);});
    const selectedTopic=selected?.chuDe;
    const list=[...groups].map(([name,docs])=>`<details class="support-document-group" ${query||name===selectedTopic?'open':''}><summary><span><i class="fa-solid fa-folder"></i> ${esc(name)}</span><em>${docs.length}${canManage&&!docs.length&&topics.some(t=>t.ten===name)?` <button class="support-document-row-delete support-topic-delete" title="Xóa chủ đề" onclick="event.preventDefault();SupportDocuments.deleteTopic('${topics.find(t=>t.ten===name)._id}')"><i class="fa-solid fa-trash"></i></button>`:''}</em></summary>${docs.map(doc=>`<div class="support-document-row"><button class="support-document-card ${selected?._id===doc._id?'active':''}" onclick="SupportDocuments.open('${doc._id}')"><strong><i class="fa-regular fa-file-lines"></i> ${esc(doc.tieuDe)}</strong><small>Cập nhật ${doc.updatedAt?new Date(doc.updatedAt).toLocaleDateString('vi-VN'):'--'}</small></button>${canManage?`<button class="support-document-row-delete" title="Xóa tài liệu" onclick="SupportDocuments.deleteDoc('${doc._id}')"><i class="fa-solid fa-trash"></i></button>`:''}</div>`).join('')||'<div class="support-document-meta" style="padding:.7rem;">Chưa có tài liệu trong chủ đề này.</div>'}</details>`).join('');
    host.innerHTML=`<div class="support-documents"><header class="support-documents-header"><div class="support-documents-heading"><div class="support-documents-icon"><i class="fa-solid fa-book-open"></i></div><div><h3>Tài liệu hỗ trợ</h3><p>Quy trình và thông tin tham khảo dành cho nhân viên.</p></div></div>${canManage?'<div class="support-documents-header-actions"><button class="btn btn-secondary" onclick="SupportDocuments.createTopic()"><i class="fa-solid fa-folder-plus"></i> Tạo chủ đề</button><button class="btn btn-primary" onclick="SupportDocuments.edit()"><i class="fa-solid fa-plus"></i> Tạo tài liệu</button></div>':''}</header><section class="support-documents-list"><form class="support-documents-search" onsubmit="event.preventDefault();SupportDocuments.search()"><input class="form-input" id="supportDocSearch" value="${esc(query)}" placeholder="Tìm tài liệu..." aria-label="Tìm tài liệu"><button class="btn btn-secondary"><i class="fa-solid fa-magnifying-glass"></i></button></form>${list||empty('Chưa có chủ đề hoặc tài liệu.') }<div class="support-documents-pagination"><button class="btn btn-secondary" ${page<=1?'disabled':''} onclick="SupportDocuments.page(-1)">Trước</button><span class="support-document-meta">Trang ${page}/${totalPages}</span><button class="btn btn-secondary" ${page>=totalPages?'disabled':''} onclick="SupportDocuments.page(1)">Sau</button></div></section><section class="support-document-detail">${selected?detailHtml(selected):empty('Chọn một tài liệu để xem nội dung.')}</section></div>`;
  }
  function detailHtml(doc) { return `<div class="support-document-meta">${esc(doc.chuDe||'Chung')} · Cập nhật ${doc.updatedAt?new Date(doc.updatedAt).toLocaleString('vi-VN'):'--'}</div><h2>${esc(doc.tieuDe)}</h2><div class="support-document-content tl-doc-rich">${cleanHtml(doc.noiDung)}</div>${canManage?`<div class="support-documents-header-actions" style="margin-top:1rem;"><button class="btn btn-secondary" onclick="SupportDocuments.edit('${doc._id}')"><i class="fa-solid fa-pen"></i> Chỉnh sửa</button><button class="btn btn-danger" onclick="SupportDocuments.deleteDoc('${doc._id}')"><i class="fa-solid fa-trash"></i> Xóa</button></div>`:''}`; }
  async function open(id) { try { const result=await request(`/documents/${encodeURIComponent(id)}`);selected=result.data;draw(); } catch(error) { alert(error.message); } }
  async function createTopic() {
    const modal=document.createElement('div');modal.className='tl-topic-modal';modal.innerHTML=`<section class="tl-topic-dialog" role="dialog" aria-modal="true"><div class="modal-header"><h3><i class="fa-solid fa-folder-plus"></i> Tạo chủ đề mới</h3><button class="btn btn-secondary" onclick="this.closest('.tl-topic-modal').remove()">×</button></div><div class="tl-topic-note"><i class="fa-solid fa-circle-info"></i><div><strong>Chủ đề là thư mục chứa các tài liệu cùng nhóm.</strong><p>Tạo chủ đề trước, sau đó chọn chủ đề khi tạo tài liệu. Ví dụ: Hướng dẫn bán hàng, Quy trình công nợ.</p></div></div><form><label class="form-label">Tên chủ đề *</label><input class="form-input" name="ten" maxlength="80" placeholder="Nhập tên chủ đề"><div class="tl-topic-error" role="alert"></div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="this.closest('.tl-topic-modal').remove()">Hủy</button><button class="btn btn-primary">Tạo chủ đề</button></div></form></section>`;
    document.body.append(modal);modal.querySelector('input').focus();modal.querySelector('form').onsubmit=async e=>{e.preventDefault();const error=modal.querySelector('.tl-topic-error');try{await request('/topics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ten:modal.querySelector('[name=ten]').value.trim()})});modal.remove();await render();}catch(err){error.textContent=err.message;}};
  }
  async function deleteTopic(id) { if(!confirm('Xóa chủ đề này?'))return;try{await request(`/topics/${encodeURIComponent(id)}`,{method:'DELETE'});await render();}catch(error){alert(error.message);} }
  async function deleteDoc(id) { if(!confirm('Xóa tài liệu này?'))return;try{await request(`/documents/${encodeURIComponent(id)}`,{method:'DELETE'});if(selected?._id===id)selected=null;await render();}catch(error){alert(error.message);} }
  function edit(id) {
    if(!canManage)return;
    const doc=selected?._id===id?selected:null;
    const modal=document.createElement('div');modal.className='tl-doc-editor';modal.innerHTML=`<div class="tl-doc-topbar"><button class="btn btn-secondary" data-back>← Quay lại</button><input id="tlDocTitle" class="tl-doc-input tl-doc-title" maxlength="160" placeholder="Tiêu đề" value="${esc(doc?.tieuDe||'')}"><select id="tlDocCategory" class="tl-doc-input tl-doc-category"><option value="">-- Chọn chủ đề --</option>${topics.map(t=>`<option ${t.ten===doc?.chuDe?'selected':''}>${esc(t.ten)}</option>`).join('')}</select><span id="tlDocError" role="alert"></span><button class="btn btn-primary" data-save>Lưu tài liệu</button></div><div class="tl-doc-toolbar"><button data-cmd="undo">↶</button><button data-cmd="redo">↷</button><select data-block><option value="P">Văn bản</option><option value="H1">Tiêu đề 1</option><option value="H2">Tiêu đề 2</option><option value="H3">Tiêu đề 3</option></select><button data-cmd="bold"><b>B</b></button><button data-cmd="italic"><i>I</i></button><button data-cmd="underline"><u>U</u></button><button data-cmd="insertUnorderedList">• Danh sách</button><button data-cmd="insertOrderedList">1. Danh sách</button><button data-cmd="justifyLeft">Trái</button><button data-cmd="justifyCenter">Giữa</button><button data-cmd="justifyRight">Phải</button><button data-image>Chèn ảnh</button></div><div class="tl-doc-canvas"><div id="tlDocPage" class="tl-doc-page tl-doc-rich" contenteditable="true" data-placeholder="Bắt đầu soạn tài liệu...">${doc?cleanHtml(doc.noiDung):''}</div></div>`;
    document.body.append(modal);document.body.classList.add('tl-doc-editing');
    const pageEl=modal.querySelector('#tlDocPage');pageEl.oninput=()=>{dirty=true;};
    modal.querySelector('[data-back]').onclick=()=>{if(!dirty||confirm('Thoát khi chưa lưu các thay đổi?')){modal.remove();document.body.classList.remove('tl-doc-editing');}};
    modal.querySelectorAll('[data-cmd]').forEach(btn=>{btn.onmousedown=e=>e.preventDefault();btn.onclick=()=>{pageEl.focus();document.execCommand(btn.dataset.cmd,false,null);dirty=true;};});
    modal.querySelector('[data-block]').onchange=e=>{pageEl.focus();document.execCommand('formatBlock',false,e.target.value);dirty=true;};
    modal.querySelector('[data-image]').onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/gif,image/webp';input.onchange=()=>{const file=input.files[0];if(!file)return;if(file.size>10*1024*1024){alert('Ảnh tối đa 10MB.');return;}const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1400/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);pageEl.focus();document.execCommand('insertHTML',false,`<img src="${canvas.toDataURL('image/jpeg',.84)}" style="max-width:100%"><p><br></p>`);dirty=true;};img.src=reader.result;};reader.readAsDataURL(file);};input.click();};
    modal.querySelector('[data-save]').onclick=async()=>{const error=modal.querySelector('#tlDocError');const payload={tieuDe:modal.querySelector('#tlDocTitle').value.trim(),chuDe:modal.querySelector('#tlDocCategory').value,noiDung:cleanHtml(pageEl.innerHTML)};try{if(!payload.tieuDe||!payload.chuDe||!pageEl.innerText.trim()&&!pageEl.querySelector('img,table,hr'))throw new Error('Vui lòng nhập tiêu đề, chọn chủ đề và nhập nội dung.');const saved=await request(`/documents${doc?`/${encodeURIComponent(doc._id)}`:''}`,{method:doc?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});selected=saved.data;dirty=false;modal.remove();document.body.classList.remove('tl-doc-editing');await render();}catch(err){error.textContent=err.message;}};
  }
  function search(){query=document.getElementById('supportDocSearch').value.trim();page=1;render();}
  function changePage(delta){page=Math.max(1,Math.min(totalPages,page+delta));render();}
  function init(container, options={}) { host=container;canManage=Boolean(options.canManage);window.SupportDocuments.options=options;render(); }
  window.SupportDocuments={render:init,open,edit,deleteTopic,deleteDoc,createTopic,search,page:changePage,options:{}};
})();
