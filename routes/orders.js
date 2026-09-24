const express = require('express');
const Order = require('../models/Order');

const router = express.Router();

// Lấy tất cả đơn hàng
router.get('/all', async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ 'Ngày Đăng Ký': -1, createdAt: -1 }).lean();
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('❌ Lỗi lấy danh sách đơn hàng:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Thêm đơn hàng mới
router.post('/create', async (req, res) => {
  try {
    const newOrderData = req.body;
    if (!newOrderData['Mã Đơn Hàng'] && !newOrderData.maDonHang) {
      newOrderData['Mã Đơn Hàng'] = 'DH' + Date.now().toString().slice(-6);
    }
    const order = await Order.create(newOrderData);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    console.error('❌ Lỗi tạo đơn hàng:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Cập nhật đơn hàng theo ID
router.put('/update/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('❌ Lỗi cập nhật đơn hàng:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Xóa đơn hàng theo ID
router.delete('/delete/:id', async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Đã xóa đơn hàng' });
  } catch (error) {
    console.error('❌ Lỗi xóa đơn hàng:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Xóa đơn hàng qua POST /delete { orderId }
router.post('/delete', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Thiếu orderId' });
    }
    await Order.findByIdAndDelete(orderId);
    res.json({ success: true, message: 'Đã xóa đơn hàng' });
  } catch (error) {
    console.error('❌ Lỗi xóa đơn hàng:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
