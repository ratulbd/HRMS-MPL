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

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    async function loadPastSheets() {
        try {
            // Fetch summary list of sheets
            const sheets = await apiCall('getSalarySheets');
            renderSheetList(sheets);
        } catch (error) {
            console.error(error);
            listContainer.innerHTML = '<div class="text-center py-4 text-red-500">Failed to load sheets.</div>';
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

            const info = document.createElement('div');
            info.innerHTML = `
                <p class="font-semibold text-gray-800">${sheet.month || 'Unknown Month'}</p>
                <p class="text-xs text-gray-500">Generated: ${formatDateForDisplay(sheet.generatedAt)} | ${sheet.count || 0} Employees</p>
            `;

            const actionDiv = document.createElement('div');

            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn btn-sm btn-primary ml-2';
            downloadBtn.innerHTML = '<i class="fas fa-download mr-1"></i> Download';
            downloadBtn.addEventListener('click', () => downloadSheet(sheet));

            actionDiv.appendChild(downloadBtn);
            item.appendChild(info);
            item.appendChild(actionDiv);
            listContainer.appendChild(item);
        });
    }

    // === RE-GENERATION LOGIC ===
    async function downloadSheet(sheetMeta) {
        try {
            customAlert("Please Wait", "Downloading salary sheet...");

            const fullSheetData = await apiCall('getSalarySheetData', 'GET', null, { id: sheetMeta.id });

            if (!fullSheetData || !fullSheetData.data) {
                throw new Error("Sheet data is empty.");
            }

            const employeesData = fullSheetData.data;

            const workbook = new ExcelJS.Workbook();

            // ==========================================
            // 1. Salary Sheet (Was GP Salary Sheet)
            // ==========================================
            const worksheet = workbook.addWorksheet('Salary Sheet'); // <--- CORRECTED NAME

            worksheet.columns = [
                { header: 'ID', key: 'id', width: 10 },
                { header: 'Name', key: 'name', width: 20 },
                { header: 'Designation', key: 'designation', width: 15 },
                { header: 'Project', key: 'project', width: 15 },
                { header: 'Project Office', key: 'projectOffice', width: 15 },
                { header: 'Report Project', key: 'reportProject', width: 15 },
                { header: 'Sub Center', key: 'subCenter', width: 15 },

                { header: 'Common Account Holder Name', key: 'holderName', width: 20 },
                { header: 'Common Account Holder ID', key: 'holderId', width: 15 },

                { header: 'Account No', key: 'accountNo', width: 15 },
                { header: 'Bank Name', key: 'bankName', width: 15 },
                { header: 'Route No', key: 'routeNo', width: 10 },

                // Attendance
                { header: 'Total Working Days', key: 'totalDays', width: 12 },
                { header: 'Holidays', key: 'holidays', width: 10 },
                { header: 'Availing Leave', key: 'availingLeave', width: 12 },
                { header: 'LWP (Days)', key: 'lwpDays', width: 10 },
                { header: 'Actual Present', key: 'actualPresent', width: 12 },
                { header: 'Net Present', key: 'netPresent', width: 12 },

                // Earnings
                { header: 'Gross Salary', key: 'gross', width: 12 },
                { header: 'Motobike/Car Maint.', key: 'maint', width: 15 },
                { header: 'Laptop Rent', key: 'laptop', width: 12 },
                { header: 'Others Allowance', key: 'otherAllow', width: 15 },
                { header: 'Arrear', key: 'arrear', width: 10 },
                { header: 'Food Allowance', key: 'food', width: 12 },
                { header: 'Station Allowance', key: 'station', width: 12 },
                { header: 'Hardship Allowance', key: 'hardship', width: 12 },

                { header: 'Gross Payable Salary', key: 'grossPayable', width: 18, style: { font: { bold: true } } },

                // Deductions
                { header: 'Subsidized Lunch', key: 'ded_lunch', width: 12 },
                { header: 'TDS', key: 'ded_tds', width: 10 },
                { header: 'Motorbike Loan', key: 'ded_bike', width: 12 },
                { header: 'Welfare Fund', key: 'ded_welfare', width: 12 },
                { header: 'Salary/Others Loan', key: 'ded_loan', width: 15 },
                { header: 'Subsidized Vehicle', key: 'ded_vehicle', width: 12 },
                { header: 'LWP (Amount)', key: 'ded_lwp', width: 12 },
                { header: 'CPF', key: 'ded_cpf', width: 10 },
                { header: 'Others Adjustment', key: 'ded_adj', width: 15 },
                { header: 'Attendance Deduction', key: 'ded_attendance', width: 15 },

                { header: 'Total Deduction', key: 'totalDeduction', width: 15, style: { font: { bold: true } } },
                { header: 'Net Payment', key: 'netPayment', width: 15, style: { font: { bold: true }, fill: { type: 'pattern', pattern:'solid', fgColor:{argb:'FFFFE0'} } } },
                { header: 'Remarks', key: 'remarks', width: 20 }
            ];

            const getVal = (val) => (val !== undefined && val !== null) ? Number(val) : 0;
            const getStr = (val) => (val !== undefined && val !== null) ? String(val) : '';

            employeesData.forEach(row => {
                worksheet.addRow({
                    id: getStr(row.id || row.employeeId),
                    name: getStr(row.name),
                    designation: getStr(row.designation),
                    project: getStr(row.project),
                    projectOffice: getStr(row.projectOffice),
                    reportProject: getStr(row.reportProject),
                    subCenter: getStr(row.subCenter),

                    holderName: getStr(row.holderName),
                    holderId: getStr(row.holderId),

                    accountNo: getStr(row.accountNo || row.bankAccount),
                    bankName: getStr(row.bankName),
                    routeNo: getStr(row.routeNo),

                    totalDays: getVal(row.totalDays),
                    holidays: getVal(row.holidays),
                    availingLeave: getVal(row.availingLeave),
                    lwpDays: getVal(row.lwpDays),
                    actualPresent: getVal(row.actualPresent),
                    netPresent: getVal(row.netPresent),

                    gross: getVal(row.gross || row.salary),
                    maint: getVal(row.maint),
                    laptop: getVal(row.laptop),
                    otherAllow: getVal(row.otherAllow),
                    arrear: getVal(row.arrear),
                    food: getVal(row.food),
                    station: getVal(row.station),
                    hardship: getVal(row.hardship),

                    grossPayable: getVal(row.grossPayable),

                    ded_lunch: getVal(row.ded_lunch),
                    ded_tds: getVal(row.ded_tds),
                    ded_bike: getVal(row.ded_bike),
                    ded_welfare: getVal(row.ded_welfare),
                    ded_loan: getVal(row.ded_loan),
                    ded_vehicle: getVal(row.ded_vehicle),
                    ded_lwp: getVal(row.ded_lwp),
                    ded_cpf: getVal(row.ded_cpf),
                    ded_adj: getVal(row.ded_adj),
                    ded_attendance: getVal(row.ded_attendance),

                    totalDeduction: getVal(row.totalDeduction),
                    netPayment: getVal(row.netPayment),
                    remarks: getStr(row.remarks)
                });
            });

            // ==========================================
            // 2. Advice Sheet
            // ==========================================
            const adviceSheet = workbook.addWorksheet('Advice');
            adviceSheet.columns = [
                { header: 'SL', key: 'sl', width: 8 },
                { header: 'ID', key: 'id', width: 15 },
                { header: 'Name', key: 'name', width: 25 },
                { header: 'Account No', key: 'account', width: 20 },
                { header: 'Amount', key: 'amount', width: 15 },
                { header: 'Remarks', key: 'remarks', width: 20 }
            ];

            employeesData.forEach((row, index) => {
                adviceSheet.addRow({
                    sl: index + 1,
                    id: getStr(row.id || row.employeeId),
                    name: getStr(row.name),
                    account: getStr(row.accountNo || row.bankAccount),
                    amount: getVal(row.netPayment),
                    remarks: getStr(row.remarks)
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `Salary_Sheet_${sheetMeta.month || 'Past'}.xlsx`;
            anchor.click();
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Download error:", error);
            customAlert("Download Error", "Failed to download the file. " + error.message);
        }
    }
}