const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const API_URL = 'http://127.0.0.1:5000/api';

const testEmployee = {
    employeeId: 'TEST-BOT-001',
    name: 'Test Bot',
    employeeType: 'Regular',
    designation: 'Tester',
    functionalRole: 'QA',
    joiningDate: '2023-01-01',
    project: 'Internal',
    projectOffice: 'HQ',
    reportProject: 'Internal',
    subCenter: 'Lab',
    personalMobile: '01700000000',
    dob: '1990-01-01',
    address: '123 Test Lane',
    identificationType: 'NID',
    identification: '9999999999',
    salary: 50000,
    basic: 30000,
    others: 20000
};

async function runTest() {
    console.log('--- STARTING AUTOMATED TEST ---\n');

    try {
        // 1. Create Employee
        console.log('1. Creating Test Employee...');
        try {
            await axios.post(`${API_URL}/employees`, testEmployee);
            console.log('   ✅ Employee Created/Exists');
        } catch (e) {
            if (e.response && e.response.data && e.response.data.error && e.response.data.error.includes('duplicate')) {
                console.log('   ℹ️  Employee already exists, proceeding...');
            } else {
                throw e;
            }
        }

        // 2. Check In
        console.log('\n2. Testing Check-In...');
        const checkInForm = new FormData();
        checkInForm.append('employeeId', testEmployee.employeeId);
        checkInForm.append('lat', '23.8103');
        checkInForm.append('lng', '90.4125');
        checkInForm.append('address', 'Test HQ');

        // Create a dummy file for selfie
        const dummyPath = path.join(__dirname, 'test_selfie.txt');
        fs.writeFileSync(dummyPath, 'dummy image content');
        checkInForm.append('selfie', fs.createReadStream(dummyPath));

        try {
            const resIn = await axios.post(`${API_URL}/attendance/check-in`, checkInForm, {
                headers: checkInForm.getHeaders()
            });
            console.log('   ✅ Check-In Successful:', resIn.data.message);
        } catch (e) {
            console.log('   ⚠️  Check-In Note:', e.response ? e.response.data.error : e.message);
        }

        // 3. Check Out
        console.log('\n3. Testing Check-Out...');
        const checkOutForm = new FormData();
        checkOutForm.append('employeeId', testEmployee.employeeId);
        checkOutForm.append('lat', '23.8103');
        checkOutForm.append('lng', '90.4125');
        checkOutForm.append('address', 'Test HQ');

        try {
            const resOut = await axios.post(`${API_URL}/attendance/check-out`, checkOutForm, {
                headers: checkOutForm.getHeaders()
            });
            console.log('   ✅ Check-Out Successful:', resOut.data.message);
            console.log('   ⏱️  Work Hours:', resOut.data.workHours);
        } catch (e) {
            console.log('   ⚠️  Check-Out Note:', e.response ? e.response.data.error : e.message);
        }

        // Cleanup
        if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);
        console.log('\n--- TEST COMPLETE ---');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        if (error.response) console.error('Server says:', error.response.data);
    }
}

runTest();
