(function () {
  function text(value) {
    return String(value ?? '').trim();
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
    [...new Set(values.filter(Boolean))].forEach(value => addOption(select, value));
    select.disabled = disabled;
    select.value = selectedValue && values.includes(selectedValue) ? selectedValue : '';
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
    const originalValues = {
      type: text(order['Loại Sản Phẩm'] || order['LOẠI SẢN PHẨM'] || 'Khác'),
      supplier: text(order.NCC || 'Khác'),
      form: text(order['Hình Thức'] || order['HÌnh Thức'] || 'Khác'),
      name: text(order['Gói '] || order['Tên Sản Phẩm'] || '')
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
      const matching = products.filter(product => productType(product) === type.value);
      const values = matching.map(productSupplier);
      if (initializing && selected && !values.includes(selected)) values.push(selected);
      resetSelect(supplier, '-- Chọn NCC --', values, selected, !type.value);
      setForms('', !supplier.value);
    }

    function setForms(selected = '', disabled = false) {
      const matching = products.filter(product => productType(product) === type.value && productSupplier(product) === supplier.value);
      const values = matching.map(productForm);
      if (initializing && selected && !values.includes(selected)) values.push(selected);
      resetSelect(form, '-- Chọn Hình Thức --', values, selected, disabled || !supplier.value);
      setNames('', !form.value);
    }

    function setNames(selected = '', disabled = false) {
      const matching = products.filter(product => productType(product) === type.value && productSupplier(product) === supplier.value && productForm(product) === form.value);
      name.replaceChildren();
      addOption(name, '', '-- Chọn Gói Cước Chi Tiết --');
      matching.forEach(product => {
        const productPrice = money(product['GIÁ SAU THUẾ'] ?? product['SAU THUẾ'] ?? product['Giá Sau Thuế'] ?? product['Gia Sau Thuế'] ?? 0);
        addOption(name, String(products.indexOf(product)), `${productName(product)} (${productPrice.toLocaleString('vi-VN')} đ)`);
      });
      const selectedProductIndex = products.findIndex(product => matching.includes(product) && productName(product) === selected);
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
