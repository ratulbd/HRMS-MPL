const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const DutyRoster = require('../models/DutyRoster');
const Shift = require('../models/Shift');
const { protect, authorize } = require('../middleware/authMiddleware');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// Protect all routes
router.use(protect);

// Helper: Normalize date to midnight
const normalizeDate = (d) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
};

// Shift map: short code -> times and name
const SHIFT_MAP = {
    'M': { startTime: '06:00', endTime: '15:00', name: 'Morning' },
    'E': { startTime: '14:00', endTime: '23:00', name: 'Evening' },
    'N': { startTime: '22:00', endTime: '07:00', name: 'Night' },
    'G': { startTime: '09:00', endTime: '18:00', name: 'General' },
    // Legacy aliases
    'A': { startTime: '06:00', endTime: '15:00', name: 'Morning' },
    'B': { startTime: '14:00', endTime: '23:00', name: 'Evening' },
    'C': { startTime: '22:00', endTime: '07:00', name: 'Night' }
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INFO_COLS = ['Employee ID', 'Name', 'Designation', 'Sub-center'];

/**
 * GET /api/roster/template
 * Horizontal format: one row per employee, date columns pre-filled with 'G'.
 * Query: ?subCenter=CenterA&month=3&year=2026
 */
router.get('/template', async (req, res) => {
    try {
        const { subCenter, month, year } = req.query;
        if (!subCenter || !month || !year) {
            return res.status(400).json({ error: "subCenter, month, and year are required." });
        }

        const m = parseInt(month);
        const y = parseInt(year);
        const daysInMonth = new Date(y, m, 0).getDate();
        const monthName = MONTH_NAMES[m - 1];

        // Fetch employees with designation and subCenter
        const employees = await Employee.find({ subCenter, status: 'Active' })
            .select('employeeId name designation subCenter');

        // Build date column headers e.g. "1-Mar-2026"
        const dateCols = [];
        for (let d = 1; d <= daysInMonth; d++) {
            dateCols.push(`${d}-${monthName}-${y}`);
        }

        // Build rows
        const rows = [];

        // Header row
        const headerRow = {};
        INFO_COLS.forEach(c => { headerRow[c] = c; });
        dateCols.forEach(c => { headerRow[c] = c; });
        rows.push(headerRow);

        // Instructions row
        const instrRow = {};
        instrRow['Employee ID'] = 'Instructions:';
        instrRow['Name'] = 'Shift codes: G=General, M=Morning, E=Evening, N=Night';
        instrRow['Designation'] = 'Leave blank to keep General shift';
        instrRow['Sub-center'] = 'Friday is default off-day (mark O for other off-days)';
        dateCols.forEach((c, idx) => {
            const dayOfWeek = new Date(y, m - 1, idx + 1).getDay();
            instrRow[c] = dayOfWeek === 5 ? 'O' : 'G'; // 5=Friday
        });
        rows.push(instrRow);

        for (const emp of employees) {
            const row = {
                'Employee ID': emp.employeeId,
                'Name': emp.name,
                'Designation': emp.designation || '',
                'Sub-center': emp.subCenter || subCenter
            };
            dateCols.forEach((c, idx) => {
                const dayOfWeek = new Date(y, m - 1, idx + 1).getDay();
                row[c] = dayOfWeek === 5 ? 'O' : 'G'; // O = off-day, G = general
            });
            rows.push(row);
        }

        // Build sheet using aoa (array of arrays) for fixed column order
        const allCols = [...INFO_COLS, ...dateCols];
        const aoaData = rows.map(row => allCols.map(col => row[col] || ''));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.aoa_to_sheet(aoaData);

        // Style: set column widths
        ws['!cols'] = [
            { wpx: 100 }, // Employee ID
            { wpx: 160 }, // Name
            { wpx: 140 }, // Designation
            { wpx: 120 }, // Sub-center
            ...dateCols.map(() => ({ wpx: 60 }))
        ];

        xlsx.utils.book_append_sheet(wb, ws, `Roster ${monthName} ${y}`);

        const fileName = `Roster_${subCenter}_${monthName}_${y}.xlsx`;
        const uploadsDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

        const filePath = path.join(uploadsDir, fileName);
        xlsx.writeFile(wb, filePath);

        res.download(filePath, fileName, () => {
            try { fs.unlinkSync(filePath); } catch (_) { }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/roster/upload
 * Parses the horizontal template format and saves to DutyRoster.
 * Each row = one employee. Date columns (e.g. "1-Mar-2026") hold shift codes.
 */
router.post('/upload', upload.single('roster'), async (req, res) => {
    try {
        let rawRows = [];
        if (req.file) {
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            // Use raw to preserve strings
            rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
            fs.unlinkSync(req.file.path);
        } else {
            return res.status(400).json({ error: "No file received. Upload an Excel file." });
        }

        if (!rawRows || rawRows.length < 3) {
            return res.status(400).json({ error: "Template appears to be empty or invalid." });
        }

        // Row 0 = headers, Row 1 = instructions (skip), Row 2+ = data
        const headers = rawRows[0];
        const dataRows = rawRows.slice(2); // skip instructions row

        // Find date columns (anything that looks like "D-Mon-YYYY")
        const dateColPattern = /^\d{1,2}-[A-Za-z]{3}-\d{4}$/;
        const dateColIndices = [];
        headers.forEach((h, i) => {
            if (h && dateColPattern.test(String(h).trim())) {
                dateColIndices.push({ idx: i, label: String(h).trim() });
            }
        });

        const empIdIdx = headers.indexOf('Employee ID');
        const stats = { created: 0, updated: 0, skipped: 0, errors: [] };

        for (const row of dataRows) {
            const empIdVal = row[empIdIdx];
            if (!empIdVal) continue;

            const employee = await Employee.findOne({ employeeId: String(empIdVal).trim() });
            if (!employee) {
                stats.errors.push(`Employee ${empIdVal} not found`);
                continue;
            }

            for (const { idx, label } of dateColIndices) {
                const shiftCode = String(row[idx] || 'G').trim().toUpperCase();
                const isOffDay = shiftCode === 'O';
                const effectiveCode = isOffDay ? 'G' : (SHIFT_MAP[shiftCode] ? shiftCode : 'G');
                const shiftInfo = SHIFT_MAP[effectiveCode];

                // Parse date label "1-Mar-2026"
                const parsedDate = new Date(label);
                if (isNaN(parsedDate)) {
                    stats.errors.push(`Could not parse date: ${label}`);
                    continue;
                }
                const date = normalizeDate(parsedDate);

                const updateData = {
                    employeeId: employee._id,
                    employeeIdStr: employee.employeeId,
                    date,
                    shiftName: effectiveCode,
                    startTime: shiftInfo.startTime,
                    endTime: shiftInfo.endTime,
                    isOffDay,
                    createdBy: req.body.uploadedBy || 'admin'
                };

                try {
                    const result = await DutyRoster.findOneAndUpdate(
                        { employeeId: employee._id, date },
                        { $set: updateData },
                        { upsert: true, new: true }
                    );
                    // new upsert has identical createdAt and updatedAt
                    const isNew = Math.abs(result.createdAt - result.updatedAt) < 100;
                    if (isNew) stats.created++; else stats.updated++;
                } catch (err) {
                    stats.errors.push(`Row ${empIdVal} / ${label}: ${err.message}`);
                }
            }
        }

        res.json({ message: 'Roster upload completed', stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/roster/my-roster/:employeeId
 * Get roster for an employee for a date range (for calendar view)
 */
router.get('/my-roster/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { start, end } = req.query;

        const query = { $or: [{ employeeIdStr: employeeId }] };
        if (start && end) {
            query.date = { $gte: normalizeDate(start), $lte: normalizeDate(end) };
        }

        const rosters = await DutyRoster.find(query).sort({ date: 1 });
        res.json(rosters);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
