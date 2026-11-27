const assert = require('assert');
const {
  MAC_DINH_MODELS,
  tachDataUrlUnc,
  chuanHoaKetQuaDocUnc,
  trichXuatTextTuInteraction,
  docThongTinUncBangAi
} = require('../services/docUncAi');

async function run() {
  // 1. Validate DataURL
  const bad = tachDataUrlUnc('data:text/plain;base64,SGVsbG8=');
  assert.ok(bad.loi);

  const okImg = tachDataUrlUnc('data:image/jpg;base64,iVBORw0KGgo=');
  assert.strictEqual(okImg.mimeType, 'image/jpeg');
  assert.strictEqual(okImg.base64Data, 'iVBORw0KGgo=');

  const okPdf = tachDataUrlUnc('data:application/pdf;base64,JVBERi0xLjQ=');
  assert.strictEqual(okPdf.mimeType, 'application/pdf');

  // 2. Chuẩn hóa kết quả JSON từ AI (có bọc ```json)
  const parsed = chuanHoaKetQuaDocUnc('```json\n{"soTien":"1.688.000 đ","maGiaoDich":"FT263319988","tenNganHang":"Vietcombank","noiDungChuyenKhoan":"DH1126-00026 thanh toan","ngayThanhToan":"27/11/2026"}\n```');
  assert.strictEqual(parsed.soTien, 1688000);
  assert.strictEqual(parsed.maGiaoDich, 'FT263319988');
  assert.strictEqual(parsed.tenNganHang, 'Vietcombank');
  assert.strictEqual(parsed.ngayThanhToan, '2026-11-27');
  assert.strictEqual(parsed.noiDungGop, 'CK Vietcombank · Mã GD: FT263319988 · DH1126-00026 thanh toan');

  // 3. Trích xuất text từ Interactions API steps
  assert.strictEqual(
    trichXuatTextTuInteraction({
      steps: [
        { type: 'thought', summary: 'thinking' },
        { type: 'model_output', content: [{ type: 'text', text: '{"soTien":1250000}' }] }
      ]
    }),
    '{"soTien":1250000}'
  );

  // 4. Fallback qua model 404 (deprecated) -> 429 (rate limit) -> 200 OK và kiểm tra Interactions API payload
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    if (calls.length === 1) {
      return {
        ok: false,
        status: 404,
        async json() { return { error: { message: 'Model not available to new users' } }; }
      };
    }
    if (calls.length === 2) {
      return {
        ok: false,
        status: 429,
        async json() { return { error: { message: 'Rate limited' } }; }
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          steps: [{
            type: 'model_output',
            content: [{
              type: 'text',
              text: JSON.stringify({
                soTien: 2500000,
                maGiaoDich: 'REF999',
                tenNganHang: 'ACB',
                noiDungChuyenKhoan: 'CK chu ky so',
                ngayThanhToan: '2026-11-27'
              })
            }]
          }]
        };
      }
    };
  };

  const res = await docThongTinUncBangAi({
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    apiKey: 'fake-key',
    models: ['gemini-2.5-flash', ...MAC_DINH_MODELS],
    fetchImpl: mockFetch
  });

  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[0].url, 'https://generativelanguage.googleapis.com/v1/interactions');
  assert.strictEqual(calls[0].headers['x-goog-api-key'], 'fake-key');
  assert.strictEqual(calls[0].headers['Api-Revision'], '2026-05-20');
  assert.strictEqual(calls[0].body.store, false);
  assert.strictEqual(calls[0].body.input[0].type, 'user_input');
  assert.strictEqual(calls[0].body.input[0].content[0].type, 'text');
  assert.strictEqual(calls[0].body.input[0].content[1].type, 'image');
  assert.strictEqual(calls[0].body.input[0].content[1].mime_type, 'image/png');
  assert.strictEqual(calls[0].body.response_format.mime_type, 'application/json');
  assert.strictEqual(res.model, 'gemini-3.1-flash-lite');
  assert.strictEqual(res.soTien, 2500000);
  assert.strictEqual(res.maGiaoDich, 'REF999');
  assert.strictEqual(res.tenNganHang, 'ACB');
  assert.strictEqual(res.noiDungGop, 'CK ACB · Mã GD: REF999 · CK chu ky so');

  // 5. PDF gửi type === 'document' và dừng ngay khi 401
  const authCalls = [];
  await assert.rejects(
    () => docThongTinUncBangAi({
      dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
      apiKey: 'bad-key',
      models: MAC_DINH_MODELS,
      fetchImpl: async (url, opts) => {
        authCalls.push(JSON.parse(opts.body));
        return {
          ok: false,
          status: 401,
          async json() { return { error: { message: 'API key invalid' } }; }
        };
      }
    }),
    /API key invalid/
  );
  assert.strictEqual(authCalls.length, 1);
  assert.strictEqual(authCalls[0].input[0].type, 'user_input');
  assert.strictEqual(authCalls[0].input[0].content[1].type, 'document');
  assert.strictEqual(authCalls[0].input[0].content[1].mime_type, 'application/pdf');

  console.log('✅ Tất cả kiểm thử AI đọc phiếu UNC (Interactions API) đã đạt!');
}

run().catch(err => {
  console.error('❌ Test thất bại:', err);
  process.exit(1);
});
