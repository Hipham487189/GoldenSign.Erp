(function () {
  let trangDangMo = null;
  const chuanHoa = giaTri => String(giaTri || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');

  document.addEventListener('keydown', suKien => {
    if (!trangDangMo?.goc.isConnected || suKien.defaultPrevented || suKien.repeat
      || !suKien.altKey || suKien.ctrlKey || suKien.metaKey || suKien.shiftKey) return;
    const dangNhapLieu = suKien.target instanceof Element
      && (suKien.target.isContentEditable || suKien.target.closest('input, textarea, select, [contenteditable="true"]'));
    const manDangNhap = document.getElementById('loginScreen');
    const coHopThoai = [...document.querySelectorAll('.modal.active, dialog[open], [role="dialog"][aria-modal="true"]')]
      .some(hopThoai => hopThoai.getClientRects().length);
    if (dangNhapLieu || coHopThoai || (manDangNhap && !manDangNhap.classList.contains('hidden'))) return;
    const so = /^Digit[1-5]$/.test(suKien.code) ? Number(suKien.code.slice(-1)) : Number(suKien.key);
    const congCu = trangDangMo.danhSach[so - 1];
    if (!congCu || !congCu.duocPhep) return;
    suKien.preventDefault();
    trangDangMo.moCongCu(congCu);
  });

  window.renderToolsMenu = function (container, options) {
    const danhSach = [
      {
        ma: 'nhap-ho-so', ten: 'Nhập Hồ Sơ', nhom: 'ho-so', tenNhom: 'Hồ sơ & Khách hàng',
        icon: 'fa-file-circle-plus', mau: 'xanh', nhan: 'Hồ sơ', nut: 'Mở tác vụ',
        moTa: 'Nhập file Excel, đối chiếu hồ sơ với đơn hàng và xác nhận trước khi cập nhật.',
        duocPhep: Boolean(options.canImportRegistration), layHanhDong: () => window.openOrderCaseFileImport
      },
      {
        ma: 'kiem-tra-cong-no', ten: 'Kiểm Tra Công Nợ', nhom: 'tai-chinh', tenNhom: 'Tài chính & Lương',
        icon: 'fa-magnifying-glass-dollar', mau: 'duong', nhan: 'Công nợ', nut: 'Tra cứu ngay',
        moTa: 'Theo dõi danh sách đăng ký và công nợ nhân viên trong hệ thống.',
        duocPhep: Boolean(options.canCheckDebt), layHanhDong: () => options.onCheckDebt
      },
      {
        ma: 'thiet-lap-luong', ten: 'Thiết Lập Lương', nhom: 'tai-chinh', tenNhom: 'Tài chính & Lương',
        icon: 'fa-sack-dollar', mau: 'vang', nhan: 'Quản lý lương', nut: 'Thiết lập',
        moTa: 'Quản lý mức lương nhân viên và thời gian bắt đầu áp dụng.',
        duocPhep: Boolean(options.canSalarySetup), layHanhDong: () => options.onSalarySetup
      },
      {
        ma: 'nhap-so-lieu', ten: 'Nhập Số liệu', nhom: 'du-lieu', tenNhom: 'Dữ liệu',
        icon: 'fa-file-invoice-dollar', mau: 'tim', nhan: 'Chi phí', nut: 'Mở số liệu',
        moTa: 'Ghi nhận đơn giá chi phí và thời gian áp dụng cho từng khoản.',
        duocPhep: Boolean(options.canInputData), layHanhDong: () => options.onInputData
      },
      {
        ma: 'cap-nhat-khach-hang', ten: 'Cập Nhật TT Khách hàng', nhom: 'ho-so', tenNhom: 'Hồ sơ & Khách hàng',
        icon: 'fa-user-pen', mau: 'ngoc', nhan: 'Giao nhận', nut: 'Cập nhật ngay',
        moTa: 'Đối chiếu thông tin từ Giao Nhận, chọn khách hàng và xác nhận trước khi bổ sung.',
        duocPhep: Boolean(options.canUpdateCustomerInfo), layHanhDong: () => options.onUpdateCustomerInfo
      }
    ];
    const khoaYeuThich = options.maNguoiDung ? `datags_tools_favorites:${options.maNguoiDung}` : '';
    let yeuThich = new Set();
    let loiLuu = '';
    if (khoaYeuThich) {
      try {
        const daLuu = localStorage.getItem(khoaYeuThich);
        const giaTri = daLuu ? JSON.parse(daLuu) : [];
        if (!Array.isArray(giaTri)) throw new Error('Dữ liệu yêu thích không hợp lệ.');
        yeuThich = new Set(giaTri.filter(ma => danhSach.some(congCu => congCu.ma === ma)));
      } catch (loi) {
        console.warn('Không thể tải danh sách công cụ yêu thích.');
        loiLuu = 'Không thể tải yêu thích đã lưu trên thiết bị này.';
      }
    } else {
      loiLuu = 'Yêu thích chỉ được giữ trong lần mở trang này.';
    }

    container.innerHTML = `<section class="tc-center">
      <header class="tc-hero"><div class="tc-hero-copy">
        <span class="tc-hero-label"><i class="fa-solid fa-bolt" aria-hidden="true"></i> TRUNG TÂM TÁC NGHIỆP</span>
        <h2>Trung Tâm Công cụ</h2>
        <p>Truy cập nhanh các công cụ hỗ trợ công việc, được phân nhóm rõ ràng và phù hợp với quyền của bạn.</p>
      </div><div class="tc-hero-stats" aria-label="Thống kê công cụ">
        <div><strong>${danhSach.length}</strong><span>Công cụ</span></div>
        <div><strong>${danhSach.filter(item => item.duocPhep).length}</strong><span>Được cấp quyền</span></div>
        <div><strong>${danhSach.filter(item => !item.duocPhep).length}</strong><span>Chưa cấp quyền</span></div>
      </div></header>
      <div class="tc-toolbar">
        <div class="tc-filters" aria-label="Lọc công cụ">
          <button type="button" class="tc-filter" data-bo-loc="tat-ca" aria-pressed="true">Tất cả công cụ (${danhSach.length})</button>
          <button type="button" class="tc-filter" data-bo-loc="ho-so" aria-pressed="false">Hồ sơ &amp; Khách hàng</button>
          <button type="button" class="tc-filter" data-bo-loc="tai-chinh" aria-pressed="false">Tài chính &amp; Lương</button>
          <button type="button" class="tc-filter" data-bo-loc="du-lieu" aria-pressed="false">Dữ liệu</button>
          <button type="button" class="tc-filter tc-filter-favorite" data-bo-loc="yeu-thich" aria-pressed="false"><i class="fa-solid fa-star" aria-hidden="true"></i> Yêu thích</button>
        </div>
        <label class="tc-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" data-tim-cong-cu maxlength="100" placeholder="Tìm công cụ..." aria-label="Tìm công cụ"></label>
      </div>
      <div class="tc-message" data-thong-bao role="status"></div>
      <div class="tc-grid" data-danh-sach></div>
      <div class="tc-bottom">
        <section class="tc-panel"><div class="tc-panel-heading"><h3><span class="tc-dot"></span> Nhật Ký Thao Tác Gần Đây</h3></div>
          <div data-nhat-ky aria-live="polite"></div>
          <div class="tc-log-pages"><button type="button" data-nhat-ky-truoc disabled>Trước</button>
            <span data-nhat-ky-trang></span><button type="button" data-nhat-ky-sau disabled>Sau</button></div></section>
        <section class="tc-panel"><div class="tc-panel-heading"><h3><i class="fa-solid fa-bolt" aria-hidden="true"></i> Phím Tắt Tác Nghiệp</h3></div>
          <p class="tc-panel-note">Dùng phím tắt để mở nhanh công cụ được cấp quyền.</p>
          <div class="tc-shortcuts">${danhSach.map((item, index) => `<button type="button" data-mo="${index}" ${item.duocPhep ? '' : 'disabled'}>
            <span>${item.ten}</span><kbd>Alt + ${index + 1}</kbd></button>`).join('')}</div>
        </section>
      </div>
    </section>`;

    const goc = container.querySelector('.tc-center');
    const lay = ten => goc.querySelector(`[data-${ten}]`);
    const bao = thongBao => { lay('thong-bao').textContent = thongBao; };
    let boLoc = 'tat-ca';
    let tuKhoa = '';
    let trangNhatKy = 1;
    let lanTaiNhatKy = 0;

    async function taiNhatKy(trang) {
      const lanTai = ++lanTaiNhatKy;
      const vung = lay('nhat-ky');
      vung.textContent = 'Đang tải nhật ký...';
      lay('nhat-ky-truoc').disabled = true;
      lay('nhat-ky-sau').disabled = true;
      try {
        const phanHoi = await fetch(`${window.API_BASE_URL}/api/nhat-ky-cong-cu?page=${trang}`);
        const ketQua = await phanHoi.json();
        if (!phanHoi.ok || !ketQua.success) throw new Error(ketQua.message || 'Không thể tải nhật ký.');
        if (!goc.isConnected || lanTai !== lanTaiNhatKy) return;
        trangNhatKy = ketQua.data.page;
        vung.replaceChildren();
        if (!ketQua.data.items.length) {
          vung.textContent = 'Chưa có hoạt động được ghi nhận từ khi triển khai.';
        } else {
          ketQua.data.items.forEach(muc => {
            const ma = String(muc.module || '').replace(/^cong-cu:/, '');
            const ten = danhSach.find(item => item.ma === ma)?.ten || 'Công cụ';
            const hanhDong = { mo: 'Mở công cụ', tao: 'Thêm', 'cap-nhat': 'Cập nhật', xoa: 'Xóa' }[muc.action] || 'Thao tác';
            const dong = document.createElement('div');
            dong.className = 'tc-log-row';
            const noiDung = document.createElement('div');
            const tieuDe = document.createElement('strong');
            tieuDe.textContent = `${hanhDong} · ${ten}`;
            const chiTiet = document.createElement('span');
            const soLuong = Number.isSafeInteger(muc.after?.soLuong) ? ` · ${muc.after.soLuong} bản ghi` : '';
            chiTiet.textContent = `${muc.actorUsername || 'Không rõ tài khoản'}${muc.recordId ? ` · ${muc.recordId}` : ''}${soLuong}`;
            noiDung.append(tieuDe, chiTiet);
            const thoiGian = document.createElement('time');
            thoiGian.textContent = new Date(muc.createdAt).toLocaleString('vi-VN');
            dong.append(noiDung, thoiGian);
            vung.append(dong);
          });
        }
        lay('nhat-ky-trang').textContent = `Trang ${trangNhatKy}`;
        lay('nhat-ky-truoc').disabled = trangNhatKy <= 1;
        lay('nhat-ky-sau').disabled = !ketQua.data.hasMore;
      } catch (loi) {
        if (!goc.isConnected || lanTai !== lanTaiNhatKy) return;
        console.error('Không thể tải nhật ký công cụ:', loi.message);
        vung.textContent = 'Không thể tải nhật ký. Vui lòng mở lại trang để thử lại.';
        lay('nhat-ky-trang').textContent = '';
      }
    }

    async function ghiLuotMo(congCu) {
      try {
        const phanHoi = await fetch(`${window.API_BASE_URL}/api/nhat-ky-cong-cu/mo`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ma: congCu.ma })
        });
        const ketQua = await phanHoi.json();
        if (!phanHoi.ok || !ketQua.success) throw new Error(ketQua.message || 'Không thể ghi nhật ký.');
        if (goc.isConnected) taiNhatKy(1);
      } catch (loi) {
        console.error('Không thể ghi lượt mở công cụ:', loi.message);
        window.alert('Đã mở công cụ nhưng không thể ghi nhật ký. Vui lòng báo quản trị viên.');
      }
    }

    function moCongCu(congCu) {
      const hanhDong = congCu.layHanhDong();
      if (typeof hanhDong !== 'function') {
        console.error('Không thể mở công cụ:', congCu.ten);
        bao(`Không thể mở ${congCu.ten}. Vui lòng tải lại trang.`);
        return;
      }
      hanhDong();
      ghiLuotMo(congCu);
    }

    function hienDanhSach() {
      const cacMuc = danhSach.map((item, index) => ({ item, index })).filter(({ item }) =>
        (boLoc === 'tat-ca' || (boLoc === 'yeu-thich' ? yeuThich.has(item.ma) : item.nhom === boLoc))
        && (!tuKhoa || chuanHoa(`${item.ten} ${item.tenNhom} ${item.moTa}`).includes(tuKhoa)));
      lay('danh-sach').innerHTML = cacMuc.length ? cacMuc.map(({ item, index }) => `
        <article class="tc-card ${item.duocPhep ? '' : 'tc-card-disabled'}">
          <div class="tc-card-top"><span class="tc-icon tc-icon-${item.mau}"><i class="fa-solid ${item.icon}" aria-hidden="true"></i></span>
            <div class="tc-card-badges"><span class="tc-badge tc-badge-${item.mau}">${item.nhan}</span>
              <kbd>Alt+${index + 1}</kbd><button type="button" class="tc-star ${yeuThich.has(item.ma) ? 'is-favorite' : ''}" data-yeu-thich="${index}"
                aria-label="${yeuThich.has(item.ma) ? 'Bỏ yêu thích' : 'Thêm yêu thích'} ${item.ten}" aria-pressed="${yeuThich.has(item.ma)}"><i class="${yeuThich.has(item.ma) ? 'fa-solid' : 'fa-regular'} fa-star" aria-hidden="true"></i></button></div></div>
          <h3>${item.ten}</h3><span class="tc-category tc-category-${item.mau}">${item.tenNhom}</span>
          <p>${item.moTa}</p>
          <div class="tc-card-footer"><span>${item.duocPhep ? 'Sẵn sàng sử dụng' : 'Không có quyền sử dụng'}</span>
            <button type="button" class="tc-open" data-mo="${index}" ${item.duocPhep ? `aria-keyshortcuts="Alt+${index + 1}"` : 'disabled'}>
              ${item.duocPhep ? item.nut : 'Chưa có quyền'} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>
        </article>`).join('') : '<div class="tc-empty">Không có công cụ phù hợp. Hãy thử từ khóa hoặc bộ lọc khác.</div>';
      if (boLoc === 'tat-ca' && !tuKhoa) {
        lay('danh-sach').insertAdjacentHTML('beforeend', `<aside class="tc-help">
          <span class="tc-help-label">TRUNG TÂM CÔNG CỤ</span><h3>Cần thêm công cụ?</h3>
          <p>Liên hệ người quản trị để được hỗ trợ và đề xuất tiện ích phù hợp với công việc.</p>
          <span class="tc-help-footer"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i> Cùng cải thiện quy trình làm việc</span>
        </aside>`);
      }
    }

    function luuYeuThich() {
      if (!khoaYeuThich) { bao('Yêu thích chỉ được giữ trong lần mở trang này.'); return; }
      try {
        localStorage.setItem(khoaYeuThich, JSON.stringify([...yeuThich]));
        bao('');
      } catch (loi) {
        console.warn('Không thể lưu danh sách công cụ yêu thích.');
        bao('Không thể lưu yêu thích trên thiết bị này; lựa chọn chỉ giữ trong lần mở trang.');
      }
    }

    goc.addEventListener('click', suKien => {
      const nutLoc = suKien.target.closest('[data-bo-loc]');
      if (nutLoc) {
        boLoc = nutLoc.dataset.boLoc;
        goc.querySelectorAll('[data-bo-loc]').forEach(nut => nut.setAttribute('aria-pressed', String(nut === nutLoc)));
        hienDanhSach();
        return;
      }
      const nutYeuThich = suKien.target.closest('[data-yeu-thich]');
      if (nutYeuThich) {
        const congCu = danhSach[Number(nutYeuThich.dataset.yeuThich)];
        if (yeuThich.has(congCu.ma)) yeuThich.delete(congCu.ma);
        else yeuThich.add(congCu.ma);
        luuYeuThich();
        hienDanhSach();
        const nutMoi = goc.querySelector(`[data-yeu-thich="${nutYeuThich.dataset.yeuThich}"]`)
          || goc.querySelector('[data-bo-loc="yeu-thich"]');
        nutMoi?.focus();
        return;
      }
      const nutMo = suKien.target.closest('[data-mo]');
      if (!nutMo || nutMo.disabled) return;
      const congCu = danhSach[Number(nutMo.dataset.mo)];
      if (congCu?.duocPhep) moCongCu(congCu);
    });
    lay('nhat-ky-truoc').addEventListener('click', () => taiNhatKy(trangNhatKy - 1));
    lay('nhat-ky-sau').addEventListener('click', () => taiNhatKy(trangNhatKy + 1));
    lay('tim-cong-cu').addEventListener('input', suKien => {
      tuKhoa = chuanHoa(suKien.target.value.trim());
      hienDanhSach();
    });
    trangDangMo = { goc, danhSach, moCongCu };
    hienDanhSach();
    taiNhatKy(1);
    if (loiLuu) bao(loiLuu);
  };
})();
