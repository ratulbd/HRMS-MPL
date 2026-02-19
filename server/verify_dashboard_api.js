const axios = require('axios');
const FormData = require('form-data');

async function verifyPendingAPI() {
    const API_BASE = 'http://localhost:5000/api';
    const ts = Date.now();
    const mgrId = `MGR-DASH-${ts}`;
    const staffId = `STAFF-DASH-${ts}`;

    try {
        console.log("1. Creating Manager and Staff with Hierarchy...");
        const empData = (id, name, hierarchy = []) => ({
            employeeId: id, name, designation: 'Tester', functionalRole: 'Test',
            joiningDate: '2023-01-01', project: 'Test', projectOffice: 'Test', reportProject: 'Test', subCenter: 'Test',
            personalMobile: '0123456789', dob: '1990-01-01', salary: 10000, basic: 5000, others: 5000,
            address: 'Test', identificationType: 'NID', identification: id,
            approvalHierarchy: hierarchy
        });

        await axios.post(`${API_BASE}/employees`, empData(mgrId, 'Manager Dashboard Bot'));
        await axios.post(`${API_BASE}/employees`, empData(staffId, 'Staff Dashboard Bot', [mgrId]));

        console.log("2. Staff Checking-in (Far Away) to create pending request...");
        const form = new FormData();
        form.append('employeeId', staffId);
        form.append('lat', '22.0000');
        form.append('lng', '90.0000');
        form.append('justification', 'Dashboard Verification');

        await axios.post(`${API_BASE}/attendance/check-in`, form, { headers: form.getHeaders() });

        console.log("3. Fetching Pending Requests for Manager...");
        const res = await axios.get(`${API_BASE}/attendance/pending/${mgrId}`);

        console.log("   Pending Requests:", JSON.stringify(res.data, null, 2));

        if (res.data.length > 0 && res.data[0].employeeIdStr === staffId) {
            console.log("\n✅ BACKEND API FOR DASHBOARD VERIFIED SUCCESSFULLY");
        } else {
            throw new Error("Pending request not found for manager!");
        }

    } catch (err) {
        console.error("\n❌ VERIFICATION FAILED");
        console.error(err.response ? err.response.data : err.message);
    }
}

verifyPendingAPI();
