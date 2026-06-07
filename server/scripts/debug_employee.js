const axios = require('axios');

async function debug() {
    const API_BASE = 'http://localhost:5000/api';
    const id = 'DEBUG-' + Date.now();

    try {
        console.log("1. Creating Debug Employee...");
        const res1 = await axios.post(`${API_BASE}/employees`, {
            employeeId: id,
            name: 'Debug Bot',
            designation: 'Bot',
            functionalRole: 'Test',
            joiningDate: '2023-01-01',
            project: 'Test',
            projectOffice: 'Test',
            reportProject: 'Test',
            subCenter: 'Test',
            personalMobile: '0123456789',
            dob: '1990-01-01',
            salary: 10000, basic: 5000, others: 5000,
            address: 'Test', identificationType: 'NID', identification: id,
            approvalHierarchy: ['MGR-1', 'HR-1']
        });

        console.log("   Saved Object:", JSON.stringify(res1.data, null, 2));

        console.log("\n2. Fetching Debug Employee...");
        const res2 = await axios.get(`${API_BASE}/employees/${id}`);
        console.log("   Fetched Object:", JSON.stringify(res2.data, null, 2));

        if (res2.data.approvalHierarchy && res2.data.approvalHierarchy.length > 0) {
            console.log("\n✅ HIERARCHY STORED SUCCESSFULLY");
        } else {
            console.error("\n❌ HIERARCHY MISSING!");
        }

    } catch (err) {
        console.error(err.response ? err.response.data : err.message);
    }
}

debug();
