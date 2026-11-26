(function () {
  const DANH_SACH_BANG = [
    { key: 'donHang', ten: 'Đơn hàng', moTa: 'Collection GS-DONHANG → Tab GS-DONHANG (loại trừ mã KL...)', icon: 'fa-file-invoice' },
    { key: 'thanhToan', ten: 'Thanh toán NCC & NV', moTa: 'SupplierPayment & EmployeePayment → Tab TTNCC, TTNhanVien', icon: 'fa-money-bill-transfer' },
    { key: 'giaoNhan', ten: 'Giao nhận', moTa: 'ChuyenPhatNhanh → Tab ChuyenPhatNhanh', icon: 'fa-truck-fast' },
    { key: 'hoSo', ten: 'Hồ sơ', moTa: 'HoSo → Tab Hoso', icon: 'fa-folder-open' }
  ];

  const TEN_BANG = {
    'tat-ca': 'Tất cả 4 bảng',
    donHang: 'Đơn hàng',
    thanhToan: 'Thanh toán NCC & NV',
    giaoNhan: 'Giao nhận',
    hoSo: 'Hồ sơ'
  };

  function thoatHtml(giaTri) {
    return String(giaTri ?? '').replace(/[&<>"']/g, kyTu => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[kyTu]);
  }

  function dinhDangGio(iso) {
    if (!iso) return 'Chưa chạy';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('vi-VN');
  }

  function nhanTrangThai(status) {
    if (status === 'success') return { lop: 'status-yes', nhan: 'Thành công' };
    if (status === 'running') return { lop: 'status-pending', nhan: 'Đang chạy' };
    if (status === 'partial-error') return { lop: 'status-pending', nhan: 'Lỗi một phần' };
    if (status === 'error') return { lop: 'status-no', nhan: 'Lỗi' };
    return { lop: 'status-pending', nhan: 'Chờ chạy' };
  }

  window.GhiNhanCapNhat = {
    render(container, options = {}) {
      if (!container) return;
      let trangThai = null;
      let lichSu = { items: [], page: 1, totalPages: 1, total: 0 };
      let dangTai = false;
      let dangDongBo = false;
      let bangDangChay = '';
      let thongBao = '';

      container.innerHTML = `<section style="display:grid;gap:1rem;width:100%;">
        <div class="overview-card" style="display:flex;align-items:center;justify-content:space-between;gap:.85rem;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;">
            ${typeof options.onBack === 'function' ? '<button type="button" class="btn btn-secondary" data-gn-back><i class="fa-solid fa-arrow-left"></i> Quay lại Công Cụ</button>' : ''}
            <div>
              <h3 style="margin:0;color:var(--text-main);font-size:1.05rem;"><i class="fa-solid fa-cloud-arrow-up" style="color:var(--primary);margin-right:6px;"></i>Ghi Nhận Cập Nhật Google Sheet</h3>
              <span class="cell-sub" data-gn-subtitle>Đồng bộ 1 chiều từ MongoDB (DATAGS) lên Google Sheet · Tự động 20:00 (UTC+7)</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" data-gn-refresh><i class="fa-solid fa-rotate"></i> Làm mới</button>
            <button type="button" class="btn btn-primary" data-gn-sync-all><i class="fa-solid fa-cloud-arrow-up"></i> Cập nhật tất cả lên Sheet</button>
          </div>
        </div>
        <div data-gn-message role="status" style="display:none;"></div>
        <div data-gn-overview class="overview-card"></div>
        <div data-gn-cards style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.85rem;"></div>
        <div class="overview-card">
          <div class="overview-card-title" style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;flex-wrap:wrap;">
            <span><i class="fa-solid fa-clock-rotate-left"></i> Lịch Sử Ghi Nhận Cập Nhật</span>
            <span class="cell-sub" data-gn-history-total></span>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;">
              <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Phạm vi</th><th style="text-align:right;">Số dòng cập nhật / thêm</th><th>Trạng thái</th></tr></thead>
              <tbody data-gn-history-body><tr><td colspan="5" class="empty-state">Đang tải lịch sử...</td></tr></tbody>
            </table>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-top:.75rem;flex-wrap:wrap;">
            <span class="cell-sub" data-gn-history-page>Trang 1/1</span>
            <div style="display:flex;gap:.45rem;">
              <button type="button" class="btn btn-secondary" data-gn-prev disabled>Trước</button>
              <button type="button" class="btn btn-secondary" data-gn-next disabled>Tiếp</button>
            </div>
          </div>
        </div>
      </section>`;

      const el = attr => container.querySelector(`[data-gn-${attr}]`);

      function veTrangThai() {
        const st = trangThai || {};
        const tt = nhanTrangThai(st.status);
        const dangChay = dangDongBo || st.running;
        el('overview').innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;">
            <span class="status-badge ${tt.lop}">${tt.nhan}</span>
            <span class="cell-sub" style="margin:0;">Lần chạy gần nhất: <strong style="color:var(--text-main);">${thoatHtml(dinhDangGio(st.at))}</strong></span>
            <span class="cell-sub" style="margin:0;">Lịch tự động kế tiếp: <strong style="color:var(--primary);">${thoatHtml(dinhDangGio(st.nextRunAt))}</strong></span>
          </div>
          ${st.error ? `<span style="color:#f43f5e;font-size:.78rem;font-weight:600;">Lỗi: ${thoatHtml(st.error)}</span>` : ''}
        </div>`;

        el('cards').innerHTML = DANH_SACH_BANG.map(bang => {
          const info = st.tables?.[bang.key] || {};
          const bStatus = nhanTrangThai(info.status);
          const dangChayBang = dangChay && bangDangChay === bang.key;
          const coSoLieu = info.total !== undefined;
          return `<div class="overview-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:.75rem;">
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.4rem;">
                <strong style="color:var(--text-main);font-size:.92rem;"><i class="fa-solid ${bang.icon}" style="color:var(--primary);margin-right:6px;"></i>${bang.ten}</strong>
                <span class="status-badge ${bStatus.lop}">${bStatus.nhan}</span>
              </div>
              <p class="cell-sub" style="margin:0 0 .6rem;">${bang.moTa}</p>
              ${coSoLieu ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.35rem .6rem;font-size:.76rem;color:var(--text-muted);">
                <span>Tổng quét: <strong style="color:var(--text-main);">${Number(info.total || 0).toLocaleString('vi-VN')}</strong></span>
                <span>Cập nhật: <strong style="color:var(--primary);">${Number(info.updated || 0).toLocaleString('vi-VN')}</strong></span>
                <span>Thêm mới: <strong style="color:#34d399;">${Number(info.appended || 0).toLocaleString('vi-VN')}</strong></span>
                <span>Không đổi: <strong>${Number(info.skippedUnchanged || 0).toLocaleString('vi-VN')}</strong></span>
              </div>` : `<div class="cell-sub">Cập nhật gần nhất: ${thoatHtml(dinhDangGio(info.at))}</div>`}
              ${info.error ? `<div style="margin-top:.45rem;color:#f43f5e;font-size:.75rem;">${thoatHtml(info.error)}</div>` : ''}
            </div>
            <button type="button" class="btn btn-secondary" data-gn-sync-one="${bang.key}" ${dangChay ? 'disabled' : ''}>
              <i class="fa-solid ${dangChayBang ? 'fa-spinner fa-spin' : 'fa-play'}"></i> ${dangChayBang ? 'Đang cập nhật...' : 'Cập nhật ngay'}
            </button>
          </div>`;
        }).join('');

        const btnAll = el('sync-all');
        if (btnAll) {
          btnAll.disabled = Boolean(dangChay);
          btnAll.innerHTML = dangChay && bangDangChay === 'tat-ca'
            ? '<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật tất cả...'
            : '<i class="fa-solid fa-cloud-arrow-up"></i> Cập nhật tất cả lên Sheet';
        }
        const msgBox = el('message');
        if (msgBox) {
          msgBox.style.display = thongBao ? 'block' : 'none';
          msgBox.className = 'overview-card';
          msgBox.textContent = thongBao;
        }
      }

      function veLichSu() {
        const body = el('history-body');
        el('history-total').textContent = `${lichSu.total || 0} lượt cập nhật`;
        el('history-page').textContent = `Trang ${lichSu.page || 1}/${lichSu.totalPages || 1}`;
        el('prev').disabled = (lichSu.page || 1) <= 1;
        el('next').disabled = (lichSu.page || 1) >= (lichSu.totalPages || 1);
        if (!lichSu.items.length) {
          body.innerHTML = '<tr><td colspan="5" class="empty-state">Chưa có lịch sử ghi nhận cập nhật nào.</td></tr>';
          return;
        }
        body.innerHTML = lichSu.items.map(item => {
          const scope = TEN_BANG[item.recordId] || item.recordId || 'Tất cả';
          const count = Number(item.after?.soLuong ?? 0);
          const st = nhanTrangThai(item.after?.status || 'success');
          return `<tr>
            <td>${thoatHtml(dinhDangGio(item.createdAt))}</td>
            <td><strong>${thoatHtml(item.actorUsername || '--')}</strong></td>
            <td>${thoatHtml(scope)}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums;"><strong>${count.toLocaleString('vi-VN')}</strong></td>
            <td><span class="status-badge ${st.lop}">${st.nhan}</span></td>
          </tr>`;
        }).join('');
      }

      async function taiDuLieu(page = lichSu.page || 1) {
        if (dangTai) return;
        dangTai = true;
        try {
          const [resStatus, resHistory] = await Promise.all([
            fetch(`${window.API_BASE_URL}/api/sync/google-sheet/status`),
            fetch(`${window.API_BASE_URL}/api/sync/google-sheet/history?page=${page}&limit=20`)
          ]);
          const jsonStatus = await resStatus.json();
          const jsonHistory = await resHistory.json();
          if (resStatus.ok && jsonStatus.success) trangThai = jsonStatus.data;
          if (resHistory.ok && jsonHistory.success) lichSu = jsonHistory.data;
          if (!container.isConnected) return;
          veTrangThai();
          veLichSu();
        } catch (loi) {
          thongBao = `Không thể tải trạng thái đồng bộ: ${loi.message}`;
          if (container.isConnected) veTrangThai();
        } finally {
          dangTai = false;
        }
      }

      async function chayCapNhat(bang) {
        if (dangDongBo) return;
        const nhan = bang ? (TEN_BANG[bang] || bang) : 'tất cả các bảng';
        if (!window.confirm(`Xác nhận ghi nhận cập nhật ${nhan} từ MongoDB lên Google Sheet?`)) return;
        dangDongBo = true;
        bangDangChay = bang || 'tat-ca';
        thongBao = '';
        veTrangThai();
        try {
          const res = await fetch(`${window.API_BASE_URL}/api/sync/google-sheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bang ? { bang } : {})
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.message || 'Không thể cập nhật Google Sheet.');
          if (json.data?.skipped) {
            thongBao = 'Phiên đồng bộ khác đang chạy hoặc tính năng xuất Sheet đang tắt.';
          } else {
            const tong = Object.values(json.data?.tables || {}).reduce(
              (s, t) => s + (Number(t?.updated) || 0) + (Number(t?.appended) || 0), 0
            );
            thongBao = `Đã ghi nhận cập nhật ${nhan} lên Google Sheet (${tong.toLocaleString('vi-VN')} dòng cập nhật/thêm mới).`;
            window.showAppToast?.(thongBao, 'Ghi Nhận Cập Nhật');
          }
          await taiDuLieu(1);
        } catch (loi) {
          thongBao = `Lỗi cập nhật Google Sheet: ${loi.message}`;
          window.showAppToast?.(thongBao, 'Lỗi cập nhật');
        } finally {
          dangDongBo = false;
          bangDangChay = '';
          if (container.isConnected) veTrangThai();
        }
      }

      container.addEventListener('click', suKien => {
        if (suKien.target.closest('[data-gn-back]')) return options.onBack?.();
        if (suKien.target.closest('[data-gn-refresh]')) return taiDuLieu(lichSu.page || 1);
        if (suKien.target.closest('[data-gn-sync-all]')) return chayCapNhat('');
        const one = suKien.target.closest('[data-gn-sync-one]');
        if (one) return chayCapNhat(one.dataset.gnSyncOne);
        if (suKien.target.closest('[data-gn-prev]') && lichSu.page > 1) return taiDuLieu(lichSu.page - 1);
        if (suKien.target.closest('[data-gn-next]') && lichSu.page < lichSu.totalPages) return taiDuLieu(lichSu.page + 1);
      });

      veTrangThai();
      taiDuLieu(1);
    }
  };
})();
