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

function laDonDaKichHoatHoacHoanTat(order) {
  if (!order) return false;
  if (order.lockedAt) return true;
  const kiemTraTrangThai = (giaTri) => {
    const s = String(giaTri || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd');
    if (!s) return false;
    if (/^(?!.*chua\s+kich\s+hoat).*kich\s+hoat/.test(s)) return true;
    if (/hoan\s+(tat|thanh)/.test(s)) return true;
    if (/thanh\s+toan/.test(s)) return true;
    return false;
  };
  if (kiemTraTrangThai(order['TÌNH TRẠNG'])) return true;
  if (Array.isArray(order.chiTietSanPham) && order.chiTietSanPham.some(dong => kiemTraTrangThai(dong.trangThai))) return true;
  return false;
}

// Xóa đơn hàng theo ID
router.delete('/delete/:id', async (req, res) => {
  try {
    const existingOrder = await Order.findById(req.params.id).lean();
    if (!existingOrder) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    if (existingOrder.lockedAt || laDonDaKichHoatHoacHoanTat(existingOrder)) {
      return res.status(423).json({ success: false, message: 'Đơn hàng đã kích hoạt hoặc hoàn tất, không thể xóa.' });
    }
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
    const existingOrder = await Order.findById(orderId).lean();
    if (!existingOrder) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    if (existingOrder.lockedAt || laDonDaKichHoatHoacHoanTat(existingOrder)) {
      return res.status(423).json({ success: false, message: 'Đơn hàng đã kích hoạt hoặc hoàn tất, không thể xóa.' });
    }
    await Order.findByIdAndDelete(orderId);
    res.json({ success: true, message: 'Đã xóa đơn hàng' });
  } catch (error) {
    console.error('❌ Lỗi xóa đơn hàng:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
