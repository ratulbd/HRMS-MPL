const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
    // Basic Info
    employeeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    employeeType: { type: String, enum: ['Regular', 'Casual', 'Contractual', 'Temporary'], default: 'Regular' },
    designation: { type: String, required: true },
    functionalRole: { type: String, required: true },
    joiningDate: { type: Date, required: true },
    workExperience: { type: Number },
    education: { type: String },

    // Approval Workflow
    approvalHierarchy: [{ type: String }], // Array of Employee IDs (e.g., ['EMP-MGR', 'EMP-HR'])

    // Project Details
    project: { type: String, required: true },
    projectOffice: { type: String, required: true },
    reportProject: { type: String, required: true },
    subCenter: { type: String, required: true },

    // Personal Details
    fatherName: { type: String },
    motherName: { type: String },
    personalMobile: { type: String, required: true },
    officialMobile: { type: String },
    mobileLimit: { type: Number },
    dob: { type: Date, required: true },
    bloodGroup: { type: String },
    address: { type: String, required: true },
    identificationType: { type: String, required: true }, // NID, Passport, etc.
    identification: { type: String, required: true },

    // Contact & Nominee
    nomineeName: { type: String },
    nomineeMobile: { type: String },

    // Salary - Earnings
    salary: { type: Number, required: true }, // Gross Salary
    basic: { type: Number, required: true },
    others: { type: Number, required: true },
    cashPayment: { type: Number, default: 0 },
    motobikeCarMaintenance: { type: Number, default: 0 },
    laptopRent: { type: Number, default: 0 },
    othersAllowance: { type: Number, default: 0 },
    arrear: { type: Number, default: 0 },
    foodAllowance: { type: Number, default: 0 },
    stationAllowance: { type: Number, default: 0 },
    hardshipAllowance: { type: Number, default: 0 },
    // Derived/Totals (Might be calculated, but storing for history/consistency with current frontend)
    grandTotal: { type: Number },

    // Salary - Deductions
    gratuity: { type: Number, default: 0 },
    subsidizedLunch: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    motorbikeLoan: { type: Number, default: 0 },
    welfareFund: { type: Number, default: 0 },
    salaryOthersLoan: { type: Number, default: 0 },
    subsidizedVehicle: { type: Number, default: 0 },
    lwp: { type: Number, default: 0 }, // Leave Without Pay deduction
    cpf: { type: Number, default: 0 },
    othersAdjustment: { type: Number, default: 0 },
    totalDeduction: { type: Number },

    // Payment
    netSalaryPayment: { type: Number },
    bankAccount: { type: String },

    // Status & Logs
    status: { type: String, enum: ['Active', 'Salary Held', 'Resigned', 'Terminated', 'Closed'], default: 'Active' },
    salaryHeld: { type: Boolean, default: false },
    holdTimestamp: { type: Date },
    separationDate: { type: Date },
    remarks: { type: String },

    lastTransferDate: { type: Date },
    lastSubcenter: { type: String },
    lastTransferReason: { type: String },

    // Leave Balances
    leaveBalance: {
        sick: { type: Number, default: 14 },
        casual: { type: Number, default: 10 },
        earned: { type: Number, default: 0 }
    },

    fileClosingDate: { type: Date },
    fileClosingRemarks: { type: String },

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

module.exports = mongoose.model('Employee', EmployeeSchema);
