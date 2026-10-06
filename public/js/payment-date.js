(function () {
  const FIELD = 'Ngày Thanh Toán';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const toIso = (v) => {
    const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : String(v || '').slice(0, 10);
  };
  function inject() {
    const grid = document.querySelector('#modalBody .order-finance-grid');
    if (!grid || document.getElementById('orderPaymentDate')) return;
    const saved = typeof currentOrder !== 'undefined' && currentOrder ? toIso(currentOrder[FIELD]) : '';
    grid.insertAdjacentHTML('beforeend', `<div class="form-group"><label class="form-label">Ngày Thanh Toán</label><input type="date" class="form-input" id="orderPaymentDate" value="${saved || today()}" data-field="${FIELD}"></div>`);
  }
  const original = window.showDetail;
  if (typeof original !== 'function') return;
  window.showDetail = async function () {
    const result = await original.apply(this, arguments);
    inject();
    return result;
  };
})();