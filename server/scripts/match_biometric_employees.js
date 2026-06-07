const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Configuration
const ZK_FILE_PATH = path.join(__dirname, 'zk_employees.json');
const MONGO_URI = process.env.MONGO_URI;
const DB_TIMEOUT_MS = 5000; // 5 seconds connection timeout

const mockEmployees = [
    {
        _id: "60c72b2f9b1d8e2b8c9d1234",
        id: "60c72b2f9b1d8e2b8c9d1234",
        employeeId: "E001",
        name: "Ratul Islam",
        email: "ratul@metal.com",
        designation: "Software Engineer",
        project: "HRMS",
        subCenter: "Dhaka Center",
        status: "Active",
        employeeType: "Permanent",
        functionalRole: "IT Services",
        projectOffice: "Dhaka",
        reportProject: "HRMS",
        joiningDate: "2026-01-01"
    },
    {
        _id: "60c72b2f9b1d8e2b8c9d5678",
        id: "60c72b2f9b1d8e2b8c9d5678",
        employeeId: "E002",
        name: "John Doe",
        email: "john@metal.com",
        designation: "HR Specialist",
        project: "HRMS",
        subCenter: "Savar",
        status: "Active",
        employeeType: "Contractual",
        functionalRole: "HR & Admin",
        projectOffice: "Savar",
        reportProject: "HRMS",
        joiningDate: "2026-02-15"
    }
];

async function loadLocalEmployees() {
    let connectionSuccess = false;
    let localEmployees = [];

    console.log('Connecting to MongoDB...');
    try {
        const connectPromise = mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: DB_TIMEOUT_MS
        });
        
        // Wait for connection with a timeout
        await Promise.race([
            connectPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), DB_TIMEOUT_MS))
        ]);

        connectionSuccess = true;
        console.log('✅ Connected to MongoDB. Fetching local employees...');
        const Employee = require('./models/Employee');
        localEmployees = await Employee.find().lean();
        console.log(`Fetched ${localEmployees.length} local employees from Database.`);
    } catch (err) {
        console.log('⚠️  Database connection failed or timed out. Falling back to static mock data.');
        localEmployees = mockEmployees;
        console.log(`Loaded ${localEmployees.length} local employees from static mock data.`);
    } finally {
        if (connectionSuccess) {
            await mongoose.disconnect();
        }
    }
    return localEmployees;
}

function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[\s\.\-_]/g, '');
}

function runComparison(localEmployees, zkEmployees) {
    console.log('\n==================================================');
    console.log('RUNNING COMPARISON & ALIGNMENT ANALYZER');
    console.log('==================================================');

    // Create maps for quick lookup
    const localMap = new Map();
    localEmployees.forEach(emp => {
        localMap.set(String(emp.employeeId).trim(), emp);
    });

    const zkMap = new Map();
    zkEmployees.forEach(emp => {
        if (emp.emp_code) {
            zkMap.set(String(emp.emp_code).trim(), emp);
        }
    });

    const results = {
        totalLocal: localEmployees.length,
        totalZk: zkEmployees.length,
        matched: [],
        mismatched: [],
        missingLocally: [],
        missingInZk: []
    };

    // 1. Check local employees against ZK database
    localEmployees.forEach(localEmp => {
        const localId = String(localEmp.employeeId).trim();
        const zkEmp = zkMap.get(localId);

        if (zkEmp) {
            // Found in both systems! Let's check alignment
            const mismatchReasons = [];

            // Compare Name
            // ZKBioTime name can be first_name + last_name, nickname, full_name, or format_name.
            const zkFullName = (zkEmp.full_name || `${zkEmp.first_name || ''} ${zkEmp.last_name || ''}`).trim();
            const normLocalName = normalizeName(localEmp.name);
            const normZkName = normalizeName(zkFullName);
            
            let nameMatch = normLocalName.includes(normZkName) || normZkName.includes(normLocalName);
            if (!nameMatch && zkEmp.first_name) {
                const normFirstName = normalizeName(zkEmp.first_name);
                nameMatch = normLocalName.includes(normFirstName) || normFirstName.includes(normLocalName);
            }

            if (!nameMatch) {
                mismatchReasons.push(`Name Mismatch (HRMS: "${localEmp.name}" vs Biometric: "${zkFullName}")`);
            }

            // Compare Subcenter / Area
            const localSubCenter = localEmp.subCenter;
            const zkAreas = zkEmp.area ? zkEmp.area.map(a => a.area_name) : [];
            const areaMatch = zkAreas.some(area => 
                localSubCenter.toLowerCase().includes(area.toLowerCase()) || 
                area.toLowerCase().includes(localSubCenter.toLowerCase())
            );

            if (!areaMatch && localSubCenter !== 'N/A') {
                mismatchReasons.push(`Area/Subcenter Mismatch (HRMS: "${localSubCenter}" vs Biometric: [${zkAreas.join(', ') || 'No Area'}])`);
            }

            if (mismatchReasons.length > 0) {
                results.mismatched.push({
                    employeeId: localId,
                    localName: localEmp.name,
                    reasons: mismatchReasons
                });
            } else {
                results.matched.push({
                    employeeId: localId,
                    name: localEmp.name,
                    subCenter: localSubCenter
                });
            }
        } else {
            // Local employee is not registered in ZKBioTime
            results.missingInZk.push(localEmp);
        }
    });

    // 2. Check ZK employees against Local database
    zkEmployees.forEach(zkEmp => {
        const zkId = String(zkEmp.emp_code).trim();
        if (zkId === '-9999' || !zkId) return; // Skip test/system codes

        if (!localMap.has(zkId)) {
            results.missingLocally.push(zkEmp);
        }
    });

    return results;
}

function printReport(results) {
    console.log('\n==================================================');
    console.log('              ALIGNMENT REPORT SUMMARY            ');
    console.log('==================================================');
    console.log(`Total Local HRMS Employees:     ${results.totalLocal}`);
    console.log(`Total Biometric Employees:      ${results.totalZk}`);
    console.log(`Fully Aligned/Matched:          ${results.matched.length}`);
    console.log(`Profile Mismatches Detected:     ${results.mismatched.length}`);
    console.log(`Missing Locally (in HRMS DB):   ${results.missingLocally.length}`);
    console.log(`Missing in Biometrics Server:   ${results.missingInZk.length}`);
    console.log('==================================================\n');

    if (results.mismatched.length > 0) {
        console.log('🔴 PROFILE DATA MISMATCHES:');
        results.mismatched.forEach(item => {
            console.log(`  - [ID: ${item.employeeId}] ${item.localName}`);
            item.reasons.forEach(r => console.log(`      ⚠️  ${r}`));
        });
        console.log('');
    }

    if (results.missingInZk.length > 0) {
        console.log('🔴 EMPLOYEES REGISTERED IN HRMS BUT MISSING IN BIOMETRICS:');
        results.missingInZk.forEach(emp => {
            console.log(`  - [ID: ${emp.employeeId}] ${emp.name} (Subcenter: ${emp.subCenter})`);
        });
        console.log('');
    }

    if (results.missingLocally.length > 0) {
        console.log('🟡 BIOMETRIC EMPLOYEES NOT IMPORTED TO LOCAL HRMS DATABASE:');
        // Show first 15 records
        const countToShow = Math.min(15, results.missingLocally.length);
        for (let i = 0; i < countToShow; i++) {
            const zk = results.missingLocally[i];
            const fullName = (zk.full_name || `${zk.first_name || ''} ${zk.last_name || ''}`).trim();
            const deptName = zk.department ? zk.department.dept_name : 'No Dept';
            const areas = zk.area ? zk.area.map(a => a.area_name).join(', ') : 'No Area';
            console.log(`  - [ID: ${zk.emp_code}] ${fullName} | Dept: ${deptName} | Areas: [${areas}]`);
        }
        if (results.missingLocally.length > countToShow) {
            console.log(`  ... and ${results.missingLocally.length - countToShow} more records.`);
        }
        console.log('');
    }

    console.log('💡 RECOMMENDATION:');
    console.log('- To allow employees to punch in other subcenters, assign them to multiple Areas in ZKBioTime.');
    console.log('- Any employee flagged as "Missing Locally" can be imported to the local HRMS database to support synchronization.');
    console.log('- Ensure that the Employee ID matches the biometric "emp_code" exactly.');
    console.log('==================================================\n');
}

async function main() {
    // 1. Read ZK employee snapshot
    if (!fs.existsSync(ZK_FILE_PATH)) {
        console.error(`❌ Biometric data file not found at: ${ZK_FILE_PATH}`);
        console.error('Please run `node pull_zk_data.js` first to generate the biometric snapshot.');
        process.exit(1);
    }

    let zkEmployees = [];
    try {
        console.log(`Reading biometric snapshot from ${ZK_FILE_PATH}...`);
        const fileContent = fs.readFileSync(ZK_FILE_PATH, 'utf8');
        zkEmployees = JSON.parse(fileContent);
        console.log(`Loaded ${zkEmployees.length} employee records from snapshot.`);
    } catch (err) {
        console.error('❌ Error parsing zk_employees.json:', err.message);
        process.exit(1);
    }

    // 2. Load Local Employees
    const localEmployees = await loadLocalEmployees();

    // 3. Compare and Print Report
    const results = runComparison(localEmployees, zkEmployees);
    printReport(results);
}

main().catch(err => {
    console.error('Fatal Error:', err);
});
