// js/salarySheet.js
import { $, customAlert, closeModal } from './utils.js';

export function setupSalarySheetModal(getEmployeesFunc) {
    const modal = $('attendanceModal');
    const form = $('attendanceForm');
    const cancelBtn = $('cancelAttendanceModal');
    const triggerBtn = $('uploadAttendanceBtn');
    // ... (rest of setupSalarySheetModal function remains unchanged) ...
    // ... (rest of setupSalarySheetModal function remains unchanged) ...
    // ... (rest of setupSalarySheetModal function remains unchanged) ...
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
                // Critical check for global libraries
                if (typeof Papa === 'undefined' || typeof ExcelJS === 'undefined' || typeof JSZip === 'undefined') {
                    throw new Error("Initialization Error: Required libraries (PapaParse, ExcelJS, JSZip) are not loaded. Please check index.html.");
                }

                const employees = getEmployeesFunc();
                if (!employees || employees.length === 0) {
                    throw new Error("No employee data found in the system.");
                }

                const attendanceData = await parseCSV(attendanceFile);
                const holderData = await parseCSV(holderFile);

                validateAttendanceHeaders(attendanceData);
                validateHolderHeaders(holderData);

                customAlert("Processing", "Generating report project wise sheets...");

                const zipContent = await generateProjectWiseZip(employees, attendanceData, holderData, monthVal);

                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipContent);
                link.download = `Salary_Reports_${monthVal}.zip`;
                link.click();
                URL.revokeObjectURL(link.href);

                closeModal('attendanceModal');
                customAlert("Success", "Salary Reports generated successfully.");

            } catch (error) {
                console.error("GENERATION FAILED:", error);
                customAlert("Generation Error", error.message || "An unknown error occurred during file generation.");
            }
        });
    }
}

// --- Helpers (unchanged) ---

function parseCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => {
            if (!results || !Array.isArray(results.data)) {
                return resolve([]);
            }
            resolve(results.data.filter(row => row !== null && typeof row === 'object'));
        }, error: (err) => reject(err) });
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

function convertNumberToWords(amount) {
    const a = ['','One ','Two ','Three ','Four ','Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
    const b = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

    const numToWords = (n) => {
        if ((n = n.toString()).length > 9) return 'overflow';
        let n_array = ('000000000' + n).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n_array) return;
        let str = '';
        str += (n_array[1] != 0) ? (a[Number(n_array[1])] || b[n_array[1][0]] + ' ' + a[n_array[1][1]]) + 'Crore ' : '';
        str += (n_array[2] != 0) ? (a[Number(n_array[2])] || b[n_array[2][0]] + ' ' + a[n_array[2][1]]) + 'Lakh ' : '';
        str += (n_array[3] != 0) ? (a[Number(n_array[3])] || b[n_array[3][0]] + ' ' + a[n_array[3][1]]) + 'Thousand ' : '';
        str += (n_array[4] != 0) ? (a[Number(n_array[4])] || b[n_array[4][0]] + ' ' + a[n_array[4][1]]) + 'Hundred ' : '';
        str += (n_array[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n_array[5])] || b[n_array[5][0]] + ' ' + a[n_array[5][1]]) + '' : '';
        return str;
    };

    return numToWords(Math.floor(amount)) + "Only";
}

function getFormattedMonthYear(dateStr) {
    const date = new Date(dateStr + "-01");
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    return { month, year, full: `${month}-${year}`, quote: `${month}'${year}` };
}

// --- MAIN GENERATION LOGIC ---

// Helper to normalize Employee IDs for matching (remove spaces, ensure uppercase)
const normalizeId = (id) => {
    if (!id) return '';
    return String(id).toUpperCase().replace(/\s/g, '').replace(/[^\w-]/g, ''); // Remove all spaces and non-alphanumeric/hyphen characters
};


async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal) {
    const zip = new JSZip();
    const { month, year, full, quote } = getFormattedMonthYear(monthVal);
    const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '.');

    const accountingFmt = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';

    // 1. Maps (Using normalizeId for keys)
    const attMap = {};
    attendanceData.forEach(row => {
        const cleanRow = {};
        for(let k in row) cleanRow[k.toLowerCase().trim()] = row[k];
        attMap[normalizeId(cleanRow['employeeid'])] = cleanRow; // Key: Normalized ID
    });

    const holderMap = {};
    holderData.forEach(row => {
        const cleanRow = {};
        for(let k in row) cleanRow[k.toLowerCase().trim()] = row[k];
        const key = `${String(cleanRow['reportproject']).trim().toLowerCase()}|${String(cleanRow['subcenter']).trim().toLowerCase()}`;
        holderMap[key] = { name: cleanRow['accountableemployeename'], id: normalizeId(cleanRow['accountableemployeeid']) }; // Value: Normalized ID
    });

    const allEmpMap = {};
    employees.forEach(e => { allEmpMap[normalizeId(e.employeeId)] = e; }); // Key: Normalized ID

    // 2. Grouping
    const projectGroups = {};

    employees.forEach((emp, index) => {
        try {
            if (!emp || !emp.employeeId) return;

            const empId = normalizeId(emp.employeeId); // Use Normalized ID for lookup

            const attRow = attMap[empId]; // Lookup with Normalized ID
            if (!attRow) return;

            const project = emp.reportProject || 'Unknown';
            const subCenter = emp.subCenter || 'General';

            if (!projectGroups[project]) projectGroups[project] = {};
            if (!projectGroups[project][subCenter]) projectGroups[project][subCenter] = [];

            const getVal = (val) => parseFloat(val) || 0;

            const totalDays = getVal(attRow['total working days']);
            const holidays = getVal(attRow['holidays']);
            const leave = getVal(attRow['availing leave']);
            const lwpDays = getVal(attRow['lwp']);
            const actualPresent = getVal(attRow['actual present']);
            const netPresent = getVal(attRow['net present']);

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
                lwpAmt: getVal(emp.lwp),
                cpf: getVal(emp.cpf),
                adj: getVal(emp.othersAdjustment)
            };

            let attDed = 0;
            if (totalDays > 0 && netPresent < totalDays) {
                attDed = (grossSalary / totalDays) * (totalDays - netPresent);
            }
            attDed = Math.round(attDed);
            const totalDeduction = Object.values(deductions).reduce((a, b) => a + b, 0) + attDed;
            const netPayment = Math.round(grossPayable - totalDeduction);

            let finalAccountNo = emp.bankAccount;
            let remarksText = "";
            let paymentType = "Bank";

            const holderKey = `${String(project).toLowerCase().trim()}|${String(subCenter).toLowerCase().trim()}`;
            const holderInfo = holderMap[holderKey];

            if (!finalAccountNo || finalAccountNo.trim() === '') {
                paymentType = "Cash (Holder)";
                if (holderInfo && holderInfo.id) {
                    const holderEmp = allEmpMap[holderInfo.id]; // Lookup with Normalized ID
                    if (holderEmp && holderEmp.bankAccount) {
                        finalAccountNo = holderEmp.bankAccount;
                        remarksText = `Pay to: ${holderInfo.name} (${holderInfo.id})`;
                    } else {
                        remarksText = `Holder: ${holderInfo.name} (No Acc Found)`;
                    }
                }
            }

            projectGroups[project][subCenter].push({
                ...emp,
                finalAccountNo,
                remarksText,
                paymentType,
                holderId: holderInfo ? holderInfo.id : null,
                att: { totalDays, holidays, leave, lwpDays, actualPresent, netPresent },
                earn: { grossSalary, ...earnings, grossPayable },
                ded: { ...deductions, attDed, totalDeduction },
                netPayment
            });

        } catch (e) {
            // Re-throw the error with context to halt the process
            throw new Error(`CRASH: Processing Emp ID ${emp ? emp.employeeId : 'UNKNOWN'} at index ${index}. Details: ${e.message}`);
        }
    });

    // 3. Generate Excel per Project

    const projectEntries = Object.entries(projectGroups);

    if (projectEntries.length === 0) {
        throw new Error("No employees processed. Check attendance file mapping or filters.");
    }

    for (const [project, subCenters] of projectEntries) {
        if (typeof ExcelJS === 'undefined') {
            throw new Error("ExcelJS is not defined. Cannot proceed with workbook generation.");
        }
        const workbook = new ExcelJS.Workbook();

        // ==================================================
        // 1. SALARY SHEET
        // ==================================================
        const sheet = workbook.addWorksheet('Salary Sheet');

        // Freeze and setup widths
        sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];
        sheet.columns.forEach((col, colNumber) => {
            if (colNumber >= 10 && colNumber <= 38) col.width = 11.18;
            if (colNumber === 41) col.width = 11.55;
        });

        // --- HEADERS --- (UNCHANGED LOGIC)
        // ... (Header Rows 1-4 and styling) ...

        // --- BODY ---
        let sl = 1;
        const sortedSubCenters = Object.keys(subCenters).sort();
        let projectGrandTotal = 0;

        for (const scName of sortedSubCenters) {
            const scEmployees = subCenters[scName];

            // Subcenter Header Row (UNCHANGED LOGIC)
            // ...

            let scTotalNet = 0;

            scEmployees.forEach(d => {
                scTotalNet += d.netPayment;
                projectGrandTotal += d.netPayment;

                const r = sheet.addRow([
                    sl++, d.employeeId, d.name, d.designation, d.functionalRole, d.joiningDate,
                    d.project, d.projectOffice, d.reportProject, d.subCenter,
                    d.att.totalDays, d.att.holidays, d.att.leave, d.att.lwpDays, d.att.actualPresent, d.att.netPresent,
                    d.previousSalary || 0, d.earn.grossSalary * 0.6, d.earn.grossSalary * 0.4, d.earn.grossSalary,
                    d.earn.maint, d.earn.laptop, d.earn.others, d.earn.arrear, d.earn.food, d.earn.station, d.earn.hardship, d.earn.grossPayable,
                    0,
                    d.ded.lunch, d.ded.tds, d.ded.bike, d.ded.welfare, d.ded.loan, d.ded.vehicle, d.ded.lwpAmt, d.ded.cpf, d.ded.adj, d.ded.attDed, d.ded.totalDeduction,
                    d.netPayment,
                    d.finalAccountNo, d.paymentType, d.remarksText
                ]);

                r.eachCell((c, colNum) => {
                    c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

                    if (colNum >= 17 && colNum <= 40) {
                        c.numFmt = accountingFmt;
                    }

                    if(colNum === 3 || colNum === 43) c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                });
            });

            // Subcenter Total (UNCHANGED LOGIC)
            // ...
        }

        // ==================================================
        // 2. ADVICE SHEET (UNCHANGED LOGIC)
        // ... (rest of Advice sheet generation logic) ...

        const buffer = await workbook.xlsx.writeBuffer();
        const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
    }

    return zip.generateAsync({ type: "blob" });
}