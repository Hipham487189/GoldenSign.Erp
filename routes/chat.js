const express = require('express');
const ChatMessage = require('../models/ChatMessage');
const KenhChat = require('../models/KenhChat');
const User = require('../models/User');
const { randomUUID } = require('crypto');
const { markUserOnline, markUserTyping, getTypingUsers } = require('../services/chatPresence');

const router = express.Router();
const GENERAL_CHANNEL = 'datags-group';

function truyVanKenh(maKenh) {
  return maKenh === GENERAL_CHANNEL
    ? { $or: [{ maKenh: GENERAL_CHANNEL }, { maKenh: { $exists: false } }, { maKenh: '' }] }
    : { maKenh };
}

async function duocTruyCapKenh(username, maKenh) {
  if (maKenh === GENERAL_CHANNEL) return true;
  return Boolean(await KenhChat.exists({ maKenh, tenThanhVien: username }));
}

router.post('/presence', (req, res) => {
  const username = String(req.auth?.username || '').trim();
  if (!username) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
  markUserOnline(username);
  if (typeof req.body?.typing === 'boolean') markUserTyping(username, req.body.typing);
  res.json({ success: true, data: { users: markUserOnline(username), typing: getTypingUsers().filter(item => item !== username) } });
});

router.get('/messages', async (req, res) => {
  try {
    const username = String(req.auth?.username || '').trim();
    const maKenh = String(req.query.channelKey || GENERAL_CHANNEL).trim();
    if (!await duocTruyCapKenh(username, maKenh)) return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập kênh này' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    if (req.query.markRead === '1' && username) {
      await ChatMessage.updateMany(
        { ...truyVanKenh(maKenh), senderUsername: { $ne: username }, luotXem: { $ne: username } },
        { $addToSet: { luotXem: username } }
      );
    }
    const messages = await ChatMessage.find(truyVanKenh(maKenh)).sort({ createdAt: -1 }).limit(limit).select('-attachmentData').lean();
    res.json({
      success: true,
      data: messages.reverse().map(message => ({
        ...message,
        coTepDinhKem: Boolean(message.attachmentSize > 0 || message.attachmentName)
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/read', async (req, res) => {
  try {
    const username = String(req.auth?.username || '').trim();
    if (!username) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
    const maKenh = String(req.body?.channelKey || GENERAL_CHANNEL).trim();
    if (!await duocTruyCapKenh(username, maKenh)) return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập kênh này' });
    await ChatMessage.updateMany(
      { ...truyVanKenh(maKenh), senderUsername: { $ne: username }, luotXem: { $ne: username } },
      { $addToSet: { luotXem: username } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id/attachment', async (req, res) => {
  try {
    const username = String(req.auth?.username || '').trim();
    const message = await ChatMessage.findById(req.params.id).select('maKenh attachmentName attachmentSize attachmentType attachmentData').lean();
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });
    if (!await duocTruyCapKenh(username, message.maKenh || GENERAL_CHANNEL)) return res.status(403).json({ success: false, message: 'Bạn không có quyền tải tệp đính kèm này' });
    if (!message.attachmentData) return res.status(404).json({ success: false, message: 'Tin nhắn không có tệp đính kèm' });
    res.json({
      success: true,
      data: {
        attachmentName: message.attachmentName || 'tep-dinh-kem',
        attachmentType: message.attachmentType || '',
        attachmentSize: message.attachmentSize || 0,
        attachmentData: message.attachmentData
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const username = String(req.auth?.username || '').trim();
    if (!username) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
    const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
    const messages = await ChatMessage.find(truyVanKenh(GENERAL_CHANNEL)).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean();
    res.json({ success: true, data: messages.reverse(), meta: { page, limit } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/channels', async (req, res) => {
  try {
    const username = String(req.auth?.username || '').trim();
    const channels = await KenhChat.find({ tenThanhVien: username }).sort({ loaiKenh: 1, updatedAt: -1 }).limit(100).lean();
    const seenInput = req.query.seen ? JSON.parse(String(req.query.seen).slice(0, 10000)) : {};
    const data = [{ maKenh: GENERAL_CHANNEL, tenKenh: 'Thảo Luận Nhóm DATAGS', loaiKenh: 'group', tenThanhVien: [] }, ...channels.map(channel => ({
      ...channel,
      tenKenh: channel.loaiKenh === 'direct'
        ? channel.tenThanhVien.find(member => member !== username) || channel.tenKenh
        : channel.tenKenh
    }))];
    const unreadFields = {};
    for (const channel of data) {
      const maKenh = channel.maKenh;
      const rawSeen = seenInput && Object.prototype.hasOwnProperty.call(seenInput, maKenh) ? Number(seenInput[maKenh]) : 0;
      const timestamp = Number.isFinite(rawSeen) && rawSeen > 0 ? rawSeen : 0;
      const dieuKien = [
        { $eq: [{ $ifNull: ['$maKenh', GENERAL_CHANNEL] }, maKenh] },
        { $ne: ['$senderUsername', username] },
        { $not: [{ $in: [username, { $ifNull: ['$luotXem', []] }] }] }
      ];
      if (timestamp > 0) {
        dieuKien.push({ $gt: ['$createdAt', new Date(timestamp)] });
      }
      unreadFields[`k${Buffer.from(maKenh).toString('hex')}`] = {
        $sum: { $cond: [{ $and: dieuKien }, 1, 0] }
      };
    }
    const unreadRows = Object.keys(unreadFields).length
      ? await ChatMessage.aggregate([{ $match: { $or: data.map(channel => channelQueryForCount(channel.maKenh)) } }, { $group: { _id: null, ...unreadFields } }])
      : [];
    const counts = unreadRows[0] || {};
    for (const channel of data) channel.soChuaDoc = Number(counts[`k${Buffer.from(channel.maKenh).toString('hex')}`] || 0);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

function channelQueryForCount(maKenh) {
  return truyVanKenh(maKenh);
}

router.get('/members', async (req, res) => {
  try {
    const members = await User.find({ isActive: { $ne: false } })
      .select('username employeeId')
      .populate('employeeId', 'name department')
      .sort({ username: 1 })
      .limit(100)
      .lean();
    res.json({ success: true, data: members.map(user => ({ username: user.username, name: user.employeeId?.name || user.username, department: user.employeeId?.department || '' })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/channels', async (req, res) => {
  try {
    const username = String(req.auth?.username || '').trim();
    const loaiKenh = req.body.type === 'direct' ? 'direct' : 'group';
    const members = [...new Set([username, ...((Array.isArray(req.body.memberUsernames) ? req.body.memberUsernames : []).map(item => String(item).trim().toLowerCase()).filter(Boolean))])];
    if (!members.length || (loaiKenh === 'direct' && members.length !== 2)) return res.status(400).json({ success: false, message: 'Kênh trực tiếp cần đúng một người nhận' });
    if (loaiKenh === 'group' && members.length < 2) return res.status(400).json({ success: false, message: 'Nhóm cần ít nhất hai thành viên' });
    const soThanhVienHopLe = await User.countDocuments({ username: { $in: members }, isActive: { $ne: false } });
    if (soThanhVienHopLe !== members.length) return res.status(400).json({ success: false, message: 'Danh sách thành viên có tài khoản không tồn tại hoặc đã bị khóa' });
    const nameInput = String(req.body.name || '').trim().slice(0, 100);
    if (loaiKenh === 'group' && !nameInput) return res.status(400).json({ success: false, message: 'Tên nhóm không được để trống' });
    const maKenh = loaiKenh === 'direct' ? `direct:${[...members].sort((a, b) => a.localeCompare(b, 'vi')).join(':')}` : `group:${randomUUID()}`;
    const tenKenh = loaiKenh === 'direct' ? members.find(member => member !== username) : nameInput;
    const channel = await KenhChat.findOneAndUpdate(
      loaiKenh === 'direct' ? { maKenh } : { maKenh: null },
      { $setOnInsert: { maKenh, tenKenh, loaiKenh, tenThanhVien: members, nguoiTao: username } },
      { upsert: true, new: true, returnDocument: 'after' }
    );
    res.status(channel.isNew ? 201 : 200).json({ success: true, data: channel });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/channels/:key', async (req, res) => {
  try {
    const username = String(req.auth?.username || '').trim();
    const maKenh = String(req.params.key || '');
    const channel = await KenhChat.findOneAndDelete({ maKenh, nguoiTao: username });
    if (!channel) return res.status(404).json({ success: false, message: 'Không tìm thấy kênh do bạn tạo' });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/create', async (req, res) => {
  try {
    const maKenh = String(req.body.channelKey || GENERAL_CHANNEL).trim();
    if (!await duocTruyCapKenh(String(req.auth?.username || '').trim(), maKenh)) return res.status(403).json({ success: false, message: 'Bạn không có quyền gửi tin vào kênh này' });
    const text = String(req.body.text || '').trim();
    const attachmentName = String(req.body.attachmentName || '').trim();
    const attachmentSize = Number(req.body.attachmentSize || 0);
    const attachmentType = String(req.body.attachmentType || '').trim();
    const attachmentData = String(req.body.attachmentData || '');
    const nguonNghiepVu = req.body.nguonNghiepVu && typeof req.body.nguonNghiepVu === 'object' ? {
      loai: String(req.body.nguonNghiepVu.loai || '').trim().slice(0, 30),
      nhan: String(req.body.nguonNghiepVu.nhan || '').trim().slice(0, 100),
      ma: String(req.body.nguonNghiepVu.ma || '').trim().slice(0, 100),
      mst: String(req.body.nguonNghiepVu.mst || '').trim().slice(0, 30),
      trangThai: String(req.body.nguonNghiepVu.trangThai || '').trim().slice(0, 100),
      tenCongTy: String(req.body.nguonNghiepVu.tenCongTy || '').trim().slice(0, 250),
      tenGoi: String(req.body.nguonNghiepVu.tenGoi || '').trim().slice(0, 250),
      loaiHoSo: String(req.body.nguonNghiepVu.loaiHoSo || '').trim().slice(0, 250),
      maDoiTuong: String(req.body.nguonNghiepVu.maDoiTuong || '').trim().slice(0, 50)
    } : {};
    const replyToInput = req.body.replyTo && typeof req.body.replyTo === 'object' ? req.body.replyTo : {};
    const replyTo = {
      messageId: String(replyToInput.messageId || '').trim().slice(0, 50),
      senderUsername: String(replyToInput.senderUsername || '').trim().slice(0, 100),
      text: String(replyToInput.text || '').trim().slice(0, 300)
    };
    if (!text && !attachmentData && !nguonNghiepVu.nhan) return res.status(400).json({ success: false, message: 'Tin nhắn không được để trống' });
    if (text.length > 2000) return res.status(400).json({ success: false, message: 'Tin nhắn không được vượt quá 2.000 ký tự' });
    if (attachmentData && (!Number.isFinite(attachmentSize) || attachmentSize <= 0 || attachmentSize > 5 * 1024 * 1024)) return res.status(400).json({ success: false, message: 'Tệp đính kèm phải có kích thước từ 1 byte đến 5MB' });
    if (attachmentData && !/^data:[^;]+;base64,/.test(attachmentData)) return res.status(400).json({ success: false, message: 'Định dạng tệp đính kèm không hợp lệ' });
    const message = await ChatMessage.create({
      senderUsername: req.auth.username || 'Thành viên',
      maKenh,
      text,
      attachmentName,
      attachmentSize,
      attachmentType,
      attachmentData,
      traLoi: replyTo,
      nguonNghiepVu
    });
    const messageObj = message.toObject();
    delete messageObj.attachmentData;
    messageObj.coTepDinhKem = Boolean(messageObj.attachmentSize > 0 || messageObj.attachmentName);
    res.status(201).json({ success: true, data: messageObj });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/reaction', async (req, res) => {
  try {
    const emoji = String(req.body.emoji || '').trim();
    const username = String(req.auth?.username || '').trim();
    if (!username) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
    if (!['👍', '❤️', '🎉', '😂', '✅'].includes(emoji)) return res.status(400).json({ success: false, message: 'Biểu tượng phản ứng không hợp lệ' });
    const message = await ChatMessage.findById(req.params.id).select('-attachmentData');
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });
    if (!await duocTruyCapKenh(username, message.maKenh || GENERAL_CHANNEL)) return res.status(403).json({ success: false, message: 'Bạn không có quyền phản ứng tin nhắn này' });
    const reaction = message.phanUng.find(item => item.emoji === emoji);
    if (reaction) {
      const index = reaction.users.indexOf(username);
      if (index >= 0) reaction.users.splice(index, 1);
      else reaction.users.push(username);
      if (!reaction.users.length) message.phanUng.pull(reaction._id);
    } else {
      message.phanUng.push({ emoji, users: [username] });
    }
    await message.save();
    const messageObj = message.toObject();
    messageObj.coTepDinhKem = Boolean(messageObj.attachmentSize > 0 || messageObj.attachmentName);
    res.json({ success: true, data: messageObj });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/pin', async (req, res) => {
  try {
    const message = await ChatMessage.findById(req.params.id).select('-attachmentData');
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });
    if (!await duocTruyCapKenh(String(req.auth?.username || '').trim(), message.maKenh || GENERAL_CHANNEL)) return res.status(403).json({ success: false, message: 'Bạn không có quyền ghim tin nhắn này' });
    message.daGhim = !message.daGhim;
    await message.save();
    const messageObj = message.toObject();
    messageObj.coTepDinhKem = Boolean(messageObj.attachmentSize > 0 || messageObj.attachmentName);
    res.json({ success: true, data: messageObj });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/view', async (req, res) => {
  try {
    const username = String(req.auth?.username || '').trim();
    const message = await ChatMessage.findById(req.params.id).select('-attachmentData');
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });
    if (!await duocTruyCapKenh(username, message.maKenh || GENERAL_CHANNEL)) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem tin nhắn này' });
    if (!message.luotXem.includes(username)) message.luotXem.push(username);
    await message.save();
    const messageObj = message.toObject();
    messageObj.coTepDinhKem = Boolean(messageObj.attachmentSize > 0 || messageObj.attachmentName);
    res.json({ success: true, data: messageObj });
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
