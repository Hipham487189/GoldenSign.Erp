/* Trang đăng nhập: ảnh phong cảnh Việt Nam đổi mỗi ngày, không lặp liên tục. Không đụng tới logic đăng nhập. */
(function () {
  'use strict';

  var DIR = 'public/img/login/';
  var PHOTOS = [
    ['hai-van.webp', 'Đèo Hải Vân'],
    ['ha-giang.webp', 'Hà Giang'],
    ['dien-bien.webp', 'Mường Thanh, Điện Biên'],
    ['cat-ba.webp', 'Cát Bà, Hải Phòng'],
    ['bai-chay.webp', 'Bãi Cháy, Hạ Long'],
    ['ha-long.webp', 'Vịnh Hạ Long']
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
    var intro = document.getElementById('lgVisualIntro');
    if (intro) intro.textContent = 'Khám phá những cảnh sắc và miền đất đặc trưng trên khắp Việt Nam.';
    var head = document.getElementById('lgVisualHeadline');
    if (head) head.textContent = 'Vẻ đẹp Việt Nam qua từng miền đất';
  }

  function init() {
    var visual = document.getElementById('lgVisual');
    if (!visual) return;
    show(visual, pickIndex());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
