const express = require('express');
const router = express.Router();

const QUERY = process.env.UNSPLASH_LOGIN_QUERY || 'vietnam landscape';
const PER_PAGE = 30;
const PAGES = 5;
let cache = { day: '', data: null };

function dayKey() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

async function fetchFromUnsplash(key) {
  const dayNo = Math.floor((Date.now() + 7 * 3600 * 1000) / 86400000);
  const page = (Math.floor(dayNo / PER_PAGE) % PAGES) + 1;
  const params = new URLSearchParams({ query: QUERY, orientation: 'landscape', per_page: String(PER_PAGE), page: String(page), content_filter: 'high' });
  const resp = await fetch('https://api.unsplash.com/search/photos?' + params, { headers: { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1' } });
  if (!resp.ok) throw new Error('Unsplash ' + resp.status);
  const json = await resp.json();
  const results = (json.results || []).filter(p => p.urls && p.urls.raw);
  if (!results.length) throw new Error('Unsplash empty');
  const photo = results[dayNo % results.length];
  const utm = '?utm_source=goldensign_erp&utm_medium=referral';
  return {
    url: photo.urls.raw + '&w=1920&q=75&fm=webp&fit=crop',
    label: photo.location?.name || 'Việt Nam',
    author: photo.user?.name || '',
    authorUrl: (photo.user?.links?.html || 'https://unsplash.com') + utm,
    sourceUrl: (photo.links?.html || 'https://unsplash.com') + utm
  };
}

// Công khai (trang đăng nhập chưa có token); chỉ trả ảnh nền, không có dữ liệu hệ thống.
router.get('/', async (req, res) => {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return res.json({ success: false });
  const today = dayKey();
  try {
    if (cache.day !== today || !cache.data) cache = { day: today, data: await fetchFromUnsplash(key) };
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ success: true, ...cache.data });
  } catch (error) {
    if (cache.data) return res.json({ success: true, ...cache.data });
    res.json({ success: false });
  }
});

module.exports = router;
