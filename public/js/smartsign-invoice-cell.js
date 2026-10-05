(function () {
  function isPdfReady(order) {
    if (order?.['SmartSign PDF Available'] === true) return true;
    const statusCode = Number(order?.['SmartSign TTHDon']);
    if ([1, 2, 3].includes(statusCode)) return true;
    const status = String(order?.['Trạng Thái Hóa Đơn'] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return ['da ky', 'da gui', 'da cap ma', 'da xuat'].some(label => status.includes(label));
  }

  window.renderSmartSignInvoiceCell = function (order, invoiceBadge, hasSmartSignInvoice) {
    const orderId = String(order?._id || '');
    const mbMat = String(order?.['SmartSign MBMat'] || '').trim();
    const actions = [];
    if (mbMat) {
      actions.push(`<button type="button" class="chat-history-btn" style="width:28px;height:28px;padding:.3rem;font-size:.68rem;" onclick="checkSmartSignStatus(event, '${orderId}')" title="Kiểm tra trạng thái SmartSign"><i class="fa-solid fa-rotate"></i></button>`);
    }
    if (isPdfReady(order)) {
      actions.push(`<button type="button" class="chat-history-btn" style="width:28px;height:28px;padding:.3rem;font-size:.68rem;color:#f87171;" onclick="reopenInvoicePdfPreview(event, '${orderId}')" title="Xem PDF hóa đơn"><i class="fa-solid fa-file-pdf"></i></button>`);
    }
    const actionMarkup = actions.length ? `<span style="display:inline-flex;align-items:center;gap:.25rem;">${actions.join('')}</span>` : '';
    return `<td class="orders-col-invoice" style="white-space:nowrap;vertical-align:middle;"><div style="display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;"><span title="${hasSmartSignInvoice ? 'Trạng thái SmartSign' : 'Hóa đơn'}">${invoiceBadge}</span>${actionMarkup}</div></td>`;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { isPdfReady };
})();