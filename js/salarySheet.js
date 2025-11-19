// js/salarySheet.js
import { $, customAlert, closeModal } from './utils.js';

export function setupSalarySheetModal(getEmployeesFunc) {
    const modal = $('attendanceModal');
    const form = $('attendanceForm');
    const cancelBtn = $('cancelAttendanceModal');
    const triggerBtn = $('uploadAttendanceBtn');

    if (triggerBtn) {
        triggerBtn.addEventListener('click', () => {
            if (modal) {
                modal.classList.remove('hidden');
                form.reset();
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (modal) modal.classList.add('hidden');
        });
    }

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
                // Critical check for global libraries (UNCHANGED)
                if (typeof Papa === 'undefined' || typeof ExcelJS === 'undefined' || typeof JSZip === 'undefined') {
                    throw new Error("Initialization Error: Required libraries (PapaParse, ExcelJS, JSZip) are not loaded. Please check index.html.");
                }

                const employees = getEmployeesFunc();
                if (!employees || employees.length === 0) {
                    throw new Error("No employee data found in the system.");
                }

                // Parse CSVs
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

// --- Helpers (UNCHANGED) ---

function parseCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => {
            if (!results || !Array.isArray(results.data)) {
                return resolve([]);
            }
            // Filter out any rows that might have resulted in null/undefined during parsing
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

async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal) {
    const zip = new JSZip();
    const { month, year, full, quote } = getFormattedMonthYear(monthVal);
    const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '.');

    const accountingFmt = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';

    // 1. Maps
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

    const allEmpMap = {};
    employees.forEach(e => { allEmpMap[String(e.employeeId).trim()] = e; });

    // 2. Grouping
    const projectGroups = {};

    // --- START CRITICAL LOOP WITH LOGGING ---
    employees.forEach((emp, index) => {
        try {
            // LOGGING STEP 1: Identify current employee index
            console.log(`Processing employee index: ${index}. ID: ${emp?.employeeId}`);

            // Safety check 1: Ensure the employee object itself is valid
            if (!emp || !emp.employeeId) {
                console.warn(`Skipping invalid/null employee object at index ${index}.`);
                return;
            }

            const empId = String(emp.employeeId).trim();

            const attRow = attMap[empId];
            if (!attRow) return; // Skip if no attendance data

            const project = emp.reportProject || 'Unknown';
            const subCenter = emp.subCenter || 'General';

            if (!projectGroups[project]) projectGroups[project] = {};
            if (!projectGroups[project][subCenter]) projectGroups[project][subCenter] = [];

            const getVal = (val) => parseFloat(val) || 0;

            // LOGGING STEP 2: Checking Attendance Data Structure
            const totalDays = getVal(attRow['total working days']);

            // Check if vital data is being read as expected (this is often where null access begins)
            if (isNaN(totalDays) || totalDays === null) {
                 console.error(`CRASH POINT LOG: totalDays (Att) is invalid for Emp ID: ${empId}.`);
            }

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
                    const holderEmp = allEmpMap[String(holderInfo.id).trim()];
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
            // LOGGING STEP 3: Catch error in the loop and re-throw with context
            console.error(`--- CRASH DURING EMPLOYEE LOOP ---`);
            console.error(`Employee ID causing crash: ${emp ? emp.employeeId : 'UNKNOWN (NULL EMP OBJECT)'}`);
            console.error(`Error details: ${e.message}`);
            // Re-throw the error to halt the process and show the alert
            throw new Error(`CRASH: Processing Emp ID ${emp ? emp.employeeId : 'UNKNOWN'}. Details: ${e.message}`);
        }
    });
    // --- END CRITICAL LOOP WITH LOGGING ---

    // 3. Generate Excel per Project (UNCHANGED LOGIC)
    for (const [project, subCenters] of Object.entries(projectGroups)) {
        if (typeof ExcelJS === 'undefined') {
            throw new Error("ExcelJS is not defined. Cannot proceed with workbook generation.");
        }
        const workbook = new ExcelJS.Workbook();

        // ... (rest of Excel generation logic, including headers, body, advice sheet) ...

        // This is where the old line 255 (the start of the loop) was.
        // We ensure all necessary logic is inside the try/catch block of the outer function.

        // ...
        const buffer = await workbook.xlsx.writeBuffer();
        const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
    }

    return zip.generateAsync({ type: "blob" });
}