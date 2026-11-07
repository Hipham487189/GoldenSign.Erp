const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Writable, Readable } = require('node:stream');

function taoKhoGia() {
  const tep = new Map();
  let so = 0;
  const Bucket = class {
    openUploadStream(ten, options) {
      const ma = `tep-${++so}`;
      const cacPhan = [];
      const luong = new Writable({
        write(phan, encoding, callback) { cacPhan.push(Buffer.from(phan)); callback(); },
        final(callback) { tep.set(ma, { ten, options, noiDung: Buffer.concat(cacPhan) }); callback(); }
      });
      luong.id = ma;
      return luong;
    }
    async delete(ma) {
      if (!tep.delete(ma)) throw new Error('Không tìm thấy tệp.');
    }
    openDownloadStream(ma) {
      const item = tep.get(ma);
      if (!item) return Readable.from((async function* () { throw new Error('Không tìm thấy tệp.'); })());
      return Readable.from([item.noiDung]);
    }
  };
  const duongDan = require.resolve('../services/tepUncMongo');
  require(duongDan);
  const moduleCu = require.cache[duongDan].exports;
  const context = {
    module: { exports: {} }, Buffer, console,
    require(ten) { return ten === 'mongoose' ? { mongo: { GridFSBucket: Bucket } } : require(ten); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'services', 'tepUncMongo.js'), 'utf8'), context);
  require.cache[duongDan].exports = context.module.exports;
  return { tep, db: { db: {} }, khoiPhuc() { require.cache[duongDan].exports = moduleCu; } };
}

module.exports = { taoKhoGia };
