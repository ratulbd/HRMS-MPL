const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Hashed
    role: { type: String, enum: ['Admin', 'Manager', 'Employee'], default: 'Employee' },
    employeeId: { type: String }, // Link to Employee profile if applicable
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
