/* Trang đăng nhập: ảnh phong cảnh đổi mỗi 2 tiếng, không lặp liên tục. Không đụng tới logic đăng nhập. */
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
  var SLOT_KEY = 'gs_login_img_slot';
  var SLOT_DURATION_MS = 2 * 60 * 60 * 1000;
  var VN_OFFSET_MS = 7 * 3600 * 1000;
  var REQUEST_TIMEOUT_MS = 5000;
  var refreshTimer = null;

  function urlOf(i) { return DIR + PHOTOS[i][0]; }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }

  function currentSlot() {
    return Math.floor((Date.now() + VN_OFFSET_MS) / SLOT_DURATION_MS);
  }

  function msUntilNextSlot() {
    var vnNow = Date.now() + VN_OFFSET_MS;
    var nextSlot = (Math.floor(vnNow / SLOT_DURATION_MS) + 1) * SLOT_DURATION_MS;
    return Math.max(5000, nextSlot - vnNow + 1500);
  }

  // Mỗi 2 tiếng chọn 1 ảnh chưa dùng trong vòng này; hết vòng thì bắt đầu vòng mới (không lặp ảnh vừa dùng).
  function pickIndex() {
    var slot = currentSlot();
    var saved = readJson(SLOT_KEY, null);
    if (saved && saved.slot === slot && PHOTOS[saved.index]) return saved.index;

    var history = readJson(HISTORY_KEY, []);
    var last = history.length ? history[history.length - 1] : -1;
    var unused = [];
    for (var i = 0; i < PHOTOS.length; i++) if (history.indexOf(i) === -1) unused.push(i);
    if (!unused.length) {
      history = [];
      for (var j = 0; j < PHOTOS.length; j++) if (j !== last) unused.push(j);
    }
    var index = unused[slot % unused.length];
    history.push(index);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      localStorage.setItem(SLOT_KEY, JSON.stringify({ slot: slot, index: index }));
    } catch (e) { /* bỏ qua nếu localStorage bị chặn */ }
    return index;
  }

  function showLocal(visual, index) {
    return show(visual, {
      url: urlOf(index),
      label: PHOTOS[index][1],
      intro: 'Khám phá những cảnh sắc và miền đất đặc trưng trên khắp Việt Nam.',
      headline: 'Vẻ đẹp Việt Nam qua từng miền đất'
    });
  }

  function show(visual, photo) {
    var caption = document.getElementById('lgVisualCaption');
    if (caption) caption.textContent = photo.label || '';
    var intro = document.getElementById('lgVisualIntro');
    if (intro) intro.textContent = photo.intro || '';
    var head = document.getElementById('lgVisualHeadline');
    if (head) head.textContent = photo.headline || '';
    var credit = document.getElementById('lgVisualCredit');
    if (credit) {
      credit.hidden = !photo.author || !photo.authorUrl;
      credit.textContent = photo.author ? 'Ảnh: ' + photo.author + ' / Unsplash' : '';
      if (photo.authorUrl) credit.href = photo.authorUrl;
    }
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        visual.style.backgroundImage = 'linear-gradient(180deg, rgba(4,20,30,.35) 0%, rgba(4,20,30,.55) 100%), url("' + photo.url.replace(/"/g, '\\"') + '")';
        visual.classList.add('is-loaded');
        resolve();
      };
      image.onerror = reject;
      image.src = photo.url;
    });
  }

  async function loadUnsplash() {
    if (!/^https?:$/.test(window.location.protocol)) return null;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    try {
      var response = await fetch(window.location.origin + '/api/login-image?slot=' + currentSlot(), {
        credentials: 'same-origin',
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) return null;
      var result = await response.json();
      return result.success && result.url ? result : null;
    } catch (error) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function scheduleNextRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      var screen = document.getElementById('loginScreen');
      if (screen && screen.style.display !== 'none') {
        init();
      }
    }, msUntilNextSlot());
  }

  async function init() {
    var visual = document.getElementById('lgVisual');
    if (!visual) return;
    scheduleNextRefresh();
    var photo = await loadUnsplash();
    if (photo) {
      try {
        await show(visual, photo);
        return;
      } catch (error) {
        // Giữ ảnh cục bộ khi ảnh Unsplash không tải được.
      }
    }
    await showLocal(visual, pickIndex()).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
