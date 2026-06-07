const mongoose = require('mongoose');

const ShiftSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    startTime: { type: String, required: true, default: "09:00" }, // 24h format HH:mm
    endTime: { type: String, required: true, default: "18:00" },
    graceTime: { type: Number, default: 15 }, // minutes
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Shift', ShiftSchema);
