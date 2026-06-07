const express = require('express');
const router = express.Router();
const Shift = require('../models/Shift');
const { protect, authorize } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);
router.use(authorize('Admin', 'Manager'));

// GET all shifts
router.get('/', async (req, res) => {
    try {
        const shifts = await Shift.find();
        res.json(shifts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new shift
router.post('/', async (req, res) => {
    try {
        const newShift = new Shift(req.body);
        const savedShift = await newShift.save();
        res.status(201).json(savedShift);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update shift
router.put('/:id', async (req, res) => {
    try {
        const updatedShift = await Shift.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedShift);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE shift
router.delete('/:id', async (req, res) => {
    try {
        await Shift.findByIdAndDelete(req.params.id);
        res.json({ message: 'Shift deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
