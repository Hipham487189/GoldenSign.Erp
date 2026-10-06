// Danh sách thông báo chỉ tải tiêu đề; nội dung/tệp đính kèm tải khi xem chi tiết.
(function () {
  const detailCache = {};

  async function fetchNotificationDetail(id) {
    if (detailCache[id]) return detailCache[id];
    try {
      const response = await fetch(API_NOTIFICATIONS_URL + '/detail/' + encodeURIComponent(id));
      const result = await response.json();
      if (result.success && result.data) {
        detailCache[id] = result.data;
        return result.data;
      }
    } catch (error) {
      console.error('Lỗi tải chi tiết thông báo:', error);
    }
    return null;
  }

  function invalidateNotificationDetail(id) {
    if (id) delete detailCache[id]; else Object.keys(detailCache).forEach(key => delete detailCache[key]);
  }

  function notificationMetaHtml(n) {
    return `${escapeHtml(n.announcer || 'Admin hệ thống')}${n.createdAt ? ` - ${new Date(n.createdAt).toLocaleString('vi-VN')}` : ''}`;
  }

  function attachmentButtons(n) {
    if (!n.attachmentData) return '<div class="notification-detail-meta">Thông báo này không có file đính kèm.</div>';
    const id = escapeHtml(n._id);
    return `<div class="notification-detail-meta"><i class="fa-solid fa-paperclip"></i> ${escapeHtml(n.attachmentName || 'tep-dinh-kem')}</div><div style="display:flex;gap:6px;margin-top:.45rem;"><button type="button" class="btn btn-secondary notification-download" onclick="viewNotificationFile('${id}')"><i class="fa-solid fa-eye"></i> Xem File</button><button type="button" class="btn btn-primary notification-download" onclick="downloadNotificationFile('${id}')"><i class="fa-solid fa-download"></i> Tải file</button></div>`;
  }

  window.invalidateNotificationDetail = invalidateNotificationDetail;

  window.showNotificationDetail = async function (id) {
    const modal = document.getElementById('notificationDetailModal');
    const body = document.getElementById('notificationDetailBody');
    const listItem = allNotifications.find(item => item._id === id);
    document.getElementById('notificationDetailTitle').textContent = listItem?.title || 'Chi Tiết Thông Báo';
    body.innerHTML = '<div class="notification-detail-meta">Đang tải...</div>';
    modal.classList.add('active');
    const n = await fetchNotificationDetail(id);
    if (!n) { body.innerHTML = '<div class="notification-detail-meta">Không tải được nội dung thông báo.</div>'; return; }
    body.innerHTML = `<div class="notification-detail-meta"><i class="fa-solid fa-user"></i> ${notificationMetaHtml(n)}</div><div class="notification-detail-content">${sanitizeNotificationHtml(n.content || '')}</div>${attachmentButtons(n)}`;
  };

  window.showNotificationManagementDetail = async function (notification) {
    const panel = document.getElementById('notificationManagementDetail');
    if (!panel || !notification) return;
    panel.innerHTML = '<div class="empty-state">Đang tải...</div>';
    const n = await fetchNotificationDetail(notification._id);
    if (!n) { panel.innerHTML = '<div class="empty-state">Không tải được chi tiết.</div>'; return; }
    panel.innerHTML = `<div class="section-card-title"><i class="fa-solid fa-bell"></i> Chi Tiết Thông Báo</div><h3>${escapeHtml(n.title || 'Không có tiêu đề')}</h3><div class="notification-detail-meta">${notificationMetaHtml(n)}</div><div class="notification-detail-content">${sanitizeNotificationHtml(n.content || '')}</div>${attachmentButtons(n)}<div class="notification-detail-status"><span class="status-badge ${n.isPublished ? 'status-active' : 'status-no'}">${n.isPublished ? 'Đang hiện' : 'Đang ẩn'}</span></div>`;
  };

  window.editNotification = async function (id) {
    const item = await fetchNotificationDetail(id);
    if (!item) return alert('Không tải được thông báo.');
    window.editingNotificationId = id;
    openNotificationForm();
    document.getElementById('notificationFormTitle').textContent = 'Chỉnh Sửa Thông Báo';
    document.getElementById('notificationAnnouncer').value = item.announcer || '';
    document.getElementById('notificationTitle').value = item.title || '';
    document.getElementById('notificationContent').innerHTML = sanitizeNotificationHtml(item.content || '');
    document.getElementById('notificationPriority').value = item.priority || 'normal';
    document.getElementById('notificationPublished').checked = item.isPublished !== false;
    document.getElementById('notificationShowOnBanner').checked = Boolean(item.showOnBanner);
  };

  window.viewNotificationFile = async function (id) {
    const n = await fetchNotificationDetail(id);
    if (!n?.attachmentData) return;
    const viewer = document.getElementById('invoicePdfViewer');
    const download = document.getElementById('invoicePdfDownload');
    document.getElementById('invoicePdfModal').classList.add('active');
    download.href = n.attachmentData;
    download.download = n.attachmentName || 'tep-dinh-kem';
    if (n.attachmentData.startsWith('data:application/pdf')) showInvoicePdf(n.attachmentData);
    else if (n.attachmentData.startsWith('data:image/')) viewer.innerHTML = `<img src="${n.attachmentData}" alt="${escapeHtml(n.attachmentName || 'Tệp đính kèm')}" style="display:block;max-width:100%;max-height:100%;margin:auto;object-fit:contain;background:#fff;">`;
    else viewer.innerHTML = '<div class="invoice-pdf-loading">Định dạng này không hỗ trợ xem trực tiếp. Hãy bấm Tải file.</div>';
  };

  window.downloadNotificationFile = async function (id) {
    const n = await fetchNotificationDetail(id);
    if (!n?.attachmentData) return;
    const link = document.createElement('a');
    link.href = n.attachmentData;
    link.download = n.attachmentName || 'tep-dinh-kem';
    link.target = '_blank';
    link.click();
  };
})();
