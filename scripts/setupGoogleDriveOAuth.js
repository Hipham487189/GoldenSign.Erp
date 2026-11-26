/**
 * Script tự động lấy GOOGLE_DRIVE_REFRESH_TOKEN cho tài khoản Google Drive cá nhân (vd: thanhi2406@gmail.com)
 * qua HTTP callback trên localhost (mặc định http://localhost:3333/oauth2callback).
 *
 * Cách dùng:
 *   node scripts/setupGoogleDriveOAuth.js
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { google } = require('googleapis');

function luuRefreshTokenVaoEnv(refreshToken) {
  const envPath = path.join(process.cwd(), '.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const line = `GOOGLE_DRIVE_REFRESH_TOKEN=${refreshToken}`;
  if (/^GOOGLE_DRIVE_REFRESH_TOKEN=.*$/m.test(content)) {
    content = content.replace(/^GOOGLE_DRIVE_REFRESH_TOKEN=.*$/m, line);
  } else {
    if (content && !content.endsWith('\n')) content += '\n';
    content += `${line}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
}

async function main() {
  const clientId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:3333/oauth2callback').trim();

  if (!clientId || !clientSecret) {
    console.error('Thiếu GOOGLE_DRIVE_CLIENT_ID hoặc GOOGLE_DRIVE_CLIENT_SECRET trong file .env.');
    process.exit(1);
  }

  const parsedUrl = new URL(redirectUri);
  const port = Number(parsedUrl.port) || 3333;
  const callbackPath = parsedUrl.pathname || '/oauth2callback';

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file']
  });

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://localhost:${port}`);
      if (reqUrl.pathname !== callbackPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Không tìm thấy đường dẫn callback.');
        return;
      }

      const errorParam = reqUrl.searchParams.get('error');
      const code = reqUrl.searchParams.get('code');
      if (errorParam || !code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>Đăng nhập thất bại hoặc bị từ chối</h2><p>Vui lòng thử lại và cấp quyền Google Drive.</p>');
        console.error('Lỗi OAuth callback:', errorParam || 'Không có mã code.');
        server.close(() => process.exit(1));
        return;
      }

      const { tokens } = await oauth2Client.getToken(code.trim());
      if (!tokens.refresh_token) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>Thiếu Refresh Token</h2><p>Google không trả refresh_token. Hãy vào Google Account > Security > Third-party access để gỡ quyền cũ rồi thử lại.</p>');
        console.error('Google không trả về refresh_token.');
        server.close(() => process.exit(1));
        return;
      }

      luuRefreshTokenVaoEnv(tokens.refresh_token);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>Kết nối Google Drive thành công!</h2><p>Hệ thống đã tự động lưu cấu hình vào file <code>.env</code>. Anh có thể đóng tab này.</p>');
      console.log('Đã lưu GOOGLE_DRIVE_REFRESH_TOKEN vào .env thành công!');
      server.close(() => process.exit(0));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>Lỗi xử lý xác thực</h2><p>Vui lòng kiểm tra terminal.</p>');
      console.error('Lỗi xác thực OAuth2:', err.message);
      server.close(() => process.exit(1));
    }
  });

  server.on('error', (err) => {
    console.error(`Không thể mở cổng ${port}:`, err.message);
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Đang lắng nghe callback tại ${redirectUri}`);
    console.log('AUTH_URL=' + authUrl);
  });
}

main().catch((err) => {
  console.error('Lỗi khởi tạo OAuth2:', err.message);
  process.exit(1);
});
