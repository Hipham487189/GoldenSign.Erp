const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { google } = require('googleapis');

const CREDENTIALS_FILE = process.env.GOOGLE_CREDENTIALS_FILE || path.join(__dirname, '..', 'credentials.json');
const DEFAULT_FOLDER_NAME = process.env.GOOGLE_DRIVE_FOLDER_NAME || 'DATAGS_FILES';

let cachedFolderId = '';

function getOAuthCredentials() {
  const clientId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
  const refreshToken = String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '').trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

function getConfiguredFolderId() {
  return String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
}

function hasServiceAccountCredentials() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) return true;
  try {
    return fs.existsSync(CREDENTIALS_FILE);
  } catch (_) {
    return false;
  }
}

function isDriveWriteConfigured() {
  if (getOAuthCredentials()) return true;
  return Boolean(getConfiguredFolderId() && hasServiceAccountCredentials());
}

async function getDriveClient() {
  const oauth = getOAuthCredentials();
  if (oauth) {
    const auth = new google.auth.OAuth2(oauth.clientId, oauth.clientSecret);
    auth.setCredentials({ refresh_token: oauth.refreshToken });
    return { drive: google.drive({ version: 'v3', auth }), authMode: 'oauth2' };
  }

  if (!hasServiceAccountCredentials()) {
    throw new Error('Chưa cấu hình thông tin xác thực Google Drive.');
  }
  const scopes = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'];
  const authOptions = process.env.GOOGLE_CREDENTIALS_JSON
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON), scopes }
    : { keyFile: CREDENTIALS_FILE, scopes };
  const auth = new google.auth.GoogleAuth(authOptions);
  return { drive: google.drive({ version: 'v3', auth: await auth.getClient() }), authMode: 'service_account' };
}

async function getOrCreateDriveFolder(drive, authMode) {
  const configured = getConfiguredFolderId();
  if (configured) return configured;
  if (cachedFolderId) return cachedFolderId;
  if (authMode !== 'oauth2') {
    throw new Error('Chưa cấu hình GOOGLE_DRIVE_FOLDER_ID được chia sẻ quyền Editor.');
  }

  const escapedName = DEFAULT_FOLDER_NAME.replace(/'/g, "\\'");
  const listRes = await drive.files.list({
    q: `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1
  });
  const existing = listRes.data.files?.[0];
  if (existing?.id) {
    cachedFolderId = existing.id;
    return cachedFolderId;
  }

  const created = await drive.files.create({
    requestBody: {
      name: DEFAULT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id'
  });
  cachedFolderId = created.data.id;
  return cachedFolderId;
}

async function uploadBufferToDrive({ buffer, fileName, mimeType = 'application/octet-stream' }) {
  const { drive, authMode } = await getDriveClient();
  const folderId = await getOrCreateDriveFolder(drive, authMode);
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: fileName || `datags-file-${Date.now()}`,
      parents: folderId ? [folderId] : undefined
    },
    media: {
      mimeType,
      body: Readable.from([buffer])
    },
    fields: 'id, webViewLink'
  });
  return {
    fileId: res.data.id,
    webViewLink: res.data.webViewLink || ''
  };
}

async function downloadBufferFromDrive(fileId) {
  const { drive } = await getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

async function deleteFileFromDrive(fileId) {
  if (!fileId) return;
  try {
    const { drive } = await getDriveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (error) {
    if (Number(error?.code) === 404 || Number(error?.response?.status) === 404) return;
    throw error;
  }
}

module.exports = {
  isDriveWriteConfigured,
  getDriveClient,
  getOrCreateDriveFolder,
  uploadBufferToDrive,
  downloadBufferFromDrive,
  deleteFileFromDrive
};
