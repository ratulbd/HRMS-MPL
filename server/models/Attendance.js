const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeIdStr: { type: String, required: true }, // Redundant string for easy querying from legacy ID
    date: { type: Date, required: true }, // Normalized to midnight

    checkInTime: { type: Date },
    checkInLocation: {
        lat: Number,
        lng: Number,
        address: String
    },
    checkInSelfie: { type: String }, // URL to image

    checkOutTime: { type: Date },
    checkOutLocation: {
        lat: Number,
        lng: Number,
        address: String
    },
    checkOutSelfie: { type: String },

    status: { type: String, enum: ['Present', 'Absent', 'Late', 'Leave', 'Pending', 'Rejected'], default: 'Absent' },
    workHours: { type: Number, default: 0 },

    // Validation Fields
    isLate: { type: Boolean, default: false },
    isOutOfRange: { type: Boolean, default: false },
    justification: { type: String },

    // Dynamic Approval Tracking
    approvalStatus: { type: String, enum: ['Approved', 'Rejected', 'Pending'], default: 'Approved' },
    currentApprover: { type: String }, // Employee ID of who needs to approve next
    approvalLogs: [{
        approverId: String,
        status: { type: String, enum: ['Approved', 'Rejected'] },
        comments: String,
        timestamp: { type: Date, default: Date.now }
    }],

}, { timestamps: true });

// Prevent duplicate attendance for same person on same day
AttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);
