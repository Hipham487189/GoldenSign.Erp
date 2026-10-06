// Form gửi phiếu UNC (có ngày thanh toán). Ghi đè hàm cũ trong HTML.
(function () {
  const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  window.openPaymentUploadModal = function (orderId) {
    closePaymentUploadModal();
    const order = filteredOrders.find(item => String(item._id) === String(orderId)) || allOrders.find(item => String(item._id) === String(orderId));
    if (!order) return;
    const customer = order['Tên Khách Hàng'] || order['Tên Công Ty '] || '--';
    document.body.insertAdjacentHTML('beforeend', `<div class="modal payment-upload-modal active" id="paymentUploadModal" onclick="if(event.target === this) closePaymentUploadModal()"><div class="modal-content"><div class="modal-header"><h3><i class="fa-solid fa-cloud-arrow-up"></i> Gửi phiếu UNC</h3><button type="button" class="modal-close-btn" onclick="closePaymentUploadModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="payment-upload-order">Đơn <strong>${escapeHtml(order['Mã Đơn Hàng'] || '--')}</strong> - ${escapeHtml(customer)}</div><div class="payment-upload-form"><div class="payment-upload-row"><div class="form-group"><label class="form-label">Số tiền UNC <span style="color:#f43f5e">*</span></label><input id="paymentUploadAmount" class="form-input" type="number" min="1" step="1" placeholder="VD: 1688000"></div><div class="form-group"><label class="form-label">Ngày thanh toán <span style="color:#f43f5e">*</span></label><input id="paymentUploadDate" class="form-input" type="date" value="${todayIso()}"></div></div><div class="form-group"><label class="form-label">Nội dung / ghi chú</label><input id="paymentUploadNote" class="form-input" placeholder="VD: CK Vietcombank, mã GD..."></div><div class="form-group"><label class="form-label">Ảnh UNC / giấy báo Có</label><div class="payment-upload-dropzone" onclick="document.getElementById('paymentUploadFile').click()"><i class="fa-solid fa-cloud-arrow-up"></i><span>Kéo thả hoặc bấm để chọn tệp</span><small id="paymentUploadFileName">PNG, JPG, PDF tối đa 8MB</small><input id="paymentUploadFile" type="file" accept="image/*,.pdf" hidden onchange="showPaymentUploadFile(this)"></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closePaymentUploadModal()">Hủy</button><button type="button" class="btn btn-primary" onclick="submitPaymentUpload('${escapeHtml(order._id)}')"><i class="fa-solid fa-paper-plane"></i> Gửi yêu cầu</button></div></div></div>`);
    const dropzone = document.querySelector('#paymentUploadModal .payment-upload-dropzone');
    dropzone?.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('is-dragover'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone?.addEventListener('drop', event => { event.preventDefault(); dropzone.classList.remove('is-dragover'); const input = document.getElementById('paymentUploadFile'); if (event.dataTransfer.files.length) { input.files = event.dataTransfer.files; showPaymentUploadFile(input); } });
  };

  window.submitPaymentUpload = async function (orderId) {
    const amount = Number(document.getElementById('paymentUploadAmount')?.value || 0);
    const paymentDate = document.getElementById('paymentUploadDate')?.value || '';
    const note = document.getElementById('paymentUploadNote')?.value.trim() || '';
    const file = document.getElementById('paymentUploadFile')?.files?.[0];
    if (!Number.isFinite(amount) || amount <= 0) return alert('Vui lòng nhập số tiền UNC hợp lệ.');
    if (!paymentDate) return alert('Vui lòng chọn ngày thanh toán.');
    if (file && file.size > 8 * 1024 * 1024) return alert('Tệp UNC không được vượt quá 8MB.');
    try {
      const imageData = file ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }) : '';
      const response = await fetch(`${API_URL}/update/${orderId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'Số Tiền UNC': amount, 'Ngày Thanh Toán UNC': paymentDate, 'Nội Dung UNC': note, 'Ảnh UNC': imageData, 'Tên File UNC': file?.name || '', 'Ngày Upload UNC': new Date().toISOString(), 'Trạng Thái UNC': 'Chờ Duyệt' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể gửi phiếu UNC.');
      closePaymentUploadModal();
      showAppToast('Đã gửi phiếu UNC, chờ quản lý duyệt.');
      applyFilters();
    } catch (error) { alert(`Không thể gửi phiếu UNC: ${error.message}`); }
  };
})();