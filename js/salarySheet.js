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

if (!attendanceData || attendanceData.length === 0) {
    throw new Error("Attendance file is empty or invalid.");
}
if (!holderData || holderData.length === 0) {
    throw new Error("Account Holder file is empty or invalid.");
}


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

// --- Helpers (Unchanged Logic, added for completeness) ---

function parseCSV(file) {
    // Assuming Papa is now loaded globally
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
    // Relying on global availability of ExcelJS and JSZip
    const zip = new JSZip();
    const { month, year, full, quote } = getFormattedMonthYear(monthVal);
    const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '.');

    const accountingFmt = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';

    // 1. Maps (Omitted for brevity, assume unchanged logic for maps)
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

    // 2. Grouping & Calculation (Omitted for brevity, assume unchanged logic for calculation)
    const projectGroups = {};

    employees.forEach(emp => {
        const attRow = attMap[String(emp.employeeId)];
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
    });

    // 3. Generate Excel per Project
    for (const [project, subCenters] of Object.entries(projectGroups)) {
        // --- Added check for ExcelJS initialization ---
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
            // NOTE: Column indices start at 1 for ExcelJS, but 0 in JS array.
            // Cols 11-39 (indices 10-38)
            if (colNumber >= 10 && colNumber <= 38) col.width = 11.18;
            // Col 42 (index 41)
            if (colNumber === 41) col.width = 11.55;
        });

        // --- HEADERS --- (Omitted for brevity, assume unchanged logic)
        // ...

        // --- BODY ---
        let sl = 1;
        const sortedSubCenters = Object.keys(subCenters).sort();
        let projectGrandTotal = 0;

        for (const scName of sortedSubCenters) {
            const scEmployees = subCenters[scName];

            // Subcenter Header Row
            const scRow = sheet.addRow([`Subcenter: ${scName}`]);
            for(let i=1; i<=43; i++) {
                const c = scRow.getCell(i);
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } };
                c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                if (i===1) c.font = { bold: true };
            }

            let scTotalNet = 0;

            if (Array.isArray(scEmployees) && scEmployees.length > 0) {
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
                    d.ded.lunch, d.ded.tds, d.ded.bike, d.ded.welfare, d.ded.loan, d.ded.vehicle, d.ded.cpf, d.ded.adj, d.ded.attDed, d.ded.totalDeduction,
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

            // Subcenter Total
            const totRow = sheet.addRow([]);
            totRow.getCell(3).value = `Total for ${scName}`;
            const netPayCell = totRow.getCell(40);
            netPayCell.value = scTotalNet;
            netPayCell.numFmt = accountingFmt;

            totRow.eachCell(c => {
                 c.font = { bold: true };
                 c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                 c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
            });
        }

        // ==================================================
        // 2. ADVICE SHEET
        // ==================================================
        const adviceSheet = workbook.addWorksheet('Advice', {
            pageSetup: {
                paperSize: 9,
                orientation: 'portrait',
                fitToPage: false,
                fitToWidth: 1,
                fitToHeight: 0,
                printTitlesRow: '41:41'
            }
        });

        // Consolidate Payments (Logic is same as previous step, map created)
        const consolidationMap = new Map();
        const allProjectEmployees = Object.values(subCenters).flat();

        allProjectEmployees.forEach(emp => {
            if (emp.finalAccountNo && emp.finalAccountNo.trim() !== '') {
                const key = String(emp.employeeId);
                if (!consolidationMap.has(key)) {
                    consolidationMap.set(key, { id: emp.employeeId, name: emp.name, designation: emp.designation, account: emp.finalAccountNo, amount: 0 });
                }
                consolidationMap.get(key).amount += emp.netPayment;
            } else if (emp.holderId) {
                const holderKey = String(emp.holderId);
                if (consolidationMap.has(holderKey)) {
                    consolidationMap.get(holderKey).amount += emp.netPayment;
                }
            }
        });

        const totalAmountWords = convertNumberToWords(projectGrandTotal);

        const writeRow = (rIdx, text, bold=false, size=11) => {
            const row = adviceSheet.getRow(rIdx);
            const cell = row.getCell(1);
            cell.value = text;
            cell.font = { name: 'Calibri', size: size, bold: bold };
            adviceSheet.mergeCells(rIdx, 1, rIdx, 6);
        };

        // Static Letter Content (Rows 1-29)
        writeRow(1, `Ref: MPL/TELECOM/Salary/${project}/${full}`, true);
        writeRow(2, `Date: ${today}`, true);
        writeRow(4, "To");
        writeRow(5, "The Manager");
        writeRow(6, "Dutch Bangla Bank PLC");
        writeRow(7, "Elephant Road Branch, Dhaka");
        writeRow(9, `Subject: Salary expenses disbursement for the Month of ${quote}.`, true);
        writeRow(11, "Dear Sir,");

        const bodyText = `Please Transfer Tk.${projectGrandTotal.toLocaleString('en-IN')}/-Taka (in word: ${totalAmountWords}) to our following employee’s bank account by debiting our CD Account No. 103.110.17302 in the name of Metal Plus Ltd. Maintained with you.`;
        const bodyRow = adviceSheet.getRow(13);
        const bodyCell = bodyRow.getCell(1);
        bodyCell.value = bodyText;
        bodyCell.font = { name: 'Calibri', size: 11 };
        bodyCell.alignment = { wrapText: true, vertical: 'top' };
        adviceSheet.mergeCells(13, 1, 17, 6);

        writeRow(19, "Regards,");

        const sigRow = adviceSheet.getRow(23);
        sigRow.getCell(1).value = "Authorized Signature";
        sigRow.getCell(1).font = { bold: true };
        sigRow.getCell(5).value = "Authorized Signature";
        sigRow.getCell(5).font = { bold: true };

        // CC Section
        writeRow(27, "CC:");
        writeRow(28, "1. GM, Finance & Accounts, Metal Plus Limited.");
        writeRow(29, "2. Office Copy");

        // Table Header at Row 41
        const tableHeaderRowIdx = 41;
        const adviceHeaders = ["SL", "ID", "Name", "Designation", "Account No", "Amount"];
        const tblHeader = adviceSheet.getRow(tableHeaderRowIdx);
        tblHeader.values = adviceHeaders;
        tblHeader.height = 30;
        tblHeader.eachCell(c => {
            c.font = { bold: true };
            c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
            c.alignment = { horizontal: 'center', vertical: 'middle' };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        });

        // Data Rows starting at 42
        let advSl = 1;
        const finalAdviceList = Array.from(consolidationMap.values()).sort((a,b) => a.id.localeCompare(b.id));

        finalAdviceList.forEach(item => {
            const r = adviceSheet.addRow([
                advSl++, item.id, item.name, item.designation, item.account, item.amount
            ]);
            r.eachCell((c, colNum) => {
                 c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                 c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                 if(colNum === 3 || colNum === 4) c.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
                 if(colNum === 6) c.numFmt = accountingFmt;
            });
        });

        // Total Row for Advice
        const advTotRow = adviceSheet.addRow(['', '', '', 'Total', '', projectGrandTotal]);
        advTotRow.eachCell((c, colNum) => {
            c.font = { bold: true };
            if(colNum === 6) c.numFmt = accountingFmt;
        });

        // Final Widths (Ensuring fit to one page)
        adviceSheet.getColumn(1).width = 6;
        adviceSheet.getColumn(2).width = 12;
        adviceSheet.getColumn(3).width = 25;
        adviceSheet.getColumn(4).width = 20;
        adviceSheet.getColumn(5).width = 20;
        adviceSheet.getColumn(6).width = 15;

        // Finalize Zip (Omitted for brevity, assume unchanged)

        // --- Removed inner Promise.resolve/reject logic here. ---

        const buffer = await workbook.xlsx.writeBuffer();
        const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
    }

    return zip.generateAsync({ type: "blob" });
}
}