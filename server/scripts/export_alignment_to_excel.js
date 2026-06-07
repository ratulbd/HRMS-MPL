const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mongoose = require('mongoose');
require('dotenv').config();

// Configuration
const ZK_FILE_PATH = path.join(__dirname, 'zk_employees.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'Biometric_Alignment_Report.xlsx');
const MONGO_URI = process.env.MONGO_URI;
const DB_TIMEOUT_MS = 5000;

const mockEmployees = [
    {
        _id: "60c72b2f9b1d8e2b8c9d1234",
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
        
        await Promise.race([
            connectPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), DB_TIMEOUT_MS))
        ]);

        connectionSuccess = true;
        console.log('✅ Connected to MongoDB. Fetching local employees...');
        const Employee = require('./models/Employee');
        localEmployees = await Employee.find().lean();
        console.log(`Fetched ${localEmployees.length} local employees.`);
    } catch (err) {
        console.log('⚠️  Database connection failed or timed out. Falling back to static mock data.');
        localEmployees = mockEmployees;
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

function generateReport(localEmployees, zkEmployees) {
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

    const matchedData = [];
    const mismatchedData = [];
    const missingInZK = [];
    const missingLocally = [];

    // 1. Compare local HRMS with Biometrics
    localEmployees.forEach(localEmp => {
        const localId = String(localEmp.employeeId).trim();
        const zkEmp = zkMap.get(localId);

        if (zkEmp) {
            const mismatchReasons = [];
            const zkFullName = (zkEmp.full_name || `${zkEmp.first_name || ''} ${zkEmp.last_name || ''}`).trim();
            const zkAreas = zkEmp.area ? zkEmp.area.map(a => a.area_name).join(', ') : '';

            // Compare Name
            const normLocalName = normalizeName(localEmp.name);
            const normZkName = normalizeName(zkFullName);
            let nameMatch = normLocalName.includes(normZkName) || normZkName.includes(normLocalName);
            if (!nameMatch && zkEmp.first_name) {
                nameMatch = normLocalName.includes(normalizeName(zkEmp.first_name));
            }
            if (!nameMatch) {
                mismatchReasons.push(`Name Mismatch: HRMS="${localEmp.name}" vs Biometric="${zkFullName}"`);
            }

            // Compare Subcenter
            const localSubCenter = localEmp.subCenter;
            const hasAreaMatch = zkEmp.area ? zkEmp.area.some(a => 
                localSubCenter.toLowerCase().includes(a.area_name.toLowerCase()) || 
                a.area_name.toLowerCase().includes(localSubCenter.toLowerCase())
            ) : false;

            if (!hasAreaMatch && localSubCenter !== 'N/A') {
                mismatchReasons.push(`Subcenter Mismatch: HRMS="${localSubCenter}" vs Biometric=[${zkAreas}]`);
            }

            if (mismatchReasons.length > 0) {
                mismatchedData.push({
                    "Employee ID": localId,
                    "HRMS Name": localEmp.name,
                    "ZK Name": zkFullName,
                    "HRMS Subcenter": localSubCenter,
                    "ZK Areas": zkAreas,
                    "Mismatch Details": mismatchReasons.join(' | ')
                });
            } else {
                matchedData.push({
                    "Employee ID": localId,
                    "HRMS Name": localEmp.name,
                    "ZK Name": zkFullName,
                    "HRMS Subcenter": localSubCenter,
                    "ZK Areas": zkAreas,
                    "Status": "Aligned"
                });
            }
        } else {
            missingInZK.push({
                "Employee ID": localId,
                "Name": localEmp.name,
                "Designation": localEmp.designation || 'N/A',
                "Subcenter": localEmp.subCenter || 'N/A',
                "Status": localEmp.status || 'Active'
            });
        }
    });

    // 2. Find biometric records missing in local DB
    zkEmployees.forEach(zkEmp => {
        const zkId = String(zkEmp.emp_code).trim();
        if (zkId === '-9999' || !zkId) return;

        if (!localMap.has(zkId)) {
            const zkFullName = (zkEmp.full_name || `${zkEmp.first_name || ''} ${zkEmp.last_name || ''}`).trim();
            const zkAreas = zkEmp.area ? zkEmp.area.map(a => a.area_name).join(', ') : 'No Area';
            const deptName = zkEmp.department ? zkEmp.department.dept_name : 'No Dept';
            const position = zkEmp.position ? zkEmp.position.position_name : 'No Role';
            missingLocally.push({
                "Biometric ID (emp_code)": zkId,
                "Full Name": zkFullName,
                "Designation/Role": position,
                "ZK Department": deptName,
                "ZK Areas/Subcenters": zkAreas,
                "Hire Date": zkEmp.hire_date || 'N/A',
                "Mobile": zkEmp.mobile || 'N/A',
                "Email": zkEmp.email || 'N/A'
            });
        }
    });

    return { matchedData, mismatchedData, missingInZK, missingLocally };
}

async function main() {
    if (!fs.existsSync(ZK_FILE_PATH)) {
        console.error(`❌ Biometric data snapshot not found at: ${ZK_FILE_PATH}`);
        process.exit(1);
    }

    console.log('Loading biometric data snapshot...');
    const fileContent = fs.readFileSync(ZK_FILE_PATH, 'utf8');
    const zkEmployees = JSON.parse(fileContent);

    const localEmployees = await loadLocalEmployees();
    const { matchedData, mismatchedData, missingInZK, missingLocally } = generateReport(localEmployees, zkEmployees);

    console.log('Creating Excel Workbook...');
    const wb = xlsx.utils.book_new();

    // Sheet 1: Summary Sheet
    const summaryRows = [
        ["Biometric Alignment & Verification Report", ""],
        ["Generated Date:", new Date().toLocaleString()],
        ["", ""],
        ["Report KPI Metric", "Count"],
        ["Total Local HRMS Employees", localEmployees.length],
        ["Total Biometric Server Records", zkEmployees.length],
        ["Fully Aligned & Matched Profiles", matchedData.length],
        ["Profile Mismatches (Name / Area mismatches)", mismatchedData.length],
        ["Missing locally (Registered in Biometrics, not in HRMS)", missingLocally.length],
        ["Missing in ZKBioTime (Registered in HRMS, not in Biometrics)", missingInZK.length]
    ];
    const wsSummary = xlsx.utils.aoa_to_sheet(summaryRows);
    xlsx.utils.book_append_sheet(wb, wsSummary, "Summary Overview");

    // Sheet 2: Profile Mismatches
    const wsMismatches = xlsx.utils.json_to_sheet(mismatchedData.length > 0 ? mismatchedData : [{
        "Employee ID": "N/A", "HRMS Name": "N/A", "ZK Name": "N/A", "HRMS Subcenter": "N/A", "ZK Areas": "N/A", "Mismatch Details": "No mismatches detected."
    }]);
    xlsx.utils.book_append_sheet(wb, wsMismatches, "Profile Mismatches");

    // Sheet 3: Missing Locally
    const wsMissingLocally = xlsx.utils.json_to_sheet(missingLocally);
    xlsx.utils.book_append_sheet(wb, wsMissingLocally, "Missing in HRMS DB");

    // Sheet 4: Missing in Biometrics
    const wsMissingInZK = xlsx.utils.json_to_sheet(missingInZK.length > 0 ? missingInZK : [{
        "Employee ID": "N/A", "Name": "N/A", "Designation": "N/A", "Subcenter": "N/A", "Status": "No records missing."
    }]);
    xlsx.utils.book_append_sheet(wb, wsMissingInZK, "Missing in Biometrics");

    // Sheet 5: Matched Records
    const wsMatched = xlsx.utils.json_to_sheet(matchedData.length > 0 ? matchedData : [{
        "Employee ID": "N/A", "HRMS Name": "N/A", "ZK Name": "N/A", "HRMS Subcenter": "N/A", "ZK Areas": "N/A", "Status": "No aligned records found."
    }]);
    xlsx.utils.book_append_sheet(wb, wsMatched, "Aligned Records");

    // Write file
    console.log(`Writing file to ${OUTPUT_PATH}...`);
    xlsx.writeFile(wb, OUTPUT_PATH);
    console.log(`✅ Excel report successfully exported to: ${OUTPUT_PATH}`);
}

main().catch(err => {
    console.error('Fatal Error:', err);
});
