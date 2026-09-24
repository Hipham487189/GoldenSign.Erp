const express = require('express');
const router = express.Router();

router.post('/push-smartsign', async (req, res) => {
  try {
    const { orderId, invoiceData } = req.body;
    console.log('📄 Yêu cầu xuất hóa đơn SmartSign cho đơn hàng:', orderId, invoiceData?.maDon);
    // Trả về kết quả thành công mô phỏng hoặc tích hợp SmartSign API
    res.json({
      success: true,
      message: `Đã gửi yêu cầu xuất hóa đơn điện tử cho đơn hàng [${invoiceData?.maDon || orderId}] thành công!`
    });
  } catch (error) {
    console.error('❌ Lỗi xuất hóa đơn SmartSign:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
