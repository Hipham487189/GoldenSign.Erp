const express = require('express');
const ChatMessage = require('../models/ChatMessage');

const router = express.Router();

router.get('/all', async (req, res) => {
  try {
    const messages = await ChatMessage.find({}).sort({ createdAt: 1 }).limit(300).lean();
    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/create', async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    const attachmentName = String(req.body.attachmentName || '').trim();
    const attachmentSize = Number(req.body.attachmentSize || 0);
    const attachmentType = String(req.body.attachmentType || '').trim();
    const attachmentData = String(req.body.attachmentData || '');
    if (!text && !attachmentData) return res.status(400).json({ success: false, message: 'Tin nhắn không được để trống' });
    if (text.length > 2000) return res.status(400).json({ success: false, message: 'Tin nhắn không được vượt quá 2.000 ký tự' });
    if (attachmentData && (!Number.isFinite(attachmentSize) || attachmentSize <= 0 || attachmentSize > 5 * 1024 * 1024)) return res.status(400).json({ success: false, message: 'Tệp đính kèm phải có kích thước từ 1 byte đến 5MB' });
    if (attachmentData && !/^data:[^;]+;base64,/.test(attachmentData)) return res.status(400).json({ success: false, message: 'Định dạng tệp đính kèm không hợp lệ' });
    const message = await ChatMessage.create({
      senderUsername: req.auth.username || 'Thành viên',
      text,
      attachmentName,
      attachmentSize,
      attachmentType,
      attachmentData
    });
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const message = await ChatMessage.findOneAndDelete({ _id: req.params.id, senderUsername: req.auth.username });
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn của bạn' });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
