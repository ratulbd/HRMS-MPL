const Employee = require('../models/Employee');
const Shift = require('../models/Shift');
const GlobalSchedule = require('../models/GlobalSchedule');
const SubCenterSetting = require('../models/SubCenterSetting');
const DutyRoster = require('../models/DutyRoster');

/**
 * Resolves the active shift for an employee on a given date.
 * Precedence: GlobalSchedule (Ramadan etc) > Employee assigned Shift > Default (9-6)
 */
async function resolveShift(employeeId, date = new Date()) {
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    // 1. Check Duty Roster (Highest Precedence)
    const mongoose = require('mongoose');
    const query = { date: searchDate };
    if (mongoose.Types.ObjectId.isValid(employeeId)) {
        query.$or = [{ employeeId: employeeId }, { employeeIdStr: employeeId }];
    } else {
        query.employeeIdStr = String(employeeId).trim();
    }

    const roster = await DutyRoster.findOne(query);

    if (roster) {
        return {
            startTime: roster.startTime,
            endTime: roster.endTime,
            graceTime: 15, // Default or fetch from roster if needed
            shiftName: roster.shiftName,
            isOffDay: roster.isOffDay,
            source: 'Roster',
            rosterId: roster._id
        };
    }

    // 2. Resolve Standard Shift (needed to check if Global applies)
    const employee = await Employee.findOne({ employeeId }).populate('shiftId');
    const stdShift = (employee && employee.shiftId && employee.shiftId.isActive) ? {
        startTime: employee.shiftId.startTime,
        endTime: employee.shiftId.endTime,
        graceTime: employee.shiftId.graceTime,
        shiftId: employee.shiftId._id,
        source: 'Employee'
    } : {
        startTime: "09:00",
        endTime: "18:00",
        graceTime: 15,
        source: 'Default'
    };

    // 3. Check Global Overrides
    const global = await GlobalSchedule.findOne({
        startDate: { $lte: date },
        endDate: { $gte: date },
        isActive: true,
        $or: [
            { appliedShifts: { $exists: false } },
            { appliedShifts: { $size: 0 } },
            { appliedShifts: stdShift.shiftId }
        ]
    });

    if (global) {
        return {
            startTime: global.startTime,
            endTime: global.endTime,
            graceTime: 15,
            source: 'Global'
        };
    }

    // 4. Return Standard Shift
    return stdShift;
}

/**
 * Resolves the approval hierarchy for a specific type (leave, attendanceIn, attendanceOut).
 * Precedence: Individual Employee Settings > Sub-Center Setting > Reporting Manager Chain
 */
async function resolveHierarchy(employee, type) {
    // Mapping types to fields
    const fieldMap = {
        'leave': 'leaveHierarchy',
        'attendanceIn': 'attendanceInHierarchy',
        'attendanceOut': 'attendanceOutHierarchy'
    };
    const field = fieldMap[type];

    // 1. Individual Setting
    if (employee[field] && employee[field].length > 0) {
        return employee[field];
    }

    // 2. Sub-Center Setting
    const subCenter = await SubCenterSetting.findOne({ subCenterName: employee.subCenter });
    if (subCenter && subCenter[field] && subCenter[field].length > 0) {
        return subCenter[field];
    }

    // 3. Reporting Manager Chain (Automatic 2-level chain if not set)
    const hierarchy = [];
    let currentId = employee.reportingManager;

    // Build a 2-level hierarchy by default from reporting managers
    for (let i = 0; i < 2; i++) {
        if (!currentId) break;
        hierarchy.push(currentId);
        const mgr = await Employee.findOne({ employeeId: currentId });
        currentId = mgr ? mgr.reportingManager : null;
    }

    return hierarchy.length > 0 ? hierarchy : (employee.approvalHierarchy || []);
}

module.exports = {
    resolveShift,
    resolveHierarchy
};
