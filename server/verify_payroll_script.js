const axios = require('axios');

const API_URL = 'http://127.0.0.1:5000/api';

const dummyPayroll = {
    monthYear: '2023-10',
    generatedBy: 'TestScript',
    jsonData: [
        { employeeId: 'EMP001', netPayment: 50000 },
        { employeeId: 'EMP002', netPayment: 60000 }
    ]
};

async function runTest() {
    console.log('--- PAYROLL API TEST ---\n');

    try {
        // 1. Archive Payroll
        console.log('1. Archiving Payroll Data...');
        const resPost = await axios.post(`${API_URL}/payroll/archive`, dummyPayroll);
        console.log('   ✅ Archived:', resPost.data);

        // 2. Fetch Archives
        console.log('\n2. Fetching Archives...');
        const resGet = await axios.get(`${API_URL}/payroll/archive`);
        console.log('   ✅ Fetched List:', resGet.data);

        if (resGet.data.jsonData.length > 0) {
            console.log(`   ℹ️  Total Records: ${resGet.data.totalRecords}`);
        } else {
            console.warn('   ⚠️  No records found?');
        }

        console.log('\n--- TEST COMPLETE ---');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        if (error.response) console.error('Server says:', error.response.data);
    }
}

runTest();
