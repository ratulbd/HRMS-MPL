const axios = require('axios');
const FormData = require('form-data');

async function testLogic() {
    const API_URL = 'http://localhost:5000/api/attendance/check-in';

    // 1. Create Temp Employee
    const uniqueId = 'GEO-' + Date.now();
    let empId = uniqueId;

    try {
        await axios.post('http://localhost:5000/api/employees', {
            employeeId: uniqueId,
            name: 'Geo Tester',
            designation: 'Bot',
            functionalRole: 'Testing',
            joiningDate: '2023-01-01',
            project: 'Test',
            projectOffice: 'Test',
            reportProject: 'Test',
            subCenter: 'Test',
            personalMobile: '0000000000',
            dob: '2000-01-01',
            salary: 10000, basic: 5000, others: 5000,
            address: 'Test Addr', identificationType: 'NID', identification: '123',
            email: 'test@example.com'
        });
        console.log(`Created Temp Employee: ${uniqueId}`);
    } catch (e) {
        console.error("Failed to create temp emp:", e.message);
        return;
    }

    // Case 1: Far Away (Should Fail)
    try {
        console.log("\n--- TEST 1: Far Away Location ---");
        const form = new FormData();
        form.append('employeeId', empId);
        form.append('lat', '22.0000'); // Far from Dhaka
        form.append('lng', '90.0000');
        form.append('address', 'Far Away');

        await axios.post(API_URL, form, { headers: form.getHeaders() });
    } catch (err) {
        if (err.response) {
            console.log(`Status: ${err.response.status}`);
            if (err.response.data.code === 'JUSTIFICATION_REQUIRED') {
                console.log("✅ SUCCESS: Prompted for Justification (Geo-fence worked)");
            } else {
                console.log("❌ FAIL: Unexpected error", err.response.data);
            }
        } else {
            console.error("Error:", err.message);
        }
    }

    // Case 2: Far Away + Justification (Should Succeed)
    try {
        console.log("\n--- TEST 2: Far Away + Justification ---");
        const form = new FormData();
        form.append('employeeId', empId);
        form.append('lat', '22.0000');
        form.append('lng', '90.0000');
        form.append('justification', 'Working from remote site');

        const res = await axios.post(API_URL, form, { headers: form.getHeaders() });
        if (res.status === 201) {
            console.log("✅ SUCCESS: Accepted with Justification");
        }
    } catch (err) {
        console.log("❌ FAIL:", err.response ? err.response.data : err.message);
    }
}

testLogic();
