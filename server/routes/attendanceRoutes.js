const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');

// === Multer Setup for Selfie Uploads ===
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/selfies/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Filename: empId_timestamp.jpg
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, req.body.employeeId + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Helper: Get today's date normalized to midnight
const getTodayDate = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

// POST /api/attendance/check-in
router.post('/check-in', upload.single('selfie'), async (req, res) => {
    try {
        const { employeeId, lat, lng, address } = req.body;
        const selfiePath = req.file ? `/uploads/selfies/${req.file.filename}` : null;

        if (!employeeId) return res.status(400).json({ error: "Employee ID is required" });

        // Verify Employee Exists
        const employee = await Employee.findOne({ employeeId });
        if (!employee) return res.status(404).json({ error: "Employee not found" });

        const today = getTodayDate();

        // Check if already checked in
        let attendance = await Attendance.findOne({
            employeeId: employee._id,
            date: today
        });

        if (attendance) {
            return res.status(400).json({ error: "Already checked in for today." });
        }

        // === VALIDATION LOGIC ===
        // Office Coords (Dhaka Center approx for demo)
        const OFFICE = { lat: 23.8103, lng: 90.4125 };
        const MAX_DIST_METERS = 500; // 500 meters allowed
        const LATE_HOUR = 9;
        const LATE_MINUTE = 15;

        const now = new Date();
        const checkInHour = now.getHours();
        const checkInMinute = now.getMinutes();

        // 1. Check Late
        let isLate = false;
        if (checkInHour > LATE_HOUR || (checkInHour === LATE_HOUR && checkInMinute > LATE_MINUTE)) {
            isLate = true;
        }

        // 2. Check Geo-fencing
        let isOutOfRange = false;

        // Haversine Formula
        const toRad = x => x * Math.PI / 180;
        const R = 6371e3; // metres
        const φ1 = toRad(OFFICE.lat);
        const φ2 = toRad(lat);
        const Δφ = toRad(lat - OFFICE.lat);
        const Δλ = toRad(lng - OFFICE.lng);

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        if (distance > MAX_DIST_METERS) {
            isOutOfRange = true;
        }

        // 3. Justification Check
        let status = 'Present';
        let approvalStatus = 'Approved';
        let currentApprover = null;

        if (isLate || isOutOfRange) {
            if (!req.body.justification) {
                // If validation failed but no justification, ask for it
                return res.status(400).json({
                    error: "Justification Required",
                    code: "JUSTIFICATION_REQUIRED", // Frontend check
                    details: { isLate, isOutOfRange, distance: Math.round(distance) }
                });
            }
            // Justification provided
            status = 'Pending';
            approvalStatus = 'Pending';

            // Set first approver from hierarchy if available
            if (employee.approvalHierarchy && employee.approvalHierarchy.length > 0) {
                currentApprover = employee.approvalHierarchy[0];
            }
        }

        // Create new Attendance record
        attendance = new Attendance({
            employeeId: employee._id,
            employeeIdStr: employee.employeeId,
            date: today,
            checkInTime: now,
            checkInLocation: { lat, lng, address },
            checkInSelfie: selfiePath,
            status: status,

            // New Fields
            isLate,
            isOutOfRange,
            justification: req.body.justification,
            approvalStatus,
            currentApprover,
            approvalLogs: []
        });

        await attendance.save();

        res.status(201).json({
            message: "Check-in successful",
            attendanceId: attendance._id,
            checkInTime: attendance.checkInTime
        });

    } catch (err) {
        console.error("Check-in Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/attendance/check-out
router.post('/check-out', upload.single('selfie'), async (req, res) => {
    try {
        const { employeeId, lat, lng, address } = req.body;
        const selfiePath = req.file ? `/uploads/selfies/${req.file.filename}` : null;

        if (!employeeId) return res.status(400).json({ error: "Employee ID is required" });

        const employee = await Employee.findOne({ employeeId });
        if (!employee) return res.status(404).json({ error: "Employee not found" });

        const today = getTodayDate();

        // Find today's attendance
        const attendance = await Attendance.findOne({
            employeeId: employee._id,
            date: today
        });

        if (!attendance) {
            return res.status(400).json({ error: "No check-in record found for today. Cannot check out." });
        }

        if (attendance.checkOutTime) {
            return res.status(400).json({ error: "Already checked out today." });
        }

        // Update with Check-out info
        attendance.checkOutTime = new Date();
        attendance.checkOutLocation = { lat, lng, address };
        attendance.checkOutSelfie = selfiePath;

        // Calculate Work Hours
        const diffMs = attendance.checkOutTime - attendance.checkInTime;
        const diffHrs = diffMs / (1000 * 60 * 60); // hours
        attendance.workHours = parseFloat(diffHrs.toFixed(2));

        await attendance.save();

        res.json({
            message: "Check-out successful",
            checkOutTime: attendance.checkOutTime,
            workHours: attendance.workHours
        });

    } catch (err) {
        console.error("Check-out Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/attendance/today/:employeeId - Get today's record for specific employee
router.get('/today/:employeeId', async (req, res) => {
    try {
        const today = getTodayDate();
        const employee = await Employee.findOne({ employeeId: req.params.employeeId });
        if (!employee) return res.status(404).json({ error: "Employee not found" });

        const record = await Attendance.findOne({
            employeeId: employee._id,
            date: today
        });
        res.json(record);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/attendance/report - Get attendance for Excel export
router.get('/report', async (req, res) => {
    try {
        const { month, year } = req.query; // e.g. ?month=12&year=2025
        if (!month || !year) return res.status(400).json({ error: "Month and Year are required." });

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const records = await Attendance.find({
            date: { $gte: startDate, $lte: endDate }
        }).populate('employeeId', 'name employeeId designation subCenter');

        const reportData = records.map(rec => ({
            "Date": rec.date.toLocaleDateString(),
            "Employee ID": rec.employeeIdStr,
            "Name": rec.employeeId ? rec.employeeId.name : 'N/A',
            "Designation": rec.employeeId ? rec.employeeId.designation : 'N/A',
            "Sub Center": rec.employeeId ? rec.employeeId.subCenter : 'N/A',
            "Check-In": rec.checkInTime ? rec.checkInTime.toLocaleTimeString() : 'N/A',
            "Check-Out": rec.checkOutTime ? rec.checkOutTime.toLocaleTimeString() : 'N/A',
            "Work Hours": rec.workHours || 0,
            "Status": rec.status,
            "Approval": rec.approvalStatus,
            "Late": rec.isLate ? 'YES' : 'NO',
            "Out of Range": rec.isOutOfRange ? 'YES' : 'NO',
            "Justification": rec.justification || ''
        }));

        res.json(reportData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/attendance/history/:employeeId
router.get('/history/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const employee = await Employee.findOne({ employeeId });
        if (!employee) return res.status(404).json({ error: "Employee not found" });

        const history = await Attendance.find({ employeeId: employee._id })
            .sort({ date: -1 })
            .limit(30); // Last 30 days

        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/attendance/pending/:approverId - Get records waiting for this approver
router.get('/pending/:approverId', async (req, res) => {
    try {
        const { approverId } = req.params;
        const pending = await Attendance.find({
            currentApprover: approverId,
            approvalStatus: 'Pending'
        }).populate('employeeId', 'name designation employeeId');

        res.json(pending);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/attendance/approve
router.post('/approve', async (req, res) => {
    try {
        const { attendanceId, approverId, action, comments } = req.body; // action: 'Approved' | 'Rejected'

        if (!['Approved', 'Rejected'].includes(action)) {
            return res.status(400).json({ error: "Invalid action" });
        }

        const attendance = await Attendance.findById(attendanceId).populate('employeeId');
        if (!attendance) return res.status(404).json({ error: "Attendance record not found" });

        // Verify Authorizer
        if (attendance.currentApprover !== approverId) {
            return res.status(403).json({ error: "You are not the authorized approver for this request." });
        }

        // Add Log
        attendance.approvalLogs.push({
            approverId,
            status: action,
            comments,
            timestamp: new Date()
        });

        if (action === 'Rejected') {
            attendance.approvalStatus = 'Rejected';
            attendance.status = 'Absent'; // Or 'Rejected'
            attendance.currentApprover = null;
        } else {
            // Approved - Check if more approvers needed
            const employee = attendance.employeeId; // populated
            const hierarchy = employee.approvalHierarchy || [];
            const currentIndex = hierarchy.indexOf(approverId);

            if (currentIndex !== -1 && currentIndex < hierarchy.length - 1) {
                // Pass to next approver
                attendance.currentApprover = hierarchy[currentIndex + 1];
            } else {
                // Final Approval
                attendance.approvalStatus = 'Approved';
                attendance.status = 'Present'; // Finalize
                attendance.currentApprover = null;
            }
        }

        await attendance.save();
        res.json({ message: "Approval processed", attendance });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
