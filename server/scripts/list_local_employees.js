const mongoose = require('mongoose');
const Employee = require('./models/Employee');
require('dotenv').config();

async function listLocalEmployees() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    
    try {
        const count = await Employee.countDocuments();
        console.log(`Total employees in MongoDB: ${count}`);

        const emps = await Employee.find().limit(10);
        console.log('First 10 employees in MongoDB:');
        emps.forEach(emp => {
            console.log(`  - ID: ${emp.employeeId} | Name: ${emp.name} | Dept/Project: ${emp.project} | Subcenter: ${emp.subCenter}`);
        });
    } catch (e) {
        console.error('Error fetching employees:', e.message);
    }
    
    await mongoose.disconnect();
    console.log('Connection closed.');
}

listLocalEmployees();
