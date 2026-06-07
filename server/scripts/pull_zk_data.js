const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://27.147.131.46';
const USERNAME = 'mpl_it_2';
const PASSWORD = 'Mpl@2026';

async function pullZKBioTimeData() {
    console.log('==================================================');
    console.log('ZKBIO TIME PULL WORKER - STRUCTURE & EMPLOYEES');
    console.log('==================================================');

    let token = null;
    let authHeaderValue = null;

    // 1. Authenticate with ZKBio Time (JWT)
    try {
        console.log(`Authenticating...`);
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
            console.log('✅ Authentication successful!');
        }
    } catch (err) {
        console.log('⚠️  JWT Auth failed, trying General Token Auth...');
        try {
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
                console.log('✅ Token Authentication successful!');
            }
        } catch (authErr) {
            console.error('❌ Failed to authenticate with both JWT and Token schemes.');
            process.exit(1);
        }
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': authHeaderValue
    };

    // Helper: Paginated GET
    async function fetchAllPages(endpoint, entityName) {
        let results = [];
        let url = `${BASE_URL}${endpoint}`;
        let page = 1;

        console.log(`\nFetching ${entityName} records...`);
        while (url) {
            process.stdout.write(`  Pulling page ${page}... `);
            try {
                const response = await axios.get(url, { headers, timeout: 20000 });
                const count = response.data.count;
                const pageData = response.data.data || [];
                
                results = results.concat(pageData);
                console.log(`Loaded ${pageData.length} records (Total retrieved: ${results.length}/${count})`);

                // Get next page URL
                url = response.data.next;
                // ZKBio Time next link is sometimes relative or needs host mapping
                if (url && !url.startsWith('http')) {
                    url = `${BASE_URL}${url}`;
                }
                page++;
            } catch (err) {
                console.log(`\n❌ Error fetching ${entityName} at page ${page}: ${err.message}`);
                break;
            }
        }
        return results;
    }

    // 2. Pull Departments (Structure)
    const departments = await fetchAllPages('/personnel/api/departments/', 'Departments');
    
    // Save Departments JSON
    const deptsPath = path.join(__dirname, 'zk_departments.json');
    fs.writeFileSync(deptsPath, JSON.stringify(departments, null, 4));
    console.log(`💾 Departments structure saved to ${deptsPath}`);

    // 3. Pull Employees
    const employees = await fetchAllPages('/personnel/api/employees/', 'Employees');
    
    // Save Employees JSON
    const empsPath = path.join(__dirname, 'zk_employees.json');
    fs.writeFileSync(empsPath, JSON.stringify(employees, null, 4));
    console.log(`💾 Employee records saved to ${empsPath}`);

    // 4. Output Summary Report
    console.log('\n==================================================');
    console.log('SUMMARIZING ZKBIO TIME STRUCTURE');
    console.log('==================================================');
    console.log(`Total Departments Pulled: ${departments.length}`);
    console.log(`Total Employees Pulled:   ${employees.length}`);

    // Department Breakdown
    const deptCounts = {};
    employees.forEach(emp => {
        const dName = emp.department ? emp.department.dept_name : 'Unassigned';
        deptCounts[dName] = (deptCounts[dName] || 0) + 1;
    });

    console.log('\nEmployee Count by Department:');
    Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).forEach(([dept, cnt]) => {
        console.log(`  - ${dept.padEnd(25)}: ${cnt} employees`);
    });

    console.log('\n==================================================');
    console.log('PULL WORK COMPLETED SUCCESSFULLY!');
    console.log('==================================================');
    process.exit(0);
}

pullZKBioTimeData();
