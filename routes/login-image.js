const express = require('express');
const router = express.Router();

const PER_PAGE = 30;
const PAGES = 3;
let cache = { day: '', data: null };

// Mỗi ngày một địa danh; ảnh tìm theo đúng địa danh nên lời giới thiệu luôn khớp với ảnh.
const DESTINATIONS = [
  { name: 'Thành phố Hồ Chí Minh', headline: 'Sài Gòn không ngủ, nhịp sống không ngừng', query: 'ho chi minh city skyline', intro: 'Thành phố lớn nhất Việt Nam và là trung tâm kinh tế năng động bậc nhất cả nước, nổi tiếng với nhịp sống không ngủ, ẩm thực đường phố phong phú và những tòa nhà chọc trời bên dòng sông Sài Gòn.' },
  { name: 'Hà Nội', headline: 'Nghìn năm văn hiến, thanh lịch từng góc phố', query: 'hanoi vietnam', intro: 'Thủ đô nghìn năm văn hiến với Hồ Gươm, phố cổ 36 phố phường và nét thanh lịch riêng, nơi cổ kính và hiện đại hòa quyện.' },
  { name: 'Đà Nẵng', headline: 'Thành phố đáng sống bên bờ biển miền Trung', query: 'da nang vietnam', intro: 'Thành phố đáng sống bên bờ biển miền Trung, nổi bật với cầu Rồng, bãi biển Mỹ Khê và bán đảo Sơn Trà.' },
  { name: 'Vịnh Hạ Long', headline: 'Kỳ quan giữa muôn trùng sóng nước', query: 'ha long bay', intro: 'Di sản thiên nhiên thế giới với hàng nghìn đảo đá vôi nhô lên giữa làn nước xanh ngọc, một trong những kỳ quan đẹp nhất Việt Nam.' },
  { name: 'Hội An', headline: 'Phố cổ lung linh trong ánh đèn lồng', query: 'hoi an ancient town', intro: 'Phố cổ ven sông Hoài với những ngôi nhà vàng, đèn lồng rực rỡ về đêm và nét văn hóa giao thoa Việt - Nhật - Hoa.' },
  { name: 'Huế', headline: 'Cố đô trầm mặc bên dòng sông Hương', query: 'hue imperial city vietnam', intro: 'Cố đô triều Nguyễn bên dòng sông Hương, lưu giữ quần thể di tích cung đình và nền ẩm thực tinh tế.' },
  { name: 'Ninh Bình', headline: 'Hạ Long trên cạn giữa núi non sông nước', query: 'ninh binh tam coc', intro: 'Vùng đất của Tràng An, Tam Cốc - Bích Động với núi đá vôi, sông nước và đồng lúa, được ví như Hạ Long trên cạn.' },
  { name: 'Đà Lạt', headline: 'Thành phố ngàn hoa trong sương mờ cao nguyên', query: 'da lat vietnam', intro: 'Thành phố ngàn hoa trên cao nguyên, khí hậu mát mẻ quanh năm với đồi thông, hồ nước và những vườn hoa rực rỡ.' },
  { name: 'Sa Pa', headline: 'Ruộng bậc thang vờn mây giữa đại ngàn', query: 'sapa rice terraces', intro: 'Thị trấn trong sương giữa dãy Hoàng Liên Sơn, nổi tiếng với ruộng bậc thang và bản sắc văn hóa các dân tộc vùng cao.' },
  { name: 'Phú Quốc', headline: 'Đảo ngọc với biển xanh và hoàng hôn rực rỡ', query: 'phu quoc island', intro: 'Đảo ngọc phía Nam với bãi cát trắng, nước biển trong xanh và hoàng hôn đẹp nhất Việt Nam.' }
];

function dayKey() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

async function fetchFromUnsplash(key) {
  const dayNo = Math.floor((Date.now() + 7 * 3600 * 1000) / 86400000);
  const dest = DESTINATIONS[dayNo % DESTINATIONS.length];
  const page = (Math.floor(dayNo / DESTINATIONS.length) % PAGES) + 1;
  const params = new URLSearchParams({ query: dest.query, orientation: 'landscape', per_page: String(PER_PAGE), page: String(page), content_filter: 'high' });
  const resp = await fetch('https://api.unsplash.com/search/photos?' + params, { headers: { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1' } });
  if (!resp.ok) throw new Error('Unsplash ' + resp.status);
  const json = await resp.json();
  const results = (json.results || []).filter(p => p.urls && p.urls.raw);
  if (!results.length) throw new Error('Unsplash empty');
  const photo = results[dayNo % results.length];
  const utm = '?utm_source=goldensign_erp&utm_medium=referral';
  return {
    url: photo.urls.raw + '&w=1920&q=75&fm=webp&fit=crop',
    label: dest.name,
    headline: dest.headline,
    intro: dest.intro,
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
