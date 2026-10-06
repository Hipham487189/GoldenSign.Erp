(function () {
  const AVATAR_SIZE = 256;
  let pendingAvatar = '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const isImage = value => /^data:image\/(png|jpe?g|webp|gif);base64,/.test(value || '');
  const formatDate = value => { const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '--'; };
  const initialsOf = name => String(name || '').split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase() || 'NV';
  const avatarHtml = (employee, size = 36) => (isImage(employee?.avatar)
    ? `<img class="emp-avatar" src="${esc(employee.avatar)}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="emp-avatar emp-avatar-empty" style="width:${size}px;height:${size}px">${esc(initialsOf(employee?.name))}</span>`);

  function injectStyles() {
    if (document.getElementById('empProfileStyles')) return;
    const style = document.createElement('style');
    style.id = 'empProfileStyles';
    style.textContent = `.emp-avatar{display:inline-grid;place-items:center;border-radius:50%;object-fit:cover;background:rgba(14,165,233,.16);color:var(--primary);font-weight:800;font-size:.8rem;vertical-align:middle}
.user-profile-avatar img.emp-avatar{width:100%;height:100%;border-radius:inherit}
.emp-avatar-field{display:flex;align-items:center;gap:.8rem;margin-top:.8rem}
.emp-avatar-actions{display:flex;flex-direction:column;gap:.4rem;align-items:flex-start}
.emp-avatar-actions small{color:var(--text-muted)}
.user-profile-birth{margin-top:.15rem;color:var(--text-muted);font-size:.78rem}`;
    document.head.appendChild(style);
  }

  function shrink(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return reject(new Error('Vui lòng chọn ảnh PNG, JPG, WEBP hoặc GIF.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = AVATAR_SIZE;
        canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh.')); };
      img.src = url;
    });
  }

  function showPreview(value) {
    pendingAvatar = value || '';
    const preview = document.getElementById('employeeAvatarPreview');
    if (preview) preview.innerHTML = avatarHtml({ avatar: pendingAvatar, name: document.getElementById('employeeName')?.value }, 64);
  }

  function decorateForm(form) {
    if (!form || form.querySelector('#employeeBirthDate')) return;
    form.querySelector('#employeeName')?.closest('.form-group')?.insertAdjacentHTML('afterend', `
      <div class="emp-avatar-field"><div id="employeeAvatarPreview"></div>
        <div class="emp-avatar-actions"><input type="file" id="employeeAvatarFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          <button type="button" class="btn btn-secondary" id="employeeAvatarPick"><i class="fa-solid fa-image"></i> Tải ảnh đại diện</button>
          <button type="button" class="btn btn-secondary" id="employeeAvatarClear"><i class="fa-solid fa-trash"></i> Bỏ ảnh</button>
          <small>Ảnh được tự cắt vuông và thu nhỏ.</small></div></div>
      <div class="form-group" style="margin-top:.8rem"><label class="form-label">Ngày Sinh</label><input id="employeeBirthDate" type="date" class="form-input"></div>`);
    const file = form.querySelector('#employeeAvatarFile');
    form.querySelector('#employeeAvatarPick').addEventListener('click', () => file.click());
    form.querySelector('#employeeAvatarClear').addEventListener('click', () => { file.value = ''; showPreview(''); });
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      try { showPreview(await shrink(file.files[0])); } catch (error) { alert(error.message); }
    });
    showPreview('');
  }

  function decorateTable() {
    const table = document.querySelector('#mainContainerBox table');
    const header = table?.querySelector('thead tr');
    if (!header || header.querySelector('.employee-avatar-column')) return;
    header.firstElementChild.insertAdjacentHTML('beforebegin', '<th class="employee-avatar-column">Ảnh</th>');
    header.children[2].insertAdjacentHTML('beforebegin', '<th>Ngày Sinh</th>');
    table.querySelectorAll('tbody tr').forEach((row, index) => {
      const employee = allEmployees[index];
      if (!employee || row.children.length < 3) return;
      row.firstElementChild.insertAdjacentHTML('beforebegin', `<td>${avatarHtml(employee)}</td>`);
      row.children[2].insertAdjacentHTML('beforebegin', `<td>${esc(formatDate(employee.birthDate))}</td>`);
    });
  }

  const baseRender = window.renderEmployeeManagement;
  if (typeof baseRender === 'function') {
    window.renderEmployeeManagement = function () {
      injectStyles();
      const result = baseRender.apply(this, arguments);
      decorateForm(document.querySelector('body > .employee-form-panel.employee-modal'));
      decorateTable();
      return result;
    };
  }

  const baseReset = window.resetEmployeeForm;
  window.resetEmployeeForm = function () {
    baseReset.apply(this, arguments);
    const birth = document.getElementById('employeeBirthDate');
    if (birth) birth.value = '';
    const file = document.getElementById('employeeAvatarFile');
    if (file) file.value = '';
    showPreview('');
  };

  const baseEdit = window.editEmployee;
  window.editEmployee = function (id) {
    baseEdit.apply(this, arguments);
    const employee = allEmployees.find(item => item._id === id);
    if (!employee) return;
    const birth = document.getElementById('employeeBirthDate');
    if (birth) birth.value = employee.birthDate || '';
    showPreview(isImage(employee.avatar) ? employee.avatar : '');
  };

  window.saveEmployee = async function () {
    const value = id => document.getElementById(id)?.value.trim() || '';
    const name = value('employeeName');
    if (!name) return alert('Vui lòng nhập họ tên nhân viên.');
    const payload = {
      name, phone: value('employeePhone'), email: value('employeeEmail'), department: value('employeeDepartment'), bankAccount: value('employeeBankAccount'),
      birthDate: value('employeeBirthDate'), avatar: pendingAvatar, isActive: document.getElementById('employeeActive').checked
    };
    const id = editingEmployeeId;
    const response = await fetch(id ? `${API_EMPLOYEES_URL}/update/${id}` : `${API_EMPLOYEES_URL}/create`, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!result.success) return alert(result.message || 'Không thể lưu nhân viên.');
    await loadEmployees();
    renderEmployeeManagement();
  };

  const baseUserPopup = window.renderUserInfoPopup;
  if (typeof baseUserPopup === 'function') {
    window.renderUserInfoPopup = function () {
      injectStyles();
      baseUserPopup.apply(this, arguments);
      const linkedId = currentUser?.employee?._id || currentUser?.employeeId?._id || currentUser?.employeeId;
      const employee = allEmployees.find(item => String(item._id) === String(linkedId))
        || allEmployees.find(item => item.email && item.email === currentUser?.email)
        || allEmployees.find(item => item.name && item.name === currentUser?.name);
      if (!employee) return;
      const avatar = document.querySelector('#userInfoPopupBody .user-profile-avatar');
      if (avatar && isImage(employee.avatar)) avatar.innerHTML = `<img class="emp-avatar" src="${esc(employee.avatar)}" alt="">`;
      if (employee.birthDate) document.querySelector('#userInfoPopupBody .user-profile-email')?.insertAdjacentHTML('afterend', `<div class="user-profile-birth"><i class="fa-solid fa-cake-candles"></i> ${esc(formatDate(employee.birthDate))}</div>`);
      const button = document.getElementById('topUserInfoButton');
      if (button && isImage(employee.avatar)) button.innerHTML = `<img class="emp-avatar" src="${esc(employee.avatar)}" alt="" style="width:100%;height:100%">`;
    };
  }
})();
