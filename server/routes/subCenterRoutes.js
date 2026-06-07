const express = require('express');
const router = express.Router();
const SubCenterSetting = require('../models/SubCenterSetting');
const { protect, authorize } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);
router.use(authorize('Admin'));

// GET all settings
router.get('/', async (req, res) => {
    try {
        const settings = await SubCenterSetting.find();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST/PUT setting (Upsert)
router.post('/', async (req, res) => {
    try {
        const { subCenterName } = req.body;
        const setting = await SubCenterSetting.findOneAndUpdate(
            { subCenterName },
            req.body,
            { upsert: true, new: true }
        );
        res.json(setting);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
