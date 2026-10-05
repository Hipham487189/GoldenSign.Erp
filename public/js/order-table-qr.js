(function () {
  function escapeAttribute(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[character]);
  }

  function openQr(orderId, quickView) {
    return `event.stopPropagation(); openTransferQrModal(decodeURIComponent('${encodeURIComponent(orderId)}'), ${quickView})`;
  }

  window.renderTransferQrCell = function (orderId, record) {
    const safeOrderId = escapeAttribute(orderId);
    const qrUrl = String(record?.qrUrl || '').trim();
    if (record && qrUrl) {
      return `<td class="orders-col-qr"><button type="button" class="qr-thumbnail-btn" onclick="${openQr(safeOrderId, true)}" title="Xem QR chuyển khoản"><img src="${escapeAttribute(qrUrl)}" alt="QR chuyển khoản" loading="lazy"></button></td>`;
    }
    return `<td class="orders-col-qr"><button type="button" class="qr-quick-btn" onclick="${openQr(safeOrderId, false)}" title="Tạo QR chuyển khoản"><i class="fa-solid fa-qrcode"></i></button></td>`;
  };
})();