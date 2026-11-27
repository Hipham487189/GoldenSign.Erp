const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const SupportFolder = require('../models/SupportFolder');
const SupportFile = require('../models/SupportFile');
const { requirePermission, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const HAN_CHIA_SE_MS = 7 * 24 * 60 * 60 * 1000;
const GIOI_HAN_THU_MUC = 100;
const GIOI_HAN_TRANG = 100;
const GIOI_HAN_TEp_CHIA_SE = 20;
const GIOI_HAN_TEP_EMAIL = 10;
const GIOI_HAN_TONG_EMAIL_BYTES = 15 * 1024 * 1024;

function taoChuKyChiaSe(fileId, expMs) {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`support-share:${fileId}:${expMs}`)
    .digest('hex');
}

function taoLienKetChiaSe(req, fileId, hanMs = HAN_CHIA_SE_MS) {
  const id = String(fileId || '').trim();
  const exp = Date.now() + hanMs;
  const sig = taoChuKyChiaSe(id, exp);
  const pathUrl = `/api/support-share/${encodeURIComponent(id)}?exp=${exp}&sig=${sig}`;
  if (!req) return pathUrl;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = req.get('host');
  return host ? `${proto}://${host}${pathUrl}` : pathUrl;
}

function xacThucLienKetChiaSe(fileId, exp, sig) {
  const id = String(fileId || '').trim();
  const expNum = Number(exp);
  const sigStr = String(sig || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) return false;
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  if (!/^[a-f0-9]{64}$/i.test(sigStr)) return false;
  const expected = taoChuKyChiaSe(id, expNum);
  const bufA = Buffer.from(expected, 'hex');
  const bufB = Buffer.from(sigStr, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function tachDataUrl(fileData) {
  const match = String(fileData || '').match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    base64: match[2],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function dinhDangTenTepAnToan(name) {
  const cleaned = String(name || 'tai-lieu-datags')
    .replace(/[\r\n"\\]/g, '_')
    .trim();
  return cleaned || 'tai-lieu-datags';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function dinhDangNhanDinhDang(mimeType, name) {
  const mime = String(mimeType || '').toLowerCase();
  const ext = String(name || '').split('.').pop().toUpperCase();
  if (mime.includes('pdf') || ext === 'PDF') return 'PDF';
  if (mime.includes('word') || mime.includes('wordprocessingml') || ext === 'DOC' || ext === 'DOCX') return 'DOCX';
  if (mime.includes('sheet') || mime.includes('excel') || ext === 'XLS' || ext === 'XLSX') return 'XLSX';
  if (mime.includes('video') || ['MP4', 'MOV', 'WEBM'].includes(ext)) return 'VIDEO';
  if (mime.includes('image') || ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF'].includes(ext)) return 'IMAGE';
  if (mime.includes('zip') || mime.includes('rar') || ['ZIP', 'RAR', '7Z'].includes(ext)) return 'ZIP';
  return ext && ext.length <= 5 ? ext : 'FILE';
}

async function layDanhSachTepTheoYeuCau({ fileIds, folderId }, gioiHan) {
  let ids = Array.isArray(fileIds)
    ? [...new Set(fileIds.map(id => String(id || '').trim()).filter(id => mongoose.Types.ObjectId.isValid(id)))]
    : [];

  if (ids.length > gioiHan) {
    const err = new Error(`Chỉ hỗ trợ tối đa ${gioiHan} tài liệu mỗi lần gửi.`);
    err.status = 400;
    throw err;
  }

  let files = [];
  if (ids.length) {
    files = await SupportFile.find({ _id: { $in: ids } }).lean();
  } else if (folderId !== undefined && folderId !== null && folderId !== '' && folderId !== 'all') {
    const filter = folderId === 'none'
      ? { folderId: null }
      : (mongoose.Types.ObjectId.isValid(folderId) ? { folderId } : null);
    if (!filter) {
      const err = new Error('Mã bộ tài liệu không hợp lệ.');
      err.status = 400;
      throw err;
    }
    files = await SupportFile.find(filter).sort({ createdAt: -1 }).limit(gioiHan).lean();
  }

  if (!files.length) {
    const err = new Error('Không tìm thấy tài liệu nào để gửi.');
    err.status = 404;
    throw err;
  }
  return files;
}

router.get('/folders', requirePermission('support:view'), async (req, res) => {
  try {
    const [folders, stats] = await Promise.all([
      SupportFolder.find({}).sort({ name: 1 }).limit(GIOI_HAN_THU_MUC).lean(),
      SupportFile.aggregate([
        {
          $group: {
            _id: '$folderId',
            fileCount: { $sum: 1 },
            totalSize: { $sum: { $ifNull: ['$size', 0] } },
            mimeTypes: { $addToSet: '$mimeType' }
          }
        }
      ])
    ]);

    const statMap = new Map();
    let totalFiles = 0;
    let unassignedCount = 0;
    let unassignedSize = 0;

    stats.forEach(item => {
      const count = Number(item.fileCount || 0);
      const size = Number(item.totalSize || 0);
      totalFiles += count;
      if (item._id) {
        statMap.set(String(item._id), {
          fileCount: count,
          totalSize: size,
          formats: [...new Set((item.mimeTypes || []).map(m => dinhDangNhanDinhDang(m, '')).filter(Boolean))]
        });
      } else {
        unassignedCount = count;
        unassignedSize = size;
      }
    });

    const enriched = folders.map((folder, index) => {
      const info = statMap.get(String(folder._id)) || { fileCount: 0, totalSize: 0, formats: [] };
      return {
        ...folder,
        kitCode: `KIT-${String(index + 1).padStart(2, '0')}`,
        fileCount: info.fileCount,
        totalSize: info.totalSize,
        formats: info.formats
      };
    });

    res.json({
      success: true,
      data: enriched,
      meta: {
        totalFolders: enriched.length,
        totalFiles,
        unassignedCount,
        unassignedSize
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/folders', requirePermission('support:create'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên bộ tài liệu.' });
    if (name.length > 100) return res.status(400).json({ success: false, message: 'Tên bộ tài liệu tối đa 100 ký tự.' });
    const folder = await SupportFolder.create({
      name,
      description: String(req.body.description || '').trim().slice(0, 300),
      createdBy: req.auth?.username || ''
    });
    res.status(201).json({ success: true, data: folder });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/folders/:id', requirePermission('support:edit'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Mã bộ tài liệu không hợp lệ.' });
    }
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên bộ tài liệu.' });
    if (name.length > 100) return res.status(400).json({ success: false, message: 'Tên bộ tài liệu tối đa 100 ký tự.' });
    const folder = await SupportFolder.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description: String(req.body.description || '').trim().slice(0, 300)
      },
      { new: true, runValidators: true }
    ).lean();
    if (!folder) return res.status(404).json({ success: false, message: 'Không tìm thấy bộ tài liệu.' });
    res.json({ success: true, data: folder });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/folders/:id', requirePermission('support:delete'), async (req, res) => {
  try {
    const fileCount = await SupportFile.countDocuments({ folderId: req.params.id });
    if (fileCount > 0) {
      return res.status(400).json({ success: false, message: 'Thư mục còn chứa tệp, vui lòng xóa hết tệp trước khi xóa thư mục.' });
    }
    const folder = await SupportFolder.findByIdAndDelete(req.params.id);
    if (!folder) return res.status(404).json({ success: false, message: 'Không tìm thấy thư mục.' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Metadata only (no fileData) with pagination & search
router.get('/files', requirePermission('support:view'), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(GIOI_HAN_TRANG, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const q = String(req.query.q || '').trim().slice(0, 120);
    const folderId = String(req.query.folderId || '').trim();

    const filter = {};
    if (folderId === 'none') {
      filter.folderId = null;
    } else if (folderId && folderId !== 'all') {
      if (!mongoose.Types.ObjectId.isValid(folderId)) {
        return res.status(400).json({ success: false, message: 'Mã bộ tài liệu không hợp lệ.' });
      }
      filter.folderId = folderId;
    }

    if (q) {
      const safeRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: safeRegex }, { description: safeRegex }];
    }

    const [files, total] = await Promise.all([
      SupportFile.find(filter)
        .select('-fileData')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SupportFile.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: files,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Full record including fileData, used for view/download
router.get('/files/:id', requirePermission('support:download'), async (req, res) => {
  try {
    const file = await SupportFile.findById(req.params.id).lean();
    if (!file) return res.status(404).json({ success: false, message: 'Không tìm thấy tệp.' });
    res.json({ success: true, data: file });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/files', requirePermission('support:create'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const fileData = String(req.body.fileData || '');
    if (!name || !fileData) return res.status(400).json({ success: false, message: 'Thiếu tên tệp hoặc nội dung tệp.' });
    if (!/^data:[^;]+;base64,/.test(fileData)) return res.status(400).json({ success: false, message: 'Định dạng tệp không hợp lệ.' });
    const folderId = req.body.folderId && req.body.folderId !== 'none' && req.body.folderId !== 'all' ? req.body.folderId : null;
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
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/files/:id', requirePermission('support:delete'), async (req, res) => {
  try {
    const file = await SupportFile.findByIdAndDelete(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Không tìm thấy tệp.' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create signed share links (7-day expiry) for Zalo / quick copy
router.post('/share-links', requirePermission('support:download'), async (req, res) => {
  try {
    let files;
    if (Array.isArray(req.body?.fileIds) && req.body.fileIds.length) {
      const ids = [...new Set(req.body.fileIds.map(id => String(id || '').trim()).filter(id => mongoose.Types.ObjectId.isValid(id)))];
      if (!ids.length) return res.status(400).json({ success: false, message: 'Danh sách tài liệu không hợp lệ.' });
      if (ids.length > GIOI_HAN_TEp_CHIA_SE) {
        return res.status(400).json({ success: false, message: `Chỉ tạo được tối đa ${GIOI_HAN_TEp_CHIA_SE} liên kết mỗi lần.` });
      }
      files = await SupportFile.find({ _id: { $in: ids } }).select('_id name size mimeType').lean();
    } else if (req.body?.folderId) {
      const folderId = String(req.body.folderId).trim();
      const filter = folderId === 'none'
        ? { folderId: null }
        : (mongoose.Types.ObjectId.isValid(folderId) ? { folderId } : null);
      if (!filter) return res.status(400).json({ success: false, message: 'Mã bộ tài liệu không hợp lệ.' });
      files = await SupportFile.find(filter).select('_id name size mimeType').sort({ createdAt: -1 }).limit(GIOI_HAN_TEp_CHIA_SE).lean();
    } else {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 tài liệu hoặc bộ tài liệu.' });
    }

    if (!files.length) {
      return res.status(404).json({ success: false, message: 'Không có tài liệu nào để tạo liên kết.' });
    }

    const items = files.map(file => ({
      _id: file._id,
      name: file.name,
      size: file.size || 0,
      mimeType: file.mimeType || 'application/octet-stream',
      shareUrl: taoLienKetChiaSe(req, file._id)
    }));

    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

// Send email with attachments via Brevo API
router.post('/send-email', requirePermission('support:download'), async (req, res) => {
  try {
    const toEmail = String(req.body?.toEmail || '').trim();
    const customerName = String(req.body?.customerName || '').trim().slice(0, 120);
    const subject = String(req.body?.subject || '').trim().slice(0, 200);
    const message = String(req.body?.message || '').trim().slice(0, 4000);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return res.status(400).json({ success: false, message: 'Địa chỉ email khách hàng không hợp lệ.' });
    }
    if (!subject) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tiêu đề email.' });
    }

    const apiKey = String(process.env.BREVO_API_KEY || '').trim();
    const senderEmail = String(process.env.BREVO_SENDER_EMAIL || '').trim();
    const senderName = String(process.env.BREVO_SENDER_NAME || 'GoldenSign ERP').trim();
    if (!apiKey || !senderEmail) {
      return res.status(503).json({
        success: false,
        message: 'Hệ thống chưa cấu hình BREVO_API_KEY hoặc BREVO_SENDER_EMAIL trong .env. Bạn có thể dùng nút "Mở ứng dụng Mail" để gửi kèm link tải.'
      });
    }

    const files = await layDanhSachTepTheoYeuCau(
      { fileIds: req.body?.fileIds, folderId: req.body?.folderId },
      GIOI_HAN_TEP_EMAIL
    );

    let totalBytes = 0;
    const attachments = [];
    const linkItems = [];

    for (const file of files) {
      const parsed = tachDataUrl(file.fileData);
      if (!parsed) {
        return res.status(400).json({ success: false, message: `Tệp "${file.name}" có định dạng dữ liệu không hợp lệ.` });
      }
      totalBytes += parsed.buffer.length;
      if (totalBytes > GIOI_HAN_TONG_EMAIL_BYTES) {
        return res.status(400).json({
          success: false,
          message: 'Tổng dung lượng tệp đính kèm vượt quá 15 MB. Vui lòng chọn ít tệp hơn hoặc gửi link Zalo.'
        });
      }
      attachments.push({
        name: dinhDangTenTepAnToan(file.name),
        content: parsed.base64
      });
      linkItems.push({
        name: file.name,
        shareUrl: taoLienKetChiaSe(req, file._id)
      });
    }

    const greeting = customerName ? `Kính gửi ${escapeHtml(customerName)},` : 'Kính gửi Quý khách,';
    const bodyHtml = message
      ? `<p style="margin:0 0 14px;line-height:1.6;color:#1e293b;white-space:pre-line;">${escapeHtml(message)}</p>`
      : '<p style="margin:0 0 14px;line-height:1.6;color:#1e293b;">DATAGS xin gửi Quý khách bộ tài liệu hướng dẫn đính kèm trong email này.</p>';
    const linksHtml = linkItems
      .map(item => `<li style="margin:6px 0;"><a href="${escapeHtml(item.shareUrl)}" style="color:#0f766e;font-weight:600;text-decoration:none;">${escapeHtml(item.name)}</a></li>`)
      .join('');

    const htmlContent = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px;">
          <div style="font-size:13px;font-weight:700;color:#0f766e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">DATAGS · Hỗ Trợ Khách Hàng</div>
          <p style="margin:0 0 12px;font-weight:600;color:#0f172a;">${greeting}</p>
          ${bodyHtml}
          <div style="margin-top:16px;padding:14px 16px;background:#f1f5f9;border-radius:8px;">
            <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:6px;">Liên kết tải tài liệu dự phòng (hiệu lực 7 ngày):</div>
            <ul style="margin:0;padding-left:18px;">${linksHtml}</ul>
          </div>
          <p style="margin:18px 0 0;font-size:12px;color:#64748b;">Trân trọng,<br>${escapeHtml(senderName)}</p>
        </div>
      </div>
    `;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail, ...(customerName ? { name: customerName } : {}) }],
        subject,
        textContent: `${customerName ? `Kính gửi ${customerName},` : 'Kính gửi Quý khách,'}\n\n${message || 'DATAGS gửi Quý khách tài liệu hỗ trợ đính kèm.'}\n\nLink tải dự phòng:\n${linkItems.map(i => `- ${i.name}: ${i.shareUrl}`).join('\n')}`,
        htmlContent,
        attachment: attachments
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(502).json({
        success: false,
        message: `Không thể gửi email qua Brevo (${response.status}). ${errText ? errText.slice(0, 180) : ''}`.trim()
      });
    }

    return res.json({
      success: true,
      message: `Đã gửi ${attachments.length} tài liệu đến ${toEmail}.`,
      data: { sentCount: attachments.length, toEmail }
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

async function taiTepCongKhai(req, res) {
  try {
    const fileId = req.params.id;
    const { exp, sig } = req.query;
    if (!xacThucLienKetChiaSe(fileId, exp, sig)) {
      return res.status(403).send('Liên kết tải tài liệu không hợp lệ hoặc đã hết hạn.');
    }
    const file = await SupportFile.findById(fileId).lean();
    if (!file) return res.status(404).send('Không tìm thấy tài liệu.');

    const parsed = tachDataUrl(file.fileData);
    if (!parsed) return res.status(500).send('Dữ liệu tài liệu không hợp lệ.');

    const safeName = dinhDangTenTepAnToan(file.name);
    const encodedName = encodeURIComponent(safeName);
    res.setHeader('Content-Type', file.mimeType || parsed.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeName.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(parsed.buffer);
  } catch (error) {
    return res.status(500).send('Không thể tải tài liệu.');
  }
}

router.taiTepCongKhai = taiTepCongKhai;
router.taoLienKetChiaSe = taoLienKetChiaSe;
router.xacThucLienKetChiaSe = xacThucLienKetChiaSe;

module.exports = router;
