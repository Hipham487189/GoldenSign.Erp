(function () {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[character]);
  }

  function getCompanyCost(order, parseMoneyValue) {
    const value = order['Thực Đóng Công Ty']
      ?? order['Thực Đóng Công Ty (VNĐ)']
      ?? order['THỰC CÔNG NỢ CTY']
      ?? order['THỰC CÔNG NỢ CÔNG TY'];
    return parseMoneyValue(value);
  }

  window.renderNccRegistrationList = function (list, nccName, rows, parseMoneyValue) {
    const bodyRows = rows.length ? rows.map(({ order, cost }) => {
      const companyCost = getCompanyCost(order, parseMoneyValue);
      return `<tr onclick="showDetail('${escapeHtml(order._id)}')"><td>${escapeHtml(order['Ngày Đăng Ký'] || '--')}</td><td>${escapeHtml(order['Mã Đơn Hàng'] || '--')}</td><td>${escapeHtml(order['Tên Công Ty '] || order['Tên Khách Hàng'] || '--')}</td><td>${escapeHtml(order['Gói '] || '--')}</td><td style="text-align:right;">${companyCost.toLocaleString('vi-VN')}</td><td style="text-align:right;color:#f43f5e;font-weight:700;">${cost.toLocaleString('vi-VN')} đ</td></tr>`;
    }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Không có dữ liệu</td></tr>';

    list.innerHTML = `<div class="overview-card-title"><i class="fa-solid fa-list-check"></i> Danh Sách Đăng Ký: ${escapeHtml(nccName)}</div><div style="overflow-x:auto;"><table><thead><tr><th>Ngày Đăng Ký</th><th>Mã Đơn</th><th>Khách Hàng / Công Ty</th><th>Gói Cước</th><th style="text-align:right;">Thực Đóng Công Ty (VNĐ)</th><th style="text-align:right;">Thực Đóng NCC</th></tr></thead><tbody>${bodyRows}</tbody></table></div>`;
    list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
})();