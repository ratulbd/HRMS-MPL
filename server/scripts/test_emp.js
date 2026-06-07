const mongoose = require('mongoose');
const Employee = require('./models/Employee');
require('dotenv').config();

async function createEmp() {
    await mongoose.connect(process.env.MONGO_URI);
    try {
        const emp = new Employee({
            employeeId: "EMP001",
            name: "Test Employee",
            designation: "Tester",
            project: "QA",
            email: "test@metal.com",
            salary: 50000,
            status: "Active",
            others: 0,
            basic: 50000,
            identification: "N/A",
            identificationType: "N/A",
            address: "N/A",
            dob: "1990-01-01",
            personalMobile: "1234567890",
            subCenter: "N/A",
            reportProject: "N/A",
            projectOffice: "N/A",
            joiningDate: "2020-01-01",
            functionalRole: "N/A"
        });
        await emp.save();
        console.log("Employee Created Successfully");
    } catch (e) {
        console.error("Error creating employee:", e.message);
    }
    mongoose.connection.close();
}
createEmp();
