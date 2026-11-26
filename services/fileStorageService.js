const zlib = require('node:zlib');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const mongoose = require('mongoose');
const googleDriveStorage = require('./googleDriveStorage');

const BUCKET_NAME = 'tep_nang';
const MAX_READ_BYTES = 20 * 1024 * 1024;
const GDRIVE_PREFIX = 'gdrive:';
const GRIDFS_PREFIX = 'gridfs:';

function laThamChieuTep(value) {
  return typeof value === 'string' && (value.startsWith(GDRIVE_PREFIX) || value.startsWith(GRIDFS_PREFIX));
}

function lamSachTenTep(name, fallback = 'tep-dinh-kem') {
  const cleaned = String(name || fallback)
    .replace(/[|\r\n\\/:"*?<>]+/g, '_')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/s.exec(String(dataUrl || '').trim());
  if (!match) return null;
  return {
    mimeType: match[1].trim().toLowerCase(),
    buffer: Buffer.from(match[2], 'base64')
  };
}

function nenBuffer(buffer, mimeType = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { buffer: Buffer.alloc(0), encoding: 'raw' };
  }
  const compressed = zlib.gzipSync(buffer, { level: 9 });
  if (compressed.length < buffer.length) {
    return { buffer: compressed, encoding: 'gzip' };
  }
  return { buffer, encoding: 'raw' };
}

function giaiNenBuffer(buffer, encoding = 'raw') {
  if (!Buffer.isBuffer(buffer)) return Buffer.alloc(0);
  if (encoding === 'gzip') return zlib.gunzipSync(buffer);
  return buffer;
}

function dinhDangThamChieu(prefix, id, mimeType, encoding, fileName) {
  return `${prefix}${id}|${mimeType}|${encoding}|${lamSachTenTep(fileName)}`;
}

function phanTichThamChieu(ref) {
  const text = String(ref || '');
  let storage = '';
  let raw = '';
  if (text.startsWith(GDRIVE_PREFIX)) {
    storage = 'gdrive';
    raw = text.slice(GDRIVE_PREFIX.length);
  } else if (text.startsWith(GRIDFS_PREFIX)) {
    storage = 'gridfs';
    raw = text.slice(GRIDFS_PREFIX.length);
  } else {
    return null;
  }
  const [id, mimeType = 'application/octet-stream', encoding = 'raw', ...nameParts] = raw.split('|');
  if (!id) return null;
  return {
    storage,
    id,
    mimeType: mimeType || 'application/octet-stream',
    encoding: encoding || 'raw',
    fileName: nameParts.join('|') || 'tep-dinh-kem'
  };
}

function layGridFsBucket() {
  const db = mongoose.connection?.db;
  if (!db) throw new Error('MongoDB chưa kết nối, không thể truy cập kho tệp.');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
}

async function luuVaoGridFs({ buffer, mimeType, encoding, fileName }) {
  const bucket = layGridFsBucket();
  const safeName = lamSachTenTep(fileName);
  const uploadStream = bucket.openUploadStream(safeName, {
    metadata: { mimeType, encoding }
  });
  try {
    await pipeline(Readable.from([buffer]), uploadStream);
  } catch (error) {
    try { await bucket.delete(uploadStream.id); } catch (_) {}
    throw error;
  }
  return dinhDangThamChieu(GRIDFS_PREFIX, String(uploadStream.id), mimeType, encoding, safeName);
}

async function docTuGridFs(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Mã tệp GridFS không hợp lệ.');
  }
  const downloadStream = layGridFsBucket().openDownloadStream(new mongoose.Types.ObjectId(id));
  const chunks = [];
  let total = 0;
  for await (const chunk of downloadStream) {
    total += chunk.length;
    if (total > MAX_READ_BYTES) {
      downloadStream.destroy();
      throw new Error('Tệp vượt quá giới hạn đọc cho phép.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function luuTepNang({ dataUrl = '', buffer = null, mimeType = '', fileName = '', prefix = 'file' } = {}) {
  if (!Buffer.isBuffer(buffer) && typeof dataUrl === 'string') {
    const trimmed = dataUrl.trim();
    if (!trimmed) return '';
    if (laThamChieuTep(trimmed)) return trimmed;
  }

  let rawBuffer = buffer;
  let resolvedMime = String(mimeType || '').trim().toLowerCase();
  if (!Buffer.isBuffer(rawBuffer)) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) throw new Error('Dữ liệu tệp đính kèm không hợp lệ.');
    rawBuffer = parsed.buffer;
    if (!resolvedMime) resolvedMime = parsed.mimeType;
  }
  if (!resolvedMime) resolvedMime = 'application/octet-stream';

  const safeName = lamSachTenTep(fileName, `${prefix}-${Date.now()}`);
  const { buffer: payloadBuffer, encoding } = nenBuffer(rawBuffer, resolvedMime);
  const driveFileName = encoding === 'gzip' ? `${safeName}.gz` : safeName;
  const driveMimeType = encoding === 'gzip' ? 'application/gzip' : resolvedMime;

  if (googleDriveStorage.isDriveWriteConfigured()) {
    try {
      const { fileId } = await googleDriveStorage.uploadBufferToDrive({
        buffer: payloadBuffer,
        fileName: driveFileName,
        mimeType: driveMimeType
      });
      if (fileId) {
        return dinhDangThamChieu(GDRIVE_PREFIX, fileId, resolvedMime, encoding, safeName);
      }
    } catch (error) {
      console.warn('Không thể tải tệp lên Google Drive, chuyển sang lưu dự phòng GridFS:', error.message);
    }
  }

  return luuVaoGridFs({
    buffer: payloadBuffer,
    mimeType: resolvedMime,
    encoding,
    fileName: safeName
  });
}

async function docTepNang(ref) {
  const value = String(ref || '').trim();
  if (!value) return null;

  if (value.startsWith('data:')) {
    const parsed = parseDataUrl(value);
    if (!parsed) return null;
    return {
      buffer: parsed.buffer,
      mimeType: parsed.mimeType,
      dataUrl: value,
      fileName: ''
    };
  }

  const meta = phanTichThamChieu(value);
  if (!meta) return null;

  const storedBuffer = meta.storage === 'gdrive'
    ? await googleDriveStorage.downloadBufferFromDrive(meta.id)
    : await docTuGridFs(meta.id);
  const rawBuffer = giaiNenBuffer(storedBuffer, meta.encoding);

  return {
    buffer: rawBuffer,
    mimeType: meta.mimeType,
    dataUrl: `data:${meta.mimeType};base64,${rawBuffer.toString('base64')}`,
    fileName: meta.fileName
  };
}

module.exports = {
  laThamChieuTep,
  parseDataUrl,
  nenBuffer,
  giaiNenBuffer,
  phanTichThamChieu,
  luuTepNang,
  docTepNang
};
