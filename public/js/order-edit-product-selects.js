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
    select.disabled = Boolean(disabled);
    const matched = findCanonicalMatch(deduped, selectedValue);
    select.value = matched && deduped.includes(matched) ? matched : '';
  }

  function money(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return Number(String(value ?? '').replace(/[^0-9-]/g, '')) || 0;
  }

  async function fetchSanPhamOptions(paramsObj) {
    const cleanParams = Object.fromEntries(Object.entries(paramsObj || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const qs = new URLSearchParams(cleanParams).toString();
    const headers = {};
    try {
      const token = localStorage.getItem('datags_auth_token') || '';
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (_) {}
    const response = await fetch(`/api/sanpham/order-options${qs ? `?${qs}` : ''}`, { headers });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Không thể tải danh sách sản phẩm.');
    }
    return result.data || {};
  }

  async function fetchAllMatchingPackages(loaiSP, ncc, hinhThuc) {
    const allItems = [];
    for (let page = 1; page <= 5; page += 1) {
      const data = await fetchSanPhamOptions({ loaiSP, ncc, hinhThuc, page: String(page), limit: '100' });
      const items = Array.isArray(data.products) ? data.products : [];
      allItems.push(...items);
      if (!data.hasMore || items.length === 0) break;
    }
    return allItems;
  }

  window.initializeOrderEditProductSelectors = function (container, products = [], order = {}) {
    if (!container) return;
    const fields = ['NCC', 'Loại Sản Phẩm', 'Hình Thức', 'Gói '];
    const inputs = fields.map(field => container.querySelector(`[data-field="${field}"]`));
    if (inputs.some(input => !input)) return;

    const localProducts = Array.isArray(products) ? products : [];
    const rawName = text(order['Gói '] || order['Tên Sản Phẩm'] || '');
    const rawSupplier = text(order.NCC || '');
    const rawType = text(order['Loại Sản Phẩm'] || order['LOẠI SẢN PHẨM'] || '');
    const rawForm = text(order['Hình Thức'] || order['HÌnh Thức'] || '');
    const matchedProduct = localProducts.find(p => sameText(productName(p), rawName) && (!rawSupplier || sameText(productSupplier(p), rawSupplier)))
      || localProducts.find(p => sameText(productName(p), rawName));

    const originalValues = {
      type: rawType || (matchedProduct ? productType(matchedProduct) : ''),
      supplier: rawSupplier || (matchedProduct ? productSupplier(matchedProduct) : ''),
      form: rawForm || (matchedProduct ? productForm(matchedProduct) : ''),
      name: rawName
    };

    const selectors = inputs.map(input => {
      if (input.tagName === 'SELECT') return input;
      const select = document.createElement('select');
      select.className = (input.className || 'form-input').replace('form-input', 'form-select');
      select.dataset.field = input.dataset.field;
      if (input.disabled) select.disabled = true;
      input.replaceWith(select);
      return select;
    });
    const [supplier, type, form, name] = selectors;
    const financialFields = ['Thành Tiền', 'Thực Đóng Công Ty', 'THỰC CÔNG NỢ CTY'];
    let packageList = [];
    let reqCounter = { types: 0, suppliers: 0, forms: 0, names: 0 };

    function isLocked() {
      return container.dataset.detailLocked === '1' || container.closest('[data-detail-locked="1"]') !== null;
    }

    function applyLockState() {
      const locked = isLocked();
      type.disabled = locked;
      supplier.disabled = locked || !type.value;
      form.disabled = locked || !supplier.value;
      name.disabled = locked || !form.value;
    }

    function clearPrices() {
      financialFields.forEach(field => {
        const input = container.querySelector(`[data-field="${field}"]`);
        if (input) input.value = '';
      });
    }

    function updatePrices(product) {
      const values = {
        'Thành Tiền': money(product['GIÁ SAU THUẾ'] ?? product['SAU THUẾ'] ?? product['Giá Sau Thuế'] ?? product['Gia Sau Thuế'] ?? product['Gia Sau Thue'] ?? 0),
        'Thực Đóng Công Ty': money(product['THỰC ĐÓNG CÔNG TY'] ?? product['Thực Đóng Công Ty'] ?? product['Thực Đóng Cty'] ?? 0),
        'THỰC CÔNG NỢ CTY': money(product['THỰC CÔNG NỢ CTY'] ?? product['THỰC CÔNG NỢ CTY (VNĐ)'] ?? 0)
      };
      Object.entries(values).forEach(([field, value]) => {
        const input = container.querySelector(`[data-field="${field}"]`);
        if (input) input.value = value;
      });
    }

    function renderPackageSelect(items, selectedName, preserveCurrentOnEmpty) {
      packageList = items;
      name.replaceChildren();
      addOption(name, '', '-- Chọn Gói Cước Chi Tiết --');
      items.forEach((product, idx) => {
        const productPrice = money(product['GIÁ SAU THUẾ'] ?? product['SAU THUẾ'] ?? product['Giá Sau Thuế'] ?? product['Gia Sau Thuế'] ?? product['Gia Sau Thue'] ?? 0);
        addOption(name, String(idx), `${productName(product)} (${productPrice.toLocaleString('vi-VN')} đ)`);
      });
      const matchedIdx = items.findIndex(product => sameText(productName(product), selectedName));
      if (matchedIdx >= 0) {
        name.value = String(matchedIdx);
        name.dataset.saveValue = productName(items[matchedIdx]);
      } else if (selectedName) {
        addOption(name, '__legacy__', selectedName);
        name.value = '__legacy__';
        name.dataset.saveValue = selectedName;
      } else {
        name.value = '';
        name.dataset.saveValue = '';
        if (!preserveCurrentOnEmpty) clearPrices();
      }
      applyLockState();
    }

    async function loadNames(selectedName = '', preservePrices = false) {
      const reqId = ++reqCounter.names;
      if (!type.value || !supplier.value || !form.value) {
        renderPackageSelect([], selectedName, preservePrices);
        return;
      }
      const localMatches = localProducts.filter(product =>
        sameText(productType(product), type.value)
        && sameText(productSupplier(product), supplier.value)
        && sameText(productForm(product), form.value)
      );
      if (localMatches.length) {
        renderPackageSelect(localMatches, selectedName, preservePrices);
      }
      if (typeof fetch !== 'function') return;
      try {
        const apiItems = await fetchAllMatchingPackages(type.value, supplier.value, form.value);
        if (reqId !== reqCounter.names || !name.isConnected) return;
        if (apiItems.length || !localMatches.length) {
          renderPackageSelect(apiItems, selectedName || name.dataset.saveValue || '', preservePrices);
        }
      } catch (_) {
        if (reqId !== reqCounter.names || !name.isConnected) return;
        if (!localMatches.length) renderPackageSelect([], selectedName, preservePrices);
      }
    }

    async function loadForms(selectedForm = '', selectedName = '', preservePrices = false) {
      const reqId = ++reqCounter.forms;
      if (!type.value || !supplier.value) {
        resetSelect(form, '-- Chọn Hình Thức --', [], '', true);
        renderPackageSelect([], '', preservePrices);
        return;
      }
      const localForms = uniqueValues(
        localProducts
          .filter(product => sameText(productType(product), type.value) && sameText(productSupplier(product), supplier.value))
          .map(productForm)
      );
      if (selectedForm && !localForms.some(v => sameText(v, selectedForm))) localForms.push(selectedForm);
      if (localForms.length) {
        resetSelect(form, '-- Chọn Hình Thức --', localForms, selectedForm, isLocked());
      }
      if (typeof fetch === 'function') {
        try {
          const data = await fetchSanPhamOptions({ loaiSP: type.value, ncc: supplier.value });
          if (reqId !== reqCounter.forms || !form.isConnected) return;
          const apiForms = uniqueValues([...(data.values || []), ...(selectedForm ? [selectedForm] : [])]);
          if (apiForms.length || !localForms.length) {
            resetSelect(form, '-- Chọn Hình Thức --', apiForms, selectedForm || form.value, isLocked());
          }
        } catch (_) {
          if (reqId !== reqCounter.forms || !form.isConnected) return;
          if (!localForms.length) resetSelect(form, '-- Chọn Hình Thức --', selectedForm ? [selectedForm] : [], selectedForm, isLocked());
        }
      }
      applyLockState();
      await loadNames(selectedName, preservePrices);
    }

    async function loadSuppliers(selectedSupplier = '', selectedForm = '', selectedName = '', preservePrices = false) {
      const reqId = ++reqCounter.suppliers;
      if (!type.value) {
        resetSelect(supplier, '-- Chọn NCC --', [], '', true);
        resetSelect(form, '-- Chọn Hình Thức --', [], '', true);
        renderPackageSelect([], '', preservePrices);
        return;
      }
      const localSuppliers = uniqueValues(
        localProducts.filter(product => sameText(productType(product), type.value)).map(productSupplier)
      );
      if (selectedSupplier && !localSuppliers.some(v => sameText(v, selectedSupplier))) localSuppliers.push(selectedSupplier);
      if (localSuppliers.length) {
        resetSelect(supplier, '-- Chọn NCC --', localSuppliers, selectedSupplier, isLocked());
      }
      if (typeof fetch === 'function') {
        try {
          const data = await fetchSanPhamOptions({ loaiSP: type.value });
          if (reqId !== reqCounter.suppliers || !supplier.isConnected) return;
          const apiSuppliers = uniqueValues([...(data.values || []), ...(selectedSupplier ? [selectedSupplier] : [])]);
          if (apiSuppliers.length || !localSuppliers.length) {
            resetSelect(supplier, '-- Chọn NCC --', apiSuppliers, selectedSupplier || supplier.value, isLocked());
          }
        } catch (_) {
          if (reqId !== reqCounter.suppliers || !supplier.isConnected) return;
          if (!localSuppliers.length) resetSelect(supplier, '-- Chọn NCC --', selectedSupplier ? [selectedSupplier] : [], selectedSupplier, isLocked());
        }
      }
      applyLockState();
      await loadForms(selectedForm, selectedName, preservePrices);
    }

    async function initSelectors() {
      const reqId = ++reqCounter.types;
      const localTypes = uniqueValues([...localProducts.map(productType), ...(originalValues.type ? [originalValues.type] : [])]);
      resetSelect(type, '-- Chọn Loại Sản Phẩm --', localTypes, originalValues.type, isLocked());

      // Dựng tức thời từ localProducts nếu có để không nhấp nháy
      if (localProducts.length) {
        const initSuppliers = uniqueValues([
          ...localProducts.filter(p => sameText(productType(p), type.value)).map(productSupplier),
          ...(originalValues.supplier ? [originalValues.supplier] : [])
        ]);
        resetSelect(supplier, '-- Chọn NCC --', initSuppliers, originalValues.supplier, isLocked() || !type.value);
        const initForms = uniqueValues([
          ...localProducts.filter(p => sameText(productType(p), type.value) && sameText(productSupplier(p), supplier.value)).map(productForm),
          ...(originalValues.form ? [originalValues.form] : [])
        ]);
        resetSelect(form, '-- Chọn Hình Thức --', initForms, originalValues.form, isLocked() || !supplier.value);
        const initPackages = localProducts.filter(p =>
          sameText(productType(p), type.value) && sameText(productSupplier(p), supplier.value) && sameText(productForm(p), form.value)
        );
        renderPackageSelect(initPackages, originalValues.name, true);
      } else {
        resetSelect(supplier, '-- Chọn NCC --', originalValues.supplier ? [originalValues.supplier] : [], originalValues.supplier, true);
        resetSelect(form, '-- Chọn Hình Thức --', originalValues.form ? [originalValues.form] : [], originalValues.form, true);
        renderPackageSelect([], originalValues.name, true);
      }

      if (typeof fetch === 'function') {
        try {
          const data = await fetchSanPhamOptions({});
          if (reqId !== reqCounter.types || !type.isConnected) return;
          const apiTypes = uniqueValues([...(data.values || []), ...(originalValues.type ? [originalValues.type] : [])]);
          if (apiTypes.length) {
            resetSelect(type, '-- Chọn Loại Sản Phẩm --', apiTypes, type.value || originalValues.type, isLocked());
          }
        } catch (_) {}
      }
      await loadSuppliers(supplier.value || originalValues.supplier, form.value || originalValues.form, originalValues.name || name.dataset.saveValue || '', true);
    }

    type.addEventListener('change', () => {
      clearPrices();
      loadSuppliers('', '', '', false);
    });
    supplier.addEventListener('change', () => {
      clearPrices();
      loadForms('', '', false);
    });
    form.addEventListener('change', () => {
      clearPrices();
      loadNames('', false);
    });
    name.addEventListener('change', () => {
      if (name.value === '__legacy__') {
        name.dataset.saveValue = originalValues.name;
        return;
      }
      const selectedProduct = packageList[Number(name.value)];
      if (selectedProduct) {
        name.dataset.saveValue = productName(selectedProduct);
        updatePrices(selectedProduct);
      } else {
        name.dataset.saveValue = '';
        clearPrices();
      }
    });

    container._syncOrderEditProductLock = applyLockState;
    initSelectors();
  };
})();
