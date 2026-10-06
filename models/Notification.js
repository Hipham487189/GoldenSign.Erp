const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
	title: { type: String, required: true, trim: true },
	announcer: { type: String, default: '', trim: true },
	content: { type: String, required: true, trim: true },
	priority: { type: String, enum: ['normal', 'important', 'urgent'], default: 'normal' },
	isPublished: { type: Boolean, default: true },
	showOnBanner: { type: Boolean, default: false },
	attachmentName: { type: String, default: '' },
	attachmentData: { type: String, default: '' }
}, { collection: 'NOTIFICATIONS', timestamps: true });

notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
