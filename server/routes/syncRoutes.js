const express = require('express');
const router = express.Router();
const { syncTransactions, getLastSyncLog, runScheduledSync } = require('../utils/zkBioTimeSync');
const { protect, authorize } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);
router.use(authorize('Admin'));

// POST /api/sync/trigger - Manual override to trigger synchronization for a custom date range
router.post('/trigger', async (req, res) => {
    try {
        const { startTime, endTime } = req.body;

        const start = startTime ? new Date(startTime) : new Date(Date.now() - 15 * 60 * 1000);
        const end = endTime ? new Date(endTime) : new Date();

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date format. Use ISO 8601 or valid date string.' });
        }

        if (start > end) {
            return res.status(400).json({ error: 'startTime must be before endTime.' });
        }

        console.log(`[MANUAL SYNC] Triggered by ${req.ip || 'unknown'} for range ${start.toISOString()} - ${end.toISOString()}`);

        const stats = await syncTransactions(start, end);

        res.json({
            success: true,
            message: 'Synchronization completed.',
            range: { startTime: start.toISOString(), endTime: end.toISOString() },
            stats
        });
    } catch (err) {
        console.error('[MANUAL SYNC] Error:', err.message);
        res.status(500).json({ error: err.message || 'Synchronization failed.' });
    }
});

// GET /api/sync/status - Retrieves logs of the last run, successful records, and failures
router.get('/status', (req, res) => {
    const log = getLastSyncLog();
    if (!log) {
        return res.json({
            hasRun: false,
            message: 'No synchronization has been performed yet.'
        });
    }

    res.json({
        hasRun: true,
        lastRun: log
    });
});

module.exports = router;
