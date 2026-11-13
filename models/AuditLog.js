const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorUsername: { type: String, default: '' },
  action: { type: String, required: true, index: true },
  module: { type: String, required: true, index: true },
  recordId: { type: String, default: '' },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String, default: '' }
}, { collection: 'AUDIT_LOGS', timestamps: true });

auditLogSchema.index({ module: 1, createdAt: -1, _id: -1 });
auditLogSchema.index({ actorUserId: 1, module: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
