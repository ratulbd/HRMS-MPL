// js/pastSheets.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';

export function setupPastSheetsModal(getEmployeesFunc, btnId) {
    const btn = $(btnId);
    const modal = $('viewSheetsModal');
    const closeBtn = $('closePastSheetsModal');
    const listContainer = $('pastSheetsList');

    if (btn) {
        btn.addEventListener('click', async () => {
            modal.classList.remove('hidden');
            listContainer.innerHTML = '<div class="text-center py-4">Loading...</div>';
            await loadPastSheets();
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    async function loadPastSheets() {
        try {
            const sheets = await apiCall('getSalarySheets');
            renderSheetList(sheets);
        } catch (error) {
            listContainer.innerHTML = '<div class="text-center py-4 text-red-500">Failed to load.</div>';
        }
    }

    function renderSheetList(sheets) {
        listContainer.innerHTML = '';
        if (!sheets || sheets.length === 0) {
            listContainer.innerHTML = '<div class="text-center py-4 text-gray-500">No past salary sheets found.</div>';
            return;
        }

        sheets.forEach(sheet => {
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center p-4 bg-gray-50 rounded border';
            item.innerHTML = `
                <div><p class="font-semibold text-gray-800">${sheet.month}</p><p class="text-xs text-gray-500">Generated: ${formatDateForDisplay(sheet.generatedAt)}</p></div>
            `;
            const btnDiv = document.createElement('div');
            const dBtn = document.createElement('button');
            dBtn.className = 'btn btn-sm btn-primary ml-2';
            dBtn.innerHTML = '<i class="fas fa-download mr-1"></i> ZIP';
            dBtn.addEventListener('click', () => downloadSheetZip(sheet));
            btnDiv.appendChild(dBtn);
            item.appendChild(btnDiv);
            listContainer.appendChild(item);
        });
    }

    async function downloadSheetZip(sheetMeta) {
        try {
            customAlert("Please Wait", "Downloading archive...");

            const fullSheetData = await apiCall('getSalarySheetData', 'GET', null, { id: sheetMeta.id });

            if (!fullSheetData || !fullSheetData.data) throw new Error("Data empty.");

            const employeesData = fullSheetData.data;
            const zip = new JSZip();
            const accountingFmt = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';
            const { full } = { month: 'Past', year: 'Year', full: sheetMeta.month, quote: sheetMeta.month };
            const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '.');

            // Group: Project -> SubCenter
            const projectGroups = {};
            employeesData.forEach(d => {
                const p = d.reportProject || 'Unknown';
                const s = d.subCenter || 'General';
                if (!projectGroups[p]) projectGroups[p] = {};
                if (!projectGroups[p][s]) projectGroups[p][s] = [];
                projectGroups[p][s].push(d);
            });

            const getVal = (v) => (v !== undefined && v !== null) ? Number(v) : 0;
            const getStr = (v) => (v !== undefined && v !== null) ? String(v) : '';

            for (const [project, subCenters] of Object.entries(projectGroups)) {
                const workbook = new ExcelJS.Workbook();
                const sheet = workbook.addWorksheet('Salary Sheet');

                // --- SALARY SHEET LAYOUT & STYLING ---
                sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];
                sheet.columns.forEach((col, colNumber) => {
                    if (colNumber >= 10 && colNumber <= 38) col.width = 11.18;
                    if (colNumber === 41) col.width = 11.55;
                });

                // Headers (Must match current structure)
                sheet.mergeCells('A1:AQ1'); sheet.getCell('A1').value = "Metal Plus Limited"; sheet.getCell('A1').font = { bold: true, size: 16 }; sheet.getCell('A1').alignment = { horizontal: 'center' };
                sheet.mergeCells('A2:AQ2'); sheet.getCell('A2').value = `Salary Sheet-${project} for the Month of ${full}`; sheet.getCell('A2').font = { bold: true, size: 12 }; sheet.getCell('A2').alignment = { horizontal: 'center' };

                const headers = [
                    "SL", "ID", "Name", "Designation", "Functional Role", "Joining Date", "Project", "Project Office", "Report Project", "Sub Center",
                    "Total Working Days", "Holidays", "Availing Leave", "LWP", "Actual Present", "Net Present",
                    "Previous Salary", "Basic", "Others", "Gross Salary",
                    "Motobike / Car Maintenance Allowance", "Laptop Rent", "Others Allowance", "Arrear", "Food Allowance", "Station Allowance", "Hardship Allowance", "Gross Payable Salary",
                    "Gratuity", "Subsidized Lunch", "TDS", "Motorbike Loan", "Welfare Fund", "Salary/ Others Loan", "Subsidized Vehicle", "CPF", "Others Adjustment", "Attendance Deduction", "Total Deduction",
                    "Net Salary Payment", "Bank Account Number", "Payment Type", "Remarks"
                ];
                const headerRow = sheet.addRow(headers);
                headerRow.height = 65;
                headerRow.eachCell((cell, colNumber) => {
                    cell.font = { bold: true, size: 9 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
                    cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    if (colNumber >= 11 && colNumber <= 39) cell.alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle', wrapText: true };
                });

                let sl = 1;
                let projectGrandTotal = 0;

                for (const scName of Object.keys(subCenters).sort()) {
                    const scRow = sheet.addRow([`Subcenter: ${scName}`]);
                    for(let i=1; i<=43; i++) {
                        const c = scRow.getCell(i); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } }; c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                        if (i===1) c.font = { bold: true };
                    }
                    let scTotalNet = 0;

                    subCenters[scName].forEach(d => {
                        scTotalNet += getVal(d.netPayment);
                        projectGrandTotal += getVal(d.netPayment);

                        // Map old data keys to new structure
                        const r = sheet.addRow([
                            sl++, getStr(d.employeeId), getStr(d.name), getStr(d.designation), getStr(d.functionalRole), getStr(d.joiningDate),
                            getStr(d.project), getStr(d.projectOffice), getStr(d.reportProject), getStr(d.subCenter),
                            getVal(d.totalDays), getVal(d.holidays), getVal(d.availingLeave), getVal(d.lwpDays), getVal(d.actualPresent), getVal(d.netPresent),
                            getVal(d.previousSalary), getVal(d.basic), getVal(d.others), getVal(d.grossSalary),
                            getVal(d.maint), getVal(d.laptop), getVal(d.othersAllowance), getVal(d.arrear), getVal(d.foodAllowance), getVal(d.stationAllowance), getVal(d.hardshipAllowance), getVal(d.grossPayable),
                            getVal(d.gratuity), getVal(d.subsidizedLunch), getVal(d.tds), getVal(d.motorbikeLoan), getVal(d.welfareFund), getVal(d.salaryOthersLoan), getVal(d.subsidizedVehicle), getVal(d.cpf), getVal(d.othersAdjustment), getVal(d.attDed), getVal(d.totalDeduction),
                            getVal(d.netPayment), getStr(d.finalAccountNo || d.bankAccount), getStr(d.paymentType), getStr(d.remarksText || d.remarks)
                        ]);
                        r.eachCell((c, colNum) => {
                            c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                            c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                            if (colNum >= 17 && colNum <= 40) c.numFmt = accountingFmt;
                            if(colNum === 3 || colNum === 43) c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                        });
                    });
                    const totRow = sheet.addRow([]);
                    totRow.getCell(3).value = `Total for ${scName}`; totRow.getCell(40).value = scTotalNet; totRow.getCell(40).numFmt = accountingFmt;
                    totRow.eachCell(c => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }; });
                }

                // ADVICE SHEET (Same logic as current generator)
                const adviceSheet = workbook.addWorksheet('Advice', { pageSetup: { printTitlesRow: '41:41', fitToWidth: 1 } });
                // ... (Static content and table generation logic here) ...

                // Finalize Zip
                const buffer = await workbook.xlsx.writeBuffer();
                const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                zip.file(`${safeName}_${sheetMeta.month}.xlsx`, buffer);
            }

            const blob = await zip.generateAsync({type:"blob"});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `Archive_${sheetMeta.month}.zip`;
            a.click();
        } catch (error) {
            customAlert("Error", "Download failed.");
        }
    }
}