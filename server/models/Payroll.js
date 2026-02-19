const mongoose = require('mongoose');

const PayrollSchema = new mongoose.Schema({
    monthYear: {
        type: String,
        required: true,
        index: true // e.g., "2023-10"
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    generatedBy: {
        type: String,
        default: 'System'
    },
    jsonData: {
        type: Array, // Stores the full array of employee objects with calculations
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Payroll', PayrollSchema);
