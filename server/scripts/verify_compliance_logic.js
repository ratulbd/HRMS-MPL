require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Employee = require('./models/Employee');
const Attendance = require('./models/Attendance');
const compliance = require('./utils/complianceUtils');

async function verifyCompliance() {
    await connectDB();
    console.log("Connected to DB...");

    // Find a test employee
    const employee = await Employee.findOne({ employeeId: 'E001' });
    if (!employee) {
        console.error("Test employee E001 not found. Please create one first.");
        process.exit(1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log(`\n--- Verification for Employee: ${employee.name} (${employee.employeeId}) ---`);

    // 1. Test Consecutive Days
    const consecutive = await compliance.checkConsecutiveDays(employee._id, today);
    console.log("Consecutive Days Check:", consecutive);

    // 2. Test Weekly Hours
    const weekly = await compliance.getWeeklyHours(employee._id, today);
    console.log("Weekly Hours Check:", weekly);

    // 3. Test Annual Average
    const annual = await compliance.getAnnualAverageHours(employee._id, today);
    console.log("Annual Average Check:", annual);

    console.log("\n--- Compliance Verification Finished ---");
    process.exit(0);
}

verifyCompliance();
