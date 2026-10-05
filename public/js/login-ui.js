/* Trang đăng nhập: ảnh phong cảnh Việt Nam đổi mỗi ngày, không lặp liên tục. Không đụng tới logic đăng nhập. */
(function () {
  'use strict';

  var DIR = 'public/img/login/';
  var PHOTOS = [
    ['lang-co.webp', 'Lăng Cô, Huế'],
    ['hai-van.webp', 'Đèo Hải Vân'],
    ['ha-giang.webp', 'Hà Giang'],
    ['lang-son.webp', 'Lạng Sơn'],
    ['dien-bien.webp', 'Mường Thanh, Điện Biên'],
    ['hue.webp', 'Kinh thành Huế'],
    ['cat-ba.webp', 'Cát Bà, Hải Phòng'],
    ['bai-chay.webp', 'Bãi Cháy, Hạ Long'],
    ['ninh-binh.webp', 'Ninh Bình'],
    ['phong-nha.webp', 'Phong Nha - Kẻ Bàng'],
    ['ha-long.webp', 'Vịnh Hạ Long'],
    ['ao-ech.webp', 'Vườn quốc gia Cát Bà']
  ];
  var HISTORY_KEY = 'gs_login_img_history';
  var DAY_KEY = 'gs_login_img_day';

  function urlOf(i) { return DIR + PHOTOS[i][0]; }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // Mỗi ngày chọn 1 ảnh chưa dùng trong vòng này; hết vòng thì bắt đầu vòng mới (không lặp ảnh hôm qua).
  function pickIndex() {
    var saved = readJson(DAY_KEY, null);
    if (saved && saved.day === today() && PHOTOS[saved.index]) return saved.index;

    var history = readJson(HISTORY_KEY, []);
    var last = history.length ? history[history.length - 1] : -1;
    var unused = [];
    for (var i = 0; i < PHOTOS.length; i++) if (history.indexOf(i) === -1) unused.push(i);
    if (!unused.length) {
      history = [];
      for (var j = 0; j < PHOTOS.length; j++) if (j !== last) unused.push(j);
    }
    var seed = Math.floor(Date.now() / 86400000);
    var index = unused[seed % unused.length];
    history.push(index);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      localStorage.setItem(DAY_KEY, JSON.stringify({ day: today(), index: index }));
    } catch (e) { /* bỏ qua nếu localStorage bị chặn */ }
    return index;
  }

  function show(visual, index) {
    var caption = document.getElementById('lgVisualCaption');
    visual.style.backgroundImage = 'linear-gradient(180deg, rgba(4,20,30,.35) 0%, rgba(4,20,30,.55) 100%), url("' + urlOf(index) + '")';
    visual.classList.add('is-loaded');
    if (caption) caption.textContent = PHOTOS[index][1];
  }

  function load(visual, index, attempts) {
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () { show(visual, index); };
    img.onerror = function () {
      // Ảnh lỗi: thử ảnh kế tiếp, tối đa 3 lần; nếu vẫn lỗi giữ nền gradient mặc định.
      if (attempts < 3) load(visual, (index + 1) % PHOTOS.length, attempts + 1);
    };
    img.src = urlOf(index);
  }

  function setBackground(visual, url) {
    visual.style.backgroundImage = 'linear-gradient(180deg, rgba(4,20,30,.35) 0%, rgba(4,20,30,.55) 100%), url("' + url + '")';
    visual.classList.add('is-loaded');
  }

  function showRemote(visual, data) {
    var caption = document.getElementById('lgVisualCaption');
    setBackground(visual, data.url);
    if (caption) caption.textContent = data.label;
    var box = caption && caption.parentNode;
    if (box && data.author) {
      var credit = document.createElement('a');
      credit.href = data.sourceUrl;
      credit.target = '_blank';
      credit.rel = 'noopener noreferrer';
      credit.className = 'lg-credit';
      credit.textContent = 'Ảnh: ' + data.author + ' / Unsplash';
      box.appendChild(credit);
    }
  }

  // Ưu tiên ảnh Unsplash do server chọn theo ngày; lỗi hoặc chưa cấu hình key thì dùng ảnh local.
  function loadRemote(visual, fallback) {
    if (!window.fetch) return fallback();
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 3000);
    fetch('/api/login-image', ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        clearTimeout(timer);
        if (!data || !data.success || !data.url) return fallback();
        var img = new Image();
        img.decoding = 'async';
        img.onload = function () { showRemote(visual, data); };
        img.onerror = fallback;
        img.src = data.url;
      })
      .catch(function () { clearTimeout(timer); fallback(); });
  }

  function init() {
    var visual = document.getElementById('lgVisual');
    if (!visual) return;
    var fallback = function () { load(visual, pickIndex(), 0); };
    var start = function () { loadRemote(visual, fallback); };
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 }); else setTimeout(start, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
