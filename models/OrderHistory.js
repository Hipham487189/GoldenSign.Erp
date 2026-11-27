const mongoose = require('mongoose');

const orderHistorySchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  changedBy: { type: String, required: true, trim: true },
  changedAt: { type: Date, default: Date.now },
  action: { type: String, default: 'UPDATE' },
  module: { type: String, default: 'orders' },
  reason: { type: String, default: '' },
  ip: { type: String, default: '' },
  changes: [{
    field: { type: String, required: true },
    from: { type: String, default: '' },
    to: { type: String, default: '' }
  }]
}, { collection: 'ORDER_HISTORY', timestamps: true });

orderHistorySchema.index({ orderId: 1, changedAt: -1 });

module.exports = mongoose.model('OrderHistory', orderHistorySchema);
