require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');

const app = express();

// Connect to Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Files
// 1. Serve Uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 2. Serve Frontend (Parent Directory)
app.use(express.static(path.join(__dirname, '..')));

// API Routes
console.log('Registering API routes...');
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));

console.log('Registering leave routes...');
const leaveRoutes = require('./routes/leaveRoutes');
app.use('/api/leave', leaveRoutes);
console.log('Leave routes registered successfully');

// Fallback Route: Serve index.html for root or unknown routes (SPA style, though we have specific htmls)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Explicitly serve specific HTMLs if needed, but express.static covers them if they are in root
// e.g. localhost:5000/test_attendance.html works automatically

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend accessible at http://localhost:${PORT}`);
});
