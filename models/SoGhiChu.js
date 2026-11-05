const mongoose = require('mongoose');

const soGhiChuSchema = new mongoose.Schema({
	nguoiDungId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	noiDung: { type: String, required: true, trim: true, maxlength: 3000 },
	hoanThanhLuc: { type: Date, default: null },
	hanChot: { type: Date, default: null },
	nhacTruocPhut: { type: Number, enum: [-1, 0, 5, 15, 60, 1440], default: 0 },
	nhacHenLuc: { type: Date, default: null },
	daNhacLuc: { type: Date, default: null }
}, {
	collection: 'SO_GHI_CHU',
	timestamps: { createdAt: 'taoLuc', updatedAt: 'capNhatLuc' }
});

soGhiChuSchema.index({ nguoiDungId: 1, hoanThanhLuc: 1, taoLuc: -1 });
soGhiChuSchema.index({ nguoiDungId: 1, hoanThanhLuc: 1, nhacHenLuc: 1, daNhacLuc: 1 });

module.exports = mongoose.model('SoGhiChu', soGhiChuSchema);
