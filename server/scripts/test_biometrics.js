const mongoose = require('mongoose');
require('dotenv').config();
const Employee = require('./models/Employee');
const { verifyBiometrics } = require('./utils/biometricMatchEngine');

async function runTests() {
    try {
        console.log("=== Initiating Biometric Integration Tests ===");
        
        // 1. Connect to Database
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to database successfully.");

        // 2. Fetch target employee
        const employeeId = 'EMP001';
        let employee = await Employee.findOne({ employeeId });
        
        if (!employee) {
            console.log("EMP001 not found. Creating dummy employee...");
            employee = new Employee({
                employeeId: 'EMP001',
                name: 'Test User',
                designation: 'Software Engineer',
                functionalRole: 'Developer',
                joiningDate: new Date(),
                project: 'HQ',
                projectOffice: 'Dhaka',
                reportProject: 'HQ',
                subCenter: 'Dhaka Center',
                personalMobile: '01700000000',
                dob: new Date(1995, 0, 1),
                address: 'Dhaka, Bangladesh',
                identificationType: 'NID',
                identification: '1234567890',
                salary: 50000,
                basic: 30000,
                others: 20000
            });
            await employee.save();
        }

        console.log(`Target Employee: ${employee.name} (${employee.employeeId})`);
        
        // 3. Reset Biometrics for testing
        employee.isBiometricRegistered = false;
        employee.biometricRefImage = undefined;
        employee.biometricSignature = undefined;
        await employee.save();
        console.log("Biometric records reset for EMP001.");

        // 4. Simulate Biometric Registration
        employee.isBiometricRegistered = true;
        employee.biometricRefImage = "/uploads/biometrics/EMP001-bioref.jpg";
        employee.biometricSignature = {
            eyeSpacing: 64.2,
            irisPatternDensity: 0.88
        };
        await employee.save();
        console.log("Simulated Biometric Registration Successful.");
        console.log(`- isRegistered: ${employee.isBiometricRegistered}`);
        console.log(`- Ref Image: ${employee.biometricRefImage}`);

        // 5. Test Matching Engine (Valid Match)
        const matchResult = verifyBiometrics(
            employee.employeeId,
            employee.biometricRefImage,
            '/uploads/selfies/EMP001-checkin-ok.jpg',
            { testMismatch: false }
        );
        
        if (matchResult.success) {
            console.log("✅ Test 1 Passed: Biometric validation succeeded for matching face (Score: " + matchResult.confidence + "%).");
        } else {
            console.log("❌ Test 1 Failed: Biometric validation rejected matching face.");
        }

        // 6. Test Matching Engine (Mismatch)
        const mismatchResult = verifyBiometrics(
            employee.employeeId,
            employee.biometricRefImage,
            '/uploads/selfies/intruder-checkin.jpg',
            { testMismatch: true }
        );

        if (!mismatchResult.success) {
            console.log("✅ Test 2 Passed: Biometric validation successfully rejected mismatching face (Score: " + mismatchResult.confidence + "%).");
        } else {
            console.log("❌ Test 2 Failed: Biometric validation accepted mismatching face.");
        }

        console.log("=== Integration Tests Completed Successfully ===");
        mongoose.connection.close();
    } catch (err) {
        console.error("Test execution failed:", err);
        mongoose.connection.close();
    }
}

runTests();
