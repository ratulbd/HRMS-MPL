const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Search by name, email, or employeeId
        const user = await User.findOne({ $or: [{ email: username }, { name: username }, { employeeId: username }] });

        if (user && (await user.comparePassword(password))) {
            res.json({
                success: true,
                message: 'Login successful',
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    employeeId: user.employeeId
                },
                token: generateToken(user._id)
            });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        res.json(req.user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Public (or Private depending on requirements, usually Private)
router.post('/change-password', async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        const user = await User.findOne({ $or: [{ email: username }, { name: username }] });

        if (!user) return res.status(404).json({ error: 'User not found' });

        user.password = newPassword; // Hashing handled by pre-save hook
        await user.save();

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
