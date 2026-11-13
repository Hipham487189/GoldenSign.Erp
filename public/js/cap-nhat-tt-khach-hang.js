(function () {
  const thoat = giaTri => String(giaTri ?? '').replace(/[&<>"']/g, kyTu => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[kyTu]);
  const sach = giaTri => String(giaTri ?? '').trim();

  async function goiApi(duongDan, tuyChon) {
    const phanHoi = await fetch(`${API_BASE_URL}/api/giao-nhan${duongDan}`, tuyChon);
    const duLieu = await phanHoi.json();
    if (!phanHoi.ok || !duLieu.success) throw new Error(duLieu.message || 'Không thể thực hiện yêu cầu.');
    return duLieu;
  }

  function render(vung, tuyChon) {
    vung.innerHTML = `<div class="cnkh">
      <header class="cnkh-header"><div><h2>Cập Nhật TT Khách hàng</h2>
        <p>Chọn phiếu, ghép đúng khách hàng và xem lại trước khi xác nhận. Chỉ bổ sung ô còn trống.</p></div>
        <button type="button" class="btn btn-secondary" data-quay-lai>${thoat(tuyChon.nhanQuayLai || 'Quay lại Công Cụ')}</button></header>
      <div class="cnkh-grid">
        <section class="cnkh-card"><h3>1. Chọn phiếu Giao Nhận</h3>
          <div class="cnkh-search"><input data-tim-phieu maxlength="100" placeholder="Tìm mã phiếu, khách hàng..." aria-label="Tìm phiếu giao nhận">
            <select data-gioi-han aria-label="Số phiếu mỗi trang"><option>20</option><option selected>50</option><option>100</option></select></div>
          <div class="cnkh-list" data-danh-sach-phieu aria-live="polite"></div>
          <div class="cnkh-actions"><button type="button" class="btn btn-secondary" data-truoc>Trước</button>
            <span data-trang></span><button type="button" class="btn btn-secondary" data-sau>Sau</button></div>
          <div class="cnkh-selected" data-phieu-chon>Chưa chọn phiếu.</div>
        </section>
        <section class="cnkh-card"><h3>2. Chọn khách hàng trong bảng Khách Hàng</h3>
          <p class="cnkh-note">Tìm theo tên hoặc mã; không tự đối chiếu theo MST.</p>
          <div class="cnkh-search"><input data-tim-khach maxlength="100" placeholder="Nhập ít nhất 2 ký tự" aria-label="Tìm khách hàng"></div>
          <div class="cnkh-list" data-danh-sach-khach aria-live="polite"><div class="cnkh-message">Nhập tên hoặc mã khách hàng để tìm.</div></div>
          <div class="cnkh-selected" data-khach-chon>Chưa chọn khách hàng.</div>
          <div class="cnkh-fields" data-truong></div>
          <div class="cnkh-actions"><button type="button" class="btn btn-primary" data-them>Thêm vào danh sách xác nhận</button></div>
          <div data-loi-chon role="status"></div>
        </section>
      </div>
      <section class="cnkh-card cnkh-queue"><h3>3. Kiểm tra và xác nhận</h3>
        <p class="cnkh-note">Tối đa 20 khách hàng mỗi lần. Mỗi khách hàng chỉ chọn một phiếu trong một lần cập nhật.</p>
        <div data-danh-sach-chon aria-live="polite"></div>
        <div class="cnkh-actions"><button type="button" class="btn btn-primary" data-xac-nhan>Xác nhận cập nhật</button>
          <span data-ket-qua role="status"></span></div>
      </section>
    </div>`;
    const goc = vung.querySelector('.cnkh');
    const lay = ten => goc.querySelector(`[data-${ten}]`);
    const trangThai = { trang: 1, gioiHan: 50, tuKhoa: '', phieu: [], khach: [], phieuChon: null, khachChon: null, hangCho: [], coTrangSau: false };
    let lanPhieu = 0;
    let lanKhach = 0;
    let henPhieu;
    let henKhach;
    let huyPhieu;
    let huyKhach;
    let dangGhi = false;
    const conMo = () => goc.isConnected;
    const bao = (ten, noiDung, loi = false) => { lay(ten).innerHTML = `<div class="cnkh-message${loi ? ' cnkh-error' : ''}">${thoat(noiDung)}</div>`; };
    const chiTiet = (phieu, khach, truong) => {
      const cot = truong === 'phone' ? 'SỐ ĐIỆN THOẠI' : 'ĐỊA CHỈ NGƯỜI NHẬN';
      return { cu: sach(khach[truong]), nguon: sach(phieu[cot]) };
    };

    async function taiPhieu() {
      if (!conMo()) return;
      if (huyPhieu) huyPhieu.abort();
      huyPhieu = new AbortController();
      const lan = ++lanPhieu;
      bao('danh-sach-phieu', 'Đang tải phiếu...');
      lay('truoc').disabled = true;
      lay('sau').disabled = true;
      try {
        const thamSo = new URLSearchParams({ q: trangThai.tuKhoa, page: String(trangThai.trang), limit: String(trangThai.gioiHan) });
        const ketQua = await goiApi(`/phieu-cap-nhat-khach-hang?${thamSo}`, { signal: huyPhieu.signal });
        if (lan !== lanPhieu || !conMo()) return;
        trangThai.phieu = ketQua.items;
        trangThai.coTrangSau = ketQua.hasMore;
        lay('danh-sach-phieu').innerHTML = ketQua.items.length ? ketQua.items.map((item, index) =>
          `<button type="button" class="cnkh-item" data-phieu="${index}"><strong>${thoat(item.ID || item.maSheet)}</strong>
            <small>${thoat(item['TÊN KHÁCH HÀNG'] || 'Chưa có tên')} · ${thoat(item['NGÀY GỬI'] || 'Chưa có ngày')}</small>
            <small>${thoat(item['SỐ ĐIỆN THOẠI'] || 'Chưa có SĐT')} · ${thoat(item['ĐỊA CHỈ NGƯỜI NHẬN'] || 'Chưa có địa chỉ')}</small></button>`).join('')
          : '<div class="cnkh-message">Không có phiếu phù hợp.</div>';
        lay('trang').textContent = `Trang ${trangThai.trang}`;
        lay('truoc').disabled = trangThai.trang <= 1;
        lay('sau').disabled = !trangThai.coTrangSau;
      } catch (loi) {
        if (loi.name !== 'AbortError' && lan === lanPhieu && conMo()) bao('danh-sach-phieu', loi.message, true);
      }
    }

    async function timKhach(tuKhoa) {
      if (!conMo()) return;
      if (huyKhach) huyKhach.abort();
      const lan = ++lanKhach;
      trangThai.khach = [];
      if (tuKhoa.length < 2) { bao('danh-sach-khach', 'Nhập ít nhất 2 ký tự để tìm khách hàng.'); return; }
      huyKhach = new AbortController();
      bao('danh-sach-khach', 'Đang tìm khách hàng...');
      try {
        const ketQua = await goiApi(`/khach-hang-goi-y?${new URLSearchParams({ q: tuKhoa })}`, { signal: huyKhach.signal });
        if (lan !== lanKhach || !conMo()) return;
        trangThai.khach = ketQua.data;
        lay('danh-sach-khach').innerHTML = ketQua.data.length ? ketQua.data.map((item, index) =>
          `<button type="button" class="cnkh-item" data-khach="${index}"><strong>${thoat(item.name)}</strong>
            <small>Mã: ${thoat(item.code)} · SĐT: ${thoat(item.phone || 'trống')}</small>
            <small>Địa chỉ: ${thoat(item.deliveryAddress || 'trống')}</small></button>`).join('')
          : '<div class="cnkh-message">Không tìm thấy khách hàng.</div>';
      } catch (loi) {
        if (loi.name !== 'AbortError' && lan === lanKhach && conMo()) bao('danh-sach-khach', loi.message, true);
      }
    }

    function hienLuaChon() {
      const phieu = trangThai.phieuChon;
      const khach = trangThai.khachChon;
      lay('phieu-chon').innerHTML = phieu
        ? `<strong>Phiếu: ${thoat(phieu.ID || phieu.maSheet)}</strong><br>${thoat(phieu['TÊN KHÁCH HÀNG'] || 'Chưa có tên')}<br>SĐT: ${thoat(phieu['SỐ ĐIỆN THOẠI'] || 'trống')}<br>Địa chỉ: ${thoat(phieu['ĐỊA CHỈ NGƯỜI NHẬN'] || 'trống')}`
        : 'Chưa chọn phiếu.';
      lay('khach-chon').innerHTML = khach
        ? `<strong>Khách hàng: ${thoat(khach.name)} (${thoat(khach.code)})</strong><br>SĐT hiện tại: ${thoat(khach.phone || 'trống')}<br>Địa chỉ hiện tại: ${thoat(khach.deliveryAddress || 'trống')}`
        : 'Chưa chọn khách hàng.';
      lay('truong').innerHTML = phieu && khach ? [['phone', 'Số điện thoại'], ['deliveryAddress', 'Địa chỉ']].map(([truong, ten]) => {
        const { cu, nguon } = chiTiet(phieu, khach, truong);
        const duocChon = !cu && !!nguon;
        return `<label><input type="checkbox" data-truong-chon="${truong}" ${duocChon ? 'checked' : 'disabled'}>
          ${ten}: ${thoat(cu || 'trống')} → ${thoat(nguon || 'nguồn trống')}${cu ? ' (đã có dữ liệu, không ghi đè)' : ''}</label>`;
      }).join('') : '';
    }

    function hienHangCho() {
      lay('danh-sach-chon').innerHTML = trangThai.hangCho.length ? trangThai.hangCho.map((muc, index) =>
        `<div class="cnkh-queue-item"><strong>${thoat(muc.khach.name)} (${thoat(muc.khach.code)}) ← ${thoat(muc.phieu.ID || muc.phieu.maSheet)}</strong>
          ${muc.truong.map(truong => `<p>${truong === 'phone' ? 'Số điện thoại' : 'Địa chỉ'}: trống → ${thoat(muc.daXem[truong].nguon)}</p>`).join('')}
          ${muc.loi ? `<p class="cnkh-error">${thoat(muc.loi)}</p>` : ''}
          <button type="button" class="btn btn-secondary" data-bo="${index}" ${dangGhi ? 'disabled' : ''}>Bỏ khỏi danh sách</button></div>`).join('')
        : '<div class="cnkh-message">Chưa có khách hàng được chọn.</div>';
      lay('xac-nhan').disabled = dangGhi || !trangThai.hangCho.length;
      lay('them').disabled = dangGhi;
    }

    lay('quay-lai').addEventListener('click', tuyChon.onBack);
    lay('tim-phieu').addEventListener('input', event => {
      clearTimeout(henPhieu); if (huyPhieu) huyPhieu.abort(); lanPhieu++;
      trangThai.tuKhoa = event.target.value.trim(); trangThai.trang = 1;
      bao('danh-sach-phieu', 'Đang chờ tìm kiếm...');
      lay('truoc').disabled = true; lay('sau').disabled = true;
      henPhieu = setTimeout(taiPhieu, 350);
    });
    lay('gioi-han').addEventListener('change', event => { trangThai.gioiHan = Number(event.target.value); trangThai.trang = 1; taiPhieu(); });
    lay('truoc').addEventListener('click', () => { if (trangThai.trang > 1) { trangThai.trang--; taiPhieu(); } });
    lay('sau').addEventListener('click', () => { if (trangThai.coTrangSau) { trangThai.trang++; taiPhieu(); } });
    lay('danh-sach-phieu').addEventListener('click', event => {
      const nut = event.target.closest('[data-phieu]'); if (!nut) return;
      trangThai.phieuChon = trangThai.phieu[Number(nut.dataset.phieu)]; hienLuaChon();
    });
    lay('tim-khach').addEventListener('input', event => {
      clearTimeout(henKhach); if (huyKhach) huyKhach.abort(); lanKhach++;
      bao('danh-sach-khach', 'Đang chờ tìm kiếm...');
      const tuKhoa = event.target.value.trim();
      henKhach = setTimeout(() => timKhach(tuKhoa), 350);
    });
    lay('danh-sach-khach').addEventListener('click', event => {
      const nut = event.target.closest('[data-khach]'); if (!nut) return;
      trangThai.khachChon = trangThai.khach[Number(nut.dataset.khach)]; hienLuaChon();
    });
    lay('them').addEventListener('click', () => {
      const phieu = trangThai.phieuChon, khach = trangThai.khachChon;
      const truong = [...goc.querySelectorAll('[data-truong-chon]:checked')].map(input => input.dataset.truongChon);
      let loi = '';
      if (!phieu || !khach || !truong.length) loi = 'Chọn phiếu, khách hàng và ít nhất một ô có thể bổ sung.';
      else if (trangThai.hangCho.length >= 20) loi = 'Chỉ chọn tối đa 20 khách hàng mỗi lần.';
      else if (trangThai.hangCho.some(muc => muc.khach._id === khach._id)) loi = 'Khách hàng này đã có trong danh sách.';
      if (loi) { bao('loi-chon', loi, true); return; }
      trangThai.hangCho.push({ phieu, khach, truong, daXem: {
        phone: chiTiet(phieu, khach, 'phone'), deliveryAddress: chiTiet(phieu, khach, 'deliveryAddress')
      } });
      lay('loi-chon').textContent = '';
      trangThai.phieuChon = null; trangThai.khachChon = null; hienLuaChon(); hienHangCho();
    });
    lay('danh-sach-chon').addEventListener('click', event => {
      const nut = event.target.closest('[data-bo]'); if (!nut || dangGhi) return;
      trangThai.hangCho.splice(Number(nut.dataset.bo), 1); hienHangCho();
    });
    lay('xac-nhan').addEventListener('click', async () => {
      if (dangGhi || !trangThai.hangCho.length || !window.confirm(`Xác nhận bổ sung thông tin cho ${trangThai.hangCho.length} khách hàng? Chỉ ô còn trống được cập nhật.`)) return;
      dangGhi = true; hienHangCho(); lay('ket-qua').textContent = 'Đang cập nhật...';
      try {
        const danhSach = trangThai.hangCho.map(muc => ({
          maGiaoNhan: muc.phieu._id, maKhachHang: muc.khach._id, truong: muc.truong, daXem: muc.daXem
        }));
        const ketQua = await goiApi('/cap-nhat-thong-tin-khach-hang', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xacNhan: true, danhSach })
        });
        if (!conMo()) return;
        const theoMa = new Map(ketQua.data.map(item => [String(item.maKhachHang), item]));
        trangThai.hangCho = trangThai.hangCho.filter(muc => {
          const item = theoMa.get(String(muc.khach._id));
          if (item?.success) return false;
          muc.loi = item?.message || 'Không nhận được kết quả cập nhật.'; return true;
        });
        lay('ket-qua').textContent = `Đã cập nhật ${ketQua.data.filter(item => item.success).length}/${danhSach.length} khách hàng.`;
        clearTimeout(henKhach); if (huyKhach) huyKhach.abort(); lanKhach++;
        trangThai.khach = []; trangThai.khachChon = null; hienLuaChon();
        lay('tim-khach').value = '';
        bao('danh-sach-khach', 'Tìm lại khách hàng để xem thông tin mới.');
      } catch (loi) {
        if (conMo()) lay('ket-qua').textContent = `Lỗi: ${loi.message}`;
      } finally {
        dangGhi = false; if (conMo()) hienHangCho();
      }
    });
    hienHangCho();
    taiPhieu();
  }

  window.CapNhatThongTinKhachHang = { render, goiApi, thoat, sach };
})();
