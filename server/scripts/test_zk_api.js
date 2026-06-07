const axios = require('axios');

const BASE_URL = 'http://27.147.131.46';
const USERNAME = 'mpl_it_2';
const PASSWORD = 'Mpl@2026';

async function testZKBioTimeConnection() {
    console.log('==================================================');
    console.log('STARTING ZKBIO TIME API CONNECTION & INTEGRATION');
    console.log('==================================================');

    let token = null;
    let authHeaderValue = null;

    // 1. Try JWT Auth First
    try {
        console.log(`\nAttempting JWT Authentication with ZKBio Time at: ${BASE_URL}/jwt-api-token-auth/`);
        const res = await axios.post(`${BASE_URL}/jwt-api-token-auth/`, {
            username: USERNAME,
            password: PASSWORD
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (res.data && res.data.token) {
            token = res.data.token;
            authHeaderValue = `JWT ${token}`;
            console.log('✅ JWT Authentication SUCCESSFUL!');
            console.log(`Token received (truncated): ${token.substring(0, 30)}...`);
        }
    } catch (err) {
        console.warn('⚠️  JWT Auth failed or is not configured. Message:', err.message);
        if (err.response) {
            console.warn('Response data:', err.response.data);
        }
    }

    // 2. Try General Token Auth if JWT fails
    if (!token) {
        try {
            console.log(`\nAttempting General Token Authentication at: ${BASE_URL}/api-token-auth/`);
            const res = await axios.post(`${BASE_URL}/api-token-auth/`, {
                username: USERNAME,
                password: PASSWORD
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            if (res.data && res.data.token) {
                token = res.data.token;
                authHeaderValue = `Token ${token}`;
                console.log('✅ General Token Authentication SUCCESSFUL!');
                console.log(`Token received (truncated): ${token.substring(0, 30)}...`);
            }
        } catch (err) {
            console.error('❌ General Token Auth failed too. Message:', err.message);
            if (err.response) {
                console.error('Response data:', err.response.data);
            }
            console.error('\nCould not authenticate with ZKBio Time. Please verify network access, URL, and credentials.');
            process.exit(1);
        }
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': authHeaderValue
    };

    // 3. Fetch Departments (Organizational Structure)
    console.log('\n--------------------------------------------------');
    console.log('FETCHING DEPARTMENTS (ORGANIZATIONAL STRUCTURE)');
    console.log('--------------------------------------------------');
    try {
        const res = await axios.get(`${BASE_URL}/personnel/api/departments/`, { headers, timeout: 15000 });
        console.log(`✅ Departments fetched successfully!`);
        console.log(`Total Count reported by API: ${res.data.count}`);
        
        const depts = res.data.data || [];
        console.log(`Retrieved ${depts.length} department records on this page:`);
        depts.forEach(d => {
            console.log(`  - [ID: ${d.id}] Code: ${d.dept_code} | Name: ${d.dept_name} | Parent: ${d.parent_dept || 'None'}`);
        });
    } catch (err) {
        console.error('❌ Failed to fetch departments:', err.message);
        if (err.response) console.error('Response:', err.response.data);
    }

    // 4. Fetch Employees
    console.log('\n--------------------------------------------------');
    console.log('FETCHING EMPLOYEES');
    console.log('--------------------------------------------------');
    try {
        const res = await axios.get(`${BASE_URL}/personnel/api/employees/`, { headers, timeout: 15000 });
        console.log(`✅ Employees fetched successfully!`);
        console.log(`Total Count reported by API: ${res.data.count}`);
        
        const emps = res.data.data || [];
        console.log(`Retrieved ${emps.length} employee records on this page:`);
        emps.forEach(emp => {
            const deptName = emp.department ? emp.department.dept_name : 'No Department';
            const areaNames = emp.area ? emp.area.map(a => a.area_name).join(', ') : 'No Area';
            console.log(`  - [ID: ${emp.id}] Code: ${emp.emp_code} | Name: ${emp.first_name} ${emp.last_name || ''} | Dept: ${deptName} | Areas: ${areaNames}`);
        });
    } catch (err) {
        console.error('❌ Failed to fetch employees:', err.message);
        if (err.response) console.error('Response:', err.response.data);
    }

    console.log('\n==================================================');
    console.log('INTEGRATION TEST FINISHED');
    console.log('==================================================');
    process.exit(0);
}

testZKBioTimeConnection();
