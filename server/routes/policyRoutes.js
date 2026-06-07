const express = require('express');
const router = express.Router();
const LeavePolicy = require('../models/LeavePolicy');
const SalaryPolicy = require('../models/SalaryPolicy');
const { protect, authorize } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);
router.use(authorize('Admin'));

// Middleware to handle offline fallback for policy routes when MongoDB is offline
router.use((req, res, next) => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
        return next();
    }

    const mockLeavePolicies = [
        {
            _id: "60c72b2f9b1d8e2b8c9d9990",
            id: "60c72b2f9b1d8e2b8c9d9990",
            name: "Casual Leave",
            code: "CL",
            daysAllowed: 10,
            applicableFor: "All",
            genderRestriction: "All",
            carryForward: false,
            maxCarryForwardDays: 0,
            requiresApproval: true,
            notes: "Annual casual leave allowance.",
            isActive: true
        },
        {
            _id: "60c72b2f9b1d8e2b8c9d9991",
            id: "60c72b2f9b1d8e2b8c9d9991",
            name: "Sick Leave",
            code: "SL",
            daysAllowed: 14,
            applicableFor: "All",
            genderRestriction: "All",
            carryForward: false,
            maxCarryForwardDays: 0,
            requiresApproval: false,
            notes: "Medical emergency leave.",
            isActive: true
        }
    ];

    const mockSalaryPolicies = [
        {
            _id: "60c72b2f9b1d8e2b8c9d8880",
            id: "60c72b2f9b1d8e2b8c9d8880",
            policyName: "Metal Standard Salary Policy",
            description: "Default salary policy for Metal Group",
            joiningDateCutoff: "2026-03-31",
            festivalBonusPercentage: 50,
            incentiveBonusPercentage: 50,
            effectiveFrom: "2026-04-01",
            effectiveTo: null,
            isActive: true,
            slabs: [
                { slNo: 1, minGross: 1, maxGross: 10000, basicPercentagePre: 50, basicPercentagePost: 50 },
                { slNo: 2, minGross: 10001, maxGross: 30000, basicPercentagePre: 45, basicPercentagePost: 45 },
                { slNo: 3, minGross: 30001, maxGross: null, basicPercentagePre: 40, basicPercentagePost: 40 }
            ]
        }
    ];

    // GET /leave
    if (req.method === 'GET' && req.path === '/leave') {
        return res.json(mockLeavePolicies);
    }
    // GET /leave/:id
    if (req.method === 'GET' && req.path.startsWith('/leave/')) {
        const id = req.path.split('/')[2];
        const policy = mockLeavePolicies.find(p => p.id === id) || mockLeavePolicies[0];
        return res.json(policy);
    }
    // POST /leave
    if (req.method === 'POST' && req.path === '/leave') {
        return res.status(201).json({ ...req.body, _id: "mock_leave_" + Date.now(), id: "mock_leave_" + Date.now() });
    }
    // PUT /leave/:id
    if (req.method === 'PUT' && req.path.startsWith('/leave/')) {
        const id = req.path.split('/')[2];
        return res.json({ ...req.body, _id: id, id: id });
    }
    // DELETE /leave/:id
    if (req.method === 'DELETE' && req.path.startsWith('/leave/')) {
        return res.json({ message: 'Leave policy deleted successfully' });
    }

    // GET /salary
    if (req.method === 'GET' && req.path === '/salary') {
        return res.json(mockSalaryPolicies);
    }
    // GET /salary/:id
    if (req.method === 'GET' && req.path.startsWith('/salary/')) {
        const id = req.path.split('/')[2];
        const policy = mockSalaryPolicies.find(p => p.id === id) || mockSalaryPolicies[0];
        return res.json(policy);
    }
    // POST /salary
    if (req.method === 'POST' && req.path === '/salary') {
        return res.status(201).json({ ...req.body, _id: "mock_salary_" + Date.now(), id: "mock_salary_" + Date.now() });
    }
    // PUT /salary/:id
    if (req.method === 'PUT' && req.path.startsWith('/salary/')) {
        const id = req.path.split('/')[2];
        return res.json({ ...req.body, _id: id, id: id });
    }
    // DELETE /salary/:id
    if (req.method === 'DELETE' && req.path.startsWith('/salary/')) {
        return res.json({ message: 'Salary policy deleted successfully' });
    }

    // POST /salary/lookup
    if (req.method === 'POST' && req.path === '/salary/lookup') {
        const { grossSalary, joiningDate } = req.body;
        if (!grossSalary || !joiningDate) {
            return res.status(400).json({ message: 'grossSalary and joiningDate are required.' });
        }
        const policy = mockSalaryPolicies[0];
        const joining = new Date(joiningDate);
        const isPost = joining >= new Date(policy.joiningDateCutoff);

        const slab = policy.slabs.find(s => {
            const inMin = grossSalary >= s.minGross;
            const inMax = s.maxGross === null || s.maxGross === undefined || grossSalary <= s.maxGross;
            return inMin && inMax;
        });

        if (!slab) return res.status(404).json({ message: 'No matching salary slab found.' });

        const percentage = isPost ? slab.basicPercentagePost : slab.basicPercentagePre;
        const basic = Math.round((grossSalary * percentage) / 100);

        return res.json({
            grossSalary,
            joiningDate,
            joiningDateCutoff: policy.joiningDateCutoff,
            isPostCutoff: isPost,
            appliedSlab: slab,
            basicPercentage: percentage,
            calculatedBasic: basic,
            policyName: policy.policyName
        });
    }

    next();
});


// ====================================================
//  LEAVE POLICIES
// ====================================================

// GET all leave policies
router.get('/leave', async (req, res) => {
    try {
        const policies = await LeavePolicy.find().sort({ name: 1 });
        res.json(policies);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET single leave policy by id
router.get('/leave/:id', async (req, res) => {
    try {
        const policy = await LeavePolicy.findById(req.params.id);
        if (!policy) return res.status(404).json({ message: 'Leave policy not found' });
        res.json(policy);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST create a new leave policy
router.post('/leave', async (req, res) => {
    try {
        const policy = new LeavePolicy(req.body);
        const saved = await policy.save();
        res.status(201).json(saved);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'A leave policy with this name or code already exists.' });
        }
        res.status(400).json({ message: err.message });
    }
});

// PUT update a leave policy
router.put('/leave/:id', async (req, res) => {
    try {
        const policy = await LeavePolicy.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!policy) return res.status(404).json({ message: 'Leave policy not found' });
        res.json(policy);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'A leave policy with this name or code already exists.' });
        }
        res.status(400).json({ message: err.message });
    }
});

// DELETE a leave policy
router.delete('/leave/:id', async (req, res) => {
    try {
        const policy = await LeavePolicy.findByIdAndDelete(req.params.id);
        if (!policy) return res.status(404).json({ message: 'Leave policy not found' });
        res.json({ message: 'Leave policy deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// ====================================================
//  SALARY POLICIES
// ====================================================

// GET all salary policies
router.get('/salary', async (req, res) => {
    try {
        const policies = await SalaryPolicy.find().sort({ effectiveFrom: -1 });
        res.json(policies);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET single salary policy by id
router.get('/salary/:id', async (req, res) => {
    try {
        const policy = await SalaryPolicy.findById(req.params.id);
        if (!policy) return res.status(404).json({ message: 'Salary policy not found' });
        res.json(policy);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST create a new salary policy
router.post('/salary', async (req, res) => {
    try {
        const policy = new SalaryPolicy(req.body);
        const saved = await policy.save();
        res.status(201).json(saved);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// PUT update a salary policy
router.put('/salary/:id', async (req, res) => {
    try {
        const policy = await SalaryPolicy.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!policy) return res.status(404).json({ message: 'Salary policy not found' });
        res.json(policy);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// DELETE a salary policy
router.delete('/salary/:id', async (req, res) => {
    try {
        const policy = await SalaryPolicy.findByIdAndDelete(req.params.id);
        if (!policy) return res.status(404).json({ message: 'Salary policy not found' });
        res.json({ message: 'Salary policy deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ====================================================
//  UTILITY: Get applicable salary % for an employee
// ====================================================

// POST /api/policies/salary/lookup
// Body: { grossSalary: Number, joiningDate: "YYYY-MM-DD" }
router.post('/salary/lookup', async (req, res) => {
    try {
        const { grossSalary, joiningDate } = req.body;
        if (!grossSalary || !joiningDate) {
            return res.status(400).json({ message: 'grossSalary and joiningDate are required.' });
        }

        // Find the currently active salary policy
        const policy = await SalaryPolicy.findOne({ isActive: true }).sort({ effectiveFrom: -1 });
        if (!policy) return res.status(404).json({ message: 'No active salary policy found.' });

        const joining = new Date(joiningDate);
        const isPost = joining >= new Date(policy.joiningDateCutoff);

        // Find the matching slab
        const slab = policy.slabs.find(s => {
            const inMin = grossSalary >= s.minGross;
            const inMax = s.maxGross === null || s.maxGross === undefined || grossSalary <= s.maxGross;
            return inMin && inMax;
        });

        if (!slab) return res.status(404).json({ message: 'No matching salary slab found.' });

        const percentage = isPost ? slab.basicPercentagePost : slab.basicPercentagePre;
        const basic = Math.round((grossSalary * percentage) / 100);

        res.json({
            grossSalary,
            joiningDate,
            joiningDateCutoff: policy.joiningDateCutoff,
            isPostCutoff: isPost,
            appliedSlab: slab,
            basicPercentage: percentage,
            calculatedBasic: basic,
            policyName: policy.policyName
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
