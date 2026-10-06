(function () {
  const root = document.getElementById('mainContainerBox');
  const baseUrl = window.API_BASE_URL;
  const state = {
    tab: 'customer',
    employee: '',
    customerId: '',
    customerLabel: '',
    year: new Date().getFullYear(),
    page: 1,
    pageSize: 25,
    detailPage: 1,
    summary: null,
    monthly: null,
    paymentHistory: null,
    paymentPage: 1,
    sort: 'remaining',
    options: { employees: [], customers: [] },
    isAdmin: false,
    employeeSelfId: '',
    employeeSelfName: ''
  };
  let customerSearchTimer = null;
  let customerSearchRequest = 0;

  const money = value => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const query = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value !== null && value !== undefined)).toString();

  function injectStyles() {
    if (document.getElementById('customerDebtStyles')) return;
    const link = document.createElement('link');
    link.id = 'customerDebtStyles';
    link.rel = 'stylesheet';
    link.href = 'public/css/customer-debts.css';
    document.head.appendChild(link);
  }

  async function request(path, params = {}) {
    const url = `${baseUrl}/api/cong-no/${path}?${query(params)}`;
    const response = await fetch(url);
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (error) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html') || /^\s*<!doctype html/i.test(responseText)) {
        throw new Error(`API ${path} trả về trang HTML thay vì JSON (HTTP ${response.status}). Hãy khởi động lại backend để nạp API công nợ mới.`);
      }
      throw new Error(`API ${path} trả về dữ liệu không hợp lệ (HTTP ${response.status}).`);
    }
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tải báo cáo công nợ.');
    return result.data;
  }

  const find = selector => root.querySelector(selector) || document.querySelector('#cdFilters ' + selector.replace(/^#cdFilters\s*/, '')) || (selector === '#cdFilters' ? document.getElementById('cdFilters') : null);
  const findAll = selector => [...root.querySelectorAll(selector), ...document.querySelectorAll('#cdFilters ' + selector)];

  function renderShell() {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 7 }, (_, index) => currentYear - 5 + index);
    const employeeRecords = [...state.options.employees];
    if (state.employeeSelfId && !employeeRecords.some(employee => employee.id === state.employeeSelfId)) {
      employeeRecords.unshift({ id: state.employeeSelfId, name: state.employeeSelfName });
    }
    const employeeOptions = employeeRecords.map(employee => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)}</option>`).join('');
    root.innerHTML = `
      <section class="customer-debt-dashboard" aria-label="Quản lý công nợ">
        <form class="cd-filters" id="cdFilters">
          <label class="cd-filter cd-employee-filter">
            <span>Nhân viên</span>
            <select id="cdEmployee" ${state.employeeSelfId ? 'disabled' : ''}>
              <option value="">Tất cả nhân viên</option>${employeeOptions}
            </select>
          </label>
          <label class="cd-filter cd-customer-filter">
            <span>Khách hàng</span>
            <div class="cd-combobox">
              <input id="cdCustomer" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cdCustomerOptions" autocomplete="off" placeholder="Tất cả khách hàng">
              <div id="cdCustomerOptions" class="cd-combobox-options" role="listbox" hidden></div>
            </div>
          </label>
          <label class="cd-filter cd-date-filter">
            <span>Từ ngày</span>
            <input id="cdFromDate" type="date" value="${currentYear}-01-01">
          </label>
          <label class="cd-filter cd-date-filter">
            <span>Đến ngày</span>
            <input id="cdToDate" type="date" value="${currentYear}-12-31">
          </label>
          <label class="cd-filter cd-year-filter">
            <span>Năm báo cáo</span>
            <select id="cdYear">${years.map(year => `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`).join('')}</select>
          </label>
          <label class="cd-filter cd-month-filter">
            <span>Tháng</span>
            <select id="cdMonth"><option value="">Cả năm</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">Tháng ${i + 1}</option>`).join('')}</select>
          </label>
          <button class="cd-report-button" type="submit"><i class="fa-solid fa-chart-line"></i> Xem báo cáo</button>
        </form>
        <div id="cdNotice" class="cd-notice" hidden></div>
        <div id="cdReport" class="cd-report"><div class="cd-loading">Chọn bộ lọc và nhấn “Xem báo cáo”.</div></div>
        <aside id="cdDrawer" class="cd-drawer" aria-hidden="true"></aside>
      </section>`;
    const tabs = document.createElement('div');
    tabs.id = 'customerDebtHeaderTabs';
    tabs.className = 'cd-tabs cd-header-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Loại công nợ');
    tabs.innerHTML = `
      <button type="button" class="cd-tab is-active" data-tab="customer" role="tab" aria-selected="true">Công nợ khách hàng</button>
      <button type="button" class="cd-tab" data-tab="employee" role="tab" aria-selected="false">Công nợ nhân viên</button>`;
    document.getElementById('pageTitle')?.insertAdjacentElement('afterend', tabs);
    const filters = root.querySelector('#cdFilters');
    const headingRow = document.querySelector('.page-heading-row');
    if (filters && headingRow) {
      filters.classList.add('cd-filters-header');
      headingRow.classList.add('cd-heading-row');
      headingRow.appendChild(filters);
    }
    find('#cdEmployee').value = state.employeeSelfId || state.employee;
    find('#cdCustomer').value = state.customerLabel;
    find('#cdYear').addEventListener('change', event => {
      const year = Number(event.target.value);
      find('#cdMonth').value = '';
      find('#cdFromDate').value = `${year}-01-01`;
      find('#cdToDate').value = `${year}-12-31`;
    });
    find('#cdMonth').addEventListener('change', event => {
      const year = Number(find('#cdYear').value);
      const month = Number(event.target.value);
      if (!month) { find('#cdFromDate').value = `${year}-01-01`; find('#cdToDate').value = `${year}-12-31`; return; }
      const mm = String(month).padStart(2, '0');
      const last = new Date(year, month, 0).getDate();
      find('#cdFromDate').value = `${year}-${mm}-01`;
      find('#cdToDate').value = `${year}-${mm}-${last}`;
    });

    find('.cd-year-filter').hidden = false;
    find('#cdEmployee').addEventListener('change', async event => {
      state.employee = event.target.value;
      state.customerId = '';
      state.customerLabel = '';
      find('#cdCustomer').value = '';
      await loadCustomerOptions().catch(showFilterError);
    });
    find('#cdCustomer').addEventListener('input', event => {
      state.customerId = '';
      state.customerLabel = event.target.value.trim();
      setCustomerOptionsOpen(true);
      clearTimeout(customerSearchTimer);
      customerSearchTimer = setTimeout(() => loadCustomerOptions().catch(showFilterError), 250);
    });
    find('#cdCustomer').addEventListener('focus', () => {
      setCustomerOptionsOpen(true);
      loadCustomerOptions().catch(showFilterError);
    });
    find('#cdCustomer').addEventListener('keydown', handleCustomerKeydown);
    find('#cdCustomerOptions').addEventListener('click', event => {
      const option = event.target.closest('[data-customer-option]');
      if (!option) return;
      state.customerId = option.dataset.customerOption;
      state.customerLabel = option.dataset.customerName;
      find('#cdCustomer').value = state.customerLabel;
      setCustomerOptionsOpen(false);
    });
    document.addEventListener('pointerdown', handleCustomerOutsideClick);
    find('#cdFilters').addEventListener('submit', event => {
      event.preventDefault();
      state.page = 1;
      state.employee = find('#cdEmployee').value;
      if (!state.customerId) state.customerLabel = find('#cdCustomer').value.trim();
      state.year = Number(find('#cdYear').value);
      loadReport();
    });
    tabs.addEventListener('click', event => {
      const button = event.target.closest('[data-tab]');
      if (!button || button.dataset.tab === state.tab) return;
      state.tab = button.dataset.tab;
      state.page = 1;
      tabs.querySelectorAll('.cd-tab').forEach(tab => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      find('.cd-customer-filter').hidden = state.tab === 'employee';
      find('.cd-year-filter').hidden = state.tab === 'employee';
      find('.cd-month-filter').hidden = state.tab === 'employee';
      find('#cdFromDate').parentElement.hidden = state.tab === 'employee';
      find('#cdToDate').parentElement.hidden = state.tab === 'employee';
      loadReport();
    });
    find('#cdReport').addEventListener('click', handleReportClick);
    find('#cdReport').addEventListener('change', event => {
      if (event.target.id === 'cdCustomerSort') {
        state.sort = event.target.value;
        loadReport();
      }
    });
    find('#cdDrawer').addEventListener('click', handleDrawerClick);
  }

  async function loadOptions() {
    const data = await request('khach-hang/options', { employeeId: state.employeeSelfId || state.employee });
    state.options = data;
    const select = find('#cdEmployee');
    if (select) {
      const selected = state.employeeSelfId || state.employee;
      const employeeRecords = [...(data.employees || [])];
      if (state.employeeSelfId && !employeeRecords.some(employee => employee.id === state.employeeSelfId)) {
        employeeRecords.unshift({ id: state.employeeSelfId, name: state.employeeSelfName });
      }
      select.innerHTML = `<option value="">Tất cả nhân viên</option>${employeeRecords.map(employee => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)}</option>`).join('')}`;
      select.value = selected;
      select.disabled = Boolean(state.employeeSelfId);
    }
    applyCustomerOptions(data.customers || []);
  }

  async function loadCustomerOptions() {
    const customerQuery = find('#cdCustomer')?.value.trim() || '';
    const requestId = ++customerSearchRequest;
    const data = await request('khach-hang/options', { employeeId: state.employeeSelfId || state.employee, q: customerQuery });
    if (requestId !== customerSearchRequest) return;
    state.options.customers = data.customers || [];
    applyCustomerOptions(state.options.customers);
  }

  function applyCustomerOptions(customers) {
    const options = find('#cdCustomerOptions');
    if (!options) return;
    const optionsHtml = [`<button type="button" role="option" aria-selected="false" data-customer-option="" data-customer-name="">Tất cả khách hàng</button>`,
      ...customers.map(customer => `<button type="button" role="option" aria-selected="false" data-customer-option="${escapeHtml(customer.id)}" data-customer-name="${escapeHtml(customer.name)}">${escapeHtml(customer.name)}${customer.company ? ` · ${escapeHtml(customer.company)}` : ''}${customer.mst ? ` · MST ${escapeHtml(customer.mst)}` : ''}</button>`)];
    options.innerHTML = optionsHtml.join('');
    options.querySelectorAll('[data-customer-option]').forEach(option => {
      option.setAttribute('aria-selected', String(option.dataset.customerOption === state.customerId));
    });
    if (find('#cdCustomer')?.getAttribute('aria-expanded') === 'true') setCustomerOptionsOpen(true);
  }

  function setCustomerOptionsOpen(open) {
    const input = find('#cdCustomer');
    const options = find('#cdCustomerOptions');
    if (!input || !options) return;
    options.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open) options.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  function handleCustomerKeydown(event) {
    const options = [...findAll('#cdCustomerOptions [data-customer-option]')];
    if (event.key === 'Escape') {
      setCustomerOptionsOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setCustomerOptionsOpen(true);
      const activeIndex = options.findIndex(option => option.getAttribute('aria-selected') === 'true');
      const nextIndex = event.key === 'ArrowDown'
        ? Math.min(options.length - 1, activeIndex + 1)
        : Math.max(0, activeIndex < 0 ? options.length - 1 : activeIndex - 1);
      options.forEach((option, index) => option.setAttribute('aria-selected', String(index === nextIndex)));
      options[nextIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && find('#cdCustomerOptions').hidden === false) {
      const active = find('#cdCustomerOptions [aria-selected="true"]');
      if (active) {
        event.preventDefault();
        state.customerId = active.dataset.customerOption;
        state.customerLabel = active.dataset.customerName;
        find('#cdCustomer').value = state.customerLabel;
        setCustomerOptionsOpen(false);
      }
    }
  }

  function handleCustomerOutsideClick(event) {
    if (!event.target.closest('.cd-combobox')) setCustomerOptionsOpen(false);
  }

  function showFilterError(error) {
    const notice = find('#cdNotice');
    notice.hidden = false;
    notice.textContent = error.message || 'Không thể tải danh sách khách hàng.';
  }

  function selectedFilters() {
    const employee = state.employeeSelfId || find('#cdEmployee')?.value || state.employee;
    const year = Number(find('#cdYear')?.value || state.year);
    if (state.tab === 'employee') return { employeeId: employee, year };
    return {
      employeeId: employee,
      customerId: state.customerId || find('#cdCustomer')?.value || state.customerLabel,
      year,
      fromDate: find('#cdFromDate')?.value || '',
      toDate: find('#cdToDate')?.value || ''
    };
  }

  async function loadReport() {
    const report = find('#cdReport');
    const filters = selectedFilters();
    state.year = filters.year;
    state.paymentPage = Math.max(1, state.paymentPage);
    report.innerHTML = '<div class="cd-loading"><i class="fa-solid fa-spinner fa-spin"></i> Đang tổng hợp dữ liệu...</div>';
    try {
      if (state.tab === 'employee') {
        const [summary, monthly, paymentHistory] = await Promise.all([
          request('nhan-vien/summary', filters),
          request('nhan-vien/monthly', { employeeId: filters.employeeId, year: filters.year }),
          request('nhan-vien/payments', { employeeId: filters.employeeId, year: filters.year, page: state.paymentPage, limit: 25 })
        ]);
        state.summary = summary;
        state.monthly = monthly;
        state.paymentHistory = paymentHistory;
        renderEmployeeReport();
      } else {
        const [summary, monthly] = await Promise.all([
          request('khach-hang/summary', { ...filters, page: state.page, limit: state.pageSize, sort: state.sort }),
          request('khach-hang/monthly', { employeeId: filters.employeeId, customerId: filters.customerId, year: filters.year })
        ]);
        state.summary = summary;
        state.monthly = monthly;
        renderCustomerReport();
      }
    } catch (error) {
      report.innerHTML = `<div class="cd-error"><i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(error.message)}</div>`;
    }
  }

  function renderKpis(items) {
    return `<div class="cd-kpis">${items.map(item => `
      <article class="cd-kpi ${item.className || ''}">
        <span class="cd-kpi-label">${escapeHtml(item.label)}</span>
        <strong>${money(item.value)}</strong>
        <small>${escapeHtml(item.note || '')}</small>
      </article>`).join('')}</div>`;
  }

  function renderMonthlyChart(months) {
    const max = Math.max(1, ...months.map(month => month.receivable || 0));
    const chartWidth = 900;
    const chartHeight = 230;
    const left = 44;
    const right = 18;
    const top = 14;
    const bottom = 30;
    const plotHeight = chartHeight - top - bottom;
    const groupWidth = (chartWidth - left - right) / 12;
    const barWidth = Math.min(12, groupWidth / 4);
    const bars = months.map((month, index) => {
      const x = left + groupWidth * index + groupWidth / 2;
      const values = [
        { value: month.receivable, color: '#93a4b8', offset: -barWidth * 1.6 },
        { value: month.paid, color: '#159b79', offset: 0 },
        { value: month.remaining, color: '#d88c31', offset: barWidth * 1.6 }
      ];
      return `${values.map(item => {
        const height = Math.max(1, plotHeight * item.value / max);
        return `<rect x="${(x + item.offset - barWidth / 2).toFixed(1)}" y="${(top + plotHeight - height).toFixed(1)}" width="${barWidth}" height="${height.toFixed(1)}" rx="3" fill="${item.color}"><title>${money(item.value)}</title></rect>`;
      }).join('')}<text x="${x.toFixed(1)}" y="${chartHeight - 7}" text-anchor="middle">T${index + 1}</text>`;
    }).join('');
    return `<section class="cd-card cd-chart-card">
      <div class="cd-section-heading"><div><h3>Diễn biến công nợ</h3><p>Phải thu, đã thu và số dư chuyển tháng</p></div>
        <div class="cd-legend"><span><i class="legend-total"></i>Phải thu</span><span><i class="legend-paid"></i>Đã thanh toán</span><span><i class="legend-left"></i>Còn lại</span></div>
      </div>
      <div class="cd-chart-wrap"><svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Biểu đồ công nợ theo tháng">
        <line x1="${left}" x2="${chartWidth - right}" y1="${top + plotHeight}" y2="${top + plotHeight}" class="cd-chart-axis"/>
        ${bars}
      </svg></div>
    </section>`;
  }

  function renderMonthlyTable(monthly, employee = false) {
    const label = employee ? 'Nợ phát sinh NV' : 'Nợ phát sinh';
    const months = monthly.months || [];
    const totals = monthly.totals || {};
    return `<section class="cd-card cd-monthly-card">
      <div class="cd-section-heading"><div><h3>Chi tiết công nợ theo tháng</h3><p>Năm ${monthly.year} · Nợ cũ được chuyển từ số dư tháng trước</p></div></div>
      <div class="cd-table-scroll"><table class="cd-table">
        <thead><tr><th>Tháng</th><th>${label}</th><th>Nợ cũ</th><th>Tổng phải ${employee ? 'đóng' : 'thu'}</th><th>Đã thanh toán</th><th>Còn lại</th></tr></thead>
        <tbody>${months.map(row => `<tr>
          <td class="cd-month">Tháng ${String(row.month).padStart(2, '0')}</td>
          <td>${money(row.incurred)}</td><td>${money(row.oldDebt)}</td><td>${money(row.receivable)}</td>
          <td class="cd-positive">${money(row.paid)}</td><td class="${row.remaining ? 'cd-warning' : 'cd-positive'}">${money(row.remaining)}</td>
        </tr>`).join('')}
        <tr class="cd-total-row"><th>TỔNG NĂM</th><th>${money(totals.incurred)}</th><th>—</th><th>${money(totals.receivable)}</th><th>${money(totals.paid)}</th><th class="${totals.remaining ? 'cd-warning' : 'cd-positive'}">${money(totals.remaining)}</th></tr></tbody>
      </table></div>
    </section>`;
  }

  function statusBadge(remaining) {
    if (remaining <= 0) return '<span class="cd-status is-paid">Đã thanh toán</span>';
    return '<span class="cd-status is-open">Còn nợ</span>';
  }

  function renderCustomerReport() {
    const summary = state.summary;
    const monthly = state.monthly;
    const notice = find('#cdNotice');
    notice.hidden = !monthly.missingPaymentDateCount;
    notice.textContent = monthly.missingPaymentDateCount
      ? `${monthly.missingPaymentDateCount} đơn có tiền đã thu nhưng thiếu ngày thanh toán; hệ thống tạm ghi nhận theo ngày đăng ký đơn. Báo cáo tháng chỉ phản ánh chính xác khi có lịch sử thu tiền theo từng lần. `
      : 'Dữ liệu thanh toán khách hàng hiện lưu tổng đã thu và một ngày thanh toán trên đơn; báo cáo tháng không thể tách các lần trả góp đã ghi đè. ';
    notice.textContent += 'Chưa có trường hạn thanh toán nên không thể xác định trạng thái quá hạn.';
    notice.hidden = false;
    const filterDates = `${escapeHtml(find('#cdFromDate').value)} — ${escapeHtml(find('#cdToDate').value)}`;
    find('#cdReport').innerHTML = `
      <div class="cd-period"><span><i class="fa-regular fa-calendar"></i> ${filterDates}</span><span>${summary.orderCount || 0} đơn hàng</span></div>
      ${renderKpis([
        { label: 'Doanh số khách hàng', value: summary.sales, note: 'Theo ngày đăng ký đơn', className: 'cd-kpi-sales' },
        { label: 'Công nợ khách hàng', value: summary.debt, note: 'Theo GIÁ THỰC THU KHÁCH HÀNG', className: 'cd-kpi-debt' },
        { label: 'Đã thanh toán', value: summary.paid, note: 'Tổng KH Thanh Toán trên đơn', className: 'cd-kpi-paid' },
        { label: 'Còn phải thu', value: summary.remaining, note: summary.remaining > 0 ? 'Đang còn công nợ' : 'Đã thanh toán hết', className: summary.remaining > 0 ? 'cd-kpi-open' : 'cd-kpi-clear' }
      ])}
      ${renderMonthlyChart(monthly.months || [])}
      ${renderMonthlyTable(monthly)}
      <section class="cd-card cd-customers-card">
        <div class="cd-section-heading"><div><h3>Khách hàng theo công nợ</h3><p>Chọn một khách hàng để xem hồ sơ và từng đơn hàng</p></div>
          <label class="cd-sort">Sắp xếp<select id="cdCustomerSort"><option value="remaining" ${state.sort === 'remaining' ? 'selected' : ''}>Còn nợ cao nhất</option><option value="debt" ${state.sort === 'debt' ? 'selected' : ''}>Công nợ cao nhất</option><option value="sales" ${state.sort === 'sales' ? 'selected' : ''}>Doanh số cao nhất</option><option value="paid" ${state.sort === 'paid' ? 'selected' : ''}>Đã thu cao nhất</option><option value="name" ${state.sort === 'name' ? 'selected' : ''}>Tên khách hàng</option></select></label>
        </div>
        <div class="cd-table-scroll"><table class="cd-table">
          <thead><tr><th>Khách hàng</th><th>MST</th><th>Nhân viên phụ trách</th><th>Số đơn</th><th>Doanh số</th><th>Công nợ</th><th>Đã thu</th><th>Còn nợ</th><th>Trạng thái</th></tr></thead>
          <tbody>${summary.customers?.length ? summary.customers.map(customer => `<tr class="cd-customer-row" data-customer="${escapeHtml(customer.name)}">
            <td><button type="button" class="cd-link-button" data-customer-detail="${escapeHtml(customer.name)}">${escapeHtml(customer.name || 'Khách lẻ')}</button></td>
            <td>${escapeHtml(customer.mst || '—')}</td><td>${escapeHtml(customer.employee || '—')}</td><td>${customer.orderCount || 0}</td>
            <td>${money(customer.sales)}</td><td>${money(customer.debt)}</td><td class="cd-positive">${money(customer.paid)}</td>
            <td class="${customer.remaining ? 'cd-warning' : 'cd-positive'}">${money(customer.remaining)}</td><td>${statusBadge(customer.remaining)}</td>
          </tr>`).join('') : '<tr><td colspan="9" class="cd-empty">Không có dữ liệu phù hợp với bộ lọc.</td></tr>'}</tbody>
        </table></div>
        ${renderPager(summary.page, summary.totalPages, summary.totalCustomers, 'cd-customer-page')}
      </section>`;
  }

  function renderEmployeeReport() {
    const summary = state.summary;
    const monthly = state.monthly;
    const notice = find('#cdNotice');
    notice.hidden = false;
    notice.textContent = 'Chưa thể tính công nợ nhân viên an toàn: đơn hàng hiện không có trường giá thực thu nhân viên. Không sử dụng “Thực Đóng Công Ty” hoặc “THỰC CÔNG NỢ CTY” vì đây là chi phí/công nợ công ty với nhà cung cấp. Đề xuất bổ sung trường “Thực Thu Nhân Viên” trên từng đơn hàng trước khi bật KPI và số dư công nợ.';
    const paymentMonths = monthly.paymentsByMonth || [];
    const paymentTotals = paymentMonths.reduce((sum, item) => sum + item.paid, 0);
    find('#cdReport').innerHTML = `
      <div class="cd-period"><span><i class="fa-regular fa-calendar"></i> Năm ${monthly.year}</span><span>${summary.orderCount || 0} đơn phụ trách</span></div>
      ${renderKpis([
        { label: 'Doanh số phụ trách', value: summary.sales, note: 'Theo Thành Tiền', className: 'cd-kpi-sales' },
        { label: 'Phiếu đã thanh toán', value: summary.paid, note: 'Theo phiếu EMPLOYEE_PAYMENTS', className: 'cd-kpi-paid' }
      ])}
      <section class="cd-card cd-monthly-card">
        <div class="cd-section-heading"><div><h3>Thanh toán nhân viên theo tháng</h3><p>Nợ phát sinh, nợ cũ và số dư chưa tính cho đến khi có trường giá thực thu nhân viên</p></div></div>
        <div class="cd-table-scroll"><table class="cd-table">
          <thead><tr><th>Tháng</th><th>Nợ phát sinh NV</th><th>Nợ cũ</th><th>Tổng phải đóng</th><th>Đã thanh toán</th><th>Còn lại</th></tr></thead>
          <tbody>${paymentMonths.map(row => `<tr><td class="cd-month">Tháng ${String(row.month).padStart(2, '0')}</td><td>—</td><td>—</td><td>—</td><td class="cd-positive">${money(row.paid)}</td><td>—</td></tr>`).join('')}
          <tr class="cd-total-row"><th>TỔNG NĂM</th><th>—</th><th>—</th><th>—</th><th>${money(paymentTotals)}</th><th>—</th></tr></tbody>
        </table></div>
      </section>
      <section class="cd-card cd-payment-history">
        <div class="cd-section-heading"><div><h3>Lịch sử phiếu thanh toán</h3><p>Phiếu ghi nhận trong EMPLOYEE_PAYMENTS</p></div></div>
        <div class="cd-table-scroll"><table class="cd-table"><thead><tr><th>Ngày</th><th>Nhân viên</th><th>Số tiền</th><th>Hình thức</th><th>Ghi chú</th><th>Người ghi nhận</th></tr></thead>
        <tbody>${state.paymentHistory.items.length ? state.paymentHistory.items.map(payment => `<tr>
          <td>${escapeHtml(payment.paymentDate || '—')}</td><td>${escapeHtml(payment.employee || '—')}</td><td class="cd-positive">${money(payment.amount)}</td>
          <td>${escapeHtml(payment.paymentMethod || '—')}</td><td>${escapeHtml(payment.note || '—')}</td><td>${escapeHtml(payment.enteredBy || payment.createdBy || '—')}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="cd-empty">Không có phiếu thanh toán trong năm này.</td></tr>'}</tbody></table></div>
        ${renderPager(state.paymentHistory.page, state.paymentHistory.totalPages, state.paymentHistory.total, 'cd-employee-payment-page', 'phiếu thanh toán')}
      </section>`;
  }

  function renderPager(page, totalPages, total, action, noun = 'khách hàng') {
    if (totalPages <= 1) return `<div class="cd-pager-note">${Number(total || 0).toLocaleString('vi-VN')} ${noun}</div>`;
    return `<div class="cd-pager"><span>${Number(total || 0).toLocaleString('vi-VN')} ${noun} · Trang ${page}/${totalPages}</span>
      <div><button type="button" data-page-action="${action}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Trước</button>
      <button type="button" data-page-action="${action}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Tiếp</button></div></div>`;
  }

  async function openCustomerDetail(customerName) {
    const drawer = find('#cdDrawer');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.innerHTML = '<div class="cd-drawer-loading"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải hồ sơ khách hàng...</div>';
    try {
      const filters = selectedFilters();
      const data = await request('khach-hang/detail', { ...filters, customerId: customerName, page: state.detailPage, limit: 50 });
      renderCustomerDetail(data);
    } catch (error) {
      drawer.innerHTML = `<div class="cd-drawer-head"><button type="button" data-close-drawer aria-label="Đóng">&times;</button></div><div class="cd-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderCustomerDetail(data) {
    const drawer = find('#cdDrawer');
    const item = data.summary;
    const paymentHistory = data.orders.flatMap(order => (order.paymentHistory || []).map(payment => ({ ...payment, orderCode: order.orderCode })));
    drawer.innerHTML = `
      <div class="cd-drawer-head"><div><span>HỒ SƠ KHÁCH HÀNG</span><h3>${escapeHtml(data.customer.name)}</h3></div><button type="button" data-close-drawer aria-label="Đóng">&times;</button></div>
      <div class="cd-drawer-meta"><span>MST <strong>${escapeHtml(data.customer.mst || 'Chưa có')}</strong></span><span>Nhân viên <strong>${escapeHtml(data.customer.employee || 'Chưa có')}</strong></span></div>
      <div class="cd-drawer-kpis"><div><small>Tổng số đơn</small><strong>${item.orderCount || 0}</strong></div><div><small>Doanh số</small><strong>${money(item.sales)}</strong></div><div><small>Công nợ</small><strong>${money(item.debt)}</strong></div><div><small>Đã thanh toán</small><strong>${money(item.paid)}</strong></div><div><small>Còn nợ</small><strong>${money(item.remaining)}</strong></div></div>
      <div class="cd-drawer-table-wrap"><table class="cd-table cd-order-table"><thead><tr><th>Mã đơn</th><th>Ngày</th><th>Sản phẩm</th><th>Doanh số</th><th>Giá thực thu KH</th><th>Đã thu</th><th>Còn nợ</th><th>Trạng thái</th></tr></thead>
      <tbody>${data.orders.length ? data.orders.map(order => `<tr data-order-detail="${escapeHtml(order.id)}">
        <td><button type="button" class="cd-link-button" data-order="${escapeHtml(order.id)}">${escapeHtml(order.orderCode || '—')}</button></td>
        <td>${escapeHtml(order.date || '—')}</td><td>${escapeHtml(order.product || '—')}</td><td>${money(order.sales)}</td>
        <td>${money(order.customerPrice)}</td><td class="cd-positive">${money(order.paid)}</td>
        <td class="${order.remaining ? 'cd-warning' : 'cd-positive'}">${money(order.remaining)}</td><td>${statusBadge(order.remaining)}</td>
      </tr>`).join('') : '<tr><td colspan="8" class="cd-empty">Không có đơn hàng trong khoảng thời gian này.</td></tr>'}</tbody></table></div>
      <section class="cd-payment-history"><div class="cd-section-heading"><div><h3>Lịch sử cập nhật thanh toán</h3><p>Lịch sử thay đổi trường thanh toán đã được hệ thống ghi nhận</p></div></div>
        <div class="cd-table-scroll"><table class="cd-table"><thead><tr><th>Thời điểm</th><th>Mã đơn</th><th>Trường</th><th>Giá trị trước</th><th>Giá trị sau</th><th>Người cập nhật</th></tr></thead>
        <tbody>${paymentHistory.length ? paymentHistory.map(payment => `<tr><td>${escapeHtml(payment.date ? new Date(payment.date).toLocaleString('vi-VN') : '—')}</td><td>${escapeHtml(payment.orderCode || '—')}</td><td>${escapeHtml(payment.field)}</td><td>${escapeHtml(payment.from || '—')}</td><td>${escapeHtml(payment.to || '—')}</td><td>${escapeHtml(payment.by || '—')}</td></tr>`).join('') : '<tr><td colspan="6" class="cd-empty">Không có lịch sử thay đổi thanh toán được lưu cho các đơn trong trang này.</td></tr>'}</tbody></table></div>
      </section>
      <div class="cd-pager"><span>${data.total} đơn hàng · Trang ${data.page}/${data.totalPages}</span><div>
        <button type="button" data-detail-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Trước</button>
        <button type="button" data-detail-page="${data.page + 1}" ${data.page >= data.totalPages ? 'disabled' : ''}>Tiếp</button></div></div>`;
  }

  async function showOrder(orderId) {
    const drawer = find('#cdDrawer');
    const row = drawer.querySelector(`[data-order-detail="${CSS.escape(orderId)}"]`);
    if (!row) return;
    const cells = Array.from(row.cells).map(cell => cell.textContent.trim());
    const modal = document.createElement('div');
    modal.className = 'cd-order-modal';
    modal.innerHTML = `<div class="cd-order-modal-card" role="dialog" aria-modal="true" aria-label="Chi tiết đơn hàng">
      <button type="button" class="cd-modal-close" aria-label="Đóng">&times;</button><h3>Chi tiết đơn hàng ${escapeHtml(cells[0])}</h3>
      <dl>${['Mã đơn', 'Ngày đăng ký', 'Sản phẩm', 'Doanh số', 'Giá thực thu khách hàng', 'Đã thu', 'Còn nợ', 'Trạng thái'].map((label, index) => `<div><dt>${label}</dt><dd>${escapeHtml(cells[index] || '—')}</dd></div>`).join('')}</dl>
    </div>`;
    root.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('.cd-modal-close')) modal.remove();
    });
  }

  function handleReportClick(event) {
    const customerButton = event.target.closest('[data-customer-detail]');
    if (customerButton) {
      state.detailPage = 1;
      openCustomerDetail(customerButton.dataset.customerDetail);
      return;
    }
    const pager = event.target.closest('[data-page-action]');
    if (pager) {
      if (pager.dataset.pageAction === 'cd-employee-payment-page') state.paymentPage = Number(pager.dataset.page);
      else state.page = Number(pager.dataset.page);
      loadReport();
    }
  }

  function handleDrawerClick(event) {
    if (event.target.closest('[data-close-drawer]')) {
      const drawer = find('#cdDrawer');
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    } else if (event.target.closest('[data-order]')) {
      showOrder(event.target.closest('[data-order]').dataset.order);
    } else if (event.target.closest('[data-detail-page]')) {
      state.detailPage = Number(event.target.closest('[data-detail-page]').dataset.detailPage);
      openCustomerDetail(state.customerLabel);
    }
  }

  async function init(user) {
    if (!root) return;
    document.getElementById('customerDebtHeaderTabs')?.remove();
    document.getElementById('cdFilters')?.remove();
    injectStyles();
    if (state.initialized) document.removeEventListener('pointerdown', handleCustomerOutsideClick);
    state.initialized = true;
    state.tab = 'customer';
    state.isAdmin = user?.role?.name === 'Admin';
    const ownScope = user?.role?.dataScopes?.orders === 'own' || ['Nhân Viên', 'Chỉ Xem'].includes(user?.role?.name);
    state.employeeSelfId = !state.isAdmin && ownScope ? String(user?.employee?._id || user?.employee?.name || '') : '';
    state.employeeSelfName = !state.isAdmin && ownScope ? String(user?.employee?.name || '') : '';
    state.employee = state.employeeSelfId;
    renderShell();
    try {
      await loadOptions();
      await loadReport();
    } catch (error) {
      find('#cdReport').innerHTML = `<div class="cd-error">${escapeHtml(error.message)}</div>`;
    }
  }

  window.CustomerDebtDashboard = { init };
})();

