const express = require('express');
const router = express.Router();
const GlobalSchedule = require('../models/GlobalSchedule');
const { protect, authorize } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);
router.use(authorize('Admin'));

// GET all schedules
router.get('/', async (req, res) => {
    try {
        const schedules = await GlobalSchedule.find();
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new schedule
router.post('/', async (req, res) => {
    try {
        console.log('POST /api/global-schedules body:', JSON.stringify(req.body, null, 2));
        const newSchedule = new GlobalSchedule({
            name: req.body.name,
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            startTime: req.body.startTime,
            endTime: req.body.endTime,
            appliedShifts: req.body.appliedShifts || []
        });
        const savedSchedule = await newSchedule.save();
        console.log('Saved Schedule:', JSON.stringify(savedSchedule, null, 2));
        res.status(201).json(savedSchedule);
    } catch (err) {
        console.error('POST Error:', err);
        res.status(400).json({ error: err.message });
    }
});

// DELETE schedule
router.delete('/:id', async (req, res) => {
    try {
        await GlobalSchedule.findByIdAndDelete(req.params.id);
        res.json({ message: 'Schedule deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
