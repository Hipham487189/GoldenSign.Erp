// Quản lý UNC theo trang; tệp chỉ được tải khi xem.
(function () {
  let uncOrders = [];
  let trang = 1;
  let tong = 0;
  let choDuyet = 0;
  let tongTrang = 1;
  let lanTai = 0;

  async function loadUncOrders(trangMoi = trang) {
    const thuTu = ++lanTai;
    const response = await fetch(`${API_URL}/unc/danh-sach?page=${trangMoi}&limit=50`);
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tải danh sách UNC.');
    if (thuTu !== lanTai) return false;
    const duLieu = result.data;
    trang = duLieu.page;
    tong = duLieu.total;
    choDuyet = duLieu.choDuyet;
    tongTrang = duLieu.totalPages;
    uncOrders = duLieu.items.map(don => ({
      ...don, loaiUnc: don.phieu.loai, maPhieu: don.phieu.maPhieu,
      'Số Tiền UNC': don.phieu.soTien, 'Ngày Thanh Toán UNC': don.phieu.ngay,
      'Ngày Upload UNC': don.phieu.ngayGui, 'Trạng Thái UNC': don.phieu.trangThai,
      'Ghi Chú Từ Chối UNC': don.phieu.lyDoTuChoi, 'Tên File UNC': don.phieu.tenTep,
      'Nội Dung UNC': don.phieu.ghiChu, hasUncImage: don.phieu.coTep
    }));
    return true;
  }

  function isAdmin() {
    return currentUser?.role?.name === 'Admin';
  }

  function canManageOwnUnc() {
    const role = currentUser?.role;
    const hasOwnScope = role?.dataScopes?.orders === 'own' || (!role?.dataScopes?.orders && ['Nhân Viên', 'Chỉ Xem'].includes(role?.name));
    return !isAdmin() && hasOwnScope && role?.permissions?.includes('manage_orders');
  }

  function uncRow(order) {
    const status = order['Trạng Thái UNC'] || 'Chờ Duyệt';
    const statusClass = status === 'Đã Duyệt' ? 'status-yes' : status === 'Từ Chối' ? 'status-no' : 'status-pending';
    const id = encodeURIComponent(String(order._id)).replace(/'/g, '%27');
    const moi = order.loaiUnc === 'moi';
    const maPhieu = encodeURIComponent(String(order.maPhieu || '')).replace(/'/g, '%27');
    const viewBtn = order.hasUncImage ? `<button class="btn btn-secondary" type="button" onclick="${moi ? `viewUncMoi(decodeURIComponent('${id}'), decodeURIComponent('${maPhieu}'))` : `viewUncFile(decodeURIComponent('${id}'))`}"><i class="fa-solid fa-eye"></i> Xem UNC</button> ` : '';
    const canReview = isAdmin() && (moi ? status === 'Chờ Duyệt' : status !== 'Đã Duyệt');
    const xuLy = moi ? `updateUncMoi(decodeURIComponent('${id}'), decodeURIComponent('${maPhieu}'), ` : `updateUncStatus(decodeURIComponent('${id}'), `;
    const reviewBtns = canReview ? `<button class="btn btn-success" type="button" onclick="${xuLy}'Đã Duyệt')"><i class="fa-solid fa-check"></i> Duyệt</button> <button class="btn btn-danger" type="button" onclick="${xuLy}'Từ Chối')"><i class="fa-solid fa-xmark"></i> Từ Chối</button>` : '';
    const editBtns = !moi && canManageOwnUnc() && status !== 'Đã Duyệt' ? `<button class="btn btn-secondary" type="button" onclick="editUncPayment(decodeURIComponent('${id}'))"><i class="fa-solid fa-pen"></i> Sửa</button> <button class="btn btn-danger" type="button" onclick="deleteUncPayment(decodeURIComponent('${id}'))"><i class="fa-solid fa-trash"></i> Xóa</button>` : '';
    const rejectionNote = status === 'Từ Chối' && order['Ghi Chú Từ Chối UNC'] ? `<small style="display:block;margin-top:4px;">Lý do: ${escapeHtml(order['Ghi Chú Từ Chối UNC'])}</small>` : '';
    return `<tr><td>${escapeHtml(order['Mã Đơn Hàng'] || '--')}</td><td>${escapeHtml(order['Tên Khách Hàng'] || order['Tên Công Ty '] || '--')}</td><td>${escapeHtml(moi ? '—' : (order.NCC || '--'))}</td><td style="text-align:right;">${Number(order['Số Tiền UNC'] || 0).toLocaleString('vi-VN')} đ</td><td>${escapeHtml(order['Tên File UNC'] || '--')}</td><td>${escapeHtml(order['Ngày Thanh Toán UNC'] ? new Date(order['Ngày Thanh Toán UNC']).toLocaleDateString('vi-VN') : '--')}</td><td>${escapeHtml(order['Ngày Upload UNC'] ? new Date(order['Ngày Upload UNC']).toLocaleString('vi-VN') : '--')}</td><td><span class="status-badge ${statusClass}">${escapeHtml(status)}</span>${rejectionNote}</td><td style="white-space:nowrap;">${viewBtn}${reviewBtns}${editBtns}</td></tr>`;
  }

  function paintUncManagement() {
    document.getElementById('currentMonthRevenue').innerText = `${tong} phiếu UNC`;
    document.getElementById('totalOrdersCount').innerText = `${choDuyet} chờ duyệt`;
    const rows = uncOrders.length ? uncOrders.map(uncRow).join('') : '<tr><td colspan="9" class="empty-state">Chưa có phiếu UNC nào.</td></tr>';
    document.getElementById('mainContainerBox').innerHTML = `<div class="overview-card" style="width:100%;"><div class="overview-card-title"><i class="fa-solid fa-file-circle-check"></i> Danh Sách Phiếu UNC</div><div style="overflow-x:auto;"><table><thead><tr><th>Mã Đơn</th><th>Khách Hàng / Công Ty</th><th>NCC</th><th style="text-align:right;">Số Tiền UNC</th><th>Tệp UNC</th><th>Ngày Thanh Toán</th><th>Ngày Gửi</th><th>Trạng Thái</th><th>${isAdmin() ? 'Quản Lý Duyệt' : 'Cập Nhật'}</th></tr></thead><tbody>${rows}</tbody></table></div><div>Trang ${trang}/${tongTrang} <button type="button" class="btn btn-secondary" onclick="chuyenTrangUnc(${trang - 1})" ${trang <= 1 ? 'disabled' : ''}>Trước</button> <button type="button" class="btn btn-secondary" onclick="chuyenTrangUnc(${trang + 1})" ${trang >= tongTrang ? 'disabled' : ''}>Tiếp</button></div></div>`;
  }

  window.renderUncManagement = async function () {
    const lan = lanTai + 1;
    if (currentTab === 'unc-management') document.getElementById('mainContainerBox').innerHTML = '<div class="empty-state">Đang tải danh sách UNC...</div>';
    try {
      if (await loadUncOrders() && currentTab === 'unc-management') paintUncManagement();
    } catch (error) {
      if (lan === lanTai && currentTab === 'unc-management') {
        document.getElementById('mainContainerBox').innerHTML = `<div class="empty-state">Không thể tải danh sách UNC: ${escapeHtml(error.message)}</div>`;
      }
    }
  };

  window.chuyenTrangUnc = async function (trangMoi) {
    if (trangMoi < 1 || trangMoi > tongTrang) return;
    try { if (await loadUncOrders(trangMoi) && currentTab === 'unc-management') paintUncManagement(); }
    catch (error) { alert(`Không thể tải danh sách UNC: ${error.message}`); }
  };

  window.updateUncMoi = async function (orderId, maPhieu, trangThai) {
    const lyDoTuChoi = trangThai === 'Từ Chối' ? window.prompt('Nhập nguyên nhân từ chối phiếu UNC:') : '';
    if (lyDoTuChoi === null) return;
    if (trangThai === 'Từ Chối' && !lyDoTuChoi.trim()) return alert('Vui lòng nhập nguyên nhân từ chối.');
    try {
      const response = await fetch(`${API_URL}/unc-nhieu-san-pham/${encodeURIComponent(orderId)}/${encodeURIComponent(maPhieu)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trangThai, lyDoTuChoi })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể xử lý phiếu UNC.');
      await window.renderUncManagement();
      showAppToast(trangThai === 'Đã Duyệt' ? 'Đã duyệt phiếu UNC.' : 'Đã từ chối phiếu UNC.');
    } catch (error) { alert(`Không thể xử lý phiếu UNC: ${error.message}`); }
  };

  window.viewUncMoi = async function (orderId, maPhieu) {
    try {
      const response = await fetch(`${API_URL}/unc-nhieu-san-pham/${encodeURIComponent(orderId)}/${encodeURIComponent(maPhieu)}/file`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tải tệp UNC.');
      const { ten, duLieu } = result.data;
      const viewer = document.getElementById('invoicePdfViewer');
      const download = document.getElementById('invoicePdfDownload');
      document.getElementById('invoicePdfModal').classList.add('active');
      download.href = duLieu;
      download.download = ten;
      download.onclick = null;
      if (duLieu.startsWith('data:application/pdf;base64,')) {
        const hienThi = showInvoicePdf(duLieu);
        download.onclick = null;
        await hienThi;
      } else if (duLieu.startsWith('data:image/')) {
        const anh = document.createElement('img');
        anh.src = duLieu;
        anh.alt = ten;
        anh.style.cssText = 'display:block;max-width:100%;max-height:100%;margin:auto;object-fit:contain;background:#fff';
        viewer.replaceChildren(anh);
      } else viewer.textContent = 'Định dạng này không hỗ trợ xem trực tiếp. Hãy bấm Tải xuống.';
    } catch (error) { alert(`Không thể xem tệp UNC: ${error.message}`); }
  };

  window.updateUncStatus = async function (orderId, status) {
    const rejectionNote = status === 'Từ Chối' ? window.prompt('Nhập nguyên nhân từ chối phiếu UNC:') : '';
    if (status === 'Từ Chối' && rejectionNote === null) return;
    if (status === 'Từ Chối' && !rejectionNote.trim()) return alert('Vui lòng nhập nguyên nhân từ chối.');
    try {
      const response = await fetch(`${API_URL}/unc/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'Trạng Thái UNC': status, 'Ghi Chú Từ Chối UNC': rejectionNote })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể cập nhật trạng thái UNC.');
      await loadUncOrders();
      paintUncManagement();
      showAppToast(status === 'Đã Duyệt' ? 'Đã duyệt phiếu UNC.' : 'Đã từ chối phiếu UNC.');
    } catch (error) {
      alert(`Không thể cập nhật trạng thái UNC: ${error.message}`);
    }
  };

  window.editUncPayment = function (orderId) {
    const order = uncOrders.find(item => item.loaiUnc === 'cu' && String(item._id) === String(orderId));
    if (!order) return;
    const date = new Date(order['Ngày Thanh Toán UNC'] || '');
    const dateValue = Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    document.getElementById('paymentUploadModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="modal payment-upload-modal active" id="paymentUploadModal" onclick="if(event.target === this) closePaymentUploadModal()"><div class="modal-content"><div class="modal-header"><h3><i class="fa-solid fa-pen"></i> Cập nhật phiếu UNC</h3><button type="button" class="modal-close-btn" onclick="closePaymentUploadModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="payment-upload-order">Đơn <strong>${escapeHtml(order['Mã Đơn Hàng'] || '--')}</strong></div><div class="payment-upload-form"><div class="payment-upload-row"><div class="form-group"><label class="form-label">Số tiền UNC</label><input id="editUncAmount" class="form-input" type="number" min="1" step="1" value="${escapeHtml(order['Số Tiền UNC'] || '')}"></div><div class="form-group"><label class="form-label">Ngày thanh toán</label><input id="editUncDate" class="form-input" type="date" value="${dateValue}"></div></div><div class="form-group"><label class="form-label">Nội dung / ghi chú</label><input id="editUncNote" class="form-input" value="${escapeHtml(order['Nội Dung UNC'] || '')}"></div><div class="form-group"><label class="form-label">Ảnh UNC / giấy báo Có</label><div class="payment-upload-dropzone" onclick="document.getElementById('editUncFile').click()"><i class="fa-solid fa-cloud-arrow-up"></i><span>Chọn tệp mới nếu cần thay</span><small id="editUncFileName">${escapeHtml(order['Tên File UNC'] || 'PNG, JPG, PDF tối đa 3MB')}</small><input id="editUncFile" type="file" accept="image/*,.pdf" hidden onchange="document.getElementById('editUncFileName').textContent=this.files[0]?.name||''"></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closePaymentUploadModal()">Hủy</button><button type="button" class="btn btn-primary" onclick="saveUncPayment('${escapeHtml(order._id)}')"><i class="fa-solid fa-floppy-disk"></i> Lưu cập nhật</button></div></div></div>`);
  };

  window.saveUncPayment = async function (orderId) {
    const amount = Number(document.getElementById('editUncAmount')?.value || 0);
    const paymentDate = document.getElementById('editUncDate')?.value || '';
    const note = document.getElementById('editUncNote')?.value.trim() || '';
    const file = document.getElementById('editUncFile')?.files?.[0];
    if (!Number.isFinite(amount) || amount <= 0) return alert('Vui lòng nhập số tiền UNC hợp lệ.');
    if (!paymentDate) return alert('Vui lòng chọn ngày thanh toán.');
    if (file && file.size > 3 * 1024 * 1024) return alert('Tệp UNC không được vượt quá 3MB.');
    try {
      const imageData = file ? await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }) : '';
      const payload = { 'Số Tiền UNC': amount, 'Ngày Thanh Toán UNC': paymentDate, 'Nội Dung UNC': note };
      if (file) {
        payload['Ảnh UNC'] = imageData;
        payload['Tên File UNC'] = file.name;
      }
      const response = await fetch(`${API_URL}/unc/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể cập nhật phiếu UNC.');
      closePaymentUploadModal();
      await loadUncOrders();
      paintUncManagement();
      showAppToast('Đã cập nhật phiếu UNC, chờ Admin duyệt lại.');
    } catch (error) {
      alert(`Không thể cập nhật phiếu UNC: ${error.message}`);
    }
  };

  window.deleteUncPayment = async function (orderId) {
    if (!window.confirm('Bạn có chắc muốn xóa phiếu UNC này?')) return;
    try {
      const response = await fetch(`${API_URL}/unc/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể xóa phiếu UNC.');
      await loadUncOrders();
      paintUncManagement();
      showAppToast('Đã xóa phiếu UNC.');
    } catch (error) {
      alert(`Không thể xóa phiếu UNC: ${error.message}`);
    }
  };

  window.viewUncFile = async function (orderId) {
    const viewer = document.getElementById('invoicePdfViewer');
    const download = document.getElementById('invoicePdfDownload');
    document.getElementById('invoicePdfModal').classList.add('active');
    viewer.innerHTML = '<div class="invoice-pdf-loading">Đang tải UNC...</div>';
    let data = '', name = 'unc';
    try {
      const response = await fetch(`${API_URL}/unc/${encodeURIComponent(orderId)}/file`);
      const result = await response.json();
      data = result.data?.['Ảnh UNC'] || '';
      name = result.data?.['Tên File UNC'] || name;
    } catch (error) { console.warn(error); }
    if (!data) { viewer.innerHTML = '<div class="invoice-pdf-loading">Không tải được tệp UNC.</div>'; return; }
    download.href = data;
    download.download = name;
    if (data.startsWith('data:application/pdf')) showInvoicePdf(data);
    else if (data.startsWith('data:image/')) viewer.innerHTML = `<img src="${data}" alt="${escapeHtml(name)}" style="display:block;max-width:100%;max-height:100%;margin:auto;object-fit:contain;background:#fff;">`;
    else viewer.innerHTML = '<div class="invoice-pdf-loading">Định dạng này không hỗ trợ xem trực tiếp. Hãy bấm Tải xuống.</div>';
  };
})();