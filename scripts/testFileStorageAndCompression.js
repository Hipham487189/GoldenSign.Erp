const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable, Writable } = require('node:stream');
const mongoose = require('mongoose');

async function runTests() {
  const driveFiles = new Map();
  let driveCounter = 0;
  let driveConfigured = true;
  let forceDriveQuotaError = false;

  const mockDriveStorage = {
    isDriveWriteConfigured: () => driveConfigured,
    uploadBufferToDrive: async ({ buffer, fileName, mimeType }) => {
      if (forceDriveQuotaError) {
        const err = new Error('The user has exceeded their Drive storage quota (storageQuotaExceeded).');
        err.code = 403;
        throw err;
      }
      const id = `drive_${++driveCounter}`;
      driveFiles.set(id, { buffer, fileName, mimeType });
      return { fileId: id, webViewLink: '' };
    },
    downloadBufferFromDrive: async (fileId) => {
      const item = driveFiles.get(fileId);
      if (!item) throw new Error('Không tìm thấy tệp trên Drive');
      return item.buffer;
    }
  };

  const gridFsStore = new Map();
  let gridCounter = 0;
  class MockGridFSBucket {
    constructor(db, opts) {
      this.bucketName = opts.bucketName;
    }
    openUploadStream(name, opts) {
      const id = new mongoose.Types.ObjectId();
      const chunks = [];
      const stream = new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.from(chunk));
          cb();
        },
        final(cb) {
          gridFsStore.set(String(id), { id, name, opts, buffer: Buffer.concat(chunks) });
          gridCounter += 1;
          cb();
        }
      });
      stream.id = id;
      return stream;
    }
    openDownloadStream(id) {
      const item = gridFsStore.get(String(id));
      if (!item) throw new Error('Không tìm thấy tệp GridFS');
      return Readable.from([item.buffer]);
    }
    async delete(id) {
      gridFsStore.delete(String(id));
    }
  }

  const filePath = path.resolve(__dirname, '..', 'services', 'fileStorageService.js');
  const mod = { exports: {} };
  const fakeMongoose = {
    Types: mongoose.Types,
    connection: { db: { databaseName: 'MOCK_DB' } },
    mongo: { GridFSBucket: MockGridFSBucket }
  };

  const ctx = {
    module: mod,
    exports: mod.exports,
    __dirname: path.dirname(filePath),
    Buffer,
    console,
    Date,
    require: (name) => {
      if (name === './googleDriveStorage') return mockDriveStorage;
      if (name === 'mongoose') return fakeMongoose;
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), ctx, { filename: filePath });
  const storage = mod.exports;

  // 1. Kiểm thử nén gzip PDF/text giảm dung lượng và giải nén khớp 100%
  const rawPdfContent = Buffer.from('%PDF-1.4\n' + 'BT /F1 12 Tf 72 712 Td (Hoa don GoldenSign ERP) Tj ET\n'.repeat(80));
  const compressed = storage.nenBuffer(rawPdfContent, 'application/pdf');
  assert.equal(compressed.encoding, 'gzip');
  assert.ok(compressed.buffer.length < rawPdfContent.length, 'Dung lượng sau nén phải nhỏ hơn bản gốc');
  const restored = storage.giaiNenBuffer(compressed.buffer, compressed.encoding);
  assert.deepEqual(restored, rawPdfContent, 'Dữ liệu giải nén phải khớp từng byte với bản gốc');

  // 2. Kiểm thử luuTepNang -> docTepNang qua Google Drive
  const pdfDataUrl = `data:application/pdf;base64,${rawPdfContent.toString('base64')}`;
  const gdriveRef = await storage.luuTepNang({
    dataUrl: pdfDataUrl,
    fileName: 'hop-dong-01.pdf',
    prefix: 'order'
  });
  assert.match(gdriveRef, /^gdrive:drive_1\|application\/pdf\|gzip\|hop-dong-01\.pdf$/);
  const readFromDrive = await storage.docTepNang(gdriveRef);
  assert.equal(readFromDrive.mimeType, 'application/pdf');
  assert.deepEqual(readFromDrive.buffer, rawPdfContent);
  assert.equal(readFromDrive.dataUrl, pdfDataUrl);

  // 3. Kiểm thử fallback sang GridFS khi Drive chưa cấu hình hoặc báo storageQuotaExceeded
  forceDriveQuotaError = true;
  const gridRef1 = await storage.luuTepNang({
    buffer: rawPdfContent,
    mimeType: 'application/pdf',
    fileName: 'hoa-don-02.pdf',
    prefix: 'hoadon'
  });
  assert.match(gridRef1, /^gridfs:[0-9a-f]{24}\|application\/pdf\|gzip\|hoa-don-02\.pdf$/);
  const readFromGrid1 = await storage.docTepNang(gridRef1);
  assert.deepEqual(readFromGrid1.buffer, rawPdfContent);

  forceDriveQuotaError = false;
  driveConfigured = false;
  const gridRef2 = await storage.luuTepNang({
    dataUrl: pdfDataUrl,
    fileName: 'gpkd.pdf',
    prefix: 'order'
  });
  assert.match(gridRef2, /^gridfs:/);
  assert.equal(gridCounter, 2);

  // 4. Kiểm thử tương thích ngược với dữ liệu cũ data:application/pdf;base64,...
  const legacyRead = await storage.docTepNang(pdfDataUrl);
  assert.equal(legacyRead.dataUrl, pdfDataUrl);
  assert.deepEqual(legacyRead.buffer, rawPdfContent);

  console.log('Đạt: nén gzip PDF/ảnh, lưu Google Drive, fallback GridFS và tương thích dữ liệu cũ.');
}

runTests().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
