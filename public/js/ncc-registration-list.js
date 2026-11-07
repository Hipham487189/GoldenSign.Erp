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

  window.renderNccRegistrationList = function (list, nccName, rows, parseMoneyValue, phanTrang) {
    const bodyRows = rows.length ? rows.map(({ order, cost }) => {
      const companyCost = getCompanyCost(order, parseMoneyValue);
      return `<tr onclick="showDetail('${escapeHtml(order._id)}')"><td class="congno-ncc-ngay">${escapeHtml(order['Ngày Đăng Ký'] || '--')}</td><td class="congno-ncc-ma-don">${escapeHtml(order['Mã Đơn Hàng'] || '--')}</td><td class="congno-ncc-khach-hang">${escapeHtml(order['Tên Công Ty '] || order['Tên Khách Hàng'] || '--')}</td><td><span class="congno-ncc-goi">${escapeHtml(order['Gói '] || '--')}</span></td><td class="congno-ncc-so-tien congno-ncc-da-tra">${companyCost.toLocaleString('vi-VN')}</td><td class="congno-ncc-so-tien congno-ncc-chi-phi">${cost.toLocaleString('vi-VN')} đ</td></tr>`;
    }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Không có dữ liệu</td></tr>';

    const dieuHuong = phanTrang ? `<div class="select-pager" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-top:.75rem;"><button type="button" class="btn btn-secondary" data-trang-ncc="truoc" ${phanTrang.page <= 1 ? 'disabled' : ''}>Trước</button><span>Trang ${Number(phanTrang.page)} / ${Number(phanTrang.totalPages)} · ${Number(phanTrang.total)} đăng ký</span><button type="button" class="btn btn-secondary" data-trang-ncc="sau" ${!phanTrang.hasMore ? 'disabled' : ''}>Tiếp</button><label>Số dòng/trang <select class="form-select" data-trang-ncc="so-dong">${[20, 50, 100].map(soDong => `<option value="${soDong}" ${Number(phanTrang.limit) === soDong ? 'selected' : ''}>${soDong}</option>`).join('')}</select></label></div>` : '';
    list.innerHTML = `<div class="overview-card-title"><i class="fa-solid fa-list-check"></i> Danh Sách Đăng Ký: ${escapeHtml(nccName)}</div><div class="congno-ncc-table-wrap"><table class="congno-ncc-table congno-ncc-bang-chi-tiet"><thead><tr><th>Ngày Đăng Ký</th><th>Mã Đơn</th><th>Khách Hàng / Công Ty</th><th>Gói Cước</th><th>Thực Đóng Công Ty (VNĐ)</th><th>Thực Đóng NCC</th></tr></thead><tbody>${bodyRows}</tbody></table></div>${dieuHuong}`;
    if (phanTrang) {
      list.querySelector('[data-trang-ncc="truoc"]').addEventListener('click', () => loadNccRegistrationList(nccName, phanTrang.page - 1, phanTrang.limit));
      list.querySelector('[data-trang-ncc="sau"]').addEventListener('click', () => loadNccRegistrationList(nccName, phanTrang.page + 1, phanTrang.limit));
      list.querySelector('[data-trang-ncc="so-dong"]').addEventListener('change', event => loadNccRegistrationList(nccName, 1, Number(event.target.value)));
    }
    list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
})();