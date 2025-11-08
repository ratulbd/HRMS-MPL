// js/salarySheet.js
import { $, openModal, closeModal, customAlert } from './utils.js';
import { apiCall } from './apiClient.js';

// --- Global variable for ExcelJS, loaded from index.html ---
const ExcelJS = window.ExcelJS;
const JSZip = window.JSZip; // Get JSZip from global scope

let allEmployees = []; // To be populated by getMainLocalEmployees

/**
 * Initializes the modal and its listeners.
 */
export function setupSalarySheetModal(getMainLocalEmployees) {
    const openBtn = $('uploadAttendanceBtn');
    const closeBtn = $('cancelAttendanceModal');
    const form = $('attendanceForm');

    if (openBtn) openBtn.addEventListener('click', () => {
        allEmployees = getMainLocalEmployees(); // Get fresh employee data on modal open
        if (!allEmployees || allEmployees.length === 0) {
            customAlert("Error", "Employee data not loaded. Please refresh the page.");
            return;
        }
        form.reset();
        openModal('attendanceModal');
    });

    if (closeBtn) closeBtn.addEventListener('click', () => closeModal('attendanceModal'));

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const generateBtn = e.target.querySelector('button[type="submit"]');
            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating...';

            try {
                const salaryMonth = $('salaryMonth').value;
                const attendanceFile = $('attendanceFile').files[0];
                const accountabilityFile = $('accountabilityFile').files[0]; // Get the file

                // --- MODIFICATION: Validation now includes accountabilityFile ---
                if (!salaryMonth || !attendanceFile || !accountabilityFile) {
                    customAlert("Missing Data", "Please select a month and provide both the Attendance and Accountability CSV files.");
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'Generate Sheet';
                    return;
                }
                // --- END MODIFICATION ---
                
                // --- MODIFICATION: Removed mock data block ---
                // 1. Parse CSV files
                const attendanceData = await parseCSV(attendanceFile);
                const accountabilityData = await parseCSV(accountabilityFile); // Parse the real file
                // --- END MODIFICATION ---

                // 2. Process data
                const processedData = processPayrollData(attendanceData, accountabilityData, allEmployees);
                
                // 3. Group by Project
                const employeesByProject = processedData.reduce((acc, emp) => {
                    const project = emp.project || 'Unknown';
                    if (!acc[project]) acc[project] = [];
                    acc[project].push(emp);
                    return acc;
                }, {});

                // 4. Generate Zip File
                if (!JSZip) {
                    throw new Error("JSZip library is not loaded. Please check index.html.");
                }
                const zip = new JSZip();

                // 5. Generate Excel file for each project and add to zip
                for (const project of Object.keys(employeesByProject)) {
                    // Pass 'false' for isArchive flag
                    const { fileName, blob } = await generateExcelReport(project, salaryMonth, employeesByProject[project], false);
                    zip.file(fileName, blob); // Add file to zip
                }

                // 6. Download the single zip file
                const zipBlob = await zip.generateAsync({ type: "blob" });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = `Salary-Reports-${salaryMonth}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);

                // 7. Archive the report
                const archiveTimestamp = new Date().toISOString(); // <-- Get timestamp
                await apiCall('saveSalaryArchive', 'POST', {
                    monthYear: salaryMonth,
                    timestamp: archiveTimestamp, // <-- Send timestamp
                    jsonData: processedData // Archive the successfully processed data
                });

                customAlert("Success", `Successfully generated and archived salary reports for ${salaryMonth}. Downloaded as a .zip file.`);
                closeModal('attendanceModal');

            } catch (error) {
                console.error("Salary Sheet Generation Error:", error);
                customAlert("Error", `Failed to generate salary sheet: ${error.message}`);
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Sheet';
            }
        });
    }
}

/**
 * Parses a CSV file into an array of objects.
 */
function parseCSV(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
             reject(new Error("No file provided to parse."));
             return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target.result;
                const lines = text.split(/[\r\n]+/).filter(line => line.trim() !== '');
                if (lines.length < 2) throw new Error("CSV file is empty or has no data rows.");
                
                const headerLine = lines.shift();
                // Handle potential BOM character at the start of the file
                const headers = headerLine.replace(/^\uFEFF/, '').split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
                
                const data = lines.map(line => {
                    // Robust CSV parsing to handle commas inside quoted values
                    const values = [];
                    let inQuote = false;
                    let currentVal = '';
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') {
                            inQuote = !inQuote;
                        } else if (char === ',' && !inQuote) {
                            values.push(currentVal.trim());
                            currentVal = '';
                        } else {
                            currentVal += char;
                        }
                    }
                    values.push(currentVal.trim());

                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = values[index] ? values[index].replace(/"/g, '') : '';
                    });
                    return obj;
                });
                resolve(data);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsText(file);
    });
}

/**
 * Core logic: Merges attendance, accountability, and employee data.
 */
function processPayrollData(attendanceData, accountabilityData, allEmployeeData) {
    const attendanceMap = new Map(attendanceData.map(row => [row.employeeid, parseInt(row.dayspresent, 10)]));
    const accountabilityMap = new Map();
    accountabilityData.forEach(row => {
        const key = `${row.reportproject}|${row.subcenter}`;
        accountabilityMap.set(key, row.accountableemployeeid);
    });

    const processed = allEmployeeData
        .filter(emp => emp.status === 'Active' || emp.status === 'Salary Held') // Only process active/held employees
        .map(emp => {
            const daysPresent = attendanceMap.get(emp.employeeId) || 0;
            const grossSalary = parseFloat(emp.salary) || 0;
            
            // Calculate salary as per requirement
            const perDaySalary = grossSalary / 30;
            const deduction = daysPresent >= 30 ? 0 : (30 - daysPresent) * perDaySalary;
            const netSalary = grossSalary - deduction;

            // Determine payment method
            let paymentType = 'Bank';
            let accountableEmployeeId = null;
            if (!emp.bankAccount || emp.bankAccount.trim() === '') {
                paymentType = 'Cash';
                const key = `${emp.reportProject}|${emp.subCenter}`;
                accountableEmployeeId = accountabilityMap.get(key) || null;
                if (!accountableEmployeeId && accountabilityData.length > 0) { // Only warn if accountability data was provided
                    console.warn(`No accountable person found for ${key}. Employee ${emp.employeeId} will not be paid.`);
                }
            }

            return {
                ...emp,
                daysPresent,
                grossSalary, // This is the original gross
                calculatedDeduction: deduction,
                calculatedNetSalary: netSalary,
                paymentType,
                accountableEmployeeId // null if bank, or 'CL-XXXX' if cash
            };
        });

    return processed;
}

/**
 * Uses ExcelJS to build and return one .xlsx file blob for a project.
 */
async function generateExcelReport(project, salaryMonth, projectEmployees, isArchive = false) {
    if (!ExcelJS) throw new Error("ExcelJS library is not loaded.");
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = `HR Management System ${isArchive ? '(Archive)' : ''}`;
    workbook.created = new Date();

    // 1. Create Salary Sheet (matches "Telecom" template)
    createSalaryWorksheet(workbook, project, projectEmployees, salaryMonth);

    // 2. Create Advice Sheet
    createAdviceWorksheet(workbook, projectEmployees, salaryMonth);

    // 3. Return the file blob and name
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const archiveSuffix = isArchive ? '-Archive' : '';
    const fileName = `Salary-${project}-${salaryMonth}${archiveSuffix}.xlsx`;

    return { fileName, blob };
}


/**
 * Creates the main "Salary Sheet" worksheet (like "Telecom").
 */
function createSalaryWorksheet(workbook, project, employees, salaryMonth) {
    // Note: Template "Dhaka South Office-Casual" refers to Sub Center
    const sheet = workbook.addWorksheet(`${project} Salary Sheet`);

    // --- Styling ---
    const headerFont = { name: 'Calibri', size: 11, bold: true };
    const centerAlign = { vertical: 'middle', horizontal: 'center' };
    const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

    // --- Headers ---
    sheet.mergeCells('A1:L1');
    sheet.getCell('A1').value = `Salary Sheet for ${project} - ${salaryMonth}`;
    sheet.getCell('A1').font = { name: 'Calibri', size: 16, bold: true };
    sheet.getCell('A1').alignment = centerAlign;

    const headers = [
        'SL No', 'Employee ID', 'Employee Name', 'Designation', 'Joining Date', 'Gross Salary', 
        'Days Present', 'Deduction', 'Net Salary', 'Bank Account Number', 'Payment Type', 'Remarks'
    ];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
        cell.font = headerFont;
        cell.alignment = centerAlign;
        cell.border = border;
    });

    // --- Group employees by Sub Center ---
    const employeesBySubCenter = employees.reduce((acc, emp) => {
        const subCenter = emp.subCenter || 'Unknown Sub Center';
        if (!acc[subCenter]) acc[subCenter] = [];
        acc[subCenter].push(emp);
        return acc;
    }, {});

    // --- Populate Data ---
    let slNo = 1;
    let grandTotalGross = 0;
    let grandTotalDeduction = 0;
    let grandTotalNet = 0;

    for (const subCenter of Object.keys(employeesBySubCenter).sort()) {
        // Add Sub-center header row
        const subCenterHeaderRow = sheet.addRow([subCenter]);
        sheet.mergeCells(sheet.lastRow.number, 1, sheet.lastRow.number, headers.length);
        subCenterHeaderRow.getCell(1).font = { name: 'Calibri', size: 12, bold: true };
        subCenterHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

        let subTotalGross = 0;
        let subTotalDeduction = 0;
        let subTotalNet = 0;

        employeesBySubCenter[subCenter].forEach(emp => {
            const row = sheet.addRow([
                slNo++,
                emp.employeeId,
                emp.name,
                emp.designation,
                emp.joiningDate, // TODO: Format as date if needed
                emp.grossSalary,
                emp.daysPresent,
                emp.calculatedDeduction,
                emp.calculatedNetSalary,
                emp.bankAccount || '',
                emp.paymentType,
                emp.accountableEmployeeId ? `Cash via ${emp.accountableEmployeeId}` : ''
            ]);
            
            // Apply formatting
            row.getCell(6).numFmt = '#,##0.00';
            row.getCell(8).numFmt = '#,##0.00';
            row.getCell(9).numFmt = '#,##0.00';
            row.eachCell((cell) => { cell.border = border; });

            // Add to subtotals
            subTotalGross += emp.grossSalary;
            subTotalDeduction += emp.calculatedDeduction;
            subTotalNet += emp.calculatedNetSalary;
        });

        // Add Subtotal Row
        const subtotalRow = sheet.addRow([
            '', '', '', 'Sub Total', '', subTotalGross, '', subTotalDeduction, subTotalNet, '', '', ''
        ]);
        subtotalRow.font = { name: 'Calibri', size: 11, bold: true };
        subtotalRow.eachCell((cell) => { cell.border = border; });
        subtotalRow.getCell(6).numFmt = '#,##0.00';
        subtotalRow.getCell(8).numFmt = '#,##0.00';
        subtotalRow.getCell(9).numFmt = '#,##0.00';
        
        // Add to grand totals
        grandTotalGross += subTotalGross;
        grandTotalDeduction += subTotalDeduction;
        grandTotalNet += subTotalNet;
    }

    // Add Grand Total Row
    const grandTotalRow = sheet.addRow([
        '', '', '', 'Grand Total', '', grandTotalGross, '', grandTotalDeduction, grandTotalNet, '', '', ''
    ]);
    grandTotalRow.font = { name: 'Calibri', size: 12, bold: true };
    grandTotalRow.eachCell((cell) => { cell.border = border; });
    grandTotalRow.getCell(6).numFmt = '#,##0.00';
    grandTotalRow.getCell(8).numFmt = '#,##0.00';
    grandTotalRow.getCell(9).numFmt = '#,##0.00';
    
    // Set column widths
    sheet.columns = [
        { width: 5 }, { width: 12 }, { width: 25 }, { width: 20 }, { width: 12 }, 
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 18 },
        { width: 12 }, { width: 20 }
    ];
}

/**
 * Creates the "Advice" worksheet.
 */
function createAdviceWorksheet(workbook, employees, salaryMonth) {
    const sheet = workbook.addWorksheet('Advice');

    // --- Logic for Advice ---
    // 1. Create a map for all payments
    const paymentMap = new Map();

    employees.forEach(emp => {
        if (emp.paymentType === 'Bank') {
            const key = emp.employeeId; // Pay the employee directly
            const payment = paymentMap.get(key) || { emp: emp, amount: 0 };
            payment.amount += emp.calculatedNetSalary;
            paymentMap.set(key, payment);
        } else if (emp.paymentType === 'Cash' && emp.accountableEmployeeId) {
            const key = emp.accountableEmployeeId; // Pay the accountable person
            // Find the accountable employee's record
            const accountableEmp = allEmployees.find(e => e.employeeId === key);
            if (accountableEmp) {
                const payment = paymentMap.get(key) || { emp: accountableEmp, amount: 0 };
                payment.amount += emp.calculatedNetSalary; // Add cash amount
                paymentMap.set(key, payment);
            } else {
                console.warn(`Accountable employee ${key} not found in master list!`);
            }
        }
    });

    // --- Headers ---
    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = `Bank Advice - ${salaryMonth}`;
    sheet.getCell('A1').font = { name: 'Calibri', size: 16, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    
    const headers = ['Employee ID', 'Employee Name', 'Bank Account Number', 'Amount (BDT)'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true };
        cell.border = { bottom: { style: 'thin' } };
    });

    // --- Populate Data ---
    let totalAdviceAmount = 0;
    for (const [employeeId, payment] of paymentMap.entries()) {
        if (payment.amount > 0) {
            sheet.addRow([
                payment.emp.employeeId,
                payment.emp.name,
                payment.emp.bankAccount || 'CASH (See Salary Sheet)',
                payment.amount
            ]);
            totalAdviceAmount += payment.amount;
        }
    }

    // --- Total Row ---
    const totalRow = sheet.addRow(['', '', 'Total', totalAdviceAmount]);
    totalRow.font = { bold: true };
    
    // --- Formatting ---
    sheet.getColumn('D').numFmt = '#,##0.00';
    sheet.getColumn(1).width = 15;
    sheet.getColumn(2).width = 30;
    sheet.getColumn(3).width = 25;
    sheet.getColumn(4).width = 15;
}