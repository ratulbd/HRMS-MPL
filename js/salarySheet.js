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

// --- Number to Words Converter (Indian Numbering System for Taka/Crore/Lac) ---
function convertNumberToWords(amount) {
    const words = new Intl.NumberFormat('en-IN').format(parseInt(amount)); // Use built-in formatter for commas to help parsing logic if needed, but here we build manual logic for words.

    // Simplified converter for integer part
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
    // dateStr is YYYY-MM
    const date = new Date(dateStr + "-01");
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    return { month, year, full: `${month}-${year}`, quote: `${month}'${year}` };
}

// --- MAIN GENERATION LOGIC ---

async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal) {
    const zip = new JSZip();
    const { month, year, full, quote } = getFormattedMonthYear(monthVal);

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

    employees.forEach(emp => {
        const attRow = attMap[String(emp.employeeId)];
        if (!attRow) return;

        const project = emp.reportProject || 'Unknown';
        const subCenter = emp.subCenter || 'General';

        if (!projectGroups[project]) projectGroups[project] = {};
        if (!projectGroups[project][subCenter]) projectGroups[project][subCenter] = [];

        // Calculations
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
        attDed = Math.round(attDed * 100) / 100;
        const totalDeduction = Object.values(deductions).reduce((a, b) => a + b, 0) + attDed;
        const netPayment = Math.round((grossPayable - totalDeduction) * 100) / 100;

        // Holder Logic
        let finalAccountNo = emp.bankAccount;
        let remarksText = "";
        let paymentType = "Bank"; // Default

        const holderKey = `${String(project).toLowerCase().trim()}|${String(subCenter).toLowerCase().trim()}`;
        const holderInfo = holderMap[holderKey];

        if (!finalAccountNo || finalAccountNo.trim() === '') {
            paymentType = "Cash (Holder)";
            if (holderInfo && holderInfo.id) {
                const holderEmp = allEmpMap[String(holderInfo.id).trim()];
                if (holderEmp) {
                    remarksText = `Pay to: ${holderInfo.name} (${holderInfo.id})`;
                    // Note: For Salary Sheet, we show this remark.
                    // For Advice Sheet, we will aggregate this amount to the holder.
                } else {
                    remarksText = `Holder: ${holderInfo.name} (Not Found)`;
                }
            }
        }

        projectGroups[project][subCenter].push({
            ...emp,
            finalAccountNo,
            remarksText,
            paymentType,
            holderId: holderInfo ? holderInfo.id : null, // Store for aggregation
            att: { totalDays, holidays, leave, lwpDays, actualPresent, netPresent },
            earn: { grossSalary, ...earnings, grossPayable },
            ded: { ...deductions, attDed, totalDeduction },
            netPayment
        });
    });

    // 3. Generate Excel per Project
    for (const [project, subCenters] of Object.entries(projectGroups)) {
        const workbook = new ExcelJS.Workbook();

        // ==================================================
        // 1. SALARY SHEET
        // ==================================================
        const sheet = workbook.addWorksheet('Salary Sheet');

        // Setup Columns
        sheet.columns = [
            { key: 'sl', width: 5 }, { key: 'id', width: 8 }, { key: 'name', width: 20 }, { key: 'desig', width: 15 }, { key: 'func', width: 15 }, { key: 'join', width: 12 },
            { key: 'proj', width: 12 }, { key: 'off', width: 12 }, { key: 'rep', width: 12 }, { key: 'sub', width: 12 },
            { key: 'td', width: 5 }, { key: 'hol', width: 5 }, { key: 'lv', width: 5 }, { key: 'lwp_d', width: 5 }, { key: 'act', width: 5 }, { key: 'net_p', width: 5 },
            { key: 'prev', width: 10 }, { key: 'basic', width: 10 }, { key: 'oth', width: 10 }, { key: 'gr_sal', width: 12 },
            { key: 'maint', width: 10 }, { key: 'lap', width: 10 }, { key: 'oth_al', width: 10 }, { key: 'arr', width: 10 }, { key: 'food', width: 10 }, { key: 'stn', width: 10 }, { key: 'hard', width: 10 }, { key: 'gr_pay', width: 14 },
            { key: 'grat', width: 10 }, { key: 'lunch', width: 10 }, { key: 'tds', width: 8 }, { key: 'bike', width: 10 }, { key: 'wel', width: 10 }, { key: 'loan', width: 10 }, { key: 'veh', width: 10 }, { key: 'cpf', width: 8 }, { key: 'adj', width: 10 }, { key: 'att_ded', width: 10 }, { key: 'tot_ded', width: 14 },
            { key: 'net_pay', width: 14 }, { key: 'bank', width: 18 }, { key: 'type', width: 10 }, { key: 'rem', width: 20 }
        ];

        // --- HEADERS ---
        // Row 1: Company Name
        sheet.mergeCells('A1:AQ1');
        const r1 = sheet.getCell('A1');
        r1.value = "Metal Plus Limited";
        r1.font = { bold: true, size: 16, name: 'Calibri' };
        r1.alignment = { horizontal: 'center', vertical: 'middle' };

        // Row 2: Sheet Title
        sheet.mergeCells('A2:AQ2');
        const r2 = sheet.getCell('A2');
        r2.value = `Salary Sheet-${project} for the Month of ${full}`;
        r2.font = { bold: true, size: 12, name: 'Calibri' };
        r2.alignment = { horizontal: 'center', vertical: 'middle' };

        // Row 3: Merged Categories
        // Mapping merges based on requested columns
        const mergeRanges = [
            { r: 'A3:J3', t: 'Employee Information' },
            { r: 'K3:P3', t: 'Attendance' },
            { r: 'Q3:T3', t: 'Salary Structure' },
            { r: 'U3:AB3', t: 'Earnings & Benefits' }, // Maint to GrossPayable
            { r: 'AC3:AM3', t: 'Deductions' },
            { r: 'AN3:AQ3', t: 'Payment Information' }
        ];

        mergeRanges.forEach(m => {
            sheet.mergeCells(m.r);
            const cell = sheet.getCell(m.r.split(':')[0]);
            cell.value = m.t;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // White text
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; // Blue bg
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        });

        // Row 4: Specific Headers
        const headers = [
            "SL", "ID", "Name", "Designation", "Functional Role", "Joining Date", "Project", "Project Office", "Report Project", "Sub Center",
            "Total Working Days", "Holidays", "Availing Leave", "LWP", "Actual Present", "Net Present",
            "Previous Salary", "Basic", "Others", "Gross Salary",
            "Motobike / Car Maintenance Allowance", "Laptop Rent", "Others Allowance", "Arrear", "Food Allowance", "Station Allowance", "Hardship Allowance", "Gross Payable Salary",
            "Gratuity", "Subsidized Lunch", "TDS", "Motorbike Loan", "Welfare Fund", "Salary/ Others Loan", "Subsidized Vehicle", "CPF", "Others Adjustment", "Attendance Deduction", "Total Deduction",
            "Net Salary Payment", "Bank Account Number", "Payment Type", "Remarks"
        ];

        const headerRow = sheet.addRow(headers);
        headerRow.height = 60; // Taller for rotation

        headerRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true, size: 9 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
            cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };

            // Rotate logic: Rotate Up (90deg) for narrow financial/attendance columns
            // Columns K (11) to AM (39) usually need rotation to fit
            if (colNumber >= 11 && colNumber <= 39) {
                cell.alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle', wrapText: true };
            } else {
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            }
        });

        // --- BODY ---
        let sl = 1;
        const sortedSubCenters = Object.keys(subCenters).sort();
        let projectGrandTotal = 0;

        for (const scName of sortedSubCenters) {
            const scEmployees = subCenters[scName];

            // Subcenter Header Row
            const scRow = sheet.addRow([`Subcenter: ${scName}`]);
            // Apply color to whole row, but DO NOT MERGE
            for(let i=1; i<=43; i++) {
                const c = scRow.getCell(i);
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } }; // Light blueish
                c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                if (i===1) c.font = { bold: true };
            }

            let scTotalNet = 0;

            // Employee Rows
            scEmployees.forEach(d => {
                scTotalNet += d.netPayment;
                projectGrandTotal += d.netPayment;

                const r = sheet.addRow([
                    sl++, d.employeeId, d.name, d.designation, d.functionalRole, d.joiningDate,
                    d.project, d.projectOffice, d.reportProject, d.subCenter,
                    d.att.totalDays, d.att.holidays, d.att.leave, d.att.lwpDays, d.att.actualPresent, d.att.netPresent,
                    d.previousSalary || 0, d.earn.grossSalary * 0.6, d.earn.grossSalary * 0.4, d.earn.grossSalary, // Dummy split for Basic/Others if not in DB
                    d.earn.maint, d.earn.laptop, d.earn.others, d.earn.arrear, d.earn.food, d.earn.station, d.earn.hardship, d.earn.grossPayable,
                    0, // Gratuity
                    d.ded.lunch, d.ded.tds, d.ded.bike, d.ded.welfare, d.ded.loan, d.ded.vehicle, d.ded.cpf, d.ded.adj, d.ded.attDed, d.ded.totalDeduction,
                    d.netPayment,
                    d.finalAccountNo, d.paymentType, d.remarksText
                ]);

                r.eachCell(c => {
                    c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                    c.alignment = { vertical: 'middle', horizontal: 'center' };
                    // Name and remarks left align
                    if(c.col === 3 || c.col === 43) c.alignment = { vertical: 'middle', horizontal: 'left' };
                });
            });

            // Subcenter Total
            const totRow = sheet.addRow([]);
            totRow.getCell(3).value = `Total for ${scName}`;
            totRow.getCell(40).value = scTotalNet; // Net Pay Col
            totRow.eachCell(c => {
                 c.font = { bold: true };
                 c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow
                 c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
            });
        }

        // ==================================================
        // 2. ADVICE SHEET (Complex Logic)
        // ==================================================
        const adviceSheet = workbook.addWorksheet('Advice', {
            pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true }
        });

        // -- A. CONSOLIDATE PAYMENTS (Holder Logic) --
        const consolidationMap = new Map(); // Key: AccountNo or HolderID, Value: { name, id, acc, amount, isHolder }

        const allProjectEmployees = Object.values(subCenters).flat();

        // 1. Initialize Map with Employees who have accounts
        allProjectEmployees.forEach(emp => {
            if (emp.finalAccountNo && emp.finalAccountNo.trim() !== '') {
                // This person has an account (could be personal or a holder receiving for self)
                const key = String(emp.employeeId);
                if (!consolidationMap.has(key)) {
                    consolidationMap.set(key, {
                        sl: 0,
                        id: emp.employeeId,
                        name: emp.name,
                        account: emp.finalAccountNo,
                        amount: 0, // Will sum up
                        remarks: ''
                    });
                }
                // Add own salary
                const entry = consolidationMap.get(key);
                entry.amount += emp.netPayment;
            }
        });

        // 2. Process Employees WITHOUT accounts (Cash/Holder)
        allProjectEmployees.forEach(emp => {
            if (!emp.finalAccountNo || emp.finalAccountNo.trim() === '') {
                // Find their holder
                if (emp.holderId) {
                    const holderKey = String(emp.holderId);
                    if (consolidationMap.has(holderKey)) {
                        const holderEntry = consolidationMap.get(holderKey);
                        holderEntry.amount += emp.netPayment;
                        // Optional: Add remark to holder?
                    } else {
                        // Edge case: Holder exists in DB but not in this Salary Sheet (unlikely but possible)
                        // Add holder just for receiving money? Or list emp separately?
                        // Requirement: "Only those who have account will be there"
                        // If holder not in list, we can't pay to holder's account.
                        console.warn(`Holder ${emp.holderId} for ${emp.name} not found in active payout list.`);
                    }
                }
            }
        });

        // -- B. HEADER ROWS (Static + Dynamic Text) --
        // Rows 1-23 are text. We insert them carefully.

        const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '.'); // DD.MM.YYYY
        const totalAmountWords = convertNumberToWords(projectGrandTotal);

        // Helper to write simple text rows
        const writeRow = (rIdx, text, bold=false, size=11) => {
            const row = adviceSheet.getRow(rIdx);
            const cell = row.getCell(1);
            cell.value = text;
            cell.font = { name: 'Calibri', size: size, bold: bold };
            adviceSheet.mergeCells(rIdx, 1, rIdx, 6); // Merge across width
        };

        writeRow(1, `Ref: MPL/TELECOM/Salary/${full}`, true);
        writeRow(2, `Date: ${today}`, true);
        writeRow(4, "To");
        writeRow(5, "The Manager");
        writeRow(6, "Dutch Bangla Bank PLC");
        writeRow(7, "Elephant Road Branch, Dhaka");
        writeRow(9, `Subject: Salary expenses disbursement for the Month of ${quote}.`, true);
        writeRow(11, "Dear Sir,");

        // Large text block
        const bodyText = `Please Transfer Tk.${projectGrandTotal.toLocaleString('en-IN')}/-Taka (in word: ${totalAmountWords}) to our following employee’s bank account by debiting our CD Account No. 103.110.17302 in the name of Metal Plus Ltd. Maintained with you.`;
        const bodyRow = adviceSheet.getRow(13);
        const bodyCell = bodyRow.getCell(1);
        bodyCell.value = bodyText;
        bodyCell.font = { name: 'Calibri', size: 11 };
        bodyCell.alignment = { wrapText: true, vertical: 'top' };
        adviceSheet.mergeCells(13, 1, 17, 6); // Block merge

        writeRow(19, "Regards,");
        // Signatures (Placeholders)
        adviceSheet.getCell('A23').value = "Authorized Signature";
        adviceSheet.getCell('E23').value = "Authorized Signature";

        // -- C. TABLE --
        const tableHeaderRowIdx = 24;
        const adviceHeaders = ["SL", "ID", "Name", "Account No", "Amount", "Remarks"];
        const tblHeader = adviceSheet.getRow(tableHeaderRowIdx);
        tblHeader.values = adviceHeaders;
        tblHeader.eachCell(c => {
            c.font = { bold: true };
            c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
            c.alignment = { horizontal: 'center' };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        });

        // -- D. DATA --
        let advSl = 1;
        // Convert map to array and sort by ID
        const finalAdviceList = Array.from(consolidationMap.values()).sort((a,b) => a.id.localeCompare(b.id));

        finalAdviceList.forEach(item => {
            const r = adviceSheet.addRow([
                advSl++, item.id, item.name, item.account, item.amount, item.remarks
            ]);
            r.eachCell(c => {
                 c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                 c.alignment = { horizontal: 'center' };
                 if(c.col === 3) c.alignment = { horizontal: 'left' }; // Name
            });
        });

        // Total Row for Advice
        const advTotRow = adviceSheet.addRow(['', '', 'Total', '', projectGrandTotal, '']);
        advTotRow.eachCell(c => c.font = { bold: true });

        // Column Widths for Advice
        adviceSheet.getColumn(1).width = 6;
        adviceSheet.getColumn(2).width = 12;
        adviceSheet.getColumn(3).width = 30;
        adviceSheet.getColumn(4).width = 20;
        adviceSheet.getColumn(5).width = 15;
        adviceSheet.getColumn(6).width = 15;


        // Finalize Zip
        const buffer = await workbook.xlsx.writeBuffer();
        const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
    }

    return zip.generateAsync({ type: "blob" });
}