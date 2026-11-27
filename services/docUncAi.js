const MAX_UNC_AI_BYTES = 6 * 1024 * 1024;
const MAC_DINH_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
const INTERACTIONS_API_URL = 'https://generativelanguage.googleapis.com/v1/interactions';
const INTERACTIONS_API_REVISION = '2026-05-20';

function tachDataUrlUnc(dataUrl) {
  const chuoi = String(dataUrl || '').trim();
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/i.exec(chuoi);
  if (!match) {
    return { loi: 'Định dạng tệp UNC không hợp lệ (chỉ hỗ trợ PNG, JPG, WEBP, GIF, PDF).' };
  }
  const mimeRaw = match[1].toLowerCase();
  const mimeType = mimeRaw === 'image/jpg' ? 'image/jpeg' : mimeRaw;
  const base64Data = match[2];
  const bytes = Buffer.from(base64Data, 'base64').length;
  if (bytes <= 0 || bytes > MAX_UNC_AI_BYTES) {
    return { loi: 'Dung lượng tệp gửi AI đọc không được vượt quá 6MB.' };
  }
  return { mimeType, base64Data };
}

function chuanHoaSoTien(val) {
  if (typeof val === 'number') {
    const n = Math.round(val);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  const digits = String(val ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function chuanHoaNgay(val) {
  const s = String(val ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : '';
  }
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (!m) return '';
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : '';
}

function chuanHoaKetQuaDocUnc(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    obj = JSON.parse(cleaned);
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Dữ liệu AI trả về không đúng định dạng JSON.');
  }

  const soTien = chuanHoaSoTien(obj.soTien ?? obj.amount);
  const maGiaoDich = String(obj.maGiaoDich ?? obj.soThamChieu ?? obj.ref ?? '').trim().slice(0, 100);
  const tenNganHang = String(obj.tenNganHang ?? obj.bankName ?? '').trim().slice(0, 100);
  const noiDungChuyenKhoan = String(obj.noiDungChuyenKhoan ?? obj.noiDung ?? obj.content ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
  const ngayThanhToan = chuanHoaNgay(obj.ngayThanhToan ?? obj.date);

  const phanGop = [];
  if (tenNganHang) phanGop.push(`CK ${tenNganHang}`);
  if (maGiaoDich) phanGop.push(`Mã GD: ${maGiaoDich}`);
  if (noiDungChuyenKhoan) phanGop.push(noiDungChuyenKhoan);

  return {
    soTien,
    maGiaoDich,
    tenNganHang,
    noiDungChuyenKhoan,
    ngayThanhToan,
    noiDungGop: phanGop.join(' · ')
  };
}

function trichXuatTextTuInteraction(result) {
  if (!result || typeof result !== 'object') return '';
  if (typeof result.output_text === 'string' && result.output_text.trim()) {
    return result.output_text.trim();
  }
  if (Array.isArray(result.steps)) {
    const stepText = result.steps
      .filter(step => step?.type === 'model_output' && Array.isArray(step.content))
      .flatMap(step => step.content)
      .filter(part => part?.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('')
      .trim();
    if (stepText) return stepText;
  }
  if (Array.isArray(result.outputs)) {
    const outText = result.outputs
      .filter(part => part?.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('')
      .trim();
    if (outText) return outText;
  }
  if (Array.isArray(result.candidates)) {
    const legacyText = result.candidates?.[0]?.content?.parts
      ?.map(p => p?.text || '')
      .join('')
      .trim();
    if (legacyText) return legacyText;
  }
  return '';
}

async function goiGeminiInteraction({ apiKey, models, input, responseFormat, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    const err = new Error('Chưa cấu hình GEMINI_API_KEY trong file .env.');
    err.statusCode = 503;
    throw err;
  }

  const dsModel = [...new Set(Array.isArray(models) && models.length ? models : MAC_DINH_MODELS)].filter(Boolean);
  let lastError = null;

  for (const model of dsModel) {
    const payload = {
      model,
      store: false,
      input
    };
    if (responseFormat) {
      payload.response_format = responseFormat;
    }

    const response = await fetchImpl(INTERACTIONS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Api-Revision': INTERACTIONS_API_REVISION
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = trichXuatTextTuInteraction(result);
      if (text) {
        return { text, model };
      }
      lastError = new Error('AI không trả về nội dung.');
      continue;
    }

    lastError = new Error(result.error?.message || result.message || `Model ${model} không phản hồi.`);
    if ([401, 403].includes(response.status)) {
      break;
    }
  }

  const err = new Error(lastError?.message || 'Các model AI đang bận, vui lòng thử lại hoặc nhập tay.');
  err.statusCode = 503;
  throw err;
}

async function docThongTinUncBangAi({ dataUrl, apiKey, models, fetchImpl = fetch } = {}) {
  const tep = tachDataUrlUnc(dataUrl);
  if (tep.loi) {
    const err = new Error(tep.loi);
    err.statusCode = 400;
    throw err;
  }

  const prompt = [
    'Bạn là hệ thống trích xuất thông tin từ ảnh chụp hoặc PDF Ủy Nhiệm Chi (UNC) / Giấy báo Có / Biên lai chuyển khoản ngân hàng Việt Nam.',
    'Hãy đọc kỹ chứng từ và trả về DUY NHẤT 1 JSON object theo đúng schema sau, KHÔNG thêm markdown hay giải thích:',
    '{"soTien": number | null, "maGiaoDich": string, "tenNganHang": string, "noiDungChuyenKhoan": string, "ngayThanhToan": "YYYY-MM-DD" | ""}',
    'Quy tắc:',
    '- soTien: số tiền chuyển khoản thực tế (số nguyên VNĐ, bỏ dấu chấm/phẩy). Nếu không rõ trả null.',
    '- maGiaoDich: Số tham chiếu / Mã giao dịch / Trace / FT / Ref. Nếu không có trả "".',
    '- tenNganHang: Tên ngắn gọn ngân hàng (VD: Vietcombank, Techcombank, MB Bank, ACB, BIDV, VietinBank, VPBank...). Nếu không có trả "".',
    '- noiDungChuyenKhoan: Nội dung/diễn giải chuyển khoản gốc trên biên lai. Nếu không có trả "".',
    '- ngayThanhToan: Ngày giao dịch theo định dạng YYYY-MM-DD. Nếu không thấy rõ trả "".',
    '- Không tự suy đoán hay bịa thông tin không có trên chứng từ.'
  ].join('\n');

  const input = [
    {
      type: 'user_input',
      content: [
        { type: 'text', text: prompt },
        {
          type: tep.mimeType === 'application/pdf' ? 'document' : 'image',
          mime_type: tep.mimeType,
          data: tep.base64Data
        }
      ]
    }
  ];

  const { text, model } = await goiGeminiInteraction({
    apiKey,
    models,
    input,
    responseFormat: { type: 'text', mime_type: 'application/json' },
    fetchImpl
  });

  const parsed = chuanHoaKetQuaDocUnc(text);
  return { ...parsed, model };
}

module.exports = {
  MAC_DINH_MODELS,
  tachDataUrlUnc,
  chuanHoaKetQuaDocUnc,
  trichXuatTextTuInteraction,
  goiGeminiInteraction,
  docThongTinUncBangAi
};
