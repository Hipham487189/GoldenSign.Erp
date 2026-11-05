const express = require('express');
const mongoose = require('mongoose');
const SoGhiChu = require('../models/SoGhiChu');

const boDinhTuyen = express.Router();
const truongDuLieu = '_id noiDung hoanThanhLuc taoLuc hanChot nhacTruocPhut nhacHenLuc';
const cacMocNhacTruocPhut = [-1, 0, 5, 15, 60, 1440];

boDinhTuyen.get('/', async (yeuCau, phanHoi) => {
	try {
		const trang = yeuCau.query.trang === undefined ? 1 : Number(yeuCau.query.trang);
		const gioiHan = yeuCau.query.gioiHan === undefined ? 20 : Number(yeuCau.query.gioiHan);
		const trangThai = yeuCau.query.trangThai || 'chua-hoan-thanh';
		const cacTrangThai = ['tat-ca', 'chua-hoan-thanh', 'da-hoan-thanh'];
		if (!Number.isSafeInteger(trang) || trang < 1) return phanHoi.status(400).json({ success: false, message: 'Trang ghi chú không hợp lệ.' });
		if (!Number.isInteger(gioiHan) || ![20, 50, 100].includes(gioiHan)) return phanHoi.status(400).json({ success: false, message: 'Số ghi chú mỗi trang không hợp lệ.' });
		if (!cacTrangThai.includes(trangThai)) return phanHoi.status(400).json({ success: false, message: 'Bộ lọc ghi chú không hợp lệ.' });

		const boLoc = { nguoiDungId: yeuCau.auth.userId };
		if (trangThai === 'chua-hoan-thanh') boLoc.hoanThanhLuc = null;
		if (trangThai === 'da-hoan-thanh') boLoc.hoanThanhLuc = { $ne: null };
		const tongSo = await SoGhiChu.countDocuments(boLoc);
		const tongTrang = Math.max(1, Math.ceil(tongSo / gioiHan));
		const trangHienTai = Math.min(trang, tongTrang);
		const danhSach = await SoGhiChu.find(boLoc).select(truongDuLieu).sort({ taoLuc: -1 }).skip((trangHienTai - 1) * gioiHan).limit(gioiHan).lean();
		phanHoi.json({
			success: true,
			data: danhSach,
			meta: { tongSo, trang: trangHienTai, gioiHan, tongTrang }
		});
	} catch (loi) {
		phanHoi.status(500).json({ success: false, message: loi.message });
	}
});

boDinhTuyen.post('/', async (yeuCau, phanHoi) => {
	try {
		if (typeof yeuCau.body?.noiDung !== 'string') return phanHoi.status(400).json({ success: false, message: 'Nội dung ghi chú không hợp lệ.' });
		const noiDung = yeuCau.body.noiDung.trim();
		if (!noiDung) return phanHoi.status(400).json({ success: false, message: 'Vui lòng nhập nội dung ghi chú.' });
		if (noiDung.length > 3000) return phanHoi.status(400).json({ success: false, message: 'Ghi chú không được vượt quá 3.000 ký tự.' });

		const nhacTruocPhut = yeuCau.body.nhacTruocPhut === undefined ? 0 : Number(yeuCau.body.nhacTruocPhut);
		if (!cacMocNhacTruocPhut.includes(nhacTruocPhut)) return phanHoi.status(400).json({ success: false, message: 'Thời gian nhắc hẹn không hợp lệ.' });

		let hanChot = null;
		let nhacHenLuc = null;
		if (yeuCau.body.hanChot) {
			hanChot = new Date(yeuCau.body.hanChot);
			if (Number.isNaN(hanChot.getTime())) return phanHoi.status(400).json({ success: false, message: 'Thời hạn ghi chú không hợp lệ.' });
			if (hanChot <= new Date()) return phanHoi.status(400).json({ success: false, message: 'Thời hạn phải ở thời điểm trong tương lai.' });
			if (nhacTruocPhut !== 0) nhacHenLuc = new Date(hanChot.getTime() - Math.max(0, nhacTruocPhut) * 60 * 1000);
		} else if (nhacTruocPhut !== 0) {
			return phanHoi.status(400).json({ success: false, message: 'Cần chọn thời hạn để đặt nhắc hẹn.' });
		}

		const ghiChu = await SoGhiChu.create({ nguoiDungId: yeuCau.auth.userId, noiDung, hanChot, nhacTruocPhut, nhacHenLuc });
		phanHoi.status(201).json({
			success: true,
			data: { _id: ghiChu._id, noiDung: ghiChu.noiDung, hoanThanhLuc: ghiChu.hoanThanhLuc, taoLuc: ghiChu.taoLuc, hanChot: ghiChu.hanChot, nhacTruocPhut: ghiChu.nhacTruocPhut }
		});
	} catch (loi) {
		phanHoi.status(500).json({ success: false, message: loi.message });
	}
});

boDinhTuyen.post('/nhac-hen/kiem-tra', async (yeuCau, phanHoi) => {
	try {
		const gioHienTai = new Date();
		const ghiChuDenHan = await SoGhiChu.find({
			nguoiDungId: yeuCau.auth.userId,
			hoanThanhLuc: null,
			nhacHenLuc: { $lte: gioHienTai },
			daNhacLuc: null
		}).select('_id').sort({ nhacHenLuc: 1 }).limit(20).lean();

		const ghiChuDaNhac = await Promise.all(ghiChuDenHan.map(ghiChu => SoGhiChu.findOneAndUpdate(
			{ _id: ghiChu._id, nguoiDungId: yeuCau.auth.userId, hoanThanhLuc: null, daNhacLuc: null },
			{ $set: { daNhacLuc: gioHienTai } },
			{ new: true }
		).select('_id noiDung hanChot nhacHenLuc').lean()));

		phanHoi.json({ success: true, data: ghiChuDaNhac.filter(Boolean) });
	} catch (loi) {
		phanHoi.status(500).json({ success: false, message: loi.message });
	}
});

boDinhTuyen.patch('/:ma/hoan-thanh', async (yeuCau, phanHoi) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(yeuCau.params.ma)) return phanHoi.status(400).json({ success: false, message: 'Mã ghi chú không hợp lệ.' });
		const ghiChu = await SoGhiChu.findOneAndUpdate(
			{ _id: yeuCau.params.ma, nguoiDungId: yeuCau.auth.userId, hoanThanhLuc: null },
			{ $set: { hoanThanhLuc: new Date() } },
			{ new: true, runValidators: true }
		).select(truongDuLieu).lean();
		if (!ghiChu) return phanHoi.status(404).json({ success: false, message: 'Không tìm thấy ghi chú đang cần hoàn thành.' });
		phanHoi.json({ success: true, data: ghiChu });
	} catch (loi) {
		phanHoi.status(500).json({ success: false, message: loi.message });
	}
});

boDinhTuyen.delete('/:ma', async (yeuCau, phanHoi) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(yeuCau.params.ma)) return phanHoi.status(400).json({ success: false, message: 'Mã ghi chú không hợp lệ.' });
		const ghiChu = await SoGhiChu.findOneAndDelete({ _id: yeuCau.params.ma, nguoiDungId: yeuCau.auth.userId }).select('_id').lean();
		if (!ghiChu) return phanHoi.status(404).json({ success: false, message: 'Không tìm thấy ghi chú cần xóa.' });
		phanHoi.json({ success: true, message: 'Đã xóa ghi chú.' });
	} catch (loi) {
		phanHoi.status(500).json({ success: false, message: loi.message });
	}
});

module.exports = boDinhTuyen;
