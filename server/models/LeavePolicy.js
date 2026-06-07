const mongoose = require('mongoose');

const LeavePolicySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    // Number of days allocated per year
    daysAllowed: { type: Number, required: true, min: 0 },
    // Applicable to all employees or specific types
    applicableFor: {
        type: String,
        enum: ['All', 'Regular', 'Casual', 'Contractual', 'Temporary'],
        default: 'All'
    },
    // Gender restriction (for Maternity/Paternity)
    genderRestriction: {
        type: String,
        enum: ['All', 'Male', 'Female'],
        default: 'All'
    },
    // Is carry forward allowed?
    carryForward: { type: Boolean, default: false },
    // Max carry forward days (0 = unlimited carry forward)
    maxCarryForwardDays: { type: Number, default: 0 },
    // Can leave be taken without prior approval (e.g. sick leave)
    requiresApproval: { type: Boolean, default: true },
    // Description or special conditions
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        versionKey: false,
        transform: function (doc, ret) {
            ret.id = ret._id;
            delete ret._id;
        }
    }
});

module.exports = mongoose.model('LeavePolicy', LeavePolicySchema);
