const crypto = require('crypto');
const Employee = require('../models/Employee');
const User = require('../models/User');

const THOI_HAN_MA_MS = 10 * 60 * 1000;
const CHO_GUI_LAI_MS = 60 * 1000;
const SO_LAN_NHAP_TOI_DA = 5;

function loi(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function chuanHoaDienThoai(value) {
  return String(value || '').replace(/\D/g, '');
}

function bamMa(code) {
  const khoa = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET || 'datags-development-secret-change-me';
  return crypto.createHmac('sha256', khoa).update(String(code)).digest('hex');
}

async function timTaiKhoan(identifier) {
  const giaTri = String(identifier || '').trim();
  if (!giaTri) throw loi('Vui lòng nhập tài khoản, email hoặc số điện thoại.');
  const theoTen = await User.findOne({ username: giaTri.toLowerCase() }).select('+maKhoiPhucHash +maKhoiPhucHetHan +yeuCauKhoiPhucLuc +soLanSaiKhoiPhuc').populate('employeeId');
  if (theoTen) return theoTen;

  let nhanVien;
  if (giaTri.includes('@')) {
    const anToan = giaTri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    nhanVien = await Employee.findOne({ email: new RegExp(`^${anToan}$`, 'i') }).lean();
  } else {
    const dienThoai = chuanHoaDienThoai(giaTri);
    if (dienThoai) {
      const mau = dienThoai.split('').join('[^0-9]*');
      nhanVien = await Employee.findOne({ phone: new RegExp(`^${mau}$`) }).lean();
    }
  }
  if (!nhanVien) return null;
  return User.findOne({ employeeId: nhanVien._id }).select('+maKhoiPhucHash +maKhoiPhucHetHan +yeuCauKhoiPhucLuc +soLanSaiKhoiPhuc').populate('employeeId');
}

async function guiEmail(email, ma) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  const senderEmail = String(process.env.BREVO_SENDER_EMAIL || '').trim();
  const senderName = String(process.env.BREVO_SENDER_NAME || 'GoldenSign ERP').trim();
  if (!apiKey || !senderEmail) throw loi('Hệ thống chưa cấu hình gửi email khôi phục. Vui lòng liên hệ quản trị viên.', 503);
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email }],
      subject: 'Mã khôi phục mật khẩu GoldenSign ERP',
      textContent: `Mã khôi phục mật khẩu của bạn là: ${ma}. Mã có hiệu lực trong 10 phút. Không chia sẻ mã này cho người khác.`,
      htmlContent: `<p>Mã khôi phục mật khẩu GoldenSign ERP của bạn là:</p><h2>${ma}</h2><p>Mã có hiệu lực trong 10 phút. Không chia sẻ mã này cho người khác.</p>`
    })
  });
  if (!response.ok) throw loi('Không thể gửi email khôi phục. Vui lòng thử lại sau.', 502);
}

async function guiSms(soDienThoai, ma) {
  const apiUrl = String(process.env.RESET_SMS_API_URL || '').trim();
  const apiToken = String(process.env.RESET_SMS_API_TOKEN || '').trim();
  if (!apiUrl || !apiToken) throw loi('Kênh SMS chưa được cấu hình. Vui lòng chọn nhận mã qua email.', 503);
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ phone: soDienThoai, message: `Ma khoi phuc GoldenSign ERP: ${ma}. Hieu luc 10 phut.` })
  });
  if (!response.ok) throw loi('Không thể gửi SMS khôi phục. Vui lòng thử lại sau.', 502);
}

async function yeuCauMa({ identifier, channel }) {
  const kenh = channel === 'sms' ? 'sms' : 'email';
  const taiKhoan = await timTaiKhoan(identifier);
  if (!taiKhoan?.isActive) return;
  const lanCuoi = taiKhoan.yeuCauKhoiPhucLuc ? new Date(taiKhoan.yeuCauKhoiPhucLuc).getTime() : 0;
  if (Date.now() - lanCuoi < CHO_GUI_LAI_MS) throw loi('Vui lòng chờ 1 phút trước khi yêu cầu mã mới.', 429);
  const dich = taiKhoan.employeeId?.[kenh === 'sms' ? 'phone' : 'email'];
  if (!dich) throw loi(`Nhân viên chưa cập nhật ${kenh === 'sms' ? 'số điện thoại' : 'email'}.`);
  const ma = crypto.randomInt(100000, 1000000).toString();
  if (kenh === 'sms') await guiSms(chuanHoaDienThoai(dich), ma);
  else await guiEmail(String(dich).trim(), ma);
  taiKhoan.maKhoiPhucHash = bamMa(ma);
  taiKhoan.maKhoiPhucHetHan = new Date(Date.now() + THOI_HAN_MA_MS);
  taiKhoan.yeuCauKhoiPhucLuc = new Date();
  taiKhoan.soLanSaiKhoiPhuc = 0;
  await taiKhoan.save();
  return taiKhoan._id;
}

async function datLaiMatKhau({ identifier, code, newPassword }) {
  if (!/^\d{6}$/.test(String(code || ''))) throw loi('Mã xác minh phải gồm 6 chữ số.');
  if (String(newPassword || '').length < 6) throw loi('Mật khẩu mới phải có tối thiểu 6 ký tự.');
  const taiKhoan = await timTaiKhoan(identifier);
  if (!taiKhoan || !taiKhoan.maKhoiPhucHash || !taiKhoan.maKhoiPhucHetHan || new Date(taiKhoan.maKhoiPhucHetHan).getTime() < Date.now()) {
    throw loi('Mã xác minh không hợp lệ hoặc đã hết hạn.');
  }
  if (Number(taiKhoan.soLanSaiKhoiPhuc || 0) >= SO_LAN_NHAP_TOI_DA) {
    throw loi('Bạn đã nhập sai mã quá nhiều lần. Vui lòng yêu cầu mã mới.');
  }
  const hashNhap = bamMa(code);
  const a = Buffer.from(taiKhoan.maKhoiPhucHash, 'hex');
  const b = Buffer.from(hashNhap, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    taiKhoan.soLanSaiKhoiPhuc = Number(taiKhoan.soLanSaiKhoiPhuc || 0) + 1;
    if (taiKhoan.soLanSaiKhoiPhuc >= SO_LAN_NHAP_TOI_DA) taiKhoan.maKhoiPhucHash = '';
    await taiKhoan.save();
    throw loi('Mã xác minh không hợp lệ hoặc đã hết hạn.');
  }
  taiKhoan.passwordHash = await require('bcryptjs').hash(String(newPassword), 12);
  taiKhoan.doiMatKhauLuc = new Date();
  taiKhoan.maKhoiPhucHash = '';
  taiKhoan.maKhoiPhucHetHan = undefined;
  taiKhoan.yeuCauKhoiPhucLuc = undefined;
  taiKhoan.soLanSaiKhoiPhuc = 0;
  await taiKhoan.save();
}

module.exports = { datLaiMatKhau, yeuCauMa };
