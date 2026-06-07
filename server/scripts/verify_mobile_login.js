const axios = require('axios');

async function test() {
    try {
        console.log("Testing Mobile Login API Lookup...");
        // 1. Get an ID first
        const listRes = await axios.get('http://localhost:5000/api/employees?limit=1');
        if (!listRes.data.employees.length) {
            console.error("No employees found to test.");
            return;
        }
        const targetId = listRes.data.employees[0].employeeId;
        console.log(`Found Target ID: ${targetId}`);

        // 2. Perform the lookup that mobile_login.html does
        // fetch(`${API_BASE}/employees/${employeeId}`)
        const loginRes = await axios.get(`http://localhost:5000/api/employees/${targetId}`);

        if (loginRes.status === 200 && loginRes.data.employeeId === targetId) {
            console.log("✅ Mobile Login Lookup Successful");
            console.log(`   Name: ${loginRes.data.name}`);
            console.log(`   Designation: ${loginRes.data.designation}`);
        } else {
            console.error("❌ Mobile Login Lookup Failed");
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}
test();
