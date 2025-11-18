// js/salarySheet.js
import { $, customAlert, closeModal } from './utils.js';

export function setupSalarySheetModal(getEmployeesFunc) {
    const modal = $('attendanceModal');
    const form = $('attendanceForm');
    const cancelBtn = $('cancelAttendanceModal');
    const triggerBtn = $('uploadAttendanceBtn');

    if (triggerBtn) triggerBtn.addEventListener('click', () => {
        if (modal) {
            modal.classList.remove('hidden');
            form.reset();
        }
    });

    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        if (modal) modal.classList.add('hidden');
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const monthVal = $('salaryMonth').value; // YYYY-MM
            const attendanceFile = $('attendanceFile').files[0];
            const holderFile = $('accountabilityFile').files[0];

            if (!monthVal || !attendanceFile || !holderFile) {
                customAlert("Error", "Please select a month and upload both CSV files.");
                return;
            }

            try {
                const employees = getEmployeesFunc();
                if (!employees || employees.length === 0) {
                    throw new Error("No employee data found in the system.");
                }

                // 1. Parse CSVs
                const attendanceData = await parseCSV(attendanceFile);
                const holderData = await parseCSV(holderFile);

                // 2. Validate Headers
                validateAttendanceHeaders(attendanceData);
                validateHolderHeaders(holderData);

                // 3. Process Data & Generate ZIP
                customAlert("Processing", "Generating report project wise sheets...");
                const zipContent = await generateProjectWiseZip(employees, attendanceData, holderData, monthVal);

                // 4. Trigger Download
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipContent);
                link.download = `Salary_Reports_${monthVal}.zip`;
                link.click();
                URL.revokeObjectURL(link.href);

                closeModal('attendanceModal');
            } catch (error) {
                console.error(error);
                customAlert("Error", error.message);
            }
        });
    }
}

// --- Helpers ---

function parseCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (err) => reject(err)
        });
    });
}

function validateAttendanceHeaders(data) {
    if (!data || data.length === 0) throw new Error("Attendance file is empty.");
    const headers = Object.keys(data[0]).map(k => k.toLowerCase());
    const strictRequired = ['employeeid']; // Minimal check
    const missing = strictRequired.filter(r => !headers.includes(r));
    if (missing.length > 0) throw new Error(`Attendance file missing columns: ${missing.join(', ')}`);
}

function validateHolderHeaders(data) {
    if (!data || data.length === 0) throw new Error("Common Account Holder file is empty.");
    const required = ['reportproject', 'subcenter', 'accountableemployeename', 'accountableemployeeid'];
    const headers = Object.keys(data[0]).map(k => k.toLowerCase().trim());
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length > 0) throw new Error(`Common Account Holder file missing columns: ${missing.join(', ')}`);
}

// --- Core Generation Logic (Grouped by Project) ---

async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal) {
    const zip = new JSZip();

    // 1. Lookup Maps
    const attMap = {};
    attendanceData.forEach(row => {
        const cleanRow = {};
        for(let k in row) cleanRow[k.toLowerCase().trim()] = row[k];
        attMap[String(cleanRow['employeeid']).trim()] = cleanRow;
    });

    const holderMap = {};
    holderData.forEach(row => {
        const cleanRow = {};
        for(let k in row) cleanRow[k.toLowerCase().trim()] = row[k];
        const key = `${String(cleanRow['reportproject']).trim().toLowerCase()}|${String(cleanRow['subcenter']).trim().toLowerCase()}`;
        holderMap[key] = { name: cleanRow['accountableemployeename'], id: cleanRow['accountableemployeeid'] };
    });

    // 2. Employee Map (To find Holder's Bank Account)
    const employeeIdMap = {};
    employees.forEach(emp => {
        employeeIdMap[String(emp.employeeId).trim()] = emp;
    });

    // 3. Group Employees by Report Project
    const projectGroups = {};

    employees.forEach(emp => {
        const attRow = attMap[String(emp.employeeId)];
        if (!attRow) return; // Skip if not in attendance

        const project = emp.reportProject || 'Unknown_Project';
        if (!projectGroups[project]) projectGroups[project] = [];

        // --- Calculate Values ---
        const getVal = (val) => parseFloat(val) || 0;

        // Attendance
        const totalDays = getVal(attRow['total working days']);
        const holidays = getVal(attRow['holidays']);
        const leave = getVal(attRow['availing leave']);
        const lwpDays = getVal(attRow['lwp']);
        const actualPresent = getVal(attRow['actual present']);
        const netPresent = getVal(attRow['net present']);

        // Holder Info
        const holderKey = `${String(project).toLowerCase().trim()}|${String(emp.subCenter || '').toLowerCase().trim()}`;
        const holderInfo = holderMap[holderKey] || { name: '', id: '' };

        // --- BANK ACCOUNT LOGIC ---
        let finalAccountNo = emp.bankAccount || '';

        // If employee account is blank, look up Holder's account
        if (!finalAccountNo && holderInfo.id) {
            const holderObj = employeeIdMap[String(holderInfo.id).trim()];
            if (holderObj && holderObj.bankAccount) {
                finalAccountNo = holderObj.bankAccount;
            }
        }

        // Earnings
        const grossSalary = getVal(emp.salary);
        const earnings = {
            maint: getVal(emp.motobikeCarMaintenance),
            laptop: getVal(emp.laptopRent),
            others: getVal(emp.othersAllowance),
            arrear: getVal(emp.arrear),
            food: getVal(emp.foodAllowance),
            station: getVal(emp.stationAllowance),
            hardship: getVal(emp.hardshipAllowance)
        };
        const grossPayable = grossSalary + Object.values(earnings).reduce((a, b) => a + b, 0);

        // Deductions
        const deductions = {
            lunch: getVal(emp.subsidizedLunch),
            tds: getVal(emp.tds),
            bike: getVal(emp.motorbikeLoan),
            welfare: getVal(emp.welfareFund),
            loan: getVal(emp.salaryOthersLoan),
            vehicle: getVal(emp.subsidizedVehicle),
            lwpAmt: getVal(emp.lwp), // Amount from DB
            cpf: getVal(emp.cpf),
            adj: getVal(emp.othersAdjustment)
        };

        // Calc Attendance Deduction
        let attDed = 0;
        if (totalDays > 0 && netPresent < totalDays) {
            const dailyRate = grossSalary / totalDays;
            attDed = dailyRate * (totalDays - netPresent);
        }
        attDed = Math.round(attDed * 100) / 100;

        const totalDeduction = Object.values(deductions).reduce((a, b) => a + b, 0) + attDed;
        const netPayment = grossPayable - totalDeduction;

        // Push processed object
        projectGroups[project].push({
            ...emp,
            holderName: holderInfo.name,
            holderId: holderInfo.id,
            finalAccountNo: finalAccountNo, // Calculated account
            att: { totalDays, holidays, leave, lwpDays, actualPresent, netPresent },
            earn: { grossSalary, ...earnings, grossPayable },
            ded: { ...deductions, attDed, totalDeduction },
            netPayment
        });
    });

    // 4. Generate Excel for each Project
    for (const [project, empList] of Object.entries(projectGroups)) {
        const workbook = new ExcelJS.Workbook();

        // --- Sheet 1: Salary Sheet ---
        const sheet = workbook.addWorksheet('Salary Sheet');

        // STRICT HEADERS FROM Salary-Format.xlsx
        sheet.columns = [
            { header: 'SL', key: 'sl', width: 5 },
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Name', key: 'name', width: 20 },
            { header: 'Designation', key: 'designation', width: 15 },
            { header: 'Project', key: 'project', width: 15 },
            { header: 'Project Office', key: 'projectOffice', width: 15 },
            { header: 'Report Project', key: 'reportProject', width: 15 },
            { header: 'Sub Center', key: 'subCenter', width: 15 },
            { header: 'Common Account Holder Name', key: 'holderName', width: 20 },
            { header: 'Common Account Holder ID', key: 'holderId', width: 15 },
            { header: 'Account No', key: 'accountNo', width: 15 },
            { header: 'Bank Name', key: 'bankName', width: 15 },
            { header: 'Route No', key: 'routeNo', width: 10 },

            { header: 'Total Working Days', key: 'totalDays', width: 12 },
            { header: 'Holidays', key: 'holidays', width: 10 },
            { header: 'Availing Leave', key: 'availingLeave', width: 12 },
            { header: 'LWP', key: 'lwpDays', width: 10 }, // Days
            { header: 'Actual Present', key: 'actualPresent', width: 12 },
            { header: 'Net Present', key: 'netPresent', width: 12 },

            { header: 'Gross Salary', key: 'gross', width: 12 },
            { header: 'Motobike / Car Maintenance Allowance', key: 'maint', width: 20 },
            { header: 'Laptop Rent', key: 'laptop', width: 12 },
            { header: 'Others Allowance', key: 'others', width: 15 },
            { header: 'Arrear', key: 'arrear', width: 10 },
            { header: 'Food Allowance', key: 'food', width: 12 },
            { header: 'Station Allowance', key: 'station', width: 12 },
            { header: 'Hardship Allowance', key: 'hardship', width: 12 },
            { header: 'Gross Payable Salary', key: 'grossPayable', width: 15, style: { font: { bold: true } } },

            { header: 'Subsidized Lunch', key: 'lunch', width: 12 },
            { header: 'TDS', key: 'tds', width: 10 },
            { header: 'Motorbike Loan', key: 'bike', width: 12 },
            { header: 'Welfare Fund', key: 'welfare', width: 12 },
            { header: 'Salary/ Others Loan', key: 'loan', width: 15 },
            { header: 'Subsidized Vehicle', key: 'vehicle', width: 12 },
            { header: 'LWP', key: 'lwpAmt', width: 12 }, // Amount
            { header: 'CPF', key: 'cpf', width: 10 },
            { header: 'Others Adjustment', key: 'adj', width: 15 },
            { header: 'Attendance Deduction', key: 'attDed', width: 15 },
            { header: 'Total Deduction', key: 'totalDed', width: 15, style: { font: { bold: true } } },

            { header: 'Net Salary Payment', key: 'netPay', width: 15, style: { font: { bold: true }, fill: { type: 'pattern', pattern:'solid', fgColor:{argb:'FFFFE0'} } } },
            { header: 'Remarks', key: 'remarks', width: 20 }
        ];

        empList.forEach((d, index) => {
            sheet.addRow({
                sl: index + 1,
                id: d.employeeId,
                name: d.name,
                designation: d.designation,
                project: d.project,
                projectOffice: d.projectOffice,
                reportProject: d.reportProject,
                subCenter: d.subCenter,
                holderName: d.holderName,
                holderId: d.holderId,
                accountNo: d.finalAccountNo, // Using logic (Self or Holder)
                bankName: '',
                routeNo: '',

                totalDays: d.att.totalDays,
                holidays: d.att.holidays,
                availingLeave: d.att.leave,
                lwpDays: d.att.lwpDays,
                actualPresent: d.att.actualPresent,
                netPresent: d.att.netPresent,

                gross: d.earn.grossSalary,
                maint: d.earn.maint,
                laptop: d.earn.laptop,
                others: d.earn.others,
                arrear: d.earn.arrear,
                food: d.earn.food,
                station: d.earn.station,
                hardship: d.earn.hardship,
                grossPayable: d.earn.grossPayable,

                lunch: d.ded.lunch,
                tds: d.ded.tds,
                bike: d.ded.bike,
                welfare: d.ded.welfare,
                loan: d.ded.loan,
                vehicle: d.ded.vehicle,
                lwpAmt: d.ded.lwpAmt,
                cpf: d.ded.cpf,
                adj: d.ded.adj,
                attDed: d.ded.attDed,
                totalDed: d.ded.totalDeduction,

                netPay: d.netPayment,
                remarks: ''
            });
        });

        // --- Sheet 2: Advice ---
        const adviceSheet = workbook.addWorksheet('Advice');
        adviceSheet.columns = [
            { header: 'SL', key: 'sl', width: 5 },
            { header: 'ID', key: 'id', width: 15 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Account No', key: 'account', width: 20 },
            { header: 'Amount', key: 'amount', width: 15 },
            { header: 'Remarks', key: 'remarks', width: 20 }
        ];

        empList.forEach((d, index) => {
            adviceSheet.addRow({
                sl: index + 1,
                id: d.employeeId,
                name: d.name,
                account: d.finalAccountNo, // Using logic (Self or Holder)
                amount: d.netPayment,
                remarks: ''
            });
        });

        // Write to Buffer and Add to Zip
        const buffer = await workbook.xlsx.writeBuffer();
        const safeProjectName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        zip.file(`${safeProjectName}_${monthVal}.xlsx`, buffer);
    }

    return zip.generateAsync({ type: "blob" });
}