const mongoose = require('mongoose');

const DutyRosterSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeIdStr: { type: String, required: true },
    date: { type: Date, required: true }, // Normalized to midnight

    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    shiftName: { type: String, enum: ['A', 'B', 'C', 'G'] }, // A=Morning, B=Evening, C=Night, G=General

    startTime: { type: String, required: true }, // HH:mm format
    endTime: { type: String, required: true },   // HH:mm format

    isOffDay: { type: Boolean, default: false },
    remarks: String,

    createdBy: { type: String }, // Employee ID of the person who uploaded/created this
}, { timestamps: true });

// Prevent duplicate roster for same employee on same day
DutyRosterSchema.index({ employeeId: 1, date: 1 }, { unique: true });
DutyRosterSchema.index({ employeeIdStr: 1, date: 1 });

module.exports = mongoose.model('DutyRoster', DutyRosterSchema);
