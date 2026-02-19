const express = require('express');
const router = express.Router();

const User = require('../models/User');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        // Search by name or email
        const user = await User.findOne({ $or: [{ email: username }, { name: username }] });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Simplified: check password (recommend bcrypt for production)
        if (user.password !== password) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        res.json({
            success: true,
            message: 'Login successful',
            user: { name: user.name, email: user.email, role: user.role },
            token: 'mock-jwt-token'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        const user = await User.findOne({ $or: [{ email: username }, { name: username }] });

        if (!user) return res.status(404).json({ error: 'User not found' });

        user.password = newPassword; // Again, should be hashed
        await user.save();

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
