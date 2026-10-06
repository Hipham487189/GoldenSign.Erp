const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
	taskId: { type: String, required: true, unique: true, index: true }
}, { collection: 'TASKS', strict: false, timestamps: true });

module.exports = mongoose.model('Task', taskSchema);