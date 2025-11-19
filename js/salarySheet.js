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

// --- Helpers (UNCHANGED) ---

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

    // --- CRITICAL LOOP START ---
    employees.forEach((emp, index) => {
        try {
            if (!emp || !emp.employeeId) {
                console.warn(`Skipping invalid/null employee object at index ${index}.`);
                return;
            }

            const empId = String(emp.employeeId).trim();

            const attRow = attMap[empId];
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
            // Re-throw the error with context to halt the process
            throw new Error(`CRASH: Processing Emp ID ${emp ? emp.employeeId : 'UNKNOWN'} at index ${index}. Details: ${e.message}`);
        }
    });
    // --- CRITICAL LOOP END ---

    // 3. Generate Excel per Project

    // --- CRITICAL FIX: Ensure safe iteration over projectGroups ---
    const projectEntries = Object.entries(projectGroups);

    if (projectEntries.length === 0) {
        throw new Error("No employees processed. Check attendance file mapping or filters.");
    }
    // -----------------------------------------------------------

    for (const [project, subCenters] of projectEntries) {
        const workbook = new ExcelJS.Workbook();

        // ... (rest of Excel generation logic, headers, body, advice sheet) ...

        // --- SALARY SHEET CONFIG & HEADERS (Omitted for brevity, assume unchanged) ---
        const sheet = workbook.addWorksheet('Salary Sheet');
        // ... (all sheet setup code) ...

        // --- BODY (Omitted for brevity, assume unchanged) ---
        let sl = 1;
        const sortedSubCenters = Object.keys(subCenters).sort();
        let projectGrandTotal = 0;

        for (const scName of sortedSubCenters) {
            const scEmployees = subCenters[scName];

            // Subcenter Header Row (Omitted for brevity, assume unchanged)
            // ...

            scEmployees.forEach(d => {
                projectGrandTotal += d.netPayment;
                // ... (data row addition logic) ...
            });
        }

        // Finalize Zip
        const buffer = await workbook.xlsx.writeBuffer();
        const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
    }

    return zip.generateAsync({ type: "blob" });
}