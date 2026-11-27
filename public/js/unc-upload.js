// Form gửi phiếu UNC (có ngày thanh toán). Ghi đè hàm cũ trong HTML.
(function () {
  const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const CAU_HINH_NEN_UNC = { maxDimension: 1280, quality: 0.72, minCompressBytes: 40 * 1024, preferWebp: true };
  let previewObjectUrl = '';
  let pasteHandler = null;
  let lanDocAi = 0;
  let tepUncDaNen = null;

  function xoaPreviewUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = '';
    }
    tepUncDaNen = null;
  }

  function uocLuongBytesDataUrl(dataUrl) {
    const idx = String(dataUrl || '').indexOf(',');
    if (idx < 0) return 0;
    const base64 = dataUrl.slice(idx + 1).replace(/=+$/, '');
    return Math.floor((base64.length * 3) / 4);
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  window.closePaymentUploadModal = function () {
    lanDocAi += 1;
    xoaPreviewUrl();
    if (pasteHandler && typeof document.removeEventListener === 'function') {
      document.removeEventListener('paste', pasteHandler);
    }
    pasteHandler = null;
    document.getElementById('paymentUploadModal')?.remove();
  };

  window.xoaTepUncDaChon = function (event) {
    event?.stopPropagation();
    lanDocAi += 1;
    const input = document.getElementById('paymentUploadFile');
    if (input) input.value = '';
    window.showPaymentUploadFile(input);
  };

  function capNhatTrangThaiAi(trangThai, noiDungHtml = '') {
    const box = document.getElementById('paymentUploadAiStatus');
    if (!box) return;
    box.className = 'payment-upload-ai-status';
    if (!trangThai) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.classList.add(`is-${trangThai}`);
    box.innerHTML = noiDungHtml;
    box.hidden = false;
  }

  async function docFileSangDataUrl(file) {
    if (tepUncDaNen && tepUncDaNen.file === file && tepUncDaNen.dataUrl) {
      return tepUncDaNen.dataUrl;
    }
    let dataUrl;
    if (/^image\//i.test(String(file?.type || '')) && typeof window.nenTepTruocKhiTaiLen === 'function') {
      dataUrl = await window.nenTepTruocKhiTaiLen(file, CAU_HINH_NEN_UNC);
    } else {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Không thể đọc tệp UNC.'));
        reader.readAsDataURL(file);
      });
    }
    const bytesSauNen = uocLuongBytesDataUrl(dataUrl);
    tepUncDaNen = { file, dataUrl, bytesSauNen };
    const infoEl = document.querySelector('#paymentUploadPreview .payment-upload-preview-meta span');
    if (infoEl && file) {
      const origText = formatFileSize(file.size);
      const compText = formatFileSize(bytesSauNen);
      infoEl.textContent = origText && compText && bytesSauNen > 0 && bytesSauNen < file.size
        ? `${file.name} (${origText} → ${compText})`
        : (origText ? `${file.name} (${origText})` : file.name);
    }
    return dataUrl;
  }

  async function docUncBangAi(file) {
    const maLanDoc = ++lanDocAi;
    const modal = document.getElementById('paymentUploadModal');
    if (!file || !modal) return;
    if (file.size > 3 * 1024 * 1024) {
      capNhatTrangThaiAi('error', '<i class="fa-solid fa-triangle-exclamation"></i> Tệp vượt quá 3MB nên bỏ qua bước AI tự đọc.');
      return;
    }
    capNhatTrangThaiAi('loading', '<i class="fa-solid fa-wand-magic-sparkles fa-spin"></i> AI đang đọc số tiền, mã giao dịch, ngân hàng và nội dung...');
    try {
      const duLieuTep = await docFileSangDataUrl(file);
      if (maLanDoc !== lanDocAi || !document.getElementById('paymentUploadModal')) return;
      const response = await fetch(`${API_URL}/unc/doc-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duLieuTep })
      });
      const result = await response.json().catch(() => ({}));
      if (maLanDoc !== lanDocAi || !document.getElementById('paymentUploadModal')) return;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.message || 'AI chưa đọc được thông tin từ chứng từ.');
      }
      const { soTien, maGiaoDich, tenNganHang, noiDungChuyenKhoan, ngayThanhToan } = result.data;
      const amountEl = document.getElementById('paymentUploadAmount');
      const dateEl = document.getElementById('paymentUploadDate');
      const bankEl = document.getElementById('paymentUploadBank');
      const refEl = document.getElementById('paymentUploadRef');
      const noteEl = document.getElementById('paymentUploadNote');

      if (amountEl && Number.isSafeInteger(soTien) && soTien > 0) {
        amountEl.value = String(soTien);
        amountEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (dateEl && ngayThanhToan) {
        dateEl.value = ngayThanhToan;
      }
      if (bankEl && tenNganHang) {
        bankEl.value = tenNganHang;
      }
      if (refEl && maGiaoDich) {
        refEl.value = maGiaoDich;
      }
      if (noteEl && noiDungChuyenKhoan) {
        noteEl.value = noiDungChuyenKhoan;
      }

      const chips = [];
      if (Number.isSafeInteger(soTien) && soTien > 0) chips.push(`Số tiền: <strong>${soTien.toLocaleString('vi-VN')} đ</strong>`);
      if (tenNganHang) chips.push(`Ngân hàng: <strong>${escapeHtml(tenNganHang)}</strong>`);
      if (maGiaoDich) chips.push(`Mã GD: <strong>${escapeHtml(maGiaoDich)}</strong>`);
      if (ngayThanhToan) chips.push(`Ngày: <strong>${escapeHtml(ngayThanhToan.split('-').reverse().join('/'))}</strong>`);
      if (noiDungChuyenKhoan) chips.push(`Nội dung: <strong>${escapeHtml(noiDungChuyenKhoan)}</strong>`);

      if (!chips.length) {
        capNhatTrangThaiAi('error', '<i class="fa-solid fa-circle-info"></i> AI chưa nhận diện rõ thông tin trên ảnh. Anh vui lòng nhập tay.');
      } else {
        capNhatTrangThaiAi(
          'success',
          `<div class="payment-upload-ai-title"><i class="fa-solid fa-wand-magic-sparkles"></i> AI đã đọc và điền sẵn thông tin (vui lòng kiểm tra lại)</div><div class="payment-upload-ai-grid">${chips.map(c => `<span class="payment-upload-ai-chip">${c}</span>`).join('')}</div>`
        );
      }
    } catch (error) {
      if (maLanDoc !== lanDocAi || !document.getElementById('paymentUploadModal')) return;
      capNhatTrangThaiAi('error', `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(error.message || 'Không thể đọc tự động.')} (Vẫn có thể nhập tay bình thường)`);
    }
  }

  window.showPaymentUploadFile = function (input) {
    const file = input?.files?.[0];
    const dropzone = document.querySelector('#paymentUploadModal .payment-upload-dropzone');
    const placeholder = document.getElementById('paymentUploadPlaceholder');
    const preview = document.getElementById('paymentUploadPreview');
    const label = document.getElementById('paymentUploadFileName');
    xoaPreviewUrl();

    if (!file) {
      if (label) label.textContent = 'PNG, JPG, PDF tối đa 3MB';
      if (placeholder) placeholder.hidden = false;
      if (preview) {
        preview.hidden = true;
        preview.replaceChildren();
      }
      dropzone?.classList.remove('has-preview');
      capNhatTrangThaiAi('');
      return;
    }

    if (label) label.textContent = file.name;
    if (!preview || !placeholder) return;

    const mime = String(file.type || '').toLowerCase();
    const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(file.name);

    previewObjectUrl = URL.createObjectURL(file);
    preview.replaceChildren();

    if (isImage) {
      const img = document.createElement('img');
      img.className = 'payment-upload-preview-img';
      img.src = previewObjectUrl;
      img.alt = file.name;
      preview.append(img);
    } else if (isPdf) {
      const frame = document.createElement('iframe');
      frame.className = 'payment-upload-preview-pdf';
      frame.src = `${previewObjectUrl}#toolbar=0&navpanes=0`;
      frame.title = file.name;
      frame.addEventListener('click', e => e.stopPropagation());
      preview.append(frame);
    }

    const meta = document.createElement('div');
    meta.className = 'payment-upload-preview-meta';
    meta.addEventListener('click', e => e.stopPropagation());

    const info = document.createElement('span');
    const sizeText = formatFileSize(file.size);
    info.textContent = sizeText ? `${file.name} (${sizeText})` : file.name;

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'payment-upload-clear-btn';
    clearBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Xóa';
    clearBtn.onclick = e => window.xoaTepUncDaChon(e);

    meta.append(info, clearBtn);
    preview.append(meta);

    placeholder.hidden = true;
    preview.hidden = false;
    dropzone?.classList.add('has-preview');
    docUncBangAi(file);
  };

  window.openPaymentUploadModal = function (orderId) {
    closePaymentUploadModal();
    const order = filteredOrders.find(item => String(item._id) === String(orderId)) || allOrders.find(item => String(item._id) === String(orderId));
    if (!order) return;
    const customer = order['Tên Khách Hàng'] || order['Tên Công Ty '] || '--';
    const nhieuSanPham = Array.isArray(order.chiTietSanPham);
    document.body.insertAdjacentHTML('beforeend', `<div class="modal payment-upload-modal active" id="paymentUploadModal" onclick="if(event.target === this) closePaymentUploadModal()"><div class="modal-content"><div class="modal-header"><h3><i class="fa-solid fa-cloud-arrow-up"></i> Gửi phiếu UNC</h3><button type="button" class="modal-close-btn" onclick="closePaymentUploadModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="payment-upload-order">Đơn <strong>${escapeHtml(order['Mã Đơn Hàng'] || '--')}</strong> - ${escapeHtml(customer)}</div><div class="payment-upload-form"><div class="payment-upload-row"><div class="form-group"><label class="form-label">Số tiền UNC <span style="color:#f43f5e">*</span></label><input id="paymentUploadAmount" class="form-input" type="number" min="1" step="1" placeholder="VD: 1688000"></div><div class="form-group"><label class="form-label">Ngày thanh toán <span style="color:#f43f5e">*</span></label><input id="paymentUploadDate" class="form-input" type="date" value="${todayIso()}"></div></div><div class="payment-upload-row"><div class="form-group"><label class="form-label">Tên ngân hàng</label><input id="paymentUploadBank" class="form-input" placeholder="VD: Vietcombank, ACB, MB..."></div><div class="form-group"><label class="form-label">Mã giao dịch / Tham chiếu</label><input id="paymentUploadRef" class="form-input" placeholder="VD: FT26331..., 55250..."></div></div><div class="form-group"><label class="form-label">Nội dung chuyển khoản / Ghi chú</label><input id="paymentUploadNote" class="form-input" placeholder="VD: DH1126-00026 thanh toan..."></div><div class="form-group"><label class="form-label">Ảnh UNC / giấy báo Có</label><div class="payment-upload-dropzone" onclick="document.getElementById('paymentUploadFile').click()"><div id="paymentUploadPlaceholder" class="payment-upload-placeholder"><i class="fa-solid fa-cloud-arrow-up"></i><span>Kéo thả, dán ảnh (Ctrl+V) hoặc bấm để chọn tệp</span><small id="paymentUploadFileName">PNG, JPG, PDF tối đa 3MB</small></div><div id="paymentUploadPreview" class="payment-upload-preview" hidden></div><input id="paymentUploadFile" type="file" accept="image/*,.pdf" hidden onchange="showPaymentUploadFile(this)"></div><div id="paymentUploadAiStatus" class="payment-upload-ai-status" hidden></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closePaymentUploadModal()">Hủy</button><button type="button" class="btn btn-primary" onclick="submitPaymentUpload('${escapeHtml(order._id)}')"><i class="fa-solid fa-paper-plane"></i> Gửi yêu cầu</button></div></div></div>`);
    const dropzone = document.querySelector('#paymentUploadModal .payment-upload-dropzone');
    dropzone?.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('is-dragover'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone?.addEventListener('drop', event => { event.preventDefault(); dropzone.classList.remove('is-dragover'); const input = document.getElementById('paymentUploadFile'); if (event.dataTransfer.files.length) { input.files = event.dataTransfer.files; showPaymentUploadFile(input); } });
    pasteHandler = event => {
      if (!document.getElementById('paymentUploadModal')) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          const input = document.getElementById('paymentUploadFile');
          if (file && input && typeof DataTransfer === 'function') {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            showPaymentUploadFile(input);
          }
          break;
        }
      }
    };
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('paste', pasteHandler);
    }
    if (nhieuSanPham) {
      const modal = document.getElementById('paymentUploadModal');
      modal.dataset.nhieuSanPham = 'true';
      const khuVuc = document.createElement('div');
      khuVuc.className = 'payment-upload-phan-bo';
      const tieuDe = document.createElement('strong');
      tieuDe.textContent = 'Chọn dòng sản phẩm và số tiền phân bổ';
      khuVuc.append(tieuDe);
      order.chiTietSanPham.forEach((dong, viTri) => {
        const nhan = document.createElement('label');
        nhan.className = 'payment-upload-dong';
        const ten = document.createElement('span');
        ten.textContent = `${viTri + 1}. ${dong.tenSanPham || 'Sản phẩm không hiển thị'}`;
        const tien = document.createElement('input');
        tien.type = 'number';
        tien.min = '0';
        tien.step = '1';
        tien.className = 'form-input';
        tien.placeholder = 'Không phân bổ';
        tien.dataset.maDong = dong.maDong || '';
        tien.setAttribute('aria-label', `Số tiền phân bổ cho ${dong.tenSanPham || `dòng ${viTri + 1}`}`);
        tien.addEventListener('input', capNhatPhanBo);
        nhan.append(ten, tien);
        khuVuc.append(nhan);
      });
      const ketQua = document.createElement('p');
      ketQua.setAttribute('role', 'status');
      const canhBao = document.createElement('p');
      canhBao.className = 'payment-upload-canh-bao';
      canhBao.textContent = 'Đang kiểm tra chức năng UNC nhiều sản phẩm...';
      khuVuc.append(ketQua, canhBao);
      modal.querySelector('.payment-upload-form').append(khuVuc);
      modal.querySelector('.modal-footer .btn-primary').disabled = true;
      const soTienUnc = document.getElementById('paymentUploadAmount');
      soTienUnc.addEventListener('input', capNhatPhanBo);
      let lanTaiPhieu = 0;
      async function taiPhieu(trang) {
        const lanTai = ++lanTaiPhieu;
        try {
          const response = await fetch(`${API_URL}/unc-nhieu-san-pham/${encodeURIComponent(orderId)}?page=${trang}`);
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tải phiếu UNC.');
          if (document.getElementById('paymentUploadModal') !== modal || lanTai !== lanTaiPhieu) return;
          const daDu = result.data.tongPhieu >= 5;
          canhBao.textContent = daDu
            ? 'Đơn đã có tối đa 5 phiếu UNC; không thể gửi thêm.'
            : `Đã có ${result.data.tongPhieu}/5 phiếu UNC. Chỉ tiền đã duyệt mới được ghi nhận thanh toán.`;
          modal.querySelector('.modal-footer .btn-primary').disabled = daDu;
          let lichSu = modal.querySelector('.payment-upload-lich-su');
          if (!lichSu) {
            lichSu = document.createElement('div');
            lichSu.className = 'payment-upload-lich-su';
            khuVuc.append(lichSu);
          }
          lichSu.replaceChildren();
          const tieuDeLichSu = document.createElement('strong');
          tieuDeLichSu.textContent = 'Phiếu UNC của đơn';
          lichSu.append(tieuDeLichSu);
          result.data.items.forEach(phieu => {
            const dong = document.createElement('div');
            const thongTin = document.createElement('span');
            thongTin.textContent = `${phieu.ngay} · ${Number(phieu.soTien).toLocaleString('vi-VN')} đ · ${phieu.trangThai}`;
            dong.append(thongTin);
            if (phieu.tenTep) {
              const nutXem = document.createElement('button');
              nutXem.type = 'button';
              nutXem.className = 'btn btn-secondary';
              nutXem.textContent = 'Xem UNC';
              nutXem.addEventListener('click', async () => {
                nutXem.disabled = true;
                try {
                  const phanHoi = await fetch(`${API_URL}/unc-nhieu-san-pham/${encodeURIComponent(orderId)}/${encodeURIComponent(phieu.maPhieu)}/file`);
                  const ketQua = await phanHoi.json();
                  if (!phanHoi.ok || !ketQua.success) throw new Error(ketQua.message || 'Không thể tải tệp UNC.');
                  const { ten, duLieu } = ketQua.data;
                  const khung = document.getElementById('invoicePdfViewer');
                  const tai = document.getElementById('invoicePdfDownload');
                  document.getElementById('invoicePdfModal').classList.add('active');
                  tai.href = duLieu;
                  tai.download = ten;
                  tai.onclick = null;
                  if (duLieu.startsWith('data:application/pdf;base64,')) {
                    const dangHienThi = showInvoicePdf(duLieu);
                    tai.onclick = null;
                    await dangHienThi;
                  }
                  else if (duLieu.startsWith('data:image/')) {
                    const anh = document.createElement('img');
                    anh.src = duLieu;
                    anh.alt = ten;
                    anh.style.cssText = 'display:block;max-width:100%;max-height:100%;margin:auto;object-fit:contain;background:#fff';
                    khung.replaceChildren(anh);
                  } else {
                    khung.textContent = 'Định dạng này không hỗ trợ xem trực tiếp. Hãy bấm Tải xuống.';
                  }
                } catch (loi) { alert(`Không thể xem tệp UNC: ${loi.message}`); }
                finally { nutXem.disabled = false; }
              });
              dong.append(nutXem);
            }
            if (typeof currentUser !== 'undefined' && currentUser?.role?.name === 'Admin' && phieu.trangThai === 'Chờ Duyệt') {
              ['Đã Duyệt', 'Từ Chối'].forEach(trangThai => {
                const nut = document.createElement('button');
                nut.type = 'button';
                nut.className = 'btn btn-secondary';
                nut.textContent = trangThai === 'Đã Duyệt' ? 'Duyệt' : 'Từ chối';
                nut.addEventListener('click', async () => {
                  const lyDoTuChoi = trangThai === 'Từ Chối' ? window.prompt('Nhập lý do từ chối UNC:') : '';
                  if (lyDoTuChoi === null) return;
                  if (trangThai === 'Từ Chối' && !lyDoTuChoi.trim()) return alert('Vui lòng nhập lý do từ chối.');
                  nut.disabled = true;
                  try {
                    const phanHoi = await fetch(`${API_URL}/unc-nhieu-san-pham/${encodeURIComponent(orderId)}/${encodeURIComponent(phieu.maPhieu)}`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ trangThai, lyDoTuChoi })
                    });
                    const ketQua = await phanHoi.json();
                    if (!phanHoi.ok || !ketQua.success) throw new Error(ketQua.message || 'Không thể xử lý phiếu UNC.');
                    await taiPhieu(trang);
                  } catch (loi) { alert(`Không thể xử lý phiếu UNC: ${loi.message}`); nut.disabled = false; }
                });
                dong.append(nut);
              });
            }
            lichSu.append(dong);
          });
          if (!result.data.items.length) {
            const rong = document.createElement('p');
            rong.textContent = 'Chưa có phiếu UNC.';
            lichSu.append(rong);
          }
          for (const [nhan, trangMoi, hien] of [['Trước', trang - 1, trang > 1], ['Tiếp', trang + 1, result.data.hasMore]]) {
            if (!hien) continue;
            const nut = document.createElement('button');
            nut.type = 'button';
            nut.className = 'btn btn-secondary';
            nut.textContent = nhan;
            nut.addEventListener('click', () => taiPhieu(trangMoi));
            lichSu.append(nut);
          }
        } catch (loi) {
          if (document.getElementById('paymentUploadModal') !== modal || lanTai !== lanTaiPhieu) return;
          canhBao.textContent = `Không thể sử dụng UNC nhiều sản phẩm: ${loi.message}`;
          modal.querySelector('.modal-footer .btn-primary').disabled = true;
        }
      }
      taiPhieu(1);
      function capNhatPhanBo() {
        const giaTri = Array.from(khuVuc.querySelectorAll('input'), input => input.value.trim());
        const soTien = giaTri.filter(Boolean).map(Number);
        const tong = soTien.reduce((sum, tien) => sum + tien, 0);
        const unc = Number(soTienUnc.value);
        if (soTien.some(tien => !Number.isSafeInteger(tien) || tien < 0) || !Number.isSafeInteger(tong)) {
          ketQua.textContent = 'Số tiền phân bổ phải là số nguyên không âm hợp lệ.';
        } else if (soTienUnc.value && Number.isSafeInteger(unc) && unc >= 0 && tong > unc) {
          ketQua.textContent = 'Tổng phân bổ vượt số tiền UNC.';
        } else if (soTienUnc.value && Number.isSafeInteger(unc) && unc >= 0) {
          ketQua.textContent = `Đã phân bổ ${tong.toLocaleString('vi-VN')} đ · Chưa phân bổ ${(unc - tong).toLocaleString('vi-VN')} đ`;
        } else {
          ketQua.textContent = `Đã phân bổ ${tong.toLocaleString('vi-VN')} đ · Nhập số tiền UNC để xem phần còn lại.`;
        }
      }
      capNhatPhanBo();
    }
  };

  window.submitPaymentUpload = async function (orderId) {
    const modal = document.getElementById('paymentUploadModal');
    const nhieuSanPham = modal?.dataset.nhieuSanPham === 'true';
    const nutGui = modal?.querySelector('.modal-footer .btn-primary');
    if (nhieuSanPham && nutGui?.disabled) return alert('Chức năng UNC nhiều sản phẩm chưa sẵn sàng.');
    const amount = Number(document.getElementById('paymentUploadAmount')?.value || 0);
    const paymentDate = document.getElementById('paymentUploadDate')?.value || '';
    const bankName = document.getElementById('paymentUploadBank')?.value.trim() || '';
    const transRef = document.getElementById('paymentUploadRef')?.value.trim() || '';
    const note = document.getElementById('paymentUploadNote')?.value.trim() || '';
    const file = document.getElementById('paymentUploadFile')?.files?.[0];
    if (!Number.isFinite(amount) || amount <= 0) return alert('Vui lòng nhập số tiền UNC hợp lệ.');
    if (!paymentDate) return alert('Vui lòng chọn ngày thanh toán.');
    if (file && file.size > 3 * 1024 * 1024) return alert('Tệp UNC không được vượt quá 3MB.');
    let phanBo;
    if (nhieuSanPham) {
      if (!Number.isSafeInteger(amount)) return alert('Số tiền UNC phải là số nguyên hợp lệ.');
      const inputs = Array.from(modal.querySelectorAll('.payment-upload-phan-bo input'));
      if (inputs.some(input => input.value && (!Number.isSafeInteger(Number(input.value)) || Number(input.value) < 0 || !input.dataset.maDong))) return alert('Số tiền hoặc mã dòng phân bổ không hợp lệ.');
      phanBo = inputs.filter(input => Number(input.value) > 0).map(input => ({ maDong: input.dataset.maDong, soTien: Number(input.value) }));
      if (!phanBo.length) return alert('Vui lòng chọn ít nhất một dòng sản phẩm và nhập số tiền thanh toán.');
      const tong = phanBo.reduce((sum, muc) => sum + muc.soTien, 0);
      if (!Number.isSafeInteger(tong) || tong > amount) return alert('Tổng phân bổ vượt số tiền UNC hoặc vượt giới hạn cho phép.');
    }
    if (nutGui) nutGui.disabled = true;
    try {
      const imageData = file ? await docFileSangDataUrl(file) : '';
      const duLieu = nhieuSanPham
        ? { soTien: amount, ngay: paymentDate, tenNganHang: bankName, maGiaoDich: transRef, ghiChu: note, phanBo, ...(file ? { tep: { ten: file.name, duLieu: imageData } } : {}) }
        : { 'Số Tiền UNC': amount, 'Ngày Thanh Toán UNC': paymentDate, 'Tên Ngân Hàng UNC': bankName, 'Mã Giao Dịch UNC': transRef, 'Nội Dung UNC': note, ...(file ? { 'Ảnh UNC': imageData, 'Tên File UNC': file.name } : {}) };
      const response = await fetch(`${API_URL}/${nhieuSanPham ? 'unc-nhieu-san-pham' : 'unc'}/${encodeURIComponent(orderId)}`, { method: nhieuSanPham ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(duLieu) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể gửi phiếu UNC.');
      closePaymentUploadModal();
      showAppToast('Đã gửi phiếu UNC, chờ quản lý duyệt.');
      applyFilters();
    } catch (error) { alert(`Không thể gửi phiếu UNC: ${error.message}`); if (nutGui) nutGui.disabled = false; }
  };
})();