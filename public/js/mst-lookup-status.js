(function () {
  function paymentStatusClass(value) {
    const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (normalized.includes('chua thanh toan')) return 'payment-method-unpaid';
    if (normalized.includes('chuyen gs') || normalized.includes('chuyen khoan gs')) return 'payment-method-gs';
    if (normalized.includes('wintech')) return 'payment-method-wintech';
    if (normalized.includes('chuyen khoan hi')) return 'payment-method-hi';
    return 'status-yes';
  }

  function createBadge(className, label) {
    const badge = document.createElement('span');
    badge.className = `status-badge ${className}`;
    badge.textContent = label;
    return badge;
  }

  function addStatusColumn(result) {
    const table = result.querySelector('#mstQuickOrderList table');
    const headerRow = table?.tHead?.rows[0];
    const body = table?.tBodies[0];
    if (!headerRow || !body || table.dataset.statusColumnAdded) return;

    const header = document.createElement('th');
    header.textContent = 'Trạng thái';
    headerRow.append(header);

    const orders = window.aiLastMstMatches || [];
    Array.from(body.rows).forEach((row, index) => {
      if (row.cells.length === 1) {
        row.cells[0].colSpan = headerRow.cells.length;
        return;
      }

      const order = orders[index] || {};
      const orderStatus = String(order['TÌNH TRẠNG'] || 'Mới').trim();
      const activated = orderStatus.toLowerCase().includes('kích hoạt');
      const paymentStatus = String(order['Hình Thức Thanh Toán'] || '--').trim();
      const cell = document.createElement('td');
      const badges = document.createElement('div');
      badges.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:.3rem;';
      badges.append(
        createBadge(activated ? 'status-active' : 'status-pending', orderStatus),
        createBadge(paymentStatusClass(paymentStatus), paymentStatus)
      );
      cell.append(badges);
      row.append(cell);
    });

    table.dataset.statusColumnAdded = 'true';
  }

  const result = document.getElementById('mstQuickLookupResult');
  if (!result || !window.MutationObserver) return;
  new window.MutationObserver(() => addStatusColumn(result)).observe(result, { childList: true, subtree: true });
})();