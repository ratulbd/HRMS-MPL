const axios = require('axios');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const { resolveShift, resolveHierarchy } = require('./hierarchyUtils');
const compliance = require('./complianceUtils');

const BASE_URL = process.env.ZKBIO_BASE_URL;
const USERNAME = process.env.ZKBIO_USERNAME;
const PASSWORD = process.env.ZKBIO_PASSWORD;

// Cache for JWT Auth Token to avoid logging in on every sync run
let cachedToken = null;
let tokenExpiresAt = null;

async function getAuthToken() {
    // If token exists and has not expired (JWT typically lasts 24h, let's refresh after 12h to be safe)
    if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    try {
        const res = await axios.post(`${BASE_URL}/jwt-api-token-auth/`, {
            username: USERNAME,
            password: PASSWORD
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (res.data && res.data.token) {
            cachedToken = `JWT ${res.data.token}`;
            tokenExpiresAt = Date.now() + 12 * 60 * 60 * 1000; // 12 hours from now
            return cachedToken;
        }
    } catch (err) {
        console.warn('⚠️ ZKBio Time JWT Authentication failed. Retrying with Token Auth...');
    }

    // Fallback to General Token
    try {
        const res = await axios.post(`${BASE_URL}/api-token-auth/`, {
            username: USERNAME,
            password: PASSWORD
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (res.data && res.data.token) {
            cachedToken = `Token ${res.data.token}`;
            tokenExpiresAt = Date.now() + 12 * 60 * 60 * 1000;
            return cachedToken;
        }
    } catch (err) {
        console.error('❌ ZKBio Time Authentication failed completely:', err.message);
        throw new Error('ZKBio Time Authentication failed.');
    }
}

/**
 * Normalizes a date to midnight local time
 */
function getMidnightDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Synchronizes transactions from ZKBio Time for a specified date range
 * @param {Date} startTime - Fetch transactions punched on or after this time
 * @param {Date} endTime - Fetch transactions punched on or before this time
 */
async function syncTransactions(startTime = new Date(), endTime = new Date(), employeeIdFilter = null) {
    const stats = { processed: 0, checkIns: 0, checkOuts: 0, skipped: 0, errors: [] };

    try {
        const authHeader = await getAuthToken();
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        };

        // Format times as required by ZKBio Time: YYYY-MM-DD HH:mm:ss
        const formatZKBioTime = (date) => {
            const pad = (num) => String(num).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        };

        const startTimeStr = formatZKBioTime(startTime);
        const endTimeStr = formatZKBioTime(endTime);

        let url = `${BASE_URL}/iclock/api/transactions/?start_time=${encodeURIComponent(startTimeStr)}&end_time=${encodeURIComponent(endTimeStr)}`;
        if (employeeIdFilter) {
            url += `&emp_code=${encodeURIComponent(employeeIdFilter.trim())}`;
            console.log(`Syncing ZKBio Time punches for employee [${employeeIdFilter}] between [${startTimeStr}] and [${endTimeStr}]...`);
        } else {
            console.log(`Syncing ZKBio Time punches between [${startTimeStr}] and [${endTimeStr}]...`);
        }

        let transactions = [];
        let page = 1;

        // Pull all pages for this range
        while (url) {
            const response = await axios.get(url, { headers, timeout: 15000 });
            if (response.data && response.data.data) {
                transactions = transactions.concat(response.data.data);
            }
            url = response.data.next;
            if (url && !url.startsWith('http')) {
                url = `${BASE_URL}${url}`;
            }
            page++;
        }

        console.log(`Retrieved ${transactions.length} total punches from ZKBio Time.`);

        // Sort transactions chronologically to process check-in before check-out
        transactions.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

        for (const tx of transactions) {
            try {
                const { emp_code, punch_time, punch_state, punch_state_display } = tx;
                if (!emp_code) continue;

                // 1. Locate local employee
                const employee = await Employee.findOne({ employeeId: emp_code.trim() });
                if (!employee) {
                    stats.skipped++;
                    continue; // Skip if employee doesn't exist locally
                }

                const punchDate = new Date(punch_time);
                const localMidnight = getMidnightDate(punchDate);
                
                // Determine if punch is Check-In or Check-Out
                // State "0" is Check In, "1" is Check Out. If not specified, look up active records.
                const isExplicitCheckIn = punch_state === '0' || (punch_state_display && punch_state_display.toLowerCase().trim() === 'check in');
                const isExplicitCheckOut = punch_state === '1' || (punch_state_display && punch_state_display.toLowerCase().trim() === 'check out');

                // 2. Query today's attendance record
                let attendance = await Attendance.findOne({
                    employeeId: employee._id,
                    date: localMidnight
                });

                if (isExplicitCheckIn || (!attendance && !isExplicitCheckOut)) {
                    // === CHECK-IN LOGIC ===
                    if (attendance) {
                        // Already checked in, skip or update checkInTime if this is earlier
                        if (punchDate < attendance.checkInTime) {
                            attendance.checkInTime = punchDate;
                            await attendance.save();
                        }
                        stats.skipped++;
                        continue;
                    }

                    // Resolve shift details
                    const shift = await resolveShift(employee.employeeId, localMidnight);
                    const [shiftH, shiftM] = shift.startTime.split(':').map(Number);
                    const lateThreshold = shiftH * 60 + shiftM + shift.graceTime;
                    const punchMinutes = punchDate.getHours() * 60 + punchDate.getMinutes();

                    const isLate = punchMinutes > lateThreshold;

                    // COMPLIANCE CHECKS FOR BIOMETRIC CHECK-IN
                    const consecutive = await compliance.checkConsecutiveDays(employee._id, localMidnight);
                    const weekly = await compliance.getWeeklyHours(employee._id, localMidnight);

                    const isCriticalViolation = consecutive.isViolation || weekly.isOTViolation || weekly.isTotalViolation;
                    const isMinorViolation = isLate || consecutive.isJustificationNeeded;

                    let status = 'Present';
                    let approvalStatus = 'Approved';
                    let requiresJustification = false;
                    let justificationReason = '';
                    let rejectionReason = '';
                    let currentApprover = null;
                    let hierarchy = [];
                    let logs = [];

                    if (isCriticalViolation) {
                        status = 'Absent';
                        approvalStatus = 'Rejected';
                        rejectionReason = consecutive.isViolation ? consecutive.message : 'Weekly hours limit exceeded (>=60h total or 12h OT)';
                        logs.push({
                            approverId: 'SYSTEM',
                            status: 'Rejected',
                            comments: `Auto-rejected biometric check-in: ${rejectionReason}`
                        });
                    } else if (isMinorViolation) {
                        status = 'Pending';
                        approvalStatus = 'Pending';
                        requiresJustification = true;
                        justificationReason = consecutive.isJustificationNeeded 
                            ? '7 consecutive days worked limit reached' 
                            : 'Late arrival';
                        hierarchy = await resolveHierarchy(employee, 'attendanceIn');
                        if (hierarchy.length > 0) {
                            currentApprover = hierarchy[0];
                        }
                        logs.push({
                            approverId: 'SYSTEM',
                            status: 'Approved',
                            comments: `Biometric punch logged. Pending justification for: ${justificationReason}`
                        });
                    } else {
                        logs.push({
                            approverId: 'SYSTEM',
                            status: 'Approved',
                            comments: 'Auto-approved biometric machine check-in'
                        });
                    }

                    attendance = new Attendance({
                        employeeId: employee._id,
                        employeeIdStr: employee.employeeId,
                        date: localMidnight,
                        checkInTime: punchDate,
                        checkInLocation: {
                            lat: 23.8103, // Mock office coordinates since physical machine has fixed range
                            lng: 90.4125,
                            address: 'Biometric Machine'
                        },
                        status,
                        isLate,
                        isOutOfRange: false,
                        justification: isMinorViolation ? '' : 'Biometric Punch',
                        requiresJustification,
                        justificationReason,
                        rejectionReason,
                        approvalStatus,
                        approvalHierarchy: hierarchy,
                        currentApprover,
                        appliedShift: {
                            startTime: shift.startTime,
                            endTime: shift.endTime,
                            graceTime: shift.graceTime,
                            shiftName: shift.shiftName,
                            isRoster: shift.source === 'Roster'
                        },
                        rosterId: shift.rosterId,
                        approvalLogs: logs
                    });

                    await attendance.save();
                    stats.checkIns++;
                    stats.processed++;

                } else {
                    // === CHECK-OUT LOGIC ===
                    if (!attendance) {
                        // If no check-in exists but we have a check-out punch: skip to keep DB clean
                        stats.skipped++;
                        continue;
                    }

                    if (attendance.checkOutTime && punchDate <= attendance.checkOutTime) {
                        // Already checked out later, skip
                        stats.skipped++;
                        continue;
                    }

                    const [endH, endM] = attendance.appliedShift.endTime.split(':').map(Number);
                    const endTimeThreshold = endH * 60 + endM;
                    const punchMinutes = punchDate.getHours() * 60 + punchDate.getMinutes();

                    const isEarlyOut = punchMinutes < endTimeThreshold;
                    const diffMs = punchDate - attendance.checkInTime;
                    const diffHrs = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

                    // COMPLIANCE CHECKS FOR BIOMETRIC CHECK-OUT
                    const weekly = await compliance.getWeeklyHours(employee._id, localMidnight);
                    const totalWeeklyInclToday = weekly.totalHours + diffHrs;
                    const isWeeklyOTViolation = (weekly.otHours + Math.max(0, diffHrs - 8)) > 12 || totalWeeklyInclToday > 60;
                    const isOverDuty = diffHrs > 9;

                    const isCriticalViolation = isWeeklyOTViolation || (attendance.approvalStatus === 'Rejected');

                    attendance.checkOutTime = punchDate;
                    attendance.checkOutLocation = {
                        lat: 23.8103,
                        lng: 90.4125,
                        address: 'Biometric Machine'
                    };
                    attendance.isEarlyOut = isEarlyOut;
                    attendance.workHours = diffHrs;

                    if (isCriticalViolation) {
                        attendance.status = 'Absent';
                        attendance.approvalStatus = 'Rejected';
                        attendance.rejectionReason = 'Weekly hours limit exceeded (>=60h total or 12h OT)';
                        attendance.requiresJustification = false;
                        attendance.approvalLogs.push({
                            approverId: 'SYSTEM',
                            status: 'Rejected',
                            comments: `Auto-rejected biometric check-out: Weekly hours limit exceeded (Total: ${totalWeeklyInclToday.toFixed(2)}h)`
                        });
                    } else if (isEarlyOut || isOverDuty) {
                        attendance.status = 'Pending';
                        attendance.approvalStatus = 'Pending';
                        attendance.requiresJustification = true;
                        attendance.justificationReason = isEarlyOut ? 'Early departure' : 'Overduty (worked > 9 hours)';
                        const hierarchy = await resolveHierarchy(employee, 'attendanceOut');
                        attendance.approvalHierarchy = hierarchy;
                        if (hierarchy.length > 0) {
                            attendance.currentApprover = hierarchy[0];
                        }
                        attendance.approvalLogs.push({
                            approverId: 'SYSTEM',
                            status: 'Approved',
                            comments: `Biometric punch logged. Pending checkout justification for: ${attendance.justificationReason}`
                        });
                    } else {
                        // Mark as approved if not already rejected or requiring checkin justification
                        if (attendance.status === 'Pending' && !attendance.requiresJustification) {
                            attendance.status = attendance.isLate ? 'Late' : 'Present';
                            attendance.approvalStatus = 'Approved';
                        }
                        attendance.approvalLogs.push({
                            approverId: 'SYSTEM',
                            status: 'Approved',
                            comments: 'Auto-approved biometric machine check-out'
                        });
                    }

                    await attendance.save();
                    stats.checkOuts++;
                    stats.processed++;
                }

            } catch (txErr) {
                console.error(`Error processing punch for employee ${tx.emp_code}:`, txErr.message);
                stats.errors.push(`Employee ${tx.emp_code} at ${tx.punch_time}: ${txErr.message}`);
            }
        }

    } catch (err) {
        console.error('Failed ZKBio Time sync execution:', err.message);
        stats.errors.push(`Global sync error: ${err.message}`);
    }

    return stats;
}

// In-memory sync log for status monitoring
let lastSyncLog = null;

function getLastSyncLog() {
    return lastSyncLog;
}

async function runScheduledSync() {
    const now = new Date();
    // Default to last 15 minutes if no previous sync recorded
    const startTime = lastSyncLog && lastSyncLog.lastSuccessfulEndTime
        ? new Date(lastSyncLog.lastSuccessfulEndTime)
        : new Date(now.getTime() - 15 * 60 * 1000);

    console.log(`[SCHEDULER] Starting scheduled ZKBio Time sync from ${startTime.toISOString()}`);

    const stats = await syncTransactions(startTime, now);

    lastSyncLog = {
        triggeredAt: new Date().toISOString(),
        startTime: startTime.toISOString(),
        endTime: now.toISOString(),
        stats,
        success: stats.errors.length === 0
    };

    if (stats.errors.length === 0) {
        lastSyncLog.lastSuccessfulEndTime = now.toISOString();
    }

    console.log(`[SCHEDULER] ZKBio Time sync complete:`, stats);
    return stats;
}

module.exports = {
    syncTransactions,
    runScheduledSync,
    getLastSyncLog
};
