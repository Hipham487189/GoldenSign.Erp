const mongoose = require('mongoose');

const sanPhamSchema = new mongoose.Schema({
  VAT: { type: Number, min: 0, max: 100 }
}, {
  collection: 'SANPHAM', 
  strict: false 
});

module.exports = mongoose.model('SanPham', sanPhamSchema);
