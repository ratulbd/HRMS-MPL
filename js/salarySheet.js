// js/salarySheet.js
import { $, customAlert, closeModal, formatDateForDisplay } from './utils.js';

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

                // 3. Generate Salary Data
                const workbook = await generateSalaryExcel(employees, attendanceData, holderData, monthVal);

                // 4. Download
                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `Salary_Sheet_${monthVal}.xlsx`;
                anchor.click();
                window.URL.revokeObjectURL(url);

                closeModal('attendanceModal');
                customAlert("Success", "Salary Sheet and Advice generated successfully.");

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
    const required = ['employeeid', 'employeename', 'total working days', 'holidays', 'availing leave', 'lwp', 'actual present', 'net present'];
    const headers = Object.keys(data[0]).map(k => k.toLowerCase().trim());
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length > 0) throw new Error(`Attendance file missing columns: ${missing.join(', ')}`);
}

function validateHolderHeaders(data) {
    if (!data || data.length === 0) throw new Error("Common Account Holder file is empty.");
    const required = ['reportproject', 'subcenter', 'accountableemployeename', 'accountableemployeeid'];
    const headers = Object.keys(data[0]).map(k => k.toLowerCase().trim());
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length > 0) throw new Error(`Common Account Holder file missing columns: ${missing.join(', ')}`);
}

// --- Main Generation Logic ---

async function generateSalaryExcel(employees, attendanceData, holderData, monthVal) {
    const workbook = new ExcelJS.Workbook();

    // === CORRECTION: Sheet Name is now generic "Salary Sheet" ===
    const sheet = workbook.addWorksheet('Salary Sheet');

    // Create Lookup Maps
    const attMap = {};
    attendanceData.forEach(row => {
        const cleanRow = {};
        for(let k in row) cleanRow[k.toLowerCase().trim()] = row[k];
        attMap[String(cleanRow['employeeid']).trim()] = cleanRow;
    });

    // Key format: "PROJECT|SUBCENTER"
    const holderMap = {};
    holderData.forEach(row => {
        const cleanRow = {};
        for(let k in row) cleanRow[k.toLowerCase().trim()] = row[k];

        const key = `${String(cleanRow['reportproject']).trim().toLowerCase()}|${String(cleanRow['subcenter']).trim().toLowerCase()}`;
        holderMap[key] = {
            name: cleanRow['accountableemployeename'],
            id: cleanRow['accountableemployeeid']
        };
    });

    // Define Columns
    sheet.columns = [
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

        // Attendance Columns
        { header: 'Total Working Days', key: 'totalDays', width: 12 },
        { header: 'Holidays', key: 'holidays', width: 10 },
        { header: 'Availing Leave', key: 'availingLeave', width: 12 },
        { header: 'LWP (Days)', key: 'lwpDays', width: 10 },
        { header: 'Actual Present', key: 'actualPresent', width: 12 },
        { header: 'Net Present', key: 'netPresent', width: 12 },

        // Earnings
        { header: 'Gross Salary', key: 'gross', width: 12 },
        { header: 'Motobike/Car Maint.', key: 'maint', width: 15 },
        { header: 'Laptop Rent', key: 'laptop', width: 12 },
        { header: 'Others Allowance', key: 'otherAllow', width: 15 },
        { header: 'Arrear', key: 'arrear', width: 10 },
        { header: 'Food Allowance', key: 'food', width: 12 },
        { header: 'Station Allowance', key: 'station', width: 12 },
        { header: 'Hardship Allowance', key: 'hardship', width: 12 },

        { header: 'Gross Payable Salary', key: 'grossPayable', width: 18, style: { font: { bold: true } } },

        // Deductions
        { header: 'Subsidized Lunch', key: 'ded_lunch', width: 12 },
        { header: 'TDS', key: 'ded_tds', width: 10 },
        { header: 'Motorbike Loan', key: 'ded_bike', width: 12 },
        { header: 'Welfare Fund', key: 'ded_welfare', width: 12 },
        { header: 'Salary/Others Loan', key: 'ded_loan', width: 15 },
        { header: 'Subsidized Vehicle', key: 'ded_vehicle', width: 12 },
        { header: 'LWP (Amount)', key: 'ded_lwp', width: 12 },
        { header: 'CPF', key: 'ded_cpf', width: 10 },
        { header: 'Others Adjustment', key: 'ded_adj', width: 15 },
        { header: 'Attendance Deduction', key: 'ded_attendance', width: 15 },

        { header: 'Total Deduction', key: 'totalDeduction', width: 15, style: { font: { bold: true } } },
        { header: 'Net Payment', key: 'netPayment', width: 15, style: { font: { bold: true }, fill: { type: 'pattern', pattern:'solid', fgColor:{argb:'FFFFE0'} } } },
        { header: 'Remarks', key: 'remarks', width: 20 }
    ];

    const adviceRows = [];

    employees.forEach(emp => {
        const attRow = attMap[String(emp.employeeId)];
        if (!attRow) return; // Skip if not in attendance file

        // --- 1. Attendance Data ---
        const totalDays = parseFloat(attRow['total working days']) || 0;
        const holidays = parseFloat(attRow['holidays']) || 0;
        const leave = parseFloat(attRow['availing leave']) || 0;
        const lwpDays = parseFloat(attRow['lwp']) || 0;
        const actualPresent = parseFloat(attRow['actual present']) || 0;
        const netPresent = parseFloat(attRow['net present']) || 0;

        // --- 2. Common Holder Data ---
        const holderKey = `${String(emp.reportProject || '').toLowerCase().trim()}|${String(emp.subCenter || '').toLowerCase().trim()}`;
        const holderInfo = holderMap[holderKey] || { name: '', id: '' };

        // --- 3. Financial Helper ---
        const getVal = (val) => parseFloat(val) || 0;

        // Earnings
        const grossSalary = getVal(emp.salary);
        const earningParts = {
            maint: getVal(emp.motobikeCarMaintenance),
            laptop: getVal(emp.laptopRent),
            otherAllow: getVal(emp.othersAllowance),
            arrear: getVal(emp.arrear),
            food: getVal(emp.foodAllowance),
            station: getVal(emp.stationAllowance),
            hardship: getVal(emp.hardshipAllowance)
        };

        const grossPayable = grossSalary +
                             earningParts.maint +
                             earningParts.laptop +
                             earningParts.otherAllow +
                             earningParts.arrear +
                             earningParts.food +
                             earningParts.station +
                             earningParts.hardship;

        // --- 4. Deductions Logic ---
        const dedParts = {
            lunch: getVal(emp.subsidizedLunch),
            tds: getVal(emp.tds),
            bike: getVal(emp.motorbikeLoan),
            welfare: getVal(emp.welfareFund),
            loan: getVal(emp.salaryOthersLoan),
            vehicle: getVal(emp.subsidizedVehicle),
            lwp: getVal(emp.lwp),
            cpf: getVal(emp.cpf),
            adj: getVal(emp.othersAdjustment)
        };

        // Calculated Attendance Deduction
        let attendanceDeduction = 0;
        if (totalDays > 0 && netPresent < totalDays) {
            const dailyRate = grossSalary / totalDays;
            const absentDays = totalDays - netPresent;
            attendanceDeduction = dailyRate * absentDays;
        }
        attendanceDeduction = Math.round(attendanceDeduction * 100) / 100;

        const totalDeduction = dedParts.lunch + dedParts.tds + dedParts.bike +
                               dedParts.welfare + dedParts.loan + dedParts.vehicle +
                               dedParts.lwp + dedParts.cpf + dedParts.adj +
                               attendanceDeduction;

        const netPayment = grossPayable - totalDeduction;

        // --- 5. Add Row to Sheet ---
        sheet.addRow({
            id: emp.employeeId,
            name: emp.name,
            designation: emp.designation,
            project: emp.project,
            projectOffice: emp.projectOffice,
            reportProject: emp.reportProject,
            subCenter: emp.subCenter,

            holderName: holderInfo.name,
            holderId: holderInfo.id,

            accountNo: emp.bankAccount || '',
            bankName: '',
            routeNo: '',

            totalDays: totalDays,
            holidays: holidays,
            availingLeave: leave,
            lwpDays: lwpDays,
            actualPresent: actualPresent,
            netPresent: netPresent,

            gross: grossSalary,
            maint: earningParts.maint,
            laptop: earningParts.laptop,
            otherAllow: earningParts.otherAllow,
            arrear: earningParts.arrear,
            food: earningParts.food,
            station: earningParts.station,
            hardship: earningParts.hardship,

            grossPayable: grossPayable,

            ded_lunch: dedParts.lunch,
            ded_tds: dedParts.tds,
            ded_bike: dedParts.bike,
            ded_welfare: dedParts.welfare,
            ded_loan: dedParts.loan,
            ded_vehicle: dedParts.vehicle,
            ded_lwp: dedParts.lwp,
            ded_cpf: dedParts.cpf,
            ded_adj: dedParts.adj,
            ded_attendance: attendanceDeduction,

            totalDeduction: totalDeduction,
            netPayment: netPayment,
            remarks: ''
        });

        // Add to Advice List
        adviceRows.push({
            id: emp.employeeId,
            name: emp.name,
            accountNo: emp.bankAccount || '',
            amount: netPayment,
            remarks: ''
        });
    });

    // === SHEET 2: Advice ===
    const adviceSheet = workbook.addWorksheet('Advice');
    adviceSheet.columns = [
        { header: 'SL', key: 'sl', width: 8 },
        { header: 'ID', key: 'id', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Account No', key: 'account', width: 20 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Remarks', key: 'remarks', width: 20 }
    ];

    adviceRows.forEach((row, index) => {
        adviceSheet.addRow({
            sl: index + 1,
            id: row.id,
            name: row.name,
            account: row.accountNo,
            amount: row.amount,
            remarks: row.remarks
        });
    });

    return workbook;
}