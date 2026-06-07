const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const SubCenterSetting = require('../models/SubCenterSetting');
const mongoose = require('mongoose');

/**
 * Normalizes any date to local midnight (00:00:00.000 local time).
 * This avoids timezone mismatch bugs when comparing dates stored in MongoDB.
 */
function toLocalMidnight(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Checks if compliance checks are relaxed for an employee.
 */
async function isComplianceRelaxed(employeeId) {
    const employee = await Employee.findById(employeeId);
    if (!employee) return false;
    if (employee.isComplianceRelaxed) return true;

    const subCenter = await SubCenterSetting.findOne({ subCenterName: employee.subCenter });
    if (subCenter && subCenter.isComplianceRelaxed) return true;

    return false;
}

/**
 * Checks if an employee has worked more than the maximum consecutive days (10 days).
 */
async function checkConsecutiveDays(employeeId, date = new Date()) {
    if (await isComplianceRelaxed(employeeId)) {
        return { count: 0, isJustificationNeeded: false, isViolation: false, message: "Compliance Relaxed" };
    }
    const today = toLocalMidnight(date);

    // Look back at the last 11 days of attendance (excluding today)
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 11);

    const attendances = await Attendance.find({
        employeeId: employeeId,
        date: { $gte: startDate, $lt: today },
        status: { $in: ['Present', 'Late'] }
    }).sort({ date: -1 });

    let consecutive = 0;
    let checkDate = new Date(today);
    checkDate.setDate(today.getDate() - 1);

    for (let i = 0; i < 11; i++) {
        const found = attendances.find(a => toLocalMidnight(a.date).getTime() === checkDate.getTime());
        if (found) {
            consecutive++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }

    return {
        count: consecutive,
        isJustificationNeeded: consecutive >= 7,
        isViolation: consecutive >= 10,
        message: consecutive >= 10 ? "Maximum 10 consecutive working days limit reached." :
            (consecutive >= 7 ? "7 consecutive working days reached. Justification and approval required." : "")
    };
}

/**
 * Calculates total hours worked in a specific week (Sunday to Saturday).
 */
async function getWeeklyHours(employeeId, date = new Date()) {
    if (await isComplianceRelaxed(employeeId)) {
        return { totalHours: 0, otHours: 0, isWarning: false, isOTViolation: false, isTotalViolation: false, message: "Compliance Relaxed" };
    }
    const d = toLocalMidnight(date);
    const day = d.getDay(); // 0 (Sun) to 6 (Sat)

    // Calculate start of week (Sunday)
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - day);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const attendances = await Attendance.find({
        employeeId: employeeId,
        date: { $gte: startOfWeek, $lte: endOfWeek },
        status: { $in: ['Present', 'Late', 'Pending'] }
    });

    const totalHours = attendances.reduce((sum, a) => sum + (a.workHours || 0), 0);
    const otHours = Math.max(0, totalHours - 48);

    return {
        totalHours: parseFloat(totalHours.toFixed(2)),
        otHours: parseFloat(otHours.toFixed(2)),
        isWarning: totalHours > 48,
        isOTViolation: otHours >= 12,
        isTotalViolation: totalHours >= 60,
        limit: 48,
        maxOTLimit: 12,
        maxTotalLimit: 60
    };
}

/**
 * Calculates the average weekly hours for the current year.
 */
async function getAnnualAverageHours(employeeId, date = new Date()) {
    if (await isComplianceRelaxed(employeeId)) {
        return { averageHours: 0, isViolation: false, message: "Compliance Relaxed" };
    }
    const d = toLocalMidnight(date);
    const startOfYear = new Date(d.getFullYear(), 0, 1);

    const attendances = await Attendance.find({
        employeeId: employeeId,
        date: { $gte: startOfYear, $lte: d },
        status: { $in: ['Present', 'Late', 'Pending'] }
    });

    const totalHours = attendances.reduce((sum, a) => sum + (a.workHours || 0), 0);

    // Calculate weeks elapsed
    const diffTime = Math.abs(d - startOfYear);
    const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7)) || 1;

    const average = totalHours / diffWeeks;

    return {
        averageHours: parseFloat(average.toFixed(2)),
        isViolation: average > 56,
        limit: 56
    };
}

module.exports = {
    checkConsecutiveDays,
    getWeeklyHours,
    getAnnualAverageHours
};
