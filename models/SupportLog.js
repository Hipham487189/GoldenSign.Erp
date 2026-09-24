const mongoose = require('mongoose');

const supportLogSchema = new mongoose.Schema({
  supportCode: { type: String, unique: true, sparse: true, trim: true, index: true },
  mst: { type: String, required: true, trim: true, index: true },
  company: { type: String, default: '', trim: true },
  customerName: { type: String, default: '', trim: true },
  customerPhone: { type: String, default: '', trim: true },
  channel: { type: String, default: '', trim: true },
  type: { type: String, default: '', trim: true },
  request: { type: String, required: true, trim: true },
  resolution: { type: String, default: '', trim: true },
  status: { type: String, default: '', trim: true },
  deadline: { type: String, default: '', trim: true },
  followUp: { type: String, default: '', trim: true },
  createdBy: { type: String, default: 'Hệ thống', trim: true },
  activityHistory: [{
    employee: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
    content: { type: String, required: true, trim: true }
  }]
}, { collection: 'SUPPORT_LOGS', timestamps: true });

module.exports = mongoose.model('SupportLog', supportLogSchema);
