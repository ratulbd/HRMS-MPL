require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');

async function createEmployee() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        let emp = await Employee.findOne({ employeeId: 'EMP001' });

        if (!emp) {
            console.log('Employee EMP001 not found. Creating...');
            emp = new Employee({
                employeeId: 'EMP001',
                name: 'MD RATUL ISLAM',
                designation: 'Managing Director',
                department: 'Management',
                employeeType: 'Full-time',
                project: 'Metal Group',
                projectOffice: 'HQ',
                subCenter: 'HQ',
                reportProject: 'Metal Group',
                dateOfJoining: new Date('2020-01-01'),
                status: 'Active',
                isBiometricRegistered: false
            });
            await emp.save();
            console.log('SUCCESS: Employee EMP001 successfully created.');
        } else {
            console.log('Employee EMP001 already exists. Resetting biometric status for testing...');
            emp.isBiometricRegistered = false;
            await emp.save();
            console.log('SUCCESS: Employee EMP001 reset.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

createEmployee();
