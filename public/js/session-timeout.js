(function () {
  'use strict';

  var TOKEN_KEY = 'datags_auth_token';
  var ACTIVITY_KEY = 'datags_last_activity';
  var TIMEOUT_MS = 30 * 60 * 1000;
  var CHECK_INTERVAL_MS = 15000;
  var WRITE_INTERVAL_MS = 5000;
  var lastWrite = 0;
  var daXuLyDangXuat = false;

  function coToken() {
    return Boolean(localStorage.getItem(TOKEN_KEY));
  }

  function ghiHoatDong() {
    if (!coToken()) return;
    var now = Date.now();
    if (now - lastWrite < WRITE_INTERVAL_MS) return;
    lastWrite = now;
    daXuLyDangXuat = false;
    localStorage.setItem(ACTIVITY_KEY, String(now));
  }

  function thongBaoDangXuat() {
    if (daXuLyDangXuat) return;
    daXuLyDangXuat = true;
    var suKien = new CustomEvent('datags:session-timeout', { cancelable: true, detail: { timeoutMs: TIMEOUT_MS } });
    if (window.dispatchEvent(suKien)) {
      window.alert('Phiên đăng nhập đã hết do không có thao tác trong 30 phút.');
      window.location.assign('/');
    }
  }

  function dangXuatTuDong() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    thongBaoDangXuat();
  }

  function kiemTraPhien() {
    if (!coToken()) return;
    var lanCuoi = Number(localStorage.getItem(ACTIVITY_KEY));
    if (!Number.isFinite(lanCuoi) || lanCuoi <= 0) {
      ghiHoatDong();
      return;
    }
    if (Date.now() - lanCuoi >= TIMEOUT_MS) dangXuatTuDong();
  }

  ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart'].forEach(function (tenSuKien) {
    window.addEventListener(tenSuKien, ghiHoatDong, { passive: true, capture: true });
  });
  window.addEventListener('focus', function () {
    kiemTraPhien();
    if (coToken()) ghiHoatDong();
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) kiemTraPhien();
  });
  window.addEventListener('storage', function (event) {
    if (event.key === ACTIVITY_KEY && coToken()) daXuLyDangXuat = false;
    if (event.key === TOKEN_KEY && event.newValue === null) thongBaoDangXuat();
  });

  kiemTraPhien();
  window.setInterval(kiemTraPhien, CHECK_INTERVAL_MS);
})();
