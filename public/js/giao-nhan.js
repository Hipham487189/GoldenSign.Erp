(function () {
  const trangThai = { tuKhoa: '', tinhTrang: '', trang: 1, gioiHan: 50 };
  let lanYeuCau = 0;
  let boHuyYeuCau = null;
  let nguoiDung = null;

  function thoatHtml(giaTri) {
    return String(giaTri ?? '').replace(/[&<>"']/g, kyTu => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[kyTu]);
  }

  async function goiApi(duongDan, tuyChon) {
    const phanHoi = await fetch(`${API_BASE_URL}/api/giao-nhan${duongDan}`, tuyChon);
    const ketQua = await phanHoi.json().catch(() => ({}));
    if (!phanHoi.ok || !ketQua.success) throw new Error(ketQua.message || 'Không thể tải dữ liệu giao nhận.');
    return ketQua;
  }

  function dangMoTrang() {
    return document.getElementById('menu-giao-nhan')?.classList.contains('active');
  }

  function layChiTiet(dong) {
    const cacNhom = [
      { ten: 'Doanh nghiệp / khách hàng', icon: 'fa-building', lop: 'giao-nhan-detail-customer', cot: [
        ['TÊN CÔNG TY', 'Tên công ty'], ['MST', 'MST'],
        ['TÊN KHÁCH HÀNG', 'Tên khách hàng'], ['SỐ ĐIỆN THOẠI', 'Số điện thoại']
      ] },
      { ten: 'Địa chỉ người nhận', icon: 'fa-location-dot', lop: 'giao-nhan-detail-address', cot: [
        ['ĐỊA CHỈ NGƯỜI NHẬN', 'Địa chỉ người nhận']
      ] },
      { ten: 'Thông tin phiếu', icon: 'fa-clipboard-list', cot: [
        ['NGÀY GỬI', 'Ngày gửi'], ['TÊN NHÂN VIÊN', 'Nhân viên gửi'],
        ['Nhân Viên Thực Hiện', 'Nhân viên thực hiện'], ['NGÀY THỰC HIỆN', 'Ngày thực hiện'],
        ['TÌNH TRẠNG', 'Tình trạng']
      ] },
      { ten: 'Nội dung & chuyển phát', icon: 'fa-truck-fast', cot: [
        ['LOẠI', 'Loại'], ['NCC', 'NCC'], ['LOẠI CÔNG VIỆC', 'Loại công việc'],
        ['MỤC ĐÍCH CPN', 'Mục đích CPN'], ['ĐƠN VỊ CPN', 'Đơn vị CPN'],
        ['SỐ  BILL', 'Số bill'], ['CHI PHÍ', 'Chi phí'], ['ĐÍNH KÈM', 'Đính kèm']
      ] },
      { ten: 'Ghi chú & theo dõi', icon: 'fa-note-sticky', cot: [
        ['GHI CHÚ NHU CẦU KHÁCH HÀNG', 'Ghi chú nhu cầu khách hàng'],
        ['GHI CHÚ\nCPN', 'Ghi chú CPN'], ['THANH TOÁN\nCHI PHÍ NV', 'Thanh toán chi phí nhân viên'],
        ['QUỐC AN\nCHECK FILE', 'Quốc An check file']
      ] }
    ];
    return `<header class="giao-nhan-detail-header">
      <div><span>CHI TIẾT GIAO NHẬN</span><h3 id="giaoNhanDetailTitle">${thoatHtml(dong.ID || dong.maSheet || '--')}</h3></div>
      <span class="giao-nhan-status">${thoatHtml(dong['TÌNH TRẠNG'] || 'Chưa cập nhật')}</span>
      <button type="button" class="giao-nhan-detail-close" data-dong-chi-tiet aria-label="Đóng chi tiết">&times;</button>
    </header><div class="giao-nhan-detail-body">${cacNhom.map(nhom => {
      const cacTruong = nhom.cot.filter(([cot]) => dong[cot] != null && dong[cot] !== '');
      return `<section class="giao-nhan-detail-group ${nhom.lop || ''}">
        <h4><i class="fa-solid ${nhom.icon}" aria-hidden="true"></i> ${nhom.ten}</h4>
        ${cacTruong.length ? `<dl>${cacTruong.map(([cot, ten]) => `<div${cot === 'CHI PHÍ' ? ' class="giao-nhan-detail-cost"' : ''}><dt>${thoatHtml(ten)}</dt><dd>${thoatHtml(dong[cot])}</dd></div>`).join('')}</dl>` : '<p>Chưa có thông tin.</p>'}
      </section>`;
    }).join('')}</div>
    <footer class="giao-nhan-detail-footer"><button type="button" class="btn btn-secondary" onclick="guiGiaoNhanVaoChat('${encodeURIComponent(JSON.stringify(dong))}')"><i class="fa-solid fa-comments"></i> Gửi vào Chat</button><button type="button" class="btn btn-primary" data-dong-chi-tiet>Đóng lại</button></footer>`;
  }

  window.guiGiaoNhanVaoChat = async function (dongMaHoa) {
    const dong = JSON.parse(decodeURIComponent(dongMaHoa));
    document.getElementById('giaoNhanDetail')?.close();
    await chuyenDuLieuVaoChat?.(`🚚 Giao nhận cần trao đổi\nMã giao nhận: ${dong.ID || dong.maSheet || '--'}\nMST: ${dong.MST || '--'}\nCông ty: ${dong['TÊN CÔNG TY'] || '--'}\nTình trạng: ${dong['TÌNH TRẠNG'] || 'Chưa cập nhật'}\nSố bill: ${dong['SỐ  BILL'] || '--'}`, { loai: 'giaonhan', nhan: `Giao nhận ${dong.ID || dong.maSheet || ''}`, ma: dong.ID || dong.maSheet || '', mst: dong.MST || '', trangThai: dong['TÌNH TRẠNG'] || '' });
  };

  function chuanHoaChuoi(giaTri) {
    return String(giaTri || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();
  }

  function suyRaQuyTrinhGiaoNhan(dong) {
    const qt = dong?.quyTrinhGiaoNhan && typeof dong.quyTrinhGiaoNhan === 'object' ? dong.quyTrinhGiaoNhan : {};
    const tinhTrang = chuanHoaChuoi(dong?.['TÌNH TRẠNG']);
    let buoc = ['da_kich_hoat', 'dang_giao', 'da_giao'].includes(qt.buocHienTai) ? qt.buocHienTai : '';
    if (!buoc) {
      if (/da giao|hoan thanh|da nhan/.test(tinhTrang)) buoc = 'da_giao';
      else if (/dang.*giao|tren duong|van chuyen/.test(tinhTrang)) buoc = 'dang_giao';
      else buoc = 'da_kich_hoat';
    }
    const nguoiGiao = String(qt.nguoiGiao || dong?.['Nhân Viên Thực Hiện'] || '').trim();
    const thuTu = { da_kich_hoat: 1, dang_giao: 2, da_giao: 3 }[buoc];
    return { buoc, nguoiGiao, thuTu, lichSu: Array.isArray(qt.lichSu) ? qt.lichSu : [] };
  }

  function coQuyenCapNhatQuyTrinh() {
    return nguoiDung?.isSuperAdmin || nguoiDung?.role?.name === 'Admin' || nguoiDung?.role?.permissions?.includes('manage_orders');
  }

  function veLuoiTramGiaoNhan(dong, chiSo) {
    const qt = suyRaQuyTrinhGiaoNhan(dong);
    const timMoc = b => {
      const muc = [...qt.lichSu].reverse().find(item => item.buoc === b);
      return muc?.thoiGian ? new Date(muc.thoiGian).toLocaleDateString('vi-VN') : '';
    };
    const nodes = [
      {
        ten: 'Đã Kích Hoạt',
        phu: timMoc('da_kich_hoat') || dong['NGÀY GỬI'] || 'Sẵn sàng giao',
        trangThai: qt.thuTu > 1 ? 'is-done' : 'is-current',
        icon: qt.thuTu > 1 ? 'fa-circle-check' : 'fa-box-open'
      }
    ];
    if (qt.thuTu >= 2) {
      nodes.push({
        ten: 'Đang Trên Đường Giao',
        phu: qt.nguoiGiao ? `Người giao: ${qt.nguoiGiao}` : 'Chưa gán người giao',
        trangThai: qt.thuTu > 2 ? 'is-done' : 'is-current',
        icon: qt.thuTu > 2 ? 'fa-circle-check' : 'fa-route'
      });
    }
    if (qt.thuTu >= 3) {
      nodes.push({
        ten: 'Đã Giao',
        phu: timMoc('da_giao') || dong['NGÀY THỰC HIỆN'] || 'Hoàn tất',
        trangThai: 'is-complete',
        icon: 'fa-flag-checkered',
        xe: true
      });
    }

    const nodesHtml = nodes.map((node, idx) => {
      const coXe = node.xe || node.trangThai === 'is-current';
      const xeHtml = coXe ? '<span class="gn-truck" aria-hidden="true"><i class="fa-solid fa-truck-fast"></i></span>' : '';
      return `${idx > 0 ? '<span class="gn-road-seg is-done" aria-hidden="true"></span>' : ''}<div class="gn-node ${node.trangThai}">${xeHtml}<i class="fa-solid ${node.icon}"></i><div><strong>${thoatHtml(node.ten)}</strong>${node.phu ? `<small>${thoatHtml(node.phu)}</small>` : ''}</div></div>`;
    }).join('');

    let actionHtml = '';
    if (coQuyenCapNhatQuyTrinh() && qt.buoc !== 'da_giao') {
      if (qt.buoc === 'da_kich_hoat') {
        actionHtml = `<button type="button" class="btn btn-primary gn-node-btn" data-gn-step="dang_giao" data-chi-so="${chiSo}"><i class="fa-solid fa-truck-fast"></i> Bắt đầu giao</button>`;
      } else if (qt.buoc === 'dang_giao') {
        actionHtml = `<button type="button" class="btn btn-primary gn-node-btn" data-gn-step="da_giao" data-chi-so="${chiSo}"><i class="fa-solid fa-check"></i> Xác nhận Đã Giao</button>`;
      }
    }

    return `<div class="gn-card-pipeline"><div class="gn-road">${nodesHtml}</div>${actionHtml ? `<div class="gn-node-action">${actionHtml}</div>` : ''}</div>`;
  }

  function hienThiDong(dong, chiSo) {
    const qt = suyRaQuyTrinhGiaoNhan(dong);
    const ma = dong.ID || dong.maSheet || '--';
    return `<article class="gn-card${qt.buoc === 'da_giao' ? ' is-completed' : ''}" data-chi-so="${chiSo}">
      <div class="gn-card-head">
        <div class="gn-card-info">
          <div class="gn-card-title">
            <span class="gn-card-code">#${thoatHtml(ma)}</span>
            <span class="gn-card-customer">${thoatHtml(dong['TÊN KHÁCH HÀNG'] || dong['TÊN CÔNG TY'] || '--')}</span>
            <span class="giao-nhan-status">${thoatHtml(dong['TÌNH TRẠNG'] || 'Đã Kích Hoạt')}</span>
          </div>
          <div class="gn-card-meta">
            ${dong['TÊN CÔNG TY'] ? `<span>Công ty: <strong>${thoatHtml(dong['TÊN CÔNG TY'])}</strong></span>` : ''}
            ${dong.MST ? `<span>MST: <strong>${thoatHtml(dong.MST)}</strong></span>` : ''}
            ${dong['SỐ ĐIỆN THOẠI'] ? `<span>SĐT: <strong>${thoatHtml(dong['SỐ ĐIỆN THOẠI'])}</strong></span>` : ''}
            <span>Gửi: <strong>${thoatHtml(dong['NGÀY GỬI'] || '--')}</strong></span>
            <span>NV gửi: <strong>${thoatHtml(dong['TÊN NHÂN VIÊN'] || '--')}</strong></span>
            ${dong['ĐƠN VỊ CPN'] ? `<span>CPN: <strong>${thoatHtml(dong['ĐƠN VỊ CPN'])}${dong['SỐ  BILL'] ? ` (${thoatHtml(dong['SỐ  BILL'])})` : ''}</strong></span>` : ''}
          </div>
        </div>
        <div class="gn-card-tools">
          <button type="button" class="giao-nhan-view-detail" aria-label="Xem chi tiết ${thoatHtml(ma)}" aria-pressed="false">Chi tiết</button>
        </div>
      </div>
      ${veLuoiTramGiaoNhan(dong, chiSo)}
    </article>`;
  }

  async function chuyenBuocGiaoNhan(vung, dong, buoc, nut) {
    let nguoiGiao = '';
    if (buoc === 'dang_giao') {
      const goiY = dong['Nhân Viên Thực Hiện'] || nguoiDung?.employee?.name || nguoiDung?.username || '';
      const nhap = window.prompt('Nhập tên người giao hàng:', goiY);
      if (nhap === null) return;
      if (!nhap.trim()) return window.alert('Vui lòng nhập tên người giao.');
      nguoiGiao = nhap.trim();
    }
    if (nut) nut.disabled = true;
    try {
      const res = await goiApi(`/${encodeURIComponent(dong._id)}/quy-trinh`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buoc, ...(nguoiGiao ? { nguoiGiao } : {}) })
      });
      await taiDanhSach(vung);
      window.showAppToast?.(res.message || 'Đã cập nhật quy trình giao nhận.', 'Giao Nhận');
    } catch (loi) {
      window.alert(loi.message || 'Không thể cập nhật quy trình giao nhận.');
      if (nut?.isConnected) nut.disabled = false;
    }
  }

  async function taiDanhSach(vung) {
    if (boHuyYeuCau) boHuyYeuCau.abort();
    boHuyYeuCau = new AbortController();
    const maYeuCau = ++lanYeuCau;
    const thamSo = new URLSearchParams({
      page: String(trangThai.trang),
      limit: String(trangThai.gioiHan),
      q: trangThai.tuKhoa,
      status: trangThai.tinhTrang
    });
    const tbody = vung.querySelector('#giaoNhanRows');
    const thongTin = vung.querySelector('#giaoNhanPageInfo');
    const chiTiet = vung.querySelector('#giaoNhanDetail');
    if (!tbody) return;
    if (chiTiet.open) chiTiet.close();
    tbody.innerHTML = '<div class="giao-nhan-message">Đang tải dữ liệu...</div>';
    try {
      const ketQua = await goiApi(`?${thamSo}`, { signal: boHuyYeuCau.signal });
      if (maYeuCau !== lanYeuCau || !dangMoTrang() || !tbody.isConnected) return;
      tbody.innerHTML = ketQua.items.length
        ? ketQua.items.map(hienThiDong).join('')
        : '<div class="giao-nhan-message">Không có dữ liệu giao nhận phù hợp.</div>';
      if (ketQua.items.length) {
        const chonDong = (chiSo, hang) => {
          hang.querySelector('.giao-nhan-view-detail')?.focus();
          chiTiet.innerHTML = layChiTiet(ketQua.items[chiSo]);
          tbody.querySelectorAll('.gn-card[data-chi-so]').forEach(card => {
            const duocChon = Number(card.dataset.chiSo) === chiSo;
            card.classList.toggle('is-selected', duocChon);
            card.querySelector('.giao-nhan-view-detail')?.setAttribute('aria-pressed', String(duocChon));
          });
          chiTiet.showModal();
        };
        tbody.querySelectorAll('.gn-card[data-chi-so]').forEach(hang => {
          hang.addEventListener('click', event => {
            const nutBuoc = event.target.closest('[data-gn-step]');
            if (nutBuoc) {
              event.stopPropagation();
              return chuyenBuocGiaoNhan(vung, ketQua.items[Number(nutBuoc.dataset.chiSo)], nutBuoc.dataset.gnStep, nutBuoc);
            }
            chonDong(Number(hang.dataset.chiSo), hang);
          });
        });
      }
      if (thongTin) thongTin.textContent = `Trang ${ketQua.page}${ketQua.hasMore ? '' : ' · Đã hết dữ liệu'}`;
      vung.querySelector('#giaoNhanPrev').disabled = ketQua.page <= 1;
      vung.querySelector('#giaoNhanNext').disabled = !ketQua.hasMore;
    } catch (loi) {
      if (loi.name === 'AbortError' || maYeuCau !== lanYeuCau || !dangMoTrang() || !tbody.isConnected) return;
      tbody.innerHTML = `<div class="giao-nhan-message giao-nhan-error">${thoatHtml(loi.message)}</div>`;
      if (thongTin) thongTin.textContent = 'Không tải được dữ liệu.';
    }
  }

  async function taiTrangThai(vung) {
    try {
      const ketQua = await goiApi('/options');
      const select = vung.querySelector('#giaoNhanStatus');
      if (!select) return;
      select.innerHTML = '<option value="">Mọi tình trạng</option>'
        + ketQua.statuses.map(muc => `<option value="${thoatHtml(muc)}">${thoatHtml(muc)}</option>`).join('');
      select.value = trangThai.tinhTrang;
    } catch (loi) {
      const thongTin = vung.querySelector('#giaoNhanSyncInfo');
      if (thongTin) thongTin.textContent = loi.message;
    }
  }

  async function taiTinhTrangDongBo(vung) {
    try {
      const ketQua = await goiApi('/sync-status');
      if (!dangMoTrang() || !vung.querySelector('#giaoNhanSyncInfo')) return;
      const tinhTrang = ketQua.data;
      const lichDongBo = 'Tự động sao lưu lên Google Sheet hằng ngày lúc 20:00 (giờ Việt Nam)';
      const noiDung = tinhTrang.at
        ? `Lần đồng bộ gần nhất: ${new Date(tinhTrang.at).toLocaleString('vi-VN')} · ${lichDongBo}.`
        : `${lichDongBo}. Đang chờ lần đồng bộ đầu tiên.`;
      const loi = tinhTrang.status === 'error' ? ` · Lỗi: ${tinhTrang.error}` : '';
      vung.querySelector('#giaoNhanSyncInfo').textContent = noiDung + loi;
    } catch (loi) {
      const thongTin = vung.querySelector('#giaoNhanSyncInfo');
      if (dangMoTrang() && thongTin) thongTin.textContent = loi.message;
    }
  }

  async function dongBoNgay(vung, nut) {
    nut.disabled = true;
    const thongTin = vung.querySelector('#giaoNhanSyncInfo');
    if (thongTin) thongTin.textContent = 'Đang sao lưu dữ liệu lên Google Sheet...';
    try {
      const ketQua = await goiApi('/sync', { method: 'POST' });
      if (!dangMoTrang() || !vung.querySelector('#giaoNhanSyncInfo')) return;
      const duLieu = ketQua.data;
      vung.querySelector('#giaoNhanSyncInfo').textContent = duLieu.skipped
        ? 'Đang có một lượt sao lưu khác chạy.'
        : `Đã sao lưu ${duLieu.total || 0} dòng (cập nhật ${duLieu.updated || 0}, thêm mới ${duLieu.appended || 0}).`;
      await taiDanhSach(vung);
      await taiTinhTrangDongBo(vung);
    } catch (loi) {
      if (dangMoTrang()) vung.querySelector('#giaoNhanSyncInfo').textContent = loi.message;
    } finally {
      if (nut.isConnected) nut.disabled = false;
    }
  }

  function ngayHomNay() {
    const ngay = new Date();
    ngay.setMinutes(ngay.getMinutes() - ngay.getTimezoneOffset());
    return ngay.toISOString().slice(0, 10);
  }

  function moFormTaoMoi(vung, duLieuBanDau = {}) {
    const coPhamViCaNhan = nguoiDung?.role?.dataScopes?.orders === 'own'
      || ['Nhân Viên', 'Chỉ Xem'].includes(nguoiDung?.role?.name);
    if (boHuyYeuCau) boHuyYeuCau.abort();
    lanYeuCau += 1;
    const nhom = [
      { ten: 'Thông tin phiếu', moTa: 'Thời gian và người phụ trách', icon: 'fa-clipboard-list', cot: [
        { cot: 'NGÀY GỬI', ten: 'Ngày gửi', kieu: 'date', batBuoc: true, giaTri: ngayHomNay() },
        { cot: 'TÊN NHÂN VIÊN', ten: 'Nhân viên gửi', giaTri: nguoiDung?.employee?.name || '', chiDoc: coPhamViCaNhan, goiY: 'Nhập tên nhân viên' },
        { cot: 'Nhân Viên Thực Hiện', ten: 'Nhân viên thực hiện', goiY: 'Nhập tên nhân viên thực hiện' },
        { cot: 'NGÀY THỰC HIỆN', ten: 'Ngày thực hiện', kieu: 'date' },
        { cot: 'TÌNH TRẠNG', ten: 'Tình trạng', goiY: 'Nhập hoặc chọn tình trạng', danhSach: 'giaoNhanGoiYTrangThai' }
      ] },
      { ten: 'Khách hàng & người nhận', moTa: 'Thông tin liên hệ và địa chỉ giao nhận', icon: 'fa-user', cot: [
        { cot: 'TÊN KHÁCH HÀNG', ten: 'Tên khách hàng', goiY: 'Nhập tên người nhận hoặc khách hàng' },
        { cot: 'SỐ ĐIỆN THOẠI', ten: 'Số điện thoại', kieu: 'tel', goiY: 'Ví dụ: 0901234567' },
        { cot: 'TÊN CÔNG TY', ten: 'Tên công ty', goiY: 'Nhập tên công ty' },
        { cot: 'MST', ten: 'Mã số thuế', goiY: 'Nhập mã số thuế' },
        { cot: 'ĐỊA CHỈ NGƯỜI NHẬN', ten: 'Địa chỉ người nhận', batBuoc: true, rong: true, goiY: 'Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành' }
      ] },
      { ten: 'Nội dung & chuyển phát', moTa: 'Công việc, nhà cung cấp và vận đơn', icon: 'fa-truck-fast', cot: [
        { cot: 'LOẠI', ten: 'Loại', goiY: 'Nhập loại hồ sơ hoặc dịch vụ' },
        { cot: 'NCC', ten: 'Nhà cung cấp', goiY: 'Nhập tên nhà cung cấp' },
        { cot: 'LOẠI CÔNG VIỆC', ten: 'Loại công việc', goiY: 'Ví dụ: Gửi hồ sơ' },
        { cot: 'MỤC ĐÍCH CPN', ten: 'Mục đích chuyển phát', goiY: 'Ví dụ: Gửi hợp đồng' },
        { cot: 'ĐƠN VỊ CPN', ten: 'Đơn vị chuyển phát', goiY: 'Ví dụ: Viettel Post, VNPost, GHTK', danhSach: 'giaoNhanGoiYDonVi' },
        { cot: 'SỐ  BILL', ten: 'Số bill / vận đơn', goiY: 'Nhập mã vận đơn nếu đã có' },
        { cot: 'CHI PHÍ', ten: 'Chi phí (đ)', kieu: 'number', goiY: 'Ví dụ: 30000' },
        { cot: 'ĐÍNH KÈM', ten: 'Đính kèm (đường dẫn)', goiY: 'Dán đường dẫn tài liệu nếu có' }
      ] },
      { ten: 'Ghi chú & theo dõi', moTa: 'Thông tin bổ sung cho quá trình xử lý', icon: 'fa-note-sticky', cot: [
        { cot: 'GHI CHÚ NHU CẦU KHÁCH HÀNG', ten: 'Nhu cầu khách hàng', kieu: 'textarea', goiY: 'Nhập yêu cầu hoặc lưu ý của khách hàng' },
        { cot: 'GHI CHÚ\nCPN', ten: 'Ghi chú chuyển phát', kieu: 'textarea', goiY: 'Nhập ghi chú cho đơn vị vận chuyển' },
        { cot: 'THANH TOÁN\nCHI PHÍ NV', ten: 'Thanh toán chi phí nhân viên', goiY: 'Nhập thông tin thanh toán nếu có' },
        { cot: 'QUỐC AN\nCHECK FILE', ten: 'Quốc An check file', goiY: 'Nhập thông tin kiểm tra file' }
      ] }
    ];
    const cacCot = nhom.flatMap(muc => muc.cot);
    vung.innerHTML = `<section class="giao-nhan-create">
      <header class="giao-nhan-create-header">
        <div><button type="button" class="giao-nhan-back" data-dong><i class="fa-solid fa-arrow-left"></i> Danh sách giao nhận</button>
          <div class="giao-nhan-title-row"><span class="giao-nhan-title-icon"><i class="fa-solid fa-truck-fast"></i></span>
          <div><h2>Tạo mới giao nhận</h2><p>Điền thông tin để tạo phiếu giao nhận mới.</p></div></div></div>
        <div class="giao-nhan-id"><span>MÃ GIAO NHẬN</span><strong>GN${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' })}-xxxxx</strong><small>Được cấp tự động khi lưu</small></div>
      </header>
      <form id="giaoNhanForm" novalidate>
        <p class="giao-nhan-form-hint"><i class="fa-solid fa-circle-info"></i> Trường có dấu * là bắt buộc. Nhập tên khách hàng hoặc tên công ty.</p>
        <nav class="giao-nhan-steps" aria-label="Các bước tạo giao nhận">
          ${nhom.map((mucNhom, chiSoNhom) => `<button type="button" class="giao-nhan-step" data-buoc="${chiSoNhom}" ${chiSoNhom ? 'disabled' : 'aria-current="step"'}>
            <span class="giao-nhan-step-number">${chiSoNhom + 1}</span><span class="giao-nhan-step-label">${thoatHtml(mucNhom.ten)}</span>
          </button>`).join('')}
        </nav>
        ${nhom.map((mucNhom, chiSoNhom) => `<section class="giao-nhan-form-section" data-noi-dung-buoc="${chiSoNhom}" ${chiSoNhom ? 'hidden' : ''}>
          <div class="giao-nhan-section-title"><span><i class="fa-solid ${mucNhom.icon}"></i></span><div><h3>${thoatHtml(mucNhom.ten)}</h3><p>${thoatHtml(mucNhom.moTa)}</p></div><b>${String(chiSoNhom + 1).padStart(2, '0')}</b></div>
          <div class="giao-nhan-form-grid">${mucNhom.cot.map(muc => {
            const chiSo = cacCot.indexOf(muc);
            const kieu = muc.kieu || 'text';
            const thuocTinh = `data-cot="${chiSo}" placeholder="${thoatHtml(muc.goiY || '')}" ${muc.batBuoc ? 'required' : ''} ${muc.chiDoc ? 'readonly' : ''}`;
            const truong = kieu === 'textarea'
              ? `<textarea class="form-input" ${thuocTinh} maxlength="1000"></textarea>`
              : `<input class="form-input" ${thuocTinh} type="${kieu}" value="${thoatHtml(muc.giaTri || '')}" ${muc.danhSach ? `list="${muc.danhSach}"` : ''} ${kieu === 'number' ? 'step="any"' : 'maxlength="1000"'}>`;
            return `<label class="giao-nhan-form-field${muc.rong ? ' giao-nhan-form-wide' : ''}"><span>${thoatHtml(muc.ten)}${muc.batBuoc ? ' <em>*</em>' : ''}</span>${truong}</label>`;
          }).join('')}</div>
        </section>`).join('')}
        <datalist id="giaoNhanGoiYTrangThai"></datalist>
        <datalist id="giaoNhanGoiYDonVi"><option value="Viettel Post"></option><option value="VNPost"></option><option value="GHTK"></option><option value="GHN"></option></datalist>
        <p class="giao-nhan-form-error" id="giaoNhanFormError" role="alert"></p>
        <footer class="giao-nhan-form-actions">
          <button type="button" class="btn btn-secondary" data-dong>Hủy</button>
          <button type="button" class="btn btn-secondary" id="giaoNhanBuocTruoc" hidden>Quay lại</button>
          <button type="button" class="btn btn-primary" id="giaoNhanBuocTiep">Tiếp theo <i class="fa-solid fa-arrow-right"></i></button>
          <button type="submit" class="btn btn-primary" id="giaoNhanSave" hidden><i class="fa-solid fa-check"></i> Tạo giao nhận</button>
        </footer>
      </form>
    </section>`;

    const form = vung.querySelector('#giaoNhanForm');
    form.querySelectorAll('[data-cot]').forEach(truong => {
      const giaTri = duLieuBanDau[cacCot[Number(truong.dataset.cot)].cot];
      if (!truong.readOnly && giaTri != null) truong.value = String(giaTri);
    });
    const cacBuoc = [...form.querySelectorAll('[data-noi-dung-buoc]')];
    const nutCacBuoc = [...form.querySelectorAll('[data-buoc]')];
    const nutTruoc = form.querySelector('#giaoNhanBuocTruoc');
    const nutTiep = form.querySelector('#giaoNhanBuocTiep');
    const nutLuu = form.querySelector('#giaoNhanSave');
    const thongBaoLoi = form.querySelector('#giaoNhanFormError');
    let buocHienTai = 0;
    let dangLuu = false;

    function hienThiBuoc(buoc) {
      buocHienTai = buoc;
      cacBuoc.forEach((noiDung, chiSo) => { noiDung.hidden = chiSo !== buoc; });
      nutCacBuoc.forEach((nut, chiSo) => {
        nut.disabled = dangLuu || chiSo > buoc;
        nut.classList.toggle('da-hoan-thanh', chiSo < buoc);
        if (chiSo === buoc) nut.setAttribute('aria-current', 'step');
        else nut.removeAttribute('aria-current');
      });
      nutTruoc.hidden = buoc === 0;
      nutTiep.hidden = buoc === nhom.length - 1;
      nutLuu.hidden = buoc !== nhom.length - 1;
    }

    function kiemTraBuoc(buoc) {
      const noiDung = cacBuoc[buoc];
      const truongLoi = [...noiDung.querySelectorAll('input, textarea')].find(truong => !truong.checkValidity());
      if (truongLoi) {
        hienThiBuoc(buoc);
        thongBaoLoi.textContent = '';
        truongLoi.reportValidity();
        return false;
      }
      if (buoc === 1) {
        const ten = noiDung.querySelector(`[data-cot="${cacCot.findIndex(muc => muc.cot === 'TÊN KHÁCH HÀNG')}"]`);
        const congTy = noiDung.querySelector(`[data-cot="${cacCot.findIndex(muc => muc.cot === 'TÊN CÔNG TY')}"]`);
        const diaChi = noiDung.querySelector(`[data-cot="${cacCot.findIndex(muc => muc.cot === 'ĐỊA CHỈ NGƯỜI NHẬN')}"]`);
        if (!ten.value.trim() && !congTy.value.trim()) {
          hienThiBuoc(buoc);
          thongBaoLoi.textContent = 'Vui lòng nhập tên khách hàng hoặc tên công ty.';
          ten.focus();
          return false;
        }
        if (!diaChi.value.trim()) {
          hienThiBuoc(buoc);
          thongBaoLoi.textContent = 'Vui lòng nhập địa chỉ người nhận.';
          diaChi.focus();
          return false;
        }
      }
      return true;
    }

    function diTiep() {
      if (!kiemTraBuoc(buocHienTai)) return;
      thongBaoLoi.textContent = '';
      hienThiBuoc(buocHienTai + 1);
      cacBuoc[buocHienTai].querySelector('input, textarea')?.focus();
    }

    nutCacBuoc.forEach((nut, chiSo) => nut.addEventListener('click', () => {
      if (chiSo < buocHienTai) {
        thongBaoLoi.textContent = '';
        hienThiBuoc(chiSo);
      }
    }));
    nutTruoc.addEventListener('click', () => {
      thongBaoLoi.textContent = '';
      hienThiBuoc(buocHienTai - 1);
    });
    nutTiep.addEventListener('click', diTiep);
    const dongForm = () => render(vung, nguoiDung);
    vung.querySelectorAll('[data-dong]').forEach(nut => nut.addEventListener('click', dongForm));
    goiApi('/options').then(ketQua => {
      const danhSach = form.querySelector('#giaoNhanGoiYTrangThai');
      if (form.isConnected && danhSach) danhSach.innerHTML = ketQua.statuses.map(muc => `<option value="${thoatHtml(muc)}"></option>`).join('');
    }).catch(loi => {
      if (form.isConnected) form.querySelector('#giaoNhanFormError').textContent = `Không tải được gợi ý tình trạng: ${loi.message}`;
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (dangLuu) return;
      if (buocHienTai < nhom.length - 1) {
        diTiep();
        return;
      }
      for (let buoc = 0; buoc < cacBuoc.length; buoc += 1) {
        if (!kiemTraBuoc(buoc)) return;
      }
      const duLieu = {};
      form.querySelectorAll('[data-cot]').forEach(truong => {
        duLieu[cacCot[Number(truong.dataset.cot)].cot] = truong.value.trim();
      });
      dangLuu = true;
      nutLuu.disabled = true;
      nutTruoc.disabled = true;
      nutCacBuoc.forEach(nut => { nut.disabled = true; });
      vung.querySelectorAll('[data-dong]').forEach(nut => { nut.disabled = true; });
      form.querySelector('#giaoNhanFormError').textContent = '';
      try {
        const ketQua = await goiApi('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(duLieu) });
        trangThai.trang = 1;
        trangThai.tuKhoa = '';
        trangThai.tinhTrang = '';
        if (!form.isConnected || !dangMoTrang()) return;
        dongForm();
        const maGiaoNhan = ketQua.data?.ID || ketQua.data?.maSheet || '';
        showAppToast(`Đã tạo giao nhận${maGiaoNhan ? ` ${maGiaoNhan}` : ''}.`);
      } catch (loi) {
        form.querySelector('#giaoNhanFormError').textContent = loi.message;
        dangLuu = false;
        nutLuu.disabled = false;
        nutTruoc.disabled = false;
        if (form.isConnected) {
          hienThiBuoc(buocHienTai);
          vung.querySelectorAll('[data-dong]').forEach(nut => { nut.disabled = false; });
        }
      }
    });
    form.querySelector('[data-cot="0"]')?.focus();
  }

  function render(vung, nguoiDungHienTai, duLieuBanDau) {
    nguoiDung = nguoiDungHienTai;
    const coQuyenDongBo = nguoiDung?.role?.name === 'Admin'
      || nguoiDung?.role?.permissions?.includes('manage_orders');
    if (duLieuBanDau && (nguoiDung?.isSuperAdmin || nguoiDung?.role?.permissions?.includes('manage_orders'))) {
      moFormTaoMoi(vung, duLieuBanDau);
      return;
    }
    vung.innerHTML = `<section class="giao-nhan-panel">
      <div class="giao-nhan-toolbar">
        <input id="giaoNhanSearch" type="search" class="form-input" maxlength="100" placeholder="Tìm ID, MST, công ty, khách hàng, số điện thoại...">
        <select id="giaoNhanStatus" class="form-select" aria-label="Lọc theo tình trạng"><option value="">Mọi tình trạng</option></select>
        <select id="giaoNhanLimit" class="form-select" aria-label="Số dòng mỗi trang"><option value="20">20 / trang</option><option value="50" selected>50 / trang</option><option value="100">100 / trang</option></select>
        <button id="giaoNhanRefresh" type="button" class="btn btn-secondary"><i class="fa-solid fa-rotate"></i> Tải lại</button>
        ${coQuyenDongBo ? '<button id="giaoNhanCreate" type="button" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Tạo mới</button>' : ''}
        ${coQuyenDongBo ? '<button id="giaoNhanSync" type="button" class="btn btn-primary"><i class="fa-solid fa-cloud-arrow-down"></i> Đồng bộ Sheet</button>' : ''}
      </div>
      <div id="giaoNhanSyncInfo" class="giao-nhan-sync-info" role="status"></div>
      <div class="giao-nhan-split">
        <section class="giao-nhan-list" aria-labelledby="giaoNhanListTitle">
          <div class="giao-nhan-list-header"><div><h2 id="giaoNhanListTitle">Danh sách giao nhận</h2><p>Theo dõi tiến trình giao nhận và bấm chọn phiếu để xem chi tiết</p></div><i class="fa-solid fa-truck-fast" aria-hidden="true"></i></div>
          <div id="giaoNhanRows" class="gn-card-list"><div class="giao-nhan-message">Đang tải dữ liệu...</div></div>
          <div class="giao-nhan-pagination"><button id="giaoNhanPrev" type="button" class="btn btn-secondary">Trang trước</button><span id="giaoNhanPageInfo">Đang tải...</span><button id="giaoNhanNext" type="button" class="btn btn-secondary">Trang sau</button></div>
        </section>
      </div>
      <dialog id="giaoNhanDetail" class="giao-nhan-detail" aria-labelledby="giaoNhanDetailTitle"></dialog>
    </section>`;

    const chiTiet = vung.querySelector('#giaoNhanDetail');
    chiTiet.addEventListener('click', event => {
      if (event.target.closest('[data-dong-chi-tiet]')) {
        chiTiet.close();
      } else if (event.target === chiTiet) {
        const khung = chiTiet.getBoundingClientRect();
        if (event.clientX < khung.left || event.clientX > khung.right || event.clientY < khung.top || event.clientY > khung.bottom) chiTiet.close();
      }
    });
    chiTiet.addEventListener('close', () => {
      if (chiTiet.open) return;
      vung.querySelectorAll('#giaoNhanRows .gn-card.is-selected').forEach(hang => {
        hang.classList.remove('is-selected');
        hang.querySelector('.giao-nhan-view-detail')?.setAttribute('aria-pressed', 'false');
      });
    });

    const timKiem = vung.querySelector('#giaoNhanSearch');
    timKiem.value = trangThai.tuKhoa;
    let henTimKiem;
    timKiem.addEventListener('input', () => {
      trangThai.tuKhoa = timKiem.value.trim();
      trangThai.trang = 1;
      if (boHuyYeuCau) boHuyYeuCau.abort();
      lanYeuCau += 1;
      clearTimeout(henTimKiem);
      henTimKiem = setTimeout(() => taiDanhSach(vung), 350);
    });
    vung.querySelector('#giaoNhanStatus').addEventListener('change', event => {
      trangThai.tinhTrang = event.target.value;
      trangThai.trang = 1;
      taiDanhSach(vung);
    });
    vung.querySelector('#giaoNhanLimit').value = String(trangThai.gioiHan);
    vung.querySelector('#giaoNhanLimit').addEventListener('change', event => {
      trangThai.gioiHan = Number(event.target.value);
      trangThai.trang = 1;
      taiDanhSach(vung);
    });
    vung.querySelector('#giaoNhanRefresh').addEventListener('click', () => taiDanhSach(vung));
    const nutTaoMoi = vung.querySelector('#giaoNhanCreate');
    if (nutTaoMoi) nutTaoMoi.addEventListener('click', () => moFormTaoMoi(vung));
    vung.querySelector('#giaoNhanPrev').addEventListener('click', () => {
      trangThai.trang = Math.max(1, trangThai.trang - 1);
      taiDanhSach(vung);
    });
    vung.querySelector('#giaoNhanNext').addEventListener('click', () => {
      trangThai.trang += 1;
      taiDanhSach(vung);
    });
    const nutDongBo = vung.querySelector('#giaoNhanSync');
    if (nutDongBo) nutDongBo.addEventListener('click', () => dongBoNgay(vung, nutDongBo));
    taiTrangThai(vung);
    taiTinhTrangDongBo(vung);
    taiDanhSach(vung);
  }

  window.GiaoNhan = { render };
})();
