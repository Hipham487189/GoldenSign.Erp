const mongoose = require('mongoose');

const sanPhamSchema = new mongoose.Schema({}, { 
  collection: 'SANPHAM', 
  strict: false 
});

module.exports = mongoose.model('SanPham', sanPhamSchema);
