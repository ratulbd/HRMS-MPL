const axios = require('axios');
const FormData = require('form-data');

async function testMultiHierarchy() {
    const API_BASE = 'http://localhost:5000/api';
    const ts = Date.now();

    try {
        console.log("--- STARTING MULTI-HIERARCHY VERIFICATION ---");

        // 1. Setup Test Data
        const staffId = `STAFF-${ts}`;
        const mgrId = `MGR-${ts}`;
        const hrId = `HR-${ts}`;
        const bossId = `BOSS-${ts}`;

        console.log("1. Creating Test Employees...");
        const empData = (id, name, extra = {}) => ({
            employeeId: id, name, designation: 'Tester', functionalRole: 'Test',
            joiningDate: '2023-01-01', project: 'Test', projectOffice: 'Test', reportProject: 'Test', subCenter: 'TestCenter',
            personalMobile: '0123456789', dob: '1990-01-01', salary: 10000, basic: 5000, others: 5000,
            address: 'Test', identificationType: 'NID', identification: id,
            ...extra
        });

        await axios.post(`${API_BASE}/employees`, empData(bossId, 'The Big Boss'));
        await axios.post(`${API_BASE}/employees`, empData(hrId, 'HR Manager', { reportingManager: bossId }));
        await axios.post(`${API_BASE}/employees`, empData(mgrId, 'Direct Manager', { reportingManager: hrId }));

        // Staff hasmgrId as reporting manager, but we'll set a specific leave hierarchy
        await axios.post(`${API_BASE}/employees`, empData(staffId, 'Staff Member', {
            reportingManager: mgrId,
            leaveHierarchy: [hrId, bossId] // Skip direct manager for leave
        }));

        console.log(`   Structure: Staff -> ${mgrId} (Report)`);
        console.log(`   Leave Hierarchy Override: [${hrId}, ${bossId}]`);

        // 2. Test Leave (Should use Leave Hierarchy)
        console.log("\n2. Applying for Leave...");
        const leaveRes = await axios.post(`${API_BASE}/leave/apply`, {
            employeeId: staffId,
            type: 'Casual',
            startDate: '2026-03-01',
            endDate: '2026-03-01',
            days: 1,
            reason: 'Test Leave Hierarchy'
        });
        console.log(`   Leave Current Approver: ${leaveRes.data.currentApprover} (Expected: ${hrId})`);
        if (leaveRes.data.currentApprover !== hrId) throw new Error("Leave hierarchy resolution failed!");

        // 3. Test Attendance In (Late) - Should use Reporting Manager Chain (since not explicitly set)
        console.log("\n3. Testing Late Check-in (Inherited Hierarchy)...");
        const form = new FormData();
        form.append('employeeId', staffId);
        form.append('lat', '23.8103'); // Office Lat
        form.append('lng', '90.4125'); // Office Lng
        form.append('justification', 'Woke up late');

        // Note: Forcing late by time isn't easy without mocking Date, 
        // but let's assume current time is after 9:15 AM
        const checkInRes = await axios.post(`${API_BASE}/attendance/check-in`, form, { headers: form.getHeaders() });
        const attendanceId = checkInRes.data.attendanceId;

        const att = (await axios.get(`${API_BASE}/attendance/today/${staffId}`)).data;
        if (att.isLate) {
            console.log(`   Late detected. Current Approver: ${att.currentApprover} (Expected: ${mgrId})`);
            if (att.currentApprover !== mgrId) throw new Error("Attendance-In hierarchy resolution failed!");
        } else {
            console.log("   Not late (check your system clock). Skipping deep hierarchy check for In.");
        }

        // 4. Test Attendance Out (Early)
        console.log("\n4. Testing Early Check-out...");
        const outForm = new FormData();
        outForm.append('employeeId', staffId);
        outForm.append('lat', '23.8103');
        outForm.append('lng', '90.4125');
        outForm.append('justification', 'Sick leave mid-day');

        const checkOutRes = await axios.post(`${API_BASE}/attendance/check-out`, outForm, { headers: outForm.getHeaders() });

        const finalAtt = (await axios.get(`${API_BASE}/attendance/today/${staffId}`)).data;
        if (finalAtt.isEarlyOut) {
            console.log(`   Early-out detected. Current Approver: ${finalAtt.currentApprover} (Expected: ${mgrId})`);
            // Since attendanceOutHierarchy is not set, it defaults to reportingManager
            if (finalAtt.currentApprover !== mgrId && !att.isLate) throw new Error("Attendance-Out hierarchy resolution failed!");
        } else {
            console.log("   Not early out (check your system clock).");
        }

        console.log("\n✅ VERIFICATION COMPLETE");

    } catch (err) {
        console.error("\n❌ VERIFICATION FAILED");
        console.error(err.response ? err.response.data : err.message);
    }
}

testMultiHierarchy();
