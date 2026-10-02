(function () {
  window.addProductDateColumns = function () {
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const headerRow = tableHead?.querySelector('tr');
    if (!headerRow || !tableBody || headerRow.textContent.includes('Ngày áp dụng')) return;

    const actionHeader = headerRow.lastElementChild;
    ['Ngày áp dụng', 'Ngày kết thúc'].forEach(label => {
      const header = document.createElement('th');
      header.textContent = label;
      headerRow.insertBefore(header, actionHeader);
    });

    tableBody.querySelectorAll('tr').forEach(row => {
      const spanningCell = row.querySelector('td[colspan]');
      if (spanningCell) {
        spanningCell.colSpan += 2;
        return;
      }

      const actionCell = row.lastElementChild;
      ['Ngày áp dụng', 'Ngày kết thúc'].forEach(() => {
        const cell = document.createElement('td');
        cell.textContent = '';
        row.insertBefore(cell, actionCell);
      });
    });
  };
})();