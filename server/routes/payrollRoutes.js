const express = require('express');
const router = express.Router();
const Payroll = require('../models/Payroll');

// POST /api/payroll/archive - Save a generated salary sheet
router.post('/archive', async (req, res) => {
    try {
        const { monthYear, jsonData, generatedBy } = req.body;

        if (!monthYear || !jsonData) {
            return res.status(400).json({ error: "MonthYear and JSON Data are required." });
        }

        // Check if archive exists for this month (optional: allow multiple versions or overwrite)
        // For now, let's just create a new record each time (history)

        const newPayroll = new Payroll({
            monthYear,
            jsonData, // Large array
            generatedBy,
            timestamp: new Date()
        });

        const savedPayroll = await newPayroll.save();
        res.status(201).json({ message: "Payroll archived successfully", id: savedPayroll._id });

    } catch (err) {
        console.error("Payroll Archive Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/payroll/archive - Get list of archives (metadata only for list)
router.get('/archive', async (req, res) => {
    try {
        // Return light list (exclude huge jsonData)
        const archives = await Payroll.find({}, 'monthYear timestamp generatedBy createdAt')
            .sort({ monthYear: -1 });

        // Frontend expects { jsonData: [...], totalRecords: N } format based on legacy apiClient usage?
        // Actually, let's check legacy apiClient usage.
        // It seems 'getSalaryArchive' might expect the full list or filtered list.
        // Let's just return the list of available months for now.

        res.json({ jsonData: archives, totalRecords: archives.length });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/payroll/archive/:id - Get specific detail
router.get('/archive/:id', async (req, res) => {
    try {
        const payroll = await Payroll.findById(req.params.id);
        if (!payroll) return res.status(404).json({ error: "Archive not found" });
        res.json(payroll);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
