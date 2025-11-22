// js/pastSheets.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';
import JSZip from 'jszip'; // Assume JSZip is imported or global
import * as ExcelJS from 'exceljs'; // Assume ExcelJS is imported or global


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
            // FIX: Corrected API action name from 'getSalarySheets' to 'getPastSheets'
            const sheets = await apiCall('getPastSheets');
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

            // FIX: Corrected API action name from 'getSalarySheetData' to 'getSheetData'
            const fullSheetData = await apiCall('getSheetData', 'GET', null, { sheetId: sheetMeta.id });

            if (!fullSheetData || !fullSheetData.data) throw new Error("Data empty.");

            // For Past sheets, the 'finalAccountNo' should have been saved in the DB row.
            // If not, we might need to fallback to logic, but ideally the snapshot is static.
            const employeesData = fullSheetData.data;
            const zip = new JSZip();

            // Assume the following are available (must be imported or global, e.g., via script tag):
            // import JSZip from 'jszip';
            // import * as ExcelJS from 'exceljs';
            // import { getFormattedMonthYear } from './salarySheet.js'; // Not available, using direct month name

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

                // Columns Key Map
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

                // Title Rows
                sheet.mergeCells('A1:AM1');
                sheet.getCell('A1').value = "Metal Plus Limited";
                sheet.getCell('A1').font = { bold: true, size: 16 };
                sheet.getCell('A1').alignment = { horizontal: 'center' };

                sheet.mergeCells('A2:AM2');
                sheet.getCell('A2').value = `Salary Sheet for ${sheetMeta.month}`;
                sheet.getCell('A2').font = { bold: true, size: 12 };
                sheet.getCell('A2').alignment = { horizontal: 'center' };

                // Headers
                const headers = [
                    "SL", "ID", "Name", "Designation", "Project", "Project Office", "Report Project", "Sub Center",
                    "Account No", "Bank Name", "Route No",
                    "Total Working Days", "Holidays", "Availing Leave", "LWP", "Actual Present", "Net Present",
                    "Gross Salary", "Motobike / Car Maintenance Allowance", "Laptop Rent", "Others Allowance", "Arrear", "Food Allowance", "Station Allowance", "Hardship Allowance", "Gross Payable Salary",
                    "Subsidized Lunch", "TDS", "Motorbike Loan", "Welfare Fund", "Salary/ Others Loan", "Subsidized Vehicle", "LWP", "CPF", "Others Adjustment", "Attendance Deduction", "Total Deduction",
                    "Net Salary Payment", "Remarks"
                ];
                const headerRow = sheet.addRow(headers);
                headerRow.eachCell(cell => {
                    cell.font = { bold: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
                    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    cell.alignment = { horizontal: 'center', wrapText: true };
                });
                headerRow.height = 40;

                let sl = 1;
                for (const scName of Object.keys(subCenters).sort()) {
                    // Subcenter Header
                    const scRow = sheet.addRow([`Subcenter: ${scName}`]);
                    sheet.mergeCells(scRow.number, 1, scRow.number, 39);
                    const scCell = scRow.getCell(1);
                    scCell.font = { bold: true };
                    scCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                    scCell.alignment = { horizontal: 'left' };
                    scCell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

                    // Rows
                    subCenters[scName].forEach(d => {
                        // Map legacy keys to new strict order
                        const row = sheet.addRow({
                            sl: sl++,
                            id: getStr(d.id || d.employeeId), name: getStr(d.name), desig: getStr(d.designation),
                            proj: getStr(d.project), off: getStr(d.projectOffice), rep: getStr(d.reportProject), sub: getStr(d.subCenter),
                            acc: getStr(d.finalAccountNo || d.accountNo || d.bankAccount), // Prioritize finalAccountNo
                            bank: '', route: '',
                            td: getVal(d.totalDays), hol: getVal(d.holidays), lv: getVal(d.availingLeave), lwp_d: getVal(d.lwpDays), act: getVal(d.actualPresent), net_p: getVal(d.netPresent),
                            gr_sal: getVal(d.gross), maint: getVal(d.maint), lap: getVal(d.laptop), oth: getVal(d.others || d.otherAllow), arr: getVal(d.arrear), food: getVal(d.food), stn: getVal(d.station), hard: getVal(d.hardship),
                            gr_pay: getVal(d.grossPayable),
                            lunch: getVal(d.ded_lunch || d.lunch), tds: getVal(d.ded_tds || d.tds), bike: getVal(d.ded_bike || d.bike), wel: getVal(d.ded_welfare || d.welfare),
                            loan: getVal(d.ded_loan || d.loan), veh: getVal(d.ded_vehicle || d.vehicle), lwp_a: getVal(d.ded_lwp || d.lwpAmt), cpf: getVal(d.ded_cpf || d.cpf), adj: getVal(d.ded_adj || d.adj),
                            att_ded: getVal(d.ded_attendance || d.attDed), tot_ded: getVal(d.totalDeduction || d.totalDed),
                            net_pay: getVal(d.netPayment || d.netPay),
                            rem: getStr(d.remarksText || d.remarks) // Ensure new Remark logic is saved/loaded
                        });
                        row.eachCell({includeEmpty:true}, c => { c.border = {top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'}} });
                    });
                }

                // Advice Sheet
                const adviceSheet = workbook.addWorksheet('Advice');
                adviceSheet.columns = [{header:'SL',key:'sl'},{header:'ID',key:'id'},{header:'Name',key:'name'},{header:'Account No',key:'acc'},{header:'Amount',key:'amt'},{header:'Remarks',key:'rem'}];
                let asl = 1;
                for (const scName of Object.keys(subCenters).sort()) {
                    subCenters[scName].forEach(d => {
                        adviceSheet.addRow({
                            sl: asl++, id: getStr(d.id || d.employeeId), name: getStr(d.name),
                            acc: getStr(d.finalAccountNo || d.accountNo || d.bankAccount),
                            amt: getVal(d.netPayment || d.netPay), rem: ''
                        });
                    });
                }

                const buffer = await workbook.xlsx.writeBuffer();
                zip.file(`${project.replace(/[^a-z0-9]/gi,'_')}.xlsx`, buffer);
            }

            const blob = await zip.generateAsync({type:"blob"});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `Archive_${sheetMeta.month}.zip`;
            a.click();
        } catch (error) {
            console.error(error);
            customAlert("Error", "Download failed.");
        }
    }
}