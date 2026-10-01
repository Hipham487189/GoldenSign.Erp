const mongoose = require('mongoose');
const roleSchema = new mongoose.Schema({ name: { type: String, required: true, unique: true }, permissions: { type: [String], default: [] }, hiddenColumns: { type: mongoose.Schema.Types.Mixed, default: {} }, dataScopes: { type: mongoose.Schema.Types.Mixed, default: {} }, description: { type: String, default: '' }, archivedAt: { type: Date, default: null } }, { collection: 'ROLES', timestamps: true });
module.exports = mongoose.model('Role', roleSchema);
