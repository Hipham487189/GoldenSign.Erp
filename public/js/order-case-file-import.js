(function () {
  const maxRows = 5000;
  let previewRows = [];

  function normalizeHeader(value) {
    return String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function normalizeMst(value) {
    let text = String(value ?? '').trim();
    if (/^\d+\.0+$/.test(text)) text = text.replace(/\.0+$/, '');
    const digits = text.replace(/\D/g, '');
    return digits.length === 9 ? `0${digits}` : digits;
  }

  function isoDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function parseExcelDate(value, cell, workbook, XLSX) {
    const text = String(cell?.w ?? value ?? '').trim();
    let match = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    if (match) return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));

    const serial = typeof value === 'number' ? value : (/^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN);
    if (!Number.isFinite(serial)) return '';
    const parts = XLSX.SSF.parse_date_code(serial, { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) });
    return parts ? isoDate(parts.y, parts.m, parts.d) : '';
  }

  function readRows(file, XLSX) {
    return file.arrayBuffer().then(buffer => {
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('File Excel không có trang tính.');
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
      if (!matrix.length) throw new Error('File Excel không có dữ liệu.');

      const headers = matrix[0].map(normalizeHeader);
      const columns = {
        mst: headers.indexOf('mst'),
        company: headers.indexOf('tencongty'),
        date: headers.indexOf('ngayhoso')
      };
      const labels = { mst: 'MST', company: 'Tên công ty', date: 'Ngày hồ sơ' };
      const missing = Object.keys(columns).filter(key => columns[key] < 0);
      if (missing.length) throw new Error(`File Excel thiếu cột ${missing.map(key => `"${labels[key]}"`).join(', ')}.`);

      const rows = [];
      matrix.slice(1).forEach((cells, index) => {
        if (!cells.some(value => String(value ?? '').trim())) return;
        const sheetRow = index + 1;
        const cellAt = column => sheet[XLSX.utils.encode_cell({ r: sheetRow, c: column })];
        const mstCell = cellAt(columns.mst);
        const rawMst = mstCell?.w ?? cells[columns.mst];
        const excelMst = normalizeMst(rawMst);
        const companyName = String(cells[columns.company] ?? '').trim();
        const dateCell = cellAt(columns.date);
        const ngayHoSo = parseExcelDate(cells[columns.date], dateCell, workbook, XLSX);
        let issue = '';
        if (!excelMst) issue = 'MST không hợp lệ';
        else if (!ngayHoSo) issue = 'Ngày hồ sơ không hợp lệ';
        rows.push({ rowNumber: sheetRow + 1, excelMst, companyName, ngayHoSo, issue });
      });

      if (!rows.length) throw new Error('File Excel không có dòng dữ liệu.');
      if (rows.length > maxRows) throw new Error(`File vượt quá ${maxRows.toLocaleString('vi-VN')} dòng dữ liệu.`);
      return rows;
    });
  }

  function addCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = String(value ?? '');
    row.append(cell);
    return cell;
  }

  function statusText(row) {
    if (row.duplicateSelection) return '❌ Đơn hàng đã được chọn ở dòng khác';
    if (row.status === 'ready') return '✅ Sẵn sàng';
    if (row.status === 'needs-selection') return '⚠️ Cần chọn đơn hàng';
    if (row.status === 'not-found') return '❌ Không tìm thấy đơn hàng';
    return `❌ ${row.reason || 'Dòng dữ liệu không hợp lệ'}`;
  }

  function refreshPreviewState(body, confirmButton) {
    const selectedCounts = new Map();
    previewRows.forEach(row => {
      row.duplicateSelection = false;
      if (row.status === 'ready' && row.selectedOrderId) selectedCounts.set(row.selectedOrderId, (selectedCounts.get(row.selectedOrderId) || 0) + 1);
    });
    previewRows.forEach(row => {
      row.duplicateSelection = Boolean(row.selectedOrderId && selectedCounts.get(row.selectedOrderId) > 1);
      if (row.statusCell) row.statusCell.textContent = statusText(row);
    });
    const ready = previewRows.length > 0 && previewRows.every(row => row.status === 'ready' && !row.duplicateSelection);
    confirmButton.disabled = !ready;
    confirmButton.title = ready ? '' : 'Cần một lựa chọn duy nhất và ngày hợp lệ cho mọi dòng.';
    body.dataset.ready = String(ready);
  }

  function renderPreview(rows, tbody, confirmButton) {
    previewRows = rows;
    tbody.replaceChildren();
    rows.forEach((item, index) => {
      const row = document.createElement('tr');
      addCell(row, item.rowNumber || index + 1);
      addCell(row, item.excelMst);
      addCell(row, item.companyName);
      addCell(row, item.ngayHoSo);
      const orderCell = document.createElement('td');

      if (item.orderOptions.length === 1) {
        const selected = item.orderOptions[0];
        orderCell.textContent = `${selected.orderCode || '(Chưa có mã)'} | ${selected.companyName || item.companyName} | ${selected.employeeName || 'Chưa có nhân viên'} | ${selected.registeredAt || 'Chưa có ngày đăng ký'}`;
      } else if (item.orderOptions.length > 1) {
        const select = document.createElement('select');
        select.className = 'form-select';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '-- Chọn đơn hàng --';
        select.append(placeholder);
        item.orderOptions.forEach(order => {
          const option = document.createElement('option');
          option.value = order.orderId;
          option.textContent = `${order.orderCode || '(Chưa có mã)'} | ${order.companyName || item.companyName} | ${order.employeeName || 'Chưa có nhân viên'} | ${order.registeredAt || 'Chưa có ngày đăng ký'}`;
          select.append(option);
        });
        select.value = item.selectedOrderId || '';
        select.addEventListener('change', () => {
          item.selectedOrderId = select.value;
          item.status = select.value ? 'ready' : 'needs-selection';
          item.reason = select.value ? '' : 'Cần chọn đơn hàng';
          refreshPreviewState(tbody, confirmButton);
        });
        orderCell.append(select);
      } else {
        orderCell.textContent = item.status === 'not-found' ? 'Không tìm thấy' : 'Không hợp lệ';
      }

      row.append(orderCell);
      item.statusCell = addCell(row, statusText(item));
      tbody.append(row);
    });
    refreshPreviewState(tbody, confirmButton);
  }

  function renderResults(data, tbody, counts) {
    tbody.replaceChildren();
    data.results.forEach(result => {
      const row = document.createElement('tr');
      addCell(row, result.rowNumber);
      addCell(row, result.excelMst);
      addCell(row, result.companyName);
      addCell(row, result.status === 'success' ? '✅ Thành công' : '❌ Lỗi');
      addCell(row, result.reason);
      tbody.append(row);
    });
    counts.textContent = `✅ Thành công: ${data.successful}　⚠️ Chưa cập nhật: ${data.notUpdated}　❌ Lỗi: ${data.errors}`;
  }

  async function sendPreview(rows) {
    const response = await fetch(`${API_URL}/case-files/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể đối chiếu đơn hàng.');
    return result.data;
  }

  async function confirmImport(rows) {
    const response = await fetch(`${API_URL}/case-files/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: rows.map(row => ({ rowNumber: row.rowNumber, excelMst: row.excelMst, companyName: row.companyName, ngayHoSo: row.ngayHoSo, orderId: row.selectedOrderId })) })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể cập nhật Ngày hồ sơ.');
    return result.data;
  }

  function mount() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls';
    fileInput.hidden = true;
    document.body.append(fileInput);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'orderCaseFileImportModal';
    modal.innerHTML = `
      <div class="modal-content" style="width:min(1100px,96vw);max-height:92vh;overflow:auto;">
        <div class="modal-header"><h3><i class="fa-solid fa-file-import"></i> Nhập Hồ Sơ</h3><button type="button" class="chat-history-btn" data-close-import title="Đóng"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body" style="padding:1rem 0;">
          <section data-upload-panel>
            <div class="form-group"><label class="form-label">Chọn file Excel (.xlsx, .xls)</label><button type="button" class="btn btn-secondary" data-select-file><i class="fa-solid fa-folder-open"></i> Chọn file</button> <span class="cell-sub" data-file-name>Chưa chọn file</span></div>
            <div class="cell-sub" style="margin-top:.5rem;">File cần có các cột MST, Tên công ty và Ngày hồ sơ.</div>
            <button type="button" class="btn btn-primary" data-read-file disabled style="margin-top:1rem;"><i class="fa-solid fa-eye"></i> Đọc dữ liệu</button>
          </section>
          <div class="cell-sub" data-import-error style="display:none;color:#f87171;margin:.75rem 0;"></div>
          <section data-preview-panel style="display:none;">
            <div class="cell-sub" data-preview-summary style="margin-bottom:.75rem;"></div>
            <div style="overflow:auto;max-height:55vh;"><table><thead><tr><th>STT</th><th>MST</th><th>Tên công ty</th><th>Ngày hồ sơ</th><th>Đơn hàng</th><th>Trạng thái</th></tr></thead><tbody data-preview-rows></tbody></table></div>
            <button type="button" class="btn btn-primary" data-confirm-import disabled style="margin-top:1rem;"><i class="fa-solid fa-circle-check"></i> XÁC NHẬN CẬP NHẬT</button>
          </section>
          <section data-result-panel style="display:none;">
            <h4>Import hoàn tất</h4><div class="cell-sub" data-result-counts style="margin:.5rem 0 1rem;"></div>
            <div style="overflow:auto;max-height:55vh;"><table><thead><tr><th>STT</th><th>MST</th><th>Tên công ty</th><th>Kết quả</th><th>Lý do</th></tr></thead><tbody data-result-rows></tbody></table></div>
          </section>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-import>Đóng</button></div>
      </div>`;
    document.body.append(modal);

    const uploadPanel = modal.querySelector('[data-upload-panel]');
    const previewPanel = modal.querySelector('[data-preview-panel]');
    const resultPanel = modal.querySelector('[data-result-panel]');
    const fileName = modal.querySelector('[data-file-name]');
    const readButton = modal.querySelector('[data-read-file]');
    const confirmButton = modal.querySelector('[data-confirm-import]');
    const previewBody = modal.querySelector('[data-preview-rows]');
    const errorLabel = modal.querySelector('[data-import-error]');
    const previewSummary = modal.querySelector('[data-preview-summary]');
    let selectedFile = null;

    function showError(message) {
      errorLabel.textContent = message;
      errorLabel.style.display = message ? 'block' : 'none';
    }

    function openModal() {
      selectedFile = null;
      fileInput.value = '';
      fileName.textContent = 'Chưa chọn file';
      readButton.disabled = true;
      confirmButton.disabled = true;
      previewBody.replaceChildren();
      uploadPanel.style.display = 'block';
      previewPanel.style.display = 'none';
      resultPanel.style.display = 'none';
      showError('');
      modal.classList.add('active');
    }

    function closeModal() {
      modal.classList.remove('active');
    }

    modal.querySelector('[data-select-file]').addEventListener('click', () => fileInput.click());
    modal.querySelectorAll('[data-close-import]').forEach(closeButton => closeButton.addEventListener('click', closeModal));
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    fileInput.addEventListener('change', () => {
      selectedFile = fileInput.files[0] || null;
      fileName.textContent = selectedFile?.name || 'Chưa chọn file';
      readButton.disabled = !selectedFile;
      showError('');
    });

    readButton.addEventListener('click', async () => {
      if (!selectedFile) return;
      readButton.disabled = true;
      showError('');
      try {
        await ensureXLSX();
        const rows = await readRows(selectedFile, XLSX);
        const result = await sendPreview(rows);
        renderPreview(result, previewBody, confirmButton);
        previewSummary.textContent = `${result.length.toLocaleString('vi-VN')} dòng. Chưa có dữ liệu nào được cập nhật.`;
        uploadPanel.style.display = 'none';
        previewPanel.style.display = 'block';
      } catch (error) {
        showError(error.message || 'Không đọc được file Excel.');
      } finally {
        readButton.disabled = !selectedFile;
      }
    });

    confirmButton.addEventListener('click', async () => {
      if (confirmButton.disabled || !previewRows.length) return;
      confirmButton.disabled = true;
      showError('');
      try {
        const result = await confirmImport(previewRows);
        renderResults(result, modal.querySelector('[data-result-rows]'), modal.querySelector('[data-result-counts]'));
        previewPanel.style.display = 'none';
        resultPanel.style.display = 'block';
      } catch (error) {
        showError(error.message || 'Không thể cập nhật Ngày hồ sơ.');
        refreshPreviewState(previewBody, confirmButton);
      }
    });

    window.openOrderCaseFileImport = openModal;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeHeader, normalizeMst, parseExcelDate, readRows };
  }
  if (typeof document !== 'undefined') mount();
})();