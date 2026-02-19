const axios = require('axios');
const User = require('./models/User');
const mongoose = require('mongoose');
require('dotenv').config();

async function createAdmin() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB...");

        const adminExists = await User.findOne({ name: 'admin' });
        if (adminExists) {
            console.log("Admin user already exists.");
        } else {
            const admin = new User({
                name: 'admin',
                email: 'admin@metal.com',
                password: 'password123',
                role: 'Admin'
            });
            await admin.save();
            console.log("Admin user created successfully!");
            console.log("Login: admin / password123");
        }

        mongoose.connection.close();
    } catch (err) {
        console.error("Error creating admin:", err);
    }
}

createAdmin();
