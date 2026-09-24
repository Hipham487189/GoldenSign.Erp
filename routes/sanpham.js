const express = require('express');
const SanPham = require('../models/SanPham');

const router = express.Router();

// Lấy tất cả sản phẩm
router.get('/all', async (req, res) => {
  try {
    const products = await SanPham.find({}).sort({ 'MÃ SẢN PHẨM': 1 }).lean();
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('❌ Lỗi lấy danh sách sản phẩm:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Thêm sản phẩm mới
router.post('/create', async (req, res) => {
  try {
    const product = await SanPham.create(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    console.error('❌ Lỗi tạo sản phẩm:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Nhập nhiều sản phẩm từ Excel
router.post('/import', async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách sản phẩm trống' });
    }
    await SanPham.insertMany(products);
    res.json({ success: true, message: `Đã nhập thành công ${products.length} sản phẩm` });
  } catch (error) {
    console.error('❌ Lỗi import sản phẩm:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
