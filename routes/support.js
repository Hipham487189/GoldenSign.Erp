const express = require('express');
const SupportFolder = require('../models/SupportFolder');
const SupportFile = require('../models/SupportFile');

const router = express.Router();

router.get('/folders', async (req, res) => {
  try { res.json({ success: true, data: await SupportFolder.find({}).sort({ name: 1 }) }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/folders', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên thư mục.' });
    const folder = await SupportFolder.create({
      name,
      description: String(req.body.description || '').trim(),
      createdBy: req.auth?.username || ''
    });
    res.status(201).json({ success: true, data: folder });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/folders/:id', async (req, res) => {
  try {
    const fileCount = await SupportFile.countDocuments({ folderId: req.params.id });
    if (fileCount > 0) return res.status(400).json({ success: false, message: 'Thư mục còn chứa tệp, vui lòng xóa hết tệp trước khi xóa thư mục.' });
    const folder = await SupportFolder.findByIdAndDelete(req.params.id);
    if (!folder) return res.status(404).json({ success: false, message: 'Không tìm thấy thư mục.' });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Metadata only (no fileData) so listing stays light
router.get('/files', async (req, res) => {
  try {
    const filter = {};
    if (req.query.folderId === 'none') filter.folderId = null;
    else if (req.query.folderId) filter.folderId = req.query.folderId;
    const files = await SupportFile.find(filter).select('-fileData').sort({ createdAt: -1 });
    res.json({ success: true, data: files });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Full record including fileData, used for view/download
router.get('/files/:id', async (req, res) => {
  try {
    const file = await SupportFile.findById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Không tìm thấy tệp.' });
    res.json({ success: true, data: file });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/files', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const fileData = String(req.body.fileData || '');
    if (!name || !fileData) return res.status(400).json({ success: false, message: 'Thiếu tên tệp hoặc nội dung tệp.' });
    if (!/^data:[^;]+;base64,/.test(fileData)) return res.status(400).json({ success: false, message: 'Định dạng tệp không hợp lệ.' });
    const folderId = req.body.folderId && req.body.folderId !== 'none' ? req.body.folderId : null;
    const file = await SupportFile.create({
      folderId,
      name,
      mimeType: String(req.body.mimeType || 'application/octet-stream'),
      size: Number(req.body.size || 0),
      fileData,
      description: String(req.body.description || '').trim(),
      uploadedBy: req.auth?.username || ''
    });
    const meta = file.toObject();
    delete meta.fileData;
    res.status(201).json({ success: true, data: meta });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/files/:id', async (req, res) => {
  try {
    const file = await SupportFile.findByIdAndDelete(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Không tìm thấy tệp.' });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
