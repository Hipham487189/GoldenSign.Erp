(function () {
  function text(value) {
    return String(value ?? '').trim();
  }

  function norm(value) {
    return text(value).toLowerCase();
  }

  function sameText(a, b) {
    return norm(a) !== '' && norm(a) === norm(b);
  }

  function uniqueValues(values) {
    const seen = new Set();
    const result = [];
    values.forEach(val => {
      const cleaned = text(val);
      const key = cleaned.toLowerCase();
      if (!cleaned || seen.has(key)) return;
      seen.add(key);
      result.push(cleaned);
    });
    return result;
  }

  function findCanonicalMatch(values, target) {
    const cleanTarget = text(target);
    if (!cleanTarget) return '';
    const exact = values.find(val => val === cleanTarget);
    if (exact) return exact;
    return values.find(val => sameText(val, cleanTarget)) || cleanTarget;
  }

  function productType(product) {
    return text(product['LOẠI SẢN PHẨM'] || product['Loại Sản Phẩm'] || 'Khác');
  }

  function productSupplier(product) {
    return text(product.NCC || 'Khác');
  }

  function productForm(product) {
    return text(product['HÌnh Thức'] ?? product['Hình Thức'] ?? 'Khác');
  }

  function productName(product) {
    return text(product['TÊN SẢN PHẨM'] ?? product['Tên Sản Phẩm'] ?? product['Gói '] ?? product['Gói']);
  }

  function addOption(select, value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label ?? value;
    select.append(option);
  }

  function resetSelect(select, placeholder, values, selectedValue, disabled) {
    select.replaceChildren();
    addOption(select, '', placeholder);
    const deduped = uniqueValues(values);
    deduped.forEach(value => addOption(select, value));
    select.disabled = disabled;
    const matched = findCanonicalMatch(deduped, selectedValue);
    select.value = matched && deduped.includes(matched) ? matched : '';
  }

  function money(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return Number(String(value ?? '').replace(/[^0-9-]/g, '')) || 0;
  }

  window.initializeOrderEditProductSelectors = function (container, products, order) {
    const fields = ['NCC', 'Loại Sản Phẩm', 'Hình Thức', 'Gói '];
    const inputs = fields.map(field => container.querySelector(`[data-field="${field}"]`));
    if (inputs.some(input => !input)) return;

    const [supplierInput, typeInput, formInput, nameInput] = inputs;
    const rawName = text(order['Gói '] || order['Tên Sản Phẩm'] || '');
    const rawSupplier = text(order.NCC || '');
    const rawType = text(order['Loại Sản Phẩm'] || order['LOẠI SẢN PHẨM'] || '');
    const rawForm = text(order['Hình Thức'] || order['HÌnh Thức'] || '');
    const matchedProduct = products.find(p => sameText(productName(p), rawName) && (!rawSupplier || sameText(productSupplier(p), rawSupplier)))
      || products.find(p => sameText(productName(p), rawName));

    const originalValues = {
      type: rawType || (matchedProduct ? productType(matchedProduct) : 'Khác'),
      supplier: rawSupplier || (matchedProduct ? productSupplier(matchedProduct) : 'Khác'),
      form: rawForm || (matchedProduct ? productForm(matchedProduct) : 'Khác'),
      name: rawName
    };
    const selectors = inputs.map(input => {
      const select = document.createElement('select');
      select.className = input.className.replace('form-input', 'form-select');
      select.dataset.field = input.dataset.field;
      input.replaceWith(select);
      return select;
    });
    const [supplier, type, form, name] = selectors;
    const financialFields = ['Thành Tiền', 'Thực Đóng Công Ty', 'THỰC CÔNG NỢ CTY'];
    let initializing = true;

    function clearPrices() {
      financialFields.forEach(field => {
        const input = container.querySelector(`[data-field="${field}"]`);
        if (input) input.value = '';
      });
    }

    function setSuppliers(selected = '') {
      const matching = products.filter(product => sameText(productType(product), type.value));
      const values = uniqueValues(matching.map(productSupplier));
      if (initializing && selected && !values.some(v => sameText(v, selected))) values.push(selected);
      resetSelect(supplier, '-- Chọn NCC --', values, selected, !type.value);
      setForms('', !supplier.value);
    }

    function setForms(selected = '', disabled = false) {
      const matching = products.filter(product => sameText(productType(product), type.value) && sameText(productSupplier(product), supplier.value));
      const values = uniqueValues(matching.map(productForm));
      if (initializing && selected && !values.some(v => sameText(v, selected))) values.push(selected);
      resetSelect(form, '-- Chọn Hình Thức --', values, selected, disabled || !supplier.value);
      setNames('', !form.value);
    }

    function setNames(selected = '', disabled = false) {
      const matching = products.filter(product => sameText(productType(product), type.value) && sameText(productSupplier(product), supplier.value) && sameText(productForm(product), form.value));
      name.replaceChildren();
      addOption(name, '', '-- Chọn Gói Cước Chi Tiết --');
      matching.forEach(product => {
        const productPrice = money(product['GIÁ SAU THUẾ'] ?? product['SAU THUẾ'] ?? product['Giá Sau Thuế'] ?? product['Gia Sau Thuế'] ?? 0);
        addOption(name, String(products.indexOf(product)), `${productName(product)} (${productPrice.toLocaleString('vi-VN')} đ)`);
      });
      const selectedProductIndex = products.findIndex(product => matching.includes(product) && sameText(productName(product), selected));
      if (selectedProductIndex >= 0) {
        name.value = String(selectedProductIndex);
        name.dataset.saveValue = selected;
      } else if (selected) {
        addOption(name, '__legacy__', selected);
        name.value = '__legacy__';
        name.dataset.saveValue = selected;
      } else {
        name.value = '';
        name.dataset.saveValue = '';
        if (!initializing) clearPrices();
      }
      name.disabled = disabled || !form.value;
    }

    function updatePrices(product) {
      const values = {
        'Thành Tiền': money(product['GIÁ SAU THUẾ'] ?? product['SAU THUẾ'] ?? product['Giá Sau Thuế'] ?? product['Gia Sau Thuế'] ?? 0),
        'Thực Đóng Công Ty': money(product['THỰC ĐÓNG CÔNG TY'] ?? product['Thực Đóng Công Ty'] ?? 0),
        'THỰC CÔNG NỢ CTY': money(product['THỰC CÔNG NỢ CTY'] ?? product['THỰC CÔNG NỢ CTY (VNĐ)'] ?? 0)
      };
      Object.entries(values).forEach(([field, value]) => {
        const input = container.querySelector(`[data-field="${field}"]`);
        if (input) input.value = value;
      });
    }

    resetSelect(type, '-- Chọn Loại Sản Phẩm --', [...products.map(productType), originalValues.type], originalValues.type, false);
    setSuppliers(originalValues.supplier);
    setForms(originalValues.form);
    setNames(originalValues.name);
    initializing = false;

    type.addEventListener('change', () => { setSuppliers(); clearPrices(); });
    supplier.addEventListener('change', () => { setForms(); clearPrices(); });
    form.addEventListener('change', () => { setNames(); clearPrices(); });
    name.addEventListener('change', () => {
      const selectedProduct = products[Number(name.value)];
      if (selectedProduct) {
        name.dataset.saveValue = productName(selectedProduct);
        updatePrices(selectedProduct);
      }
    });
  };
})();
