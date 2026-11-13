(function () {
  const { goiApi, thoat, sach } = window.CapNhatThongTinKhachHang;
  const cacTruong = [['phone', 'Số điện thoại'], ['deliveryAddress', 'Địa chỉ']];

  function render(vung, tuyChon) {
    vung.innerHTML = `<div class="cnkh">
      <header class="cnkh-header"><div><h2>Cập Nhật TT Khách hàng</h2>
        <p>Gom nhiều phiếu theo tên, gợi ý khách hàng khớp tên duy nhất và chỉ bổ sung ô còn trống.</p></div>
        <div class="cnkh-actions"><button type="button" class="btn btn-secondary" data-thu-cong>Chọn thủ công</button>
          <button type="button" class="btn btn-secondary" data-quay-lai>Quay lại Công Cụ</button></div></header>
      <div class="cnkh-tabs" role="tablist" aria-label="Danh sách cập nhật khách hàng">
        <button type="button" role="tab" aria-selected="true" data-tab-goi-y>Gợi ý cập nhật</button>
        <button type="button" role="tab" aria-selected="false" data-tab-da-cap-nhat>Khách hàng đã cập nhật</button>
      </div>
      <div data-vung-goi-y>
      <section class="cnkh-card">
        <p class="cnkh-note">Tên được so khớp chính xác sau khi bỏ khoảng trắng đầu/cuối, không dùng MST. Tên trùng có thể thuộc nhiều người: anh vui lòng kiểm tra trước khi xác nhận. Nhóm chưa khớp hoặc trùng khách hàng dùng chế độ chọn thủ công.</p>
        <div class="cnkh-search"><input data-tim maxlength="100" placeholder="Tìm tên khách hàng" aria-label="Tìm tên khách hàng">
          <select data-gioi-han aria-label="Số nhóm mỗi trang"><option>20</option><option selected>50</option><option>100</option></select>
          <button type="button" class="btn btn-secondary" data-chon-nhieu>Chọn tối đa 20 gợi ý sẵn sàng</button></div>
        <p class="cnkh-note">Chỉ chọn trên trang hiện tại. Những thông tin khác nhau cần được chọn thủ công trước khi cập nhật.</p>
        <div data-danh-sach aria-live="polite"></div>
        <div class="cnkh-actions"><button type="button" class="btn btn-secondary" data-truoc>Trước</button>
          <span data-trang></span><button type="button" class="btn btn-secondary" data-sau>Sau</button></div>
      </section>
      <section class="cnkh-card cnkh-queue"><h3>Xác nhận cập nhật</h3>
        <p class="cnkh-note">Kiểm tra tên, mã khách hàng và thông tin dự kiến ở các dòng đã chọn. Chỉ cập nhật sau khi xác nhận.</p>
        <div class="cnkh-actions"><button type="button" class="btn btn-primary" data-xac-nhan>Xác nhận cập nhật</button>
          <span data-ket-qua role="status"></span></div>
      </section>
      </div>
      <section class="cnkh-card" data-vung-da-cap-nhat hidden>
        <h3>Khách hàng đã cập nhật</h3>
        <p class="cnkh-note">Danh sách ghi nhận các lần cập nhật thành công qua công cụ từ khi chức năng này được triển khai.</p>
        <div class="cnkh-search"><input data-tim-da maxlength="100" placeholder="Tìm tên hoặc mã khách hàng" aria-label="Tìm khách hàng đã cập nhật">
          <select data-gioi-han-da aria-label="Số khách hàng mỗi trang"><option>20</option><option selected>50</option><option>100</option></select></div>
        <div data-danh-sach-da aria-live="polite"></div>
        <div class="cnkh-actions"><button type="button" class="btn btn-secondary" data-truoc-da>Trước</button>
          <span data-trang-da></span><button type="button" class="btn btn-secondary" data-sau-da>Sau</button></div>
      </section>
    </div>`;
    const goc = vung.querySelector('.cnkh');
    const lay = ten => goc.querySelector(`[data-${ten}]`);
    const conMo = () => goc.isConnected;
    const trangThai = { trang: 1, gioiHan: 50, tuKhoa: '', nhom: [], coTrangSau: false, mo: null };
    const trangThaiDa = { trang: 1, gioiHan: 50, tuKhoa: '', daTai: false, coTrangSau: false };
    let dangGhi = false;
    let lanNhom = 0;
    let lanGiaTri = 0;
    let huyNhom;
    let huyGiaTri;
    let henTim;
    let henTimDa;
    let lanDa = 0;
    let huyDa;
    const soDaChon = () => trangThai.nhom.filter(item => item.daChon).length;
    const khach = item => item.khachHang.length === 1 ? item.khachHang[0] : null;
    const coTheChon = item => {
      const cacMuc = cacTruong.filter(([truong]) => item.luaChon[truong].bat);
      return !!khach(item) && cacMuc.length > 0 && cacMuc.every(([truong]) => item.luaChon[truong].giaTri);
    };

    function hienThi() {
      lay('danh-sach').innerHTML = trangThai.nhom.length ? trangThai.nhom.map((item, index) => {
        const khachHang = khach(item);
        const lyDo = item.khachHang.length > 1 ? 'Có nhiều khách hàng cùng tên; cần chọn thủ công.'
          : !khachHang ? 'Chưa tìm thấy khách hàng khớp chính xác; cần chọn thủ công.' : '';
        const chiTiet = khachHang ? cacTruong.map(([truong, ten]) => {
          const muc = item.luaChon[truong];
          const cu = sach(khachHang[truong]);
          if (cu) return `<div class="cnkh-suggest-field">${ten}: ${thoat(cu)} <small>(đã có dữ liệu, không ghi đè)</small></div>`;
          if (!item[`${truong}Min`]) return `<div class="cnkh-suggest-field">${ten}: <small>không có dữ liệu nguồn</small></div>`;
          const xungDot = sach(item[`${truong}Min`].giaTri) !== sach(item[`${truong}Max`]?.giaTri);
          const giaTri = muc.giaTri ? thoat(muc.giaTri.giaTri) : 'Chưa chọn thông tin';
          return `<div class="cnkh-suggest-field"><label><input type="checkbox" data-bat="${index}:${truong}" ${muc.bat ? 'checked' : ''} ${dangGhi ? 'disabled' : ''}>
            ${ten}: trống → <strong>${giaTri}</strong></label>
            ${xungDot ? `<button type="button" class="btn btn-secondary" data-xem="${index}:${truong}" ${dangGhi ? 'disabled' : ''}>${muc.giaTri ? 'Đổi lựa chọn' : 'Chọn trong các giá trị khác nhau'}</button>` : ''}
          </div>`;
        }).join('') : '';
        const mo = trangThai.mo;
        const danhSachGiaTri = mo?.index === index ? `<div class="cnkh-conflict">
          <strong>Chọn ${mo.truong === 'phone' ? 'số điện thoại' : 'địa chỉ'} đúng cho ${thoat(item._id)}</strong>
          <div class="cnkh-list">${mo.dangTai ? '<div class="cnkh-message">Đang tải...</div>'
            : mo.loi ? `<div class="cnkh-message cnkh-error">${thoat(mo.loi)}</div>`
              : mo.items.length ? mo.items.map((giaTri, viTri) => `<button type="button" class="cnkh-item" data-gia-tri="${viTri}">${thoat(giaTri._id)} <small>${giaTri.soPhieu} phiếu</small></button>`).join('')
                : '<div class="cnkh-message">Không có thông tin.</div>'}</div>
          <div class="cnkh-actions"><button type="button" class="btn btn-secondary" data-gia-tri-truoc ${mo.trang <= 1 || mo.dangTai ? 'disabled' : ''}>Trước</button>
            <span>Trang ${mo.trang}</span><button type="button" class="btn btn-secondary" data-gia-tri-sau ${!mo.coTrangSau || mo.dangTai ? 'disabled' : ''}>Sau</button>
            <button type="button" class="btn btn-secondary" data-dong-gia-tri>Đóng</button></div></div>` : '';
        return `<div class="cnkh-suggest-item"><div class="cnkh-suggest-title">
          <input type="checkbox" data-chon="${index}" aria-label="Chọn ${thoat(item._id)}" ${item.daChon ? 'checked' : ''} ${!coTheChon(item) || dangGhi ? 'disabled' : ''}>
          <div><strong>${thoat(item._id)}</strong> <small>· ${item.soPhieu} phiếu</small><br>
            ${khachHang ? `Khách hàng: <strong>${thoat(khachHang.name)}</strong> · Mã ${thoat(khachHang.code)}` : `<span class="cnkh-error">${thoat(lyDo)}</span>`}</div></div>
          ${chiTiet}${danhSachGiaTri}${item.loi ? `<div class="cnkh-error">${thoat(item.loi)}</div>` : ''}</div>`;
      }).join('') : '<div class="cnkh-message">Không có nhóm khách hàng phù hợp.</div>';
      lay('trang').textContent = `Trang ${trangThai.trang}`;
      lay('truoc').disabled = dangGhi || trangThai.trang <= 1;
      lay('sau').disabled = dangGhi || !trangThai.coTrangSau;
      lay('chon-nhieu').disabled = dangGhi || !trangThai.nhom.some(item => coTheChon(item) && !item.daChon);
      lay('xac-nhan').disabled = dangGhi || !soDaChon();
      lay('xac-nhan').textContent = `Xác nhận cập nhật (${soDaChon()})`;
      lay('thu-cong').disabled = dangGhi;
      lay('quay-lai').disabled = dangGhi;
      lay('tim').disabled = dangGhi;
      lay('gioi-han').disabled = dangGhi;
      lay('tab-goi-y').disabled = dangGhi;
      lay('tab-da-cap-nhat').disabled = dangGhi;
    }

    function khoiTao(item) {
      const khachHang = khach(item);
      item.luaChon = Object.fromEntries(cacTruong.map(([truong]) => {
        const min = item[`${truong}Min`];
        const max = item[`${truong}Max`];
        const bat = !!khachHang && !sach(khachHang[truong]) && !!min;
        return [truong, { bat, giaTri: bat && sach(min.giaTri) === sach(max?.giaTri) ? min : null }];
      }));
      item.daChon = false;
      return item;
    }

    async function taiNhom() {
      if (!conMo()) return;
      if (huyNhom) huyNhom.abort();
      if (huyGiaTri) huyGiaTri.abort();
      lanGiaTri++;
      huyNhom = new AbortController();
      const lan = ++lanNhom;
      trangThai.mo = null;
      trangThai.nhom = [];
      lay('ket-qua').textContent = '';
      hienThi();
      lay('danh-sach').innerHTML = '<div class="cnkh-message">Đang tổng hợp gợi ý...</div>';
      lay('truoc').disabled = true; lay('sau').disabled = true;
      try {
        const thamSo = new URLSearchParams({ q: trangThai.tuKhoa, page: String(trangThai.trang), limit: String(trangThai.gioiHan) });
        const ketQua = await goiApi(`/nhom-cap-nhat-khach-hang?${thamSo}`, { signal: huyNhom.signal });
        if (lan !== lanNhom || !conMo()) return;
        trangThai.nhom = ketQua.items.map(khoiTao);
        trangThai.coTrangSau = ketQua.hasMore;
        hienThi();
      } catch (loi) {
        if (loi.name !== 'AbortError' && lan === lanNhom && conMo()) {
          lay('danh-sach').innerHTML = `<div class="cnkh-message cnkh-error">${thoat(loi.message)}</div>`;
        }
      }
    }

    async function taiGiaTri(index, truong, trang) {
      if (huyGiaTri) huyGiaTri.abort();
      huyGiaTri = new AbortController();
      const lan = ++lanGiaTri;
      const item = trangThai.nhom[index];
      trangThai.mo = { index, truong, trang, items: [], dangTai: true, coTrangSau: false };
      hienThi();
      try {
        const thamSo = new URLSearchParams({ ten: item._id, truong, page: String(trang) });
        const ketQua = await goiApi(`/gia-tri-khach-hang?${thamSo}`, { signal: huyGiaTri.signal });
        if (lan !== lanGiaTri || !conMo()) return;
        trangThai.mo = { index, truong, trang, items: ketQua.items, dangTai: false, coTrangSau: ketQua.hasMore };
        hienThi();
      } catch (loi) {
        if (loi.name !== 'AbortError' && lan === lanGiaTri && conMo()) {
          trangThai.mo = { index, truong, trang, items: [], dangTai: false, coTrangSau: false, loi: loi.message };
          hienThi();
        }
      }
    }

    async function taiDaCapNhat() {
      if (!conMo()) return;
      if (huyDa) huyDa.abort();
      huyDa = new AbortController();
      const lan = ++lanDa;
      trangThaiDa.daTai = false;
      lay('danh-sach-da').innerHTML = '<div class="cnkh-message">Đang tải khách hàng đã cập nhật...</div>';
      lay('truoc-da').disabled = true; lay('sau-da').disabled = true;
      try {
        const thamSo = new URLSearchParams({ q: trangThaiDa.tuKhoa, page: String(trangThaiDa.trang), limit: String(trangThaiDa.gioiHan) });
        const ketQua = await goiApi(`/khach-hang-da-cap-nhat?${thamSo}`, { signal: huyDa.signal });
        if (lan !== lanDa || !conMo()) return;
        trangThaiDa.daTai = true;
        trangThaiDa.coTrangSau = ketQua.hasMore;
        lay('danh-sach-da').innerHTML = ketQua.items.length ? ketQua.items.map(item => {
          const ngay = new Date(item.lucCapNhat);
          const thoiGian = Number.isNaN(ngay.getTime()) ? 'Không xác định' : ngay.toLocaleString('vi-VN');
          return `<div class="cnkh-suggest-item"><strong>${thoat(item.name)}</strong> · Mã ${thoat(item.code)}
            <p>Số điện thoại: ${thoat(sach(item.phone) || 'trống')}</p>
            <p>Địa chỉ: ${thoat(sach(item.deliveryAddress) || 'trống')}</p>
            <small>Cập nhật: ${thoat(thoiGian)}</small></div>`;
        }).join('') : '<div class="cnkh-message">Chưa có khách hàng đã cập nhật phù hợp.</div>';
        lay('trang-da').textContent = `Trang ${trangThaiDa.trang}`;
        lay('truoc-da').disabled = trangThaiDa.trang <= 1;
        lay('sau-da').disabled = !trangThaiDa.coTrangSau;
      } catch (loi) {
        if (loi.name !== 'AbortError' && lan === lanDa && conMo()) {
          trangThaiDa.daTai = false;
          lay('danh-sach-da').innerHTML = `<div class="cnkh-message cnkh-error">${thoat(loi.message)}</div><button type="button" class="btn btn-secondary" data-thu-lai-da>Thử lại</button>`;
        }
      }
    }

    function chuyenTab(daCapNhat) {
      if (!daCapNhat) {
        clearTimeout(henTimDa);
        if (huyDa) huyDa.abort();
        lanDa++;
      }
      lay('vung-goi-y').hidden = daCapNhat;
      lay('vung-da-cap-nhat').hidden = !daCapNhat;
      lay('tab-goi-y').setAttribute('aria-selected', String(!daCapNhat));
      lay('tab-da-cap-nhat').setAttribute('aria-selected', String(daCapNhat));
      if (daCapNhat && !trangThaiDa.daTai) taiDaCapNhat();
    }

    lay('quay-lai').addEventListener('click', tuyChon.onBack);
    lay('thu-cong').addEventListener('click', tuyChon.onManual);
    lay('tab-goi-y').addEventListener('click', () => chuyenTab(false));
    lay('tab-da-cap-nhat').addEventListener('click', () => chuyenTab(true));
    lay('tim-da').addEventListener('input', event => {
      clearTimeout(henTimDa); if (huyDa) huyDa.abort(); lanDa++;
      trangThaiDa.tuKhoa = event.target.value.trim(); trangThaiDa.trang = 1; trangThaiDa.daTai = false;
      lay('danh-sach-da').innerHTML = '<div class="cnkh-message">Đang chờ tìm kiếm...</div>';
      lay('truoc-da').disabled = true; lay('sau-da').disabled = true;
      henTimDa = setTimeout(taiDaCapNhat, 350);
    });
    lay('gioi-han-da').addEventListener('change', event => { trangThaiDa.gioiHan = Number(event.target.value); trangThaiDa.trang = 1; taiDaCapNhat(); });
    lay('truoc-da').addEventListener('click', () => { if (trangThaiDa.trang > 1) { trangThaiDa.trang--; taiDaCapNhat(); } });
    lay('sau-da').addEventListener('click', () => { if (trangThaiDa.coTrangSau) { trangThaiDa.trang++; taiDaCapNhat(); } });
    lay('danh-sach-da').addEventListener('click', event => { if (event.target.closest('[data-thu-lai-da]')) taiDaCapNhat(); });
    lay('tim').addEventListener('input', event => {
      clearTimeout(henTim);
      if (huyNhom) huyNhom.abort();
      if (huyGiaTri) huyGiaTri.abort();
      lanNhom++; lanGiaTri++;
      trangThai.tuKhoa = event.target.value.trim(); trangThai.trang = 1;
      trangThai.nhom = []; trangThai.mo = null; hienThi();
      lay('ket-qua').textContent = '';
      lay('danh-sach').innerHTML = '<div class="cnkh-message">Đang chờ tìm kiếm...</div>';
      lay('truoc').disabled = true; lay('sau').disabled = true;
      henTim = setTimeout(taiNhom, 350);
    });
    lay('gioi-han').addEventListener('change', event => { trangThai.gioiHan = Number(event.target.value); trangThai.trang = 1; taiNhom(); });
    lay('truoc').addEventListener('click', () => { if (trangThai.trang > 1) { trangThai.trang--; taiNhom(); } });
    lay('sau').addEventListener('click', () => { if (trangThai.coTrangSau) { trangThai.trang++; taiNhom(); } });
    lay('chon-nhieu').addEventListener('click', () => {
      let soLuong = soDaChon();
      trangThai.nhom.forEach(item => { if (!item.daChon && coTheChon(item) && soLuong < 20) { item.daChon = true; soLuong++; } });
      lay('ket-qua').textContent = `Đã chọn ${soLuong} khách hàng trên trang này.`;
      hienThi();
    });
    lay('danh-sach').addEventListener('change', event => {
      if (dangGhi) return;
      if (event.target.dataset.chon !== undefined) {
        const item = trangThai.nhom[Number(event.target.dataset.chon)];
        if (event.target.checked && soDaChon() >= 20) {
          lay('ket-qua').textContent = 'Chỉ chọn tối đa 20 khách hàng mỗi lần.';
        } else item.daChon = event.target.checked;
      } else if (event.target.dataset.bat) {
        const [index, truong] = event.target.dataset.bat.split(':');
        const item = trangThai.nhom[Number(index)];
        item.luaChon[truong].bat = event.target.checked;
        if (!coTheChon(item)) item.daChon = false;
      }
      hienThi();
    });
    lay('danh-sach').addEventListener('click', event => {
      if (dangGhi) return;
      const xem = event.target.closest('[data-xem]');
      if (xem) { const [index, truong] = xem.dataset.xem.split(':'); taiGiaTri(Number(index), truong, 1); return; }
      const mo = trangThai.mo;
      if (!mo) return;
      const chon = event.target.closest('[data-gia-tri]');
      if (chon) {
        const luaChon = mo.items[Number(chon.dataset.giaTri)];
        trangThai.nhom[mo.index].luaChon[mo.truong].giaTri = { giaTri: luaChon._id, maPhieu: luaChon.maPhieu };
        trangThai.mo = null; hienThi(); return;
      }
      if (event.target.closest('[data-gia-tri-truoc]') && mo.trang > 1) taiGiaTri(mo.index, mo.truong, mo.trang - 1);
      else if (event.target.closest('[data-gia-tri-sau]') && mo.coTrangSau) taiGiaTri(mo.index, mo.truong, mo.trang + 1);
      else if (event.target.closest('[data-dong-gia-tri]')) { if (huyGiaTri) huyGiaTri.abort(); lanGiaTri++; trangThai.mo = null; hienThi(); }
    });
    lay('xac-nhan').addEventListener('click', async () => {
      const daChon = trangThai.nhom.filter(item => item.daChon);
      if (dangGhi || !daChon.length || !window.confirm(`Xác nhận bổ sung thông tin cho ${daChon.length} khách hàng đã chọn?`)) return;
      if (huyGiaTri) huyGiaTri.abort(); lanGiaTri++; trangThai.mo = null;
      dangGhi = true; hienThi(); lay('ket-qua').textContent = 'Đang cập nhật...';
      try {
        const danhSach = daChon.map(item => {
          const khachHang = khach(item);
          const truong = cacTruong.filter(([ten]) => item.luaChon[ten].bat).map(([ten]) => ten);
          return {
            maKhachHang: khachHang._id, truong,
            maPhieuTheoTruong: Object.fromEntries(truong.map(ten => [ten, item.luaChon[ten].giaTri.maPhieu])),
            daXem: Object.fromEntries(cacTruong.map(([ten]) => [ten, { cu: sach(khachHang[ten]), nguon: sach(item.luaChon[ten].giaTri?.giaTri) }])),
            nhom: { ten: item._id, ...Object.fromEntries(truong.map(ten => [ten, {
              min: sach(item[`${ten}Min`]?.giaTri), max: sach(item[`${ten}Max`]?.giaTri)
            }])) }
          };
        });
        const ketQua = await goiApi('/cap-nhat-thong-tin-khach-hang', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xacNhan: true, danhSach })
        });
        if (!conMo()) return;
        const theoMa = new Map(ketQua.data.map(item => [String(item.maKhachHang), item]));
        daChon.forEach(item => {
          const ketQuaKhach = theoMa.get(String(khach(item)._id));
          if (!ketQuaKhach?.success) { item.loi = ketQuaKhach?.message || 'Không nhận được kết quả cập nhật.'; return; }
          item.daCapNhat = true;
        });
        trangThai.nhom = trangThai.nhom.filter(item => !item.daCapNhat);
        if (ketQua.data.some(item => item.success)) {
          clearTimeout(henTimDa); if (huyDa) huyDa.abort(); lanDa++;
          trangThaiDa.daTai = false;
        }
        lay('ket-qua').textContent = `Đã cập nhật ${ketQua.data.filter(item => item.success).length}/${daChon.length} khách hàng.`;
      } catch (loi) {
        if (conMo()) lay('ket-qua').textContent = `Lỗi: ${loi.message}`;
      } finally {
        dangGhi = false; if (conMo()) hienThi();
      }
    });
    taiNhom();
  }

  window.GoiYCapNhatKhachHang = { render };
})();
