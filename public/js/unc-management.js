// Quản Lý UNC: tải toàn bộ phiếu UNC từ server (không phụ thuộc trang đơn hàng) và xem tệp UNC theo yêu cầu.
(function () {
  let uncOrders = [];

  async function loadUncOrders() {
    const response = await fetch(API_URL + '/unc');
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tải danh sách UNC.');
    uncOrders = result.data || [];
  }

  function uncRow(order) {
    const status = order['Trạng Thái UNC'] || 'Chờ Duyệt';
    const statusClass = status === 'Đã Duyệt' ? 'status-yes' : status === 'Từ Chối' ? 'status-no' : 'status-pending';
    const id = escapeHtml(order._id);
    const viewBtn = order.hasUncImage ? `<button class="btn btn-secondary" type="button" onclick="viewUncFile('${id}')"><i class="fa-solid fa-eye"></i> Xem UNC</button> ` : '';
    return `<tr><td>${escapeHtml(order['Mã Đơn Hàng'] || '--')}</td><td>${escapeHtml(order['Tên Khách Hàng'] || order['Tên Công Ty '] || '--')}</td><td>${escapeHtml(order.NCC || '--')}</td><td style="text-align:right;">${Number(order['Số Tiền UNC'] || 0).toLocaleString('vi-VN')} đ</td><td>${escapeHtml(order['Tên File UNC'] || '--')}</td><td>${escapeHtml(order['Ngày Thanh Toán UNC'] ? new Date(order['Ngày Thanh Toán UNC']).toLocaleDateString('vi-VN') : '--')}</td><td>${escapeHtml(order['Ngày Upload UNC'] ? new Date(order['Ngày Upload UNC']).toLocaleString('vi-VN') : '--')}</td><td><span class="status-badge ${statusClass}">${escapeHtml(status)}</span></td><td style="white-space:nowrap;">${viewBtn}<button class="btn btn-success" type="button" onclick="updateUncStatus('${id}', 'Đã Duyệt')"><i class="fa-solid fa-check"></i> Duyệt</button> <button class="btn btn-danger" type="button" onclick="updateUncStatus('${id}', 'Từ Chối')"><i class="fa-solid fa-xmark"></i> Từ Chối</button></td></tr>`;
  }

  function paintUncManagement() {
    document.getElementById('currentMonthRevenue').innerText = `${uncOrders.length} phiếu UNC`;
    document.getElementById('totalOrdersCount').innerText = `${uncOrders.filter(order => (order['Trạng Thái UNC'] || 'Chờ Duyệt') === 'Chờ Duyệt').length} chờ duyệt`;
    const rows = uncOrders.length ? uncOrders.map(uncRow).join('') : '<tr><td colspan="9" class="empty-state">Chưa có phiếu UNC nào.</td></tr>';
    document.getElementById('mainContainerBox').innerHTML = `<div class="overview-card" style="width:100%;"><div class="overview-card-title"><i class="fa-solid fa-file-circle-check"></i> Danh Sách Phiếu UNC</div><div style="overflow-x:auto;"><table><thead><tr><th>Mã Đơn</th><th>Khách Hàng / Công Ty</th><th>NCC</th><th style="text-align:right;">Số Tiền UNC</th><th>Tệp UNC</th><th>Ngày Thanh Toán</th><th>Ngày Gửi</th><th>Trạng Thái</th><th>Quản Lý Duyệt</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  window.renderUncManagement = async function () {
    try { await loadUncOrders(); } catch (error) { console.warn(error); }
    if (currentTab === 'unc-management') paintUncManagement();
  };

  window.updateUncStatus = async function (orderId, status) {
    const response = await fetch(`${API_URL}/update/${orderId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'Trạng Thái UNC': status }) });
    const result = await response.json();
    if (!response.ok || !result.success) return alert(result.message || 'Không thể cập nhật trạng thái UNC.');
    const order = uncOrders.find(item => String(item._id) === String(orderId));
    if (order) order['Trạng Thái UNC'] = status;
    paintUncManagement();
    showAppToast(status === 'Đã Duyệt' ? 'Đã duyệt phiếu UNC.' : 'Đã từ chối phiếu UNC.');
  };

  window.viewUncFile = async function (orderId) {
    const viewer = document.getElementById('invoicePdfViewer');
    const download = document.getElementById('invoicePdfDownload');
    document.getElementById('invoicePdfModal').classList.add('active');
    viewer.innerHTML = '<div class="invoice-pdf-loading">Đang tải UNC...</div>';
    let data = '', name = 'unc';
    try {
      const response = await fetch(`${API_URL}/detail/${encodeURIComponent(orderId)}`);
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