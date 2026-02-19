const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeIdStr: { type: String, required: true },
    type: { type: String, enum: ['Sick', 'Casual', 'Earned', 'LWP'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    approvalStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    currentApprover: { type: String }, // Employee ID
    approvalHierarchy: [{ type: String }], // Copy of employee's hierarchy
    approvalLogs: [
        {
            approverId: String,
            status: String,
            comments: String,
            timestamp: { type: Date, default: Date.now }
        }
    ],
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Leave', LeaveSchema);
