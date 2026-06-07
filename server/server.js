require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Initialize Express
const app = express();

// Connect to Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Logger (Optional: could add Winston/Morgan here)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.originalUrl}`);
        next();
    });
}

// Static Folders
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..')));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/leave', require('./routes/leaveRoutes'));
app.use('/api/shifts', require('./routes/shiftRoutes'));
app.use('/api/subcenters', require('./routes/subCenterRoutes'));
app.use('/api/policies', require('./routes/policyRoutes'));
app.use('/api/global-schedules', require('./routes/globalScheduleRoutes'));
app.use('/api/roster', require('./routes/rosterRoutes'));
app.use('/api/sync', require('./routes/syncRoutes'));

// Root / Frontend Fallback
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 HRMS Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    console.log(`🔗 Local: http://localhost:${PORT}`);
});
