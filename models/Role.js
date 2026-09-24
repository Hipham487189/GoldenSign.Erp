const mongoose = require('mongoose');
const roleSchema = new mongoose.Schema({ name: { type: String, required: true, unique: true }, permissions: { type: [String], default: [] }, hiddenColumns: { type: mongoose.Schema.Types.Mixed, default: {} }, description: { type: String, default: '' } }, { collection: 'ROLES', timestamps: true });
module.exports = mongoose.model('Role', roleSchema);
