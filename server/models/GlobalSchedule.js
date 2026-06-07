// GlobalSchedule model with appliedShifts support
const mongoose = require('mongoose');

const GlobalScheduleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    startTime: { type: String, required: true }, // Override hours
    endTime: { type: String, required: true },
    appliedShifts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Shift' }],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('GlobalSchedule', GlobalScheduleSchema);
