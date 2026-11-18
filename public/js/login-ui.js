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
  var REQUEST_TIMEOUT_MS = 5000;

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
      var response = await fetch(window.location.origin + '/api/login-image', {
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

  async function init() {
    var visual = document.getElementById('lgVisual');
    if (!visual) return;
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
