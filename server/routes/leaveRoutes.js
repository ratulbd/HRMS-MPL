const express = require('express');
const router = express.Router();
const Leave = require('../models/Leave');
const Employee = require('../models/Employee');

// POST /api/leave/apply - Apply for leave
router.post('/apply', async (req, res) => {
    try {
        const { employeeId, type, startDate, endDate, days, reason } = req.body;

        const employee = await Employee.findOne({ employeeId });
        if (!employee) return res.status(404).json({ error: "Employee not found" });

        // Check Balance
        const leaveType = type.toLowerCase();
        if (leaveType !== 'lwp' && employee.leaveBalance[leaveType] < days) {
            return res.status(400).json({ error: `Insufficient ${type} leave balance.` });
        }

        const leave = new Leave({
            employeeId: employee._id,
            employeeIdStr: employee.employeeId,
            type,
            startDate,
            endDate,
            days,
            reason,
            approvalHierarchy: employee.approvalHierarchy,
            currentApprover: employee.approvalHierarchy && employee.approvalHierarchy.length > 0 ? employee.approvalHierarchy[0] : null,
            status: (employee.approvalHierarchy && employee.approvalHierarchy.length > 0) ? 'Pending' : 'Approved'
        });

        // If no approvers, auto-approve and deduct balance
        if (leave.status === 'Approved') {
            if (leaveType !== 'lwp') {
                employee.leaveBalance[leaveType] -= days;
                await employee.save();
            }
            leave.approvalStatus = 'Approved';
        }

        await leave.save();
        res.status(201).json(leave);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/leave/history/:employeeId
router.get('/history/:employeeId', async (req, res) => {
    try {
        const history = await Leave.find({ employeeIdStr: req.params.employeeId })
            .sort({ createdAt: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/leave/pending/:approverId
router.get('/pending/:approverId', async (req, res) => {
    try {
        const pending = await Leave.find({
            currentApprover: req.params.approverId,
            status: 'Pending'
        }).populate('employeeId', 'name employeeId designation');
        res.json(pending);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/leave/approve
router.post('/approve', async (req, res) => {
    try {
        const { leaveId, approverId, action, comments } = req.body; // action: Approved / Rejected

        const leave = await Leave.findById(leaveId).populate('employeeId');
        if (!leave) return res.status(404).json({ error: "Leave request not found" });

        if (leave.currentApprover !== approverId) {
            return res.status(403).json({ error: "Unauthorized approver" });
        }

        leave.approvalLogs.push({ approverId, status: action, comments });

        if (action === 'Rejected') {
            leave.status = 'Rejected';
            leave.approvalStatus = 'Rejected';
            leave.currentApprover = null;
        } else {
            // Check next in hierarchy
            const hierarchy = leave.approvalHierarchy || [];
            const currentIndex = hierarchy.indexOf(approverId);

            if (currentIndex !== -1 && currentIndex < hierarchy.length - 1) {
                leave.currentApprover = hierarchy[currentIndex + 1];
            } else {
                // Final Approval
                leave.status = 'Approved';
                leave.approvalStatus = 'Approved';
                leave.currentApprover = null;

                // Deduct Balance
                const employee = leave.employeeId;
                const leaveType = leave.type.toLowerCase();
                if (leaveType !== 'lwp') {
                    employee.leaveBalance[leaveType] -= leave.days;
                    await employee.save();
                }
            }
        }

        await leave.save();
        res.json(leave);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/leave/check-pending/:employeeId
router.get('/check-pending/:employeeId', async (req, res) => {
    try {
        const pending = await Leave.findOne({
            employeeIdStr: req.params.employeeId,
            status: 'Pending'
        });
        res.json({ hasPending: !!pending, leave: pending });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/leave/approver-history/:approverId
router.get('/approver-history/:approverId', async (req, res) => {
    try {
        const { status } = req.query; // 'Approved' or 'Rejected'
        const requests = await Leave.find({
            status: status,
            'approvalLogs.approverId': req.params.approverId
        })
            .populate('employeeId', 'name employeeId designation')
            .sort({ updatedAt: -1 });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
