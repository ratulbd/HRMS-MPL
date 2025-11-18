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

                const attendanceData = await parseCSV(attendanceFile);
                const holderData = await parseCSV(holderFile);

                validateAttendanceHeaders(attendanceData);
                validateHolderHeaders(holderData);

                customAlert("Processing", "Generating report project wise sheets...");

                // Pass monthVal to generation for the Title Row
                const zipContent = await generateProjectWiseZip(employees, attendanceData, holderData, monthVal);

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
        Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => resolve(results.data), error: (err) => reject(err) });
    });
}

function validateAttendanceHeaders(data) {
    if (!data || data.length === 0) throw new Error("Attendance file is empty.");
    const headers = Object.keys(data[0]).map(k => k.toLowerCase());
    if (!headers.some(h => h.includes('employeeid'))) throw new Error("Attendance file missing 'employeeId' column.");
}

function validateHolderHeaders(data) {
    if (!data || data.length === 0) throw new Error("Common Account Holder file is empty.");
    const headers = Object.keys(data[0]).map(k => k.toLowerCase());
    if (!headers.some(h => h.includes('accountableemployeeid'))) throw new Error("Account Holder file missing required columns.");
}

// --- MAIN GENERATION LOGIC ---

async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal) {
    const zip = new JSZip();

    // 1. Prepare Data Maps
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

    // Map of all employees to find Holder's Bank Account later
    const allEmpMap = {};
    employees.forEach(e => { allEmpMap[String(e.employeeId).trim()] = e; });

    // 2. Group by Project -> Then by Subcenter
    const projectGroups = {};

    employees.forEach(emp => {
        const attRow = attMap[String(emp.employeeId)];
        if (!attRow) return; // Skip non-attendance

        const project = emp.reportProject || 'Unknown';
        const subCenter = emp.subCenter || 'General';

        if (!projectGroups[project]) projectGroups[project] = {};
        if (!projectGroups[project][subCenter]) projectGroups[project][subCenter] = [];

        // Calculations
        const getVal = (val) => parseFloat(val) || 0;

        const totalDays = getVal(attRow['total working days']);
        const holidays = getVal(attRow['holidays']);
        const leave = getVal(attRow['availing leave']);
        const lwpDays = getVal(attRow['lwp']); // From Attendance
        const actualPresent = getVal(attRow['actual present']);
        const netPresent = getVal(attRow['net present']);

        // Financials
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

        const deductions = {
            lunch: getVal(emp.subsidizedLunch),
            tds: getVal(emp.tds),
            bike: getVal(emp.motorbikeLoan),
            welfare: getVal(emp.welfareFund),
            loan: getVal(emp.salaryOthersLoan),
            vehicle: getVal(emp.subsidizedVehicle),
            lwpAmt: getVal(emp.lwp), // From DB (Amount)
            cpf: getVal(emp.cpf),
            adj: getVal(emp.othersAdjustment)
        };

        let attDed = 0;
        if (totalDays > 0 && netPresent < totalDays) {
            attDed = (grossSalary / totalDays) * (totalDays - netPresent);
        }
        attDed = Math.round(attDed * 100) / 100;
        const totalDeduction = Object.values(deductions).reduce((a, b) => a + b, 0) + attDed;
        const netPayment = grossPayable - totalDeduction;

        // --- LOGIC: Common Account Holder ---
        let finalAccountNo = emp.bankAccount;
        let remarksText = "";

        // 1. Get Holder Info
        const holderKey = `${String(project).toLowerCase().trim()}|${String(subCenter).toLowerCase().trim()}`;
        const holderInfo = holderMap[holderKey];

        // 2. If No Personal Account, use Holder's Account
        if (!finalAccountNo || finalAccountNo.trim() === '') {
            if (holderInfo && holderInfo.id) {
                const holderEmp = allEmpMap[String(holderInfo.id).trim()];
                if (holderEmp && holderEmp.bankAccount) {
                    finalAccountNo = holderEmp.bankAccount; // Use Holder's Account for Advice
                    remarksText = `Pay to: ${holderInfo.name} (${holderInfo.id})`; // Remark for Sheet
                } else {
                    remarksText = `Holder: ${holderInfo.name} (No Acc Found)`;
                }
            }
        }

        projectGroups[project][subCenter].push({
            ...emp,
            finalAccountNo,
            remarksText,
            att: { totalDays, holidays, leave, lwpDays, actualPresent, netPresent },
            earn: { grossSalary, ...earnings, grossPayable },
            ded: { ...deductions, attDed, totalDeduction },
            netPayment
        });
    });

    // 3. Generate Excel Files
    for (const [project, subCenters] of Object.entries(projectGroups)) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Salary Sheet');

        // --- A. SHEET STYLING & COLUMNS ---
        // We define columns to map data, but we manually write headers for styling
        sheet.columns = [
            { key: 'sl', width: 6 }, { key: 'id', width: 10 }, { key: 'name', width: 22 }, { key: 'desig', width: 18 },
            { key: 'proj', width: 15 }, { key: 'off', width: 15 }, { key: 'rep', width: 15 }, { key: 'sub', width: 15 },
            { key: 'acc', width: 18 }, { key: 'bank', width: 15 }, { key: 'route', width: 10 },
            { key: 'td', width: 8 }, { key: 'hol', width: 8 }, { key: 'lv', width: 8 }, { key: 'lwp_d', width: 8 }, { key: 'act', width: 8 }, { key: 'net_p', width: 8 },
            { key: 'gr_sal', width: 12 }, { key: 'maint', width: 12 }, { key: 'lap', width: 12 }, { key: 'oth', width: 12 }, { key: 'arr', width: 12 },
            { key: 'food', width: 12 }, { key: 'stn', width: 12 }, { key: 'hard', width: 12 }, { key: 'gr_pay', width: 15 },
            { key: 'lunch', width: 12 }, { key: 'tds', width: 10 }, { key: 'bike', width: 12 }, { key: 'wel', width: 12 }, { key: 'loan', width: 12 },
            { key: 'veh', width: 12 }, { key: 'lwp_a', width: 12 }, { key: 'cpf', width: 10 }, { key: 'adj', width: 12 }, { key: 'att_ded', width: 12 },
            { key: 'tot_ded', width: 15 }, { key: 'net_pay', width: 15 }, { key: 'rem', width: 25 }
        ];

        // --- B. HEADER ROWS ---
        // Row 1: Title
        sheet.mergeCells('A1:AM1'); // A to 39th column
        const titleRow = sheet.getCell('A1');
        titleRow.value = "Metal Plus Limited";
        titleRow.font = { bold: true, size: 16, name: 'Calibri' };
        titleRow.alignment = { horizontal: 'center' };

        // Row 2: Subtitle
        sheet.mergeCells('A2:AM2');
        const subTitleRow = sheet.getCell('A2');
        subTitleRow.value = `Salary Sheet for the Month of ${monthVal}`;
        subTitleRow.font = { bold: true, size: 12, name: 'Calibri' };
        subTitleRow.alignment = { horizontal: 'center' };

        // Row 3: Actual Headers (Manual write for control)
        const headerValues = [
            "SL", "ID", "Name", "Designation", "Project", "Project Office", "Report Project", "Sub Center",
            "Account No", "Bank Name", "Route No",
            "Total Working Days", "Holidays", "Availing Leave", "LWP", "Actual Present", "Net Present",
            "Gross Salary", "Motobike / Car Maintenance Allowance", "Laptop Rent", "Others Allowance", "Arrear", "Food Allowance", "Station Allowance", "Hardship Allowance", "Gross Payable Salary",
            "Subsidized Lunch", "TDS", "Motorbike Loan", "Welfare Fund", "Salary/ Others Loan", "Subsidized Vehicle", "LWP", "CPF", "Others Adjustment", "Attendance Deduction", "Total Deduction",
            "Net Salary Payment", "Remarks"
        ];

        const headerRow = sheet.addRow(headerValues);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: '000000' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; // Greyish background
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        headerRow.height = 40; // Headers usually taller

        // --- C. DATA ROWS (Grouped by Subcenter) ---
        let slCounter = 1;

        // Sort Subcenters alphabetically
        const sortedSubCenters = Object.keys(subCenters).sort();

        for (const scName of sortedSubCenters) {
            const scEmployees = subCenters[scName];

            // 1. Sub-Center Header Row (Merged)
            const scRow = sheet.addRow([`Subcenter: ${scName}`]);
            const rowIdx = scRow.number;
            sheet.mergeCells(rowIdx, 1, rowIdx, 39); // Merge across all columns

            const scCell = scRow.getCell(1);
            scCell.font = { bold: true, color: { argb: '000000' } };
            scCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow background
            scCell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            scCell.alignment = { horizontal: 'left' };

            // 2. Employee Rows
            scEmployees.forEach(d => {
                const row = sheet.addRow({
                    sl: slCounter++,
                    id: d.employeeId, name: d.name, desig: d.designation,
                    proj: d.project, off: d.projectOffice, rep: d.reportProject, sub: d.subCenter,
                    acc: d.finalAccountNo, // Logic applied (Personal or Holder)
                    bank: '', route: '',

                    td: d.att.totalDays, hol: d.att.holidays, lv: d.att.leave, lwp_d: d.att.lwpDays,
                    act: d.att.actualPresent, net_p: d.att.netPresent,

                    gr_sal: d.earn.grossSalary, maint: d.earn.maint, lap: d.earn.laptop, oth: d.earn.others,
                    arr: d.earn.arrear, food: d.earn.food, stn: d.earn.station, hard: d.earn.hardship,
                    gr_pay: d.earn.grossPayable,

                    lunch: d.ded.lunch, tds: d.ded.tds, bike: d.ded.bike, wel: d.ded.welfare, loan: d.ded.loan,
                    veh: d.ded.vehicle, lwp_a: d.ded.lwpAmt, cpf: d.ded.cpf, adj: d.ded.adj, att_ded: d.ded.attDed,
                    tot_ded: d.ded.totalDeduction,

                    net_pay: d.netPayment,
                    rem: d.remarksText // "Pay to Holder..." or blank
                });

                // Apply borders to data row
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    cell.alignment = { vertical: 'middle' };
                });
            });
        }

        // --- D. ADVICE SHEET ---
        const adviceSheet = workbook.addWorksheet('Advice');
        adviceSheet.columns = [
            { header: 'SL', key: 'sl', width: 8 },
            { header: 'ID', key: 'id', width: 15 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Account No', key: 'account', width: 25 },
            { header: 'Amount', key: 'amount', width: 15 },
            { header: 'Remarks', key: 'remarks', width: 20 }
        ];

        // Flatten list for Advice (Sequence: Subcenter sorted)
        let adviceSL = 1;
        for (const scName of sortedSubCenters) {
             subCenters[scName].forEach(d => {
                adviceSheet.addRow({
                    sl: adviceSL++,
                    id: d.employeeId,
                    name: d.name,
                    account: d.finalAccountNo, // Crucial: Uses Holder info if employee blank
                    amount: d.netPayment,
                    remarks: ''
                });
             });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
    }

    return zip.generateAsync({ type: "blob" });
}