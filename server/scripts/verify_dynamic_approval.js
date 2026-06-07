const axios = require('axios');
const FormData = require('form-data');

async function testDynamicApproval() {
    const API_BASE = 'http://localhost:5000/api';
    const ts = Date.now();

    try {
        console.log("--- STARTING DYNAMIC APPROVAL TEST ---");

        // 1. Create Approvers
        const mgrId = `MGR-${ts}`;
        const hrId = `HR-${ts}`;
        const staffId = `STAFF-${ts}`;

        console.log("1. Creating Approvers and Staff...");
        const empData = (id, name, hierarchy = []) => ({
            employeeId: id, name, designation: 'Tester', functionalRole: 'Test',
            joiningDate: '2023-01-01', project: 'Test', projectOffice: 'Test', reportProject: 'Test', subCenter: 'Test',
            personalMobile: '0123456789', dob: '1990-01-01', salary: 10000, basic: 5000, others: 5000,
            address: 'Test', identificationType: 'NID', identification: id,
            approvalHierarchy: hierarchy
        });

        await axios.post(`${API_BASE}/employees`, empData(mgrId, 'Manager Bot'));
        await axios.post(`${API_BASE}/employees`, empData(hrId, 'HR Bot'));
        await axios.post(`${API_BASE}/employees`, empData(staffId, 'Staff Bot', [mgrId, hrId]));

        console.log(`   Hierarchy: Staff -> ${mgrId} -> ${hrId}`);

        // 2. Check-in with Justification (Force Pending)
        console.log("\n2. Staff Checking-in (Far Away)...");
        const form = new FormData();
        form.append('employeeId', staffId);
        form.append('lat', '22.0000'); // Force Geo-fence fail
        form.append('lng', '90.0000');
        form.append('justification', 'Multi-level approval test');

        const checkInRes = await axios.post(`${API_BASE}/attendance/check-in`, form, { headers: form.getHeaders() });
        const attendanceId = checkInRes.data.attendanceId;

        let att = (await axios.get(`${API_BASE}/attendance/today`)).data.find(r => r.employeeIdStr === staffId);
        console.log(`   Initial Status: ${att.approvalStatus}`);
        console.log(`   Current Approver: ${att.currentApprover} (Expected: ${mgrId})`);

        if (att.currentApprover !== mgrId) throw new Error("Wrong first approver!");

        // 3. Approve as Manager
        console.log("\n3. Approving as Manager...");
        await axios.post(`${API_BASE}/attendance/approve`, {
            attendanceId,
            approverId: mgrId,
            action: 'Approved',
            comments: 'Manager says OK'
        });

        att = (await axios.get(`${API_BASE}/attendance/today`)).data.find(r => r.employeeIdStr === staffId);
        console.log(`   Status: ${att.approvalStatus}`);
        console.log(`   Current Approver: ${att.currentApprover} (Expected: ${hrId})`);

        if (att.currentApprover !== hrId) throw new Error("Approval didn't pass to HR!");

        // 4. Approve as HR (Final)
        console.log("\n4. Approving as HR (Final Stage)...");
        await axios.post(`${API_BASE}/attendance/approve`, {
            attendanceId,
            approverId: hrId,
            action: 'Approved',
            comments: 'HR Final Approval'
        });

        att = (await axios.get(`${API_BASE}/attendance/today`)).data.find(r => r.employeeIdStr === staffId);
        console.log(`   Final Status: ${att.approvalStatus} (Expected: Approved)`);
        console.log(`   Final Attendance Status: ${att.status} (Expected: Present)`);

        if (att.approvalStatus === 'Approved' && att.status === 'Present') {
            console.log("\n✅ DYNAMIC APPROVAL WORKFLOW VERIFIED SUCCESSFULLY");
        } else {
            throw new Error("Final status check failed!");
        }

    } catch (err) {
        console.error("\n❌ TEST FAILED");
        console.error(err.response ? err.response.data : err.message);
    }
}

testDynamicApproval();
