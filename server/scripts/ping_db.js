require('dotenv').config();
const mongoose = require('mongoose');

async function ping() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected successfully!');
        
        const result = await mongoose.connection.db.admin().ping();
        console.log('Ping result:', result);
        
        console.log('Disconnecting...');
        await mongoose.disconnect();
        console.log('Done. Cluster inactivity timer reset.');
        process.exit(0);
    } catch (err) {
        console.error('Error connecting to DB:', err);
        process.exit(1);
    }
}
ping();
