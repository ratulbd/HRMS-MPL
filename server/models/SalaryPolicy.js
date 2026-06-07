const mongoose = require('mongoose');

// Each slab represents one row in the "Metal" salary table
const SlabSchema = new mongoose.Schema({
    slNo: { type: Number, required: true },
    minGross: { type: Number, required: true },
    // null/undefined means "and above" (open-ended top slab)
    maxGross: { type: Number, default: null },
    // basic_percentage for employees joining BEFORE the cutoff date
    basicPercentagePre: { type: Number, required: true },
    // basic_percentage for employees joining ON or AFTER the cutoff date
    basicPercentagePost: { type: Number, required: true }
}, { _id: false });

const SalaryPolicySchema = new mongoose.Schema({
    policyName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    // The "cut-off" joining date.
    // Employees who joined BEFORE this date get basicPercentagePre.
    // Employees who joined ON or AFTER this date get basicPercentagePost.
    joiningDateCutoff: { type: Date, required: true },

    slabs: { type: [SlabSchema], required: true },

    // Festival Bonus & Incentive Bonus percentage of Gross Pay
    festivalBonusPercentage: { type: Number, default: 50 },
    incentiveBonusPercentage: { type: Number, default: 50 },

    // Effective from
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },

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

module.exports = mongoose.model('SalaryPolicy', SalaryPolicySchema);
