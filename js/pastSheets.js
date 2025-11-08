// js/pastSheets.js
import { $, openModal, closeModal, customAlert } from './utils.js';
import { apiCall } from './apiClient.js';
// We need to import the core logic from salarySheet.js.
// This requires salarySheet.js to export its helper functions.
// For simplicity, we will duplicate the core logic function here.
// A better long-term fix would be a shared 'payroll.js' module.

// --- Global variable for ExcelJS ---
const ExcelJS = window.ExcelJS;
let allEmployees = []; // To be populated by getMainLocalEmployees
let allArchives = [];  // To store the fetched archives

export function setupPastSheetsModal(getMainLocalEmployees) {
    const openBtn = $('viewSheetsBtn');
    const closeBtn = $('closePastSheetsModal');

    if (openBtn) {
        openBtn.addEventListener('click', async () => {
            allEmployees = getMainLocalEmployees(); // Get fresh master employee list
            const listElement = $('pastSheetsList');
            listElement.innerHTML = '<div class="spinner"></div>';
            openModal('viewSheetsModal');

            try {
                const archives = await apiCall('getSalaryArchive');
                allArchives = archives.sort((a, b) => b.monthYear.localeCompare(a.monthYear)); // Newest first

                if (allArchives.length === 0) {
                    listElement.innerHTML = '<p class="text-gray-500">No past salary sheets found in the archive.</p>';
                    return;
                }

                listElement.innerHTML = ''; // Clear spinner
                allArchives.forEach((archive, index) => {
                    const item = document.createElement('div');
                    item.className = 'flex justify-between items-center p-4 bg-gray-50 rounded-lg border';
                    item.innerHTML = `
                        <span class="font-medium text-gray-700">${archive.monthYear}</span>
                        <button class="btn btn-secondary text-sm py-1 px-3" data-index="${index}">
                            Re-download
                        </button>
                    `;
                    listElement.appendChild(item);
                });

            } catch (error) {
                console.error("Error fetching salary archive:", error);
                customAlert("Error", `Failed to load past sheets: ${error.message}`);
                listElement.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
            }
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => closeModal('viewSheetsModal'));

    // --- Add listener for re-download buttons ---
    const listElement = $('pastSheetsList');
    if (listElement) {
        listElement.addEventListener('click', async (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.dataset.index) {
                const index = parseInt(e.target.dataset.index, 10);
                const archive = allArchives[index];
                
                if (!archive || !archive.jsonData) {
                    customAlert("Error", "Could not find the archived data.");
                    return;
                }

                const btn = e.target;
                btn.disabled = true;
                btn.textContent = 'Generating...';

                try {
                    // Re-process the archived data
                    const processedData = archive.jsonData; // This is the 'processedEmployees' list from the original generation
                    const salaryMonth = archive.monthYear;

                    const employeesByProject = processedData.reduce((acc, emp) => {
                        const project = emp.project || 'Unknown';
                        if (!acc[project]) acc[project] = [];
                        acc[project].push(emp);
                        return acc;
                    }, {});

                    // Re-generate Excel file for each project
                    for (const project of Object.keys(employeesByProject)) {
                        // This uses the helper functions duplicated below
                        await generateExcelReport(project, salaryMonth, employeesByProject[project]);
                    }

                    customAlert("Success", `Re-generated salary reports for ${salaryMonth}.`);

                } catch (error) {
                    console.error("Failed to re-generate report:", error);
                    customAlert("Error", `Failed to re-generate report: ${error.message}`);
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Re-download';
                }
            }
        });
    }
}


// --- DUPLICATED HELPER FUNCTIONS ---
// These are copied from salarySheet.js to be used here.
// In a larger refactor, these would live in a shared 'payrollLogic.js' file.

/**
 * Uses ExcelJS to build and download one .xlsx file for a project.
 */
async function generateExcelReport(project, salaryMonth, projectEmployees) {
    if (!ExcelJS) throw new Error("ExcelJS library is not loaded.");
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HR Management System (Archive)';
    workbook.created = new Date();

    // 1. Create Salary Sheet
    createSalaryWorksheet(workbook, project, projectEmployees, salaryMonth);
    // 2. Create Advice Sheet
    createAdviceWorksheet(workbook, projectEmployees, salaryMonth);

    // 3. Download the file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Salary-${project}-${salaryMonth}-Archive.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
}

/**
 * Creates the main "Salary Sheet" worksheet (like "Telecom").
 */
function createSalaryWorksheet(workbook, project, employees, salaryMonth) {
    const sheet = workbook.addWorksheet(`${project} Salary Sheet`);
    const headerFont = { name: 'Calibri', size: 11, bold: true };
    const centerAlign = { vertical: 'middle', horizontal: 'center' };
    const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

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

    const employeesBySubCenter = employees.reduce((acc, emp) => {
        const subCenter = emp.subCenter || 'Unknown Sub Center';
        if (!acc[subCenter]) acc[subCenter] = [];
        acc[subCenter].push(emp);
        return acc;
    }, {});

    let slNo = 1;
    let grandTotalGross = 0;
    let grandTotalDeduction = 0;
    let grandTotalNet = 0;

    for (const subCenter of Object.keys(employeesBySubCenter).sort()) {
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
                emp.joiningDate,
                emp.grossSalary,
                emp.daysPresent,
                emp.calculatedDeduction,
                emp.calculatedNetSalary,
                emp.bankAccount || '',
                emp.paymentType,
                emp.accountableEmployeeId ? `Cash via ${emp.accountableEmployeeId}` : ''
            ]);
            
            row.getCell(6).numFmt = '#,##0.00';
            row.getCell(8).numFmt = '#,##0.00';
            row.getCell(9).numFmt = '#,##0.00';
            row.eachCell((cell) => { cell.border = border; });

            subTotalGross += emp.grossSalary;
            subTotalDeduction += emp.calculatedDeduction;
            subTotalNet += emp.calculatedNetSalary;
        });

        const subtotalRow = sheet.addRow([
            '', '', '', 'Sub Total', '', subTotalGross, '', subTotalDeduction, subTotalNet, '', '', ''
        ]);
        subtotalRow.font = { name: 'Calibri', size: 11, bold: true };
        subtotalRow.eachCell((cell) => { cell.border = border; });
        subtotalRow.getCell(6).numFmt = '#,##0.00';
        subtotalRow.getCell(8).numFmt = '#,##0.00';
        subtotalRow.getCell(9).numFmt = '#,##0.00';
        
        grandTotalGross += subTotalGross;
        grandTotalDeduction += subTotalDeduction;
        grandTotalNet += subTotalNet;
    }

    const grandTotalRow = sheet.addRow([
        '', '', '', 'Grand Total', '', grandTotalGross, '', grandTotalDeduction, grandTotalNet, '', '', ''
    ]);
    grandTotalRow.font = { name: 'Calibri', size: 12, bold: true };
    grandTotalRow.eachCell((cell) => { cell.border = border; });
    grandTotalRow.getCell(6).numFmt = '#,##0.00';
    grandTotalRow.getCell(8).numFmt = '#,##0.00';
    grandTotalRow.getCell(9).numFmt = '#,##0.00';
    
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
    const paymentMap = new Map();

    employees.forEach(emp => {
        if (emp.paymentType === 'Bank') {
            const key = emp.employeeId;
            const payment = paymentMap.get(key) || { emp: emp, amount: 0 };
            payment.amount += emp.calculatedNetSalary;
            paymentMap.set(key, payment);
        } else if (emp.paymentType === 'Cash' && emp.accountableEmployeeId) {
            const key = emp.accountableEmployeeId;
            // Find the accountable employee's record FROM THE ARCHIVED DATA
            // This is a slight flaw; we need the *master list*. We use the global 'allEmployees' for this.
            const accountableEmp = allEmployees.find(e => e.employeeId === key);
            if (accountableEmp) {
                const payment = paymentMap.get(key) || { emp: accountableEmp, amount: 0 };
                payment.amount += emp.calculatedNetSalary;
                paymentMap.set(key, payment);
            } else {
                // Fallback if accountable emp isn't in the main list (e.g., they're resigned)
                // We'll just use the ID
                const fallbackEmp = { employeeId: key, name: `Accountable Emp (${key})`, bankAccount: 'N/A' };
                const payment = paymentMap.get(key) || { emp: fallbackEmp, amount: 0 };
                payment.amount += emp.calculatedNetSalary;
                paymentMap.set(key, payment);
                console.warn(`Accountable employee ${key} not found in master list! Using ID as fallback.`);
            }
        }
    });

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

    const totalRow = sheet.addRow(['', '', 'Total', totalAdviceAmount]);
    totalRow.font = { bold: true };
    
    sheet.getColumn('D').numFmt = '#,##0.00';
    sheet.getColumn(1).width = 15;
    sheet.getColumn(2).width = 30;
    sheet.getColumn(3).width = 25;
    sheet.getColumn(4).width = 15;
}