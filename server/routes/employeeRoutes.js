const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');

// GET /api/employees/logs/hold - Get all employees with salary hold
router.get('/logs/hold', async (req, res) => {
    try {
        const employees = await Employee.find({
            $or: [{ salaryHeld: true }, { status: 'Salary Held' }]
        }).sort({ holdTimestamp: -1 });

        const logData = employees.map(emp => ({
            "Employee ID": emp.employeeId,
            "Name": emp.name,
            "Designation": emp.designation,
            "Sub Center": emp.subCenter,
            "Hold Date": emp.holdTimestamp ? emp.holdTimestamp.toLocaleDateString() : 'N/A',
            "Remarks": emp.remarks || ''
        }));
        res.json(logData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/employees/logs/separation - Get separation log
router.get('/logs/separation', async (req, res) => {
    try {
        const employees = await Employee.find({
            status: { $in: ['Resigned', 'Terminated', 'Closed'] },
            separationDate: { $exists: true }
        }).sort({ separationDate: -1 });

        const logData = employees.map(emp => ({
            "Employee ID": emp.employeeId,
            "Name": emp.name,
            "Designation": emp.designation,
            "Type": emp.status,
            "Separation Date": emp.separationDate ? emp.separationDate.toLocaleDateString() : 'N/A',
            "Remarks": emp.remarks || ''
        }));
        res.json(logData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/employees/logs/transfer - Get transfer log
router.get('/logs/transfer', async (req, res) => {
    try {
        const employees = await Employee.find({
            lastTransferDate: { $exists: true }
        }).sort({ lastTransferDate: -1 });

        const logData = employees.map(emp => ({
            "Employee ID": emp.employeeId,
            "Name": emp.name,
            "New Sub Center": emp.subCenter,
            "Last Sub Center": emp.lastSubcenter || 'N/A',
            "Transfer Date": emp.lastTransferDate ? emp.lastTransferDate.toLocaleDateString() : 'N/A',
            "Reason": emp.lastTransferReason || ''
        }));
        res.json(logData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/employees/logs/file-close - Get file close log
router.get('/logs/file-close', async (req, res) => {
    try {
        const employees = await Employee.find({
            status: 'Closed',
            fileClosingDate: { $exists: true }
        }).sort({ fileClosingDate: -1 });

        const logData = employees.map(emp => ({
            "Employee ID": emp.employeeId,
            "Name": emp.name,
            "Designation": emp.designation,
            "Closing Date": emp.fileClosingDate ? emp.fileClosingDate.toLocaleDateString() : 'N/A',
            "Remarks": emp.fileClosingRemarks || ''
        }));
        res.json(logData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/employees/stats - Get HR statistics for dashboard
router.get('/stats', async (req, res) => {
    try {
        const stats = {
            total: await Employee.countDocuments(),
            active: await Employee.countDocuments({ status: 'Active' }),
            held: await Employee.countDocuments({ $or: [{ status: 'Salary Held' }, { salaryHeld: true }] }),
            resigned: await Employee.countDocuments({ status: 'Resigned' }),
            terminated: await Employee.countDocuments({ status: 'Terminated' }),
            closed: await Employee.countDocuments({ status: 'Closed' }),

            // Breakdowns
            byProject: await Employee.aggregate([
                { $group: { _id: "$project", count: { $sum: 1 } } }
            ]),
            byType: await Employee.aggregate([
                { $group: { _id: "$employeeType", count: { $sum: 1 } } }
            ]),
            byDesignation: await Employee.aggregate([
                { $group: { _id: "$designation", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        };
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/employees - Get all employees with pagination and filtering
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 30,
            name,
            status,
            designation,
            functionalRole,
            type,
            project,
            projectOffice,
            reportProject,
            subCenter
        } = req.query;

        const query = {};

        // Search by Name or ID
        if (name) {
            query.$or = [
                { name: { $regex: name, $options: 'i' } },
                { employeeId: { $regex: name, $options: 'i' } }
            ];
        }

        // Filters (Array support for multi-select)
        if (status) query.status = { $in: status.split(',') };
        if (designation) query.designation = { $in: designation.split(',') };
        if (functionalRole) query.functionalRole = { $in: functionalRole.split(',') };
        if (type) query.employeeType = { $in: type.split(',') }; // Map 'type' param to 'employeeType' field
        if (project) query.project = { $in: project.split(',') };
        if (projectOffice) query.projectOffice = { $in: projectOffice.split(',') };
        if (reportProject) query.reportProject = { $in: reportProject.split(',') };
        if (subCenter) query.subCenter = { $in: subCenter.split(',') };

        const employees = await Employee.find(query)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const count = await Employee.countDocuments(query);

        // Get unique values for filters (for frontend dropdowns)
        // Note: Doing this every time might be heavy on large DBs, can optimize later
        const filterFields = [
            'designation', 'functionalRole', 'employeeType', 'project', 'projectOffice', 'reportProject', 'subCenter'
        ];
        const distinctFilters = {};
        for (const field of filterFields) {
            // Using distinct for efficiency, though it doesn't respect the current query subset (usually what user wants globally)
            distinctFilters[field === 'employeeType' ? 'type' : field] = await Employee.distinct(field);
        }

        res.json({
            employees,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            totalCount: count,
            filters: distinctFilters
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
    try {
        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        res.json(employee);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/employees - Create new employee
router.post('/', async (req, res) => {
    try {
        const newEmployee = new Employee(req.body);
        const savedEmployee = await newEmployee.save();
        res.status(201).json(savedEmployee);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
    try {
        const updatedEmployee = await Employee.findOneAndUpdate(
            { employeeId: req.params.id },
            req.body,
            { new: true }
        );
        if (!updatedEmployee) return res.status(404).json({ error: 'Employee not found' });
        res.json(updatedEmployee);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/employees/:id/transfer - Record employee transfer
router.post('/:id/transfer', async (req, res) => {
    try {
        const { project, projectOffice, subCenter, reason } = req.body;
        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });

        // Carry current values to "last" fields before updating
        employee.lastTransferDate = new Date();
        employee.lastSubcenter = employee.subCenter;
        employee.lastTransferReason = reason || 'Official Transfer';

        // Update to new values
        if (project) employee.project = project;
        if (projectOffice) employee.projectOffice = projectOffice;
        if (subCenter) employee.subCenter = subCenter;

        await employee.save();
        res.json({ message: 'Transfer recorded successfully', employee });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/employees/:id/separation - Record Resignation/Termination
router.post('/:id/separation', async (req, res) => {
    try {
        const { type, date, remarks } = req.body; // type: 'Resigned' | 'Terminated'
        if (!['Resigned', 'Terminated'].includes(type)) {
            return res.status(400).json({ error: 'Invalid separation type' });
        }

        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });

        employee.status = type;
        employee.separationDate = date || new Date();
        employee.remarks = remarks;

        await employee.save();
        res.json({ message: `Employee ${type} successfully`, employee });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/employees/:id/close-file - Final File Closing
router.post('/:id/close-file', async (req, res) => {
    try {
        const { date, remarks } = req.body;
        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });

        if (!['Resigned', 'Terminated'].includes(employee.status)) {
            return res.status(400).json({ error: 'Employee must be Resigned or Terminated before file closing.' });
        }

        employee.status = 'Closed';
        employee.fileClosingDate = date || new Date();
        employee.fileClosingRemarks = remarks;

        await employee.save();
        res.json({ message: 'File closed successfully', employee });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
