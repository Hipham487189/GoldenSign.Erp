(function () {
  const FIELD = 'Ngày KH thanh toán';
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '');
  const toIso = (v) => {
    const text = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    const a = Number(m[1]), b = Number(m[2]), padded = m[1].length === 2 && m[2].length === 2;
    if (a > 12) return iso(m[3], b, a);
    if (b > 12) return iso(m[3], a, b);
    return padded ? iso(m[3], b, a) : iso(m[3], a, b);
  };
  function inject() {
    const grid = document.querySelector('#modalBody .order-finance-grid');
    if (!grid || document.getElementById('orderPaymentDate')) return;
    const saved = typeof currentOrder !== 'undefined' && currentOrder ? toIso(currentOrder[FIELD]) : '';
    grid.insertAdjacentHTML('beforeend', `<div class="form-group"><label class="form-label">Ngày Thanh Toán</label><input type="date" class="form-input" id="orderPaymentDate" value="${saved}" data-field="${FIELD}"></div>`);
    const input = document.getElementById('orderPaymentDate');
    const sync = () => {
      const m = input.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      input.dataset.saveValue = m ? `${m[3]}/${m[2]}/${m[1]}` : '';
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();
    if (!saved && currentOrder && currentOrder[FIELD]) input.dataset.saveValue = currentOrder[FIELD];
  }
  const original = window.showDetail;
  if (typeof original !== 'function') return;
  window.showDetail = async function () {
    const result = await original.apply(this, arguments);
    inject();
    return result;
  };
})();