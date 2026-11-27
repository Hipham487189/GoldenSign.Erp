const express = require('express');
const router = express.Router();

const PER_PAGE = 30;
const TOP_PICK_POOL = 8;
const SLOT_DURATION_MS = 2 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 3600 * 1000;
const RETRY_DELAY_MS = 30 * 60 * 1000;
let cache = { slot: -1, data: null };
let unsplashDisabled = false;
let retryAt = 0;

// Mỗi khung 2 tiếng một chủ đề/địa danh với từ khóa giàu thẩm mỹ để Unsplash trả về ảnh sắc nét, sang trọng.
const DESTINATIONS = [
  { name: 'Thành phố Hồ Chí Minh', headline: 'Sài Gòn rực rỡ ánh đèn bên dòng sông đêm', query: 'ho chi minh city skyline night aerial', intro: 'Trung tâm kinh tế năng động bậc nhất cả nước với đường chân trời hiện đại, những tòa tháp lung linh ánh đèn và nhịp sống không ngừng nghỉ.' },
  { name: 'Vịnh Hạ Long', headline: 'Kỳ quan huyền ảo giữa làn nước xanh ngọc', query: 'ha long bay aerial emerald water sunset', intro: 'Di sản thiên nhiên thế giới với hàng nghìn đảo đá vôi kỳ vĩ nhô lên giữa làn nước xanh ngọc trong ánh hoàng hôn rực rỡ.' },
  { name: 'Hội An', headline: 'Phố cổ lung linh trong ánh đèn lồng vàng', query: 'hoi an lantern night river vietnam', intro: 'Phố cổ ven sông Hoài với những mái ngói rêu phong, dãy đèn lồng rực rỡ về đêm và nét văn hóa giao thoa tinh tế.' },
  { name: 'Ninh Bình', headline: 'Tuyệt tác núi non sông nước lúc bình minh', query: 'ninh binh tam coc aerial misty sunrise', intro: 'Vùng đất Tràng An, Tam Cốc với những dãy núi đá vôi trùng điệp soi bóng xuống dòng sông uốn lượn trong sương sớm.' },
  { name: 'Đà Nẵng', headline: 'Thành phố biển hiện đại và cầu Rồng rực sáng', query: 'da nang dragon bridge night skyline', intro: 'Thành phố đáng sống bên bờ biển miền Trung, nổi bật với những cây cầu biểu tượng và bãi biển trải dài.' },
  { name: 'Sa Pa', headline: 'Biển mây bồng bềnh trên ruộng bậc thang', query: 'sapa terraced rice fields clouds sunrise', intro: 'Thị trấn trong sương giữa dãy Hoàng Liên Sơn, nơi những thửa ruộng bậc thang vàng óng hòa quyện cùng biển mây đại ngàn.' },
  { name: 'Phú Quốc', headline: 'Hoàng hôn tím biếc trên đảo ngọc phương Nam', query: 'phu quoc island tropical sunset ocean', intro: 'Đảo ngọc với bờ cát trắng mịn, làn nước trong xanh màu ngọc bích và những buổi chiều hoàng hôn ngoạn mục.' },
  { name: 'Đà Lạt', headline: 'Đồi thông sương mờ và ánh nắng ban mai', query: 'da lat pine forest misty morning lake', intro: 'Thành phố ngàn hoa trên cao nguyên xanh mát, nổi tiếng với rừng thông bạt ngàn, mặt hồ phẳng lặng và không gian yên bình.' },
  { name: 'Hà Nội', headline: 'Nét thanh lịch nghìn năm bên Hồ Tây hoàng hôn', query: 'hanoi west lake sunset skyline', intro: 'Thủ đô nghìn năm văn hiến với mặt hồ lộng gió, chiều tà rực rỡ và sự giao hòa giữa kiến trúc cổ kính cùng nhịp sống hiện đại.' },
  { name: 'Huế', headline: 'Cố đô trầm mặc soi bóng dòng sông Hương', query: 'hue imperial city vietnam sunset river', intro: 'Cố đô triều Nguyễn bên dòng sông Hương thơ mộng, lưu giữ vẻ đẹp uy nghi của kiến trúc cung đình và nét thanh tao sâu lắng.' },
  { name: 'Hà Giang', headline: 'Cung đèo hùng vĩ giữa núi đá chạm mây', query: 'ha giang mountain pass vietnam aerial', intro: 'Miền đá nở hoa nơi địa đầu Tổ quốc với những cung đường uốn lượn ngoạn mục giữa núi non trùng điệp.' },
  { name: 'Kiến trúc & Tầm nhìn', headline: 'Không gian hiện đại, chuẩn mực và tinh tế', query: 'modern luxury glass architecture golden hour', intro: 'Đường nét kiến trúc đương đại kết hợp ánh sáng giờ vàng, mang lại cảm hứng tập trung và chuyên nghiệp cho ngày làm việc hiệu quả.' }
];

function getSlotInfo(now = Date.now()) {
  const vnNow = now + VN_OFFSET_MS;
  const slot = Math.floor(vnNow / SLOT_DURATION_MS);
  const nextSlotVnMs = (slot + 1) * SLOT_DURATION_MS;
  const remainingSec = Math.max(60, Math.floor((nextSlotVnMs - vnNow) / 1000));
  return { slot, remainingSec };
}

async function fetchFromUnsplash(key, slotNo) {
  const dest = DESTINATIONS[slotNo % DESTINATIONS.length];
  const params = new URLSearchParams({
    query: dest.query,
    orientation: 'landscape',
    order_by: 'relevant',
    per_page: String(PER_PAGE),
    page: '1',
    content_filter: 'high'
  });
  const resp = await fetch('https://api.unsplash.com/search/photos?' + params, {
    headers: { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1' }
  });
  if (!resp.ok) {
    const error = new Error('Unsplash request failed');
    error.status = resp.status;
    throw error;
  }
  const json = await resp.json();
  const valid = (json.results || []).filter(p => p.urls && p.urls.raw);
  if (!valid.length) throw new Error('Unsplash empty');

  // Ưu tiên ảnh ngang độ phân giải cao và được nhiều lượt thích nhất để tránh ảnh mờ hoặc bố cục xấu.
  const hiResLandscape = valid.filter(p => Number(p.width) >= 1600 && Number(p.width) > Number(p.height));
  const pool = hiResLandscape.length ? hiResLandscape : valid;
  pool.sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0));
  const topPool = pool.slice(0, Math.min(TOP_PICK_POOL, pool.length));
  const photo = topPool[Math.floor(slotNo / DESTINATIONS.length) % topPool.length];

  const utm = '?utm_source=goldensign_erp&utm_medium=referral';
  return {
    url: photo.urls.raw + '&w=1920&q=85&fm=webp&fit=crop',
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
  const key = String(process.env.UNSPLASH_ACCESS_KEY || '').trim();
  if (!key) {
    return res.json({ success: false });
  }
  if (unsplashDisabled || Date.now() < retryAt) {
    return res.json({ success: false });
  }
  const { slot, remainingSec } = getSlotInfo();
  try {
    if (cache.slot !== slot || !cache.data) {
      cache = { slot, data: await fetchFromUnsplash(key, slot) };
    }
    res.set('Cache-Control', `public, max-age=${remainingSec}`);
    res.json({ success: true, slot, ...cache.data });
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      unsplashDisabled = true;
      console.warn('Unsplash chưa được cấu hình hợp lệ; chuyển sang ảnh đăng nhập cục bộ.');
    } else {
      retryAt = Date.now() + RETRY_DELAY_MS;
      console.warn('Không thể tải ảnh Unsplash; tạm dùng ảnh đăng nhập cục bộ.');
    }
    if (cache.data) return res.json({ success: true, ...cache.data });
    res.json({ success: false });
  }
});

router.getSlotInfo = getSlotInfo;
router.DESTINATIONS = DESTINATIONS;

module.exports = router;
