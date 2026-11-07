/**
 * Hộ Số Định Kèm Component
 * Module độc lập, tái sử dụng cho upload nhiều file
 */

class HoSoDinhKem {
  constructor(containerId, config = {}) {
    this.containerId = containerId;
    this.files = {};
    
    // Cấu hình mặc định
    this.config = {
      maxSize: 5 * 1024 * 1024, // 5MB
      fields: [
        { id: 'hopDong', label: 'Hợp Đồng / GDK', accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx' },
        { id: 'xacNhan', label: 'Xác Nhận / BBBG', accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx' },
        { id: 'gpkd', label: 'GPKD', accept: '.pdf,.jpg,.jpeg,.png' },
        { id: 'cccd', label: 'CCCD', accept: '.pdf,.jpg,.jpeg,.png' },
        { id: 'fileTong', label: 'File tổng', accept: '.rar,.zip' }
      ],
      hienThiNutThaoTac: true,
      onFileChange: null,
      onValidationError: null,
      ...config
    };

    this.init();
  }

  init() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container #${this.containerId} không tìm thấy`);
      return;
    }

    // Khởi tạo file object
    this.config.fields.forEach(field => {
      this.files[field.id] = null;
    });

    this.render();
    this.attachEventListeners();
  }

  render() {
    const container = document.getElementById(this.containerId);
    const fieldsHtml = this.config.fields.map(field => `
      <div class="hos-file-item">
        <label class="hos-file-label">${field.label}</label>
        <div class="hos-file-upload">
          <label class="hos-file-btn">
            <i class="fa-solid fa-upload"></i> Chọn Tệp
            <input type="file" id="hos_input_${field.id}" accept="${field.accept}" style="display: none;">
          </label>
          <span class="hos-file-status" id="hos_status_${field.id}">
            <i class="fa-solid fa-circle-xmark"></i> Chưa chọn
          </span>
        </div>
        <small class="hos-file-hint">${field.id === 'fileTong' ? 'RAR/ZIP, tối đa 5MB' : 'Tối đa 5MB'}</small>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="hos-container">
        <div class="hos-grid">
          ${fieldsHtml}
        </div>
        ${this.config.hienThiNutThaoTac ? `<div class="hos-actions">
          <button type="button" class="hos-btn hos-btn-secondary" id="hos_btn_clear">
            <i class="fa-solid fa-rotate-left"></i> Xóa
          </button>
          <button type="button" class="hos-btn hos-btn-primary" id="hos_btn_submit">
            <i class="fa-solid fa-check"></i> Tiếp Tục
          </button>
        </div>` : ''}
      </div>
    `;

    HoSoDinhKem.addStyles();
  }

  static addStyles() {
    if (document.getElementById('hos-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'hos-styles';
    style.textContent = `
      .hos-container {
        padding: 0;
      }

      .hos-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .hos-file-item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .hos-file-label {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-main, #0f172a);
        display: block;
      }

      .hos-file-upload {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }

      .hos-file-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.6rem 0.8rem;
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        color: #1f2937;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.85rem;
        transition: all 0.2s ease;
        min-height: 38px;
      }

      .hos-file-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
      }

      .hos-file-status {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 0.8rem;
        background: var(--input-bg, #f7fcfd);
        border: 1px solid var(--input-border, rgba(15, 91, 105, 0.16));
        border-radius: 8px;
        font-size: 0.85rem;
        color: var(--text-muted, #64748b);
        min-height: 38px;
        align-items: center;
        word-break: break-word;
      }

      .hos-file-status.ok {
        color: #10b981;
        border-color: #10b981;
        background: rgba(16, 185, 129, 0.1);
      }

      .hos-file-status i {
        font-size: 0.9rem;
        flex-shrink: 0;
      }

      .hos-file-hint {
        font-size: 0.75rem;
        color: var(--text-subtle, #94a3b8);
        display: block;
      }

      .hos-actions {
        display: flex;
        gap: 0.8rem;
        justify-content: flex-end;
        padding-top: 1rem;
        border-top: 1px solid var(--border-color, rgba(15, 91, 105, 0.14));
      }

      .hos-btn {
        padding: 0.65rem 1.5rem;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        transition: all 0.2s ease;
      }

      .hos-btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-muted, #64748b);
        border: 1px solid var(--border-color, rgba(15, 91, 105, 0.14));
      }

      .hos-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: var(--border-strong, rgba(15, 91, 105, 0.24));
        transform: translateY(-2px);
      }

      .hos-btn-primary {
        background: linear-gradient(135deg, #0284c7 0%, #06b6d4 100%);
        color: white;
        border: none;
      }

      .hos-btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
      }

      .hos-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      @media (max-width: 1200px) {
        .hos-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      @media (max-width: 768px) {
        .hos-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 480px) {
        .hos-grid {
          grid-template-columns: 1fr;
        }

        .hos-actions {
          flex-direction: column-reverse;
        }

        .hos-btn {
          width: 100%;
          justify-content: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  attachEventListeners() {
    this.config.fields.forEach(field => {
      const input = document.getElementById(`hos_input_${field.id}`);
      if (input) {
        input.addEventListener('change', (e) => this.handleFileSelect(e, field));
      }
    });

    const btnClear = document.getElementById('hos_btn_clear');
    if (btnClear) {
      btnClear.addEventListener('click', () => this.clear());
    }

    const btnSubmit = document.getElementById('hos_btn_submit');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => this.submit());
    }
  }

  handleFileSelect(event, field) {
    const input = event.target;
    const file = input.files[0];
    const statusEl = document.getElementById(`hos_status_${field.id}`);

    if (!file) {
      this.files[field.id] = null;
      this.updateStatus(statusEl, false, 'Chưa chọn');
      return;
    }

    // Kiểm tra kích thước
    if (file.size > this.config.maxSize) {
      this.error(`Tệp ${file.name} vượt quá 5MB`);
      input.value = '';
      this.files[field.id] = null;
      this.updateStatus(statusEl, false, 'Chưa chọn');
      return;
    }

    // Kiểm tra định dạng file tổng
    if (field.id === 'fileTong') {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['rar', 'zip'].includes(ext)) {
        this.error('File tổng chỉ nhận RAR/ZIP');
        input.value = '';
        this.files[field.id] = null;
        this.updateStatus(statusEl, false, 'Chưa chọn');
        return;
      }
    }

    this.files[field.id] = file;
    this.updateStatus(statusEl, true, file.name);

    if (this.config.onFileChange) {
      this.config.onFileChange(field.id, file);
    }
  }

  updateStatus(el, ok, text) {
    el.classList.toggle('ok', ok);
    const icon = ok ? 'fa-check-circle' : 'fa-circle-xmark';
    el.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${text}</span>`;
  }

  clear() {
    this.config.fields.forEach(field => {
      const input = document.getElementById(`hos_input_${field.id}`);
      if (input) input.value = '';
      this.files[field.id] = null;
      const statusEl = document.getElementById(`hos_status_${field.id}`);
      this.updateStatus(statusEl, false, 'Chưa chọn');
    });
  }

  async submit() {
    const hasFiles = Object.values(this.files).some(f => f !== null);
    if (!hasFiles) {
      this.error('Vui lòng chọn ít nhất một tệp');
      return;
    }

    const formData = new FormData();
    Object.entries(this.files).forEach(([key, file]) => {
      if (file) formData.append(key, file);
    });

    try {
      const token = localStorage.getItem('datags_auth_token') || '';
      const response = await fetch('/api/orders/upload-attachments', {
        method: 'POST',
        body: formData,
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Upload thất bại');

      this.success('Upload thành công!');
      if (window.onHoSoDinhKemSubmit) window.onHoSoDinhKemSubmit(result);
    } catch (err) {
      this.error(`Lỗi: ${err.message}`);
    }
  }

  error(msg) {
    console.error('[HoSoDinhKem]', msg);
    if (this.config.onValidationError) {
      this.config.onValidationError(msg);
    }
  }

  success(msg) {
    console.log('[HoSoDinhKem]', msg);
  }

  getFiles() {
    return this.files;
  }

  addField(field) {
    this.config.fields.push(field);
    this.files[field.id] = null;
    this.render();
    this.attachEventListeners();
  }

  removeField(fieldId) {
    this.config.fields = this.config.fields.filter(f => f.id !== fieldId);
    delete this.files[fieldId];
    this.render();
    this.attachEventListeners();
  }
}

// Export cho các môi trường khác nhau
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HoSoDinhKem;
}
