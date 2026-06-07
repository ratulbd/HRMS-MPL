require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Employee = require('./models/Employee');

async function resetPassword() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        let user = await User.findOne({ employeeId: 'EMP001' }) || await User.findOne({ name: 'EMP001' }) || await User.findOne({ email: 'EMP001' });

        if (!user) {
            console.log('User EMP001 not found. Creating a new User...');
            
            // Check if Employee exists
            const emp = await Employee.findOne({ employeeId: 'EMP001' });
            
            user = new User({
                name: (emp && emp.name) ? emp.name : 'MD RATUL ISLAM',
                email: (emp && emp.email) ? emp.email : 'emp001@metal.com',
                password: 'temp', // Will be overwritten
                employeeId: 'EMP001',
                role: 'Employee'
            });
        }

        user.password = '12345';
        await user.save(); // Pre-save hook hashes it automatically
        
        console.log('SUCCESS: EMP001 password successfully set to 12345');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

resetPassword();
