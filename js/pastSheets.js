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
            downloadBtn.innerHTML = '<i class="fas fa-download mr-1"></i> Download ZIP';
            downloadBtn.addEventListener('click', () => downloadSheetZip(sheet));

            actionDiv.appendChild(downloadBtn);
            item.appendChild(info);
            item.appendChild(actionDiv);
            listContainer.appendChild(item);
        });
    }

    async function downloadSheetZip(sheetMeta) {
        try {
            customAlert("Please Wait", "Downloading and archiving files...");

            const fullSheetData = await apiCall('getSalarySheetData', 'GET', null, { id: sheetMeta.id });

            if (!fullSheetData || !fullSheetData.data) {
                throw new Error("Sheet data is empty.");
            }

            const employeesData = fullSheetData.data;
            const zip = new JSZip();

            // Group by Report Project
            const projectGroups = {};
            employeesData.forEach(d => {
                const project = d.reportProject || 'Unknown_Project';
                if (!projectGroups[project]) projectGroups[project] = [];
                projectGroups[project].push(d);
            });

            // Helper to safely get values from old data structure
            const getVal = (val) => (val !== undefined && val !== null) ? Number(val) : 0;
            const getStr = (val) => (val !== undefined && val !== null) ? String(val) : '';

            // Generate Excel for each group
            for (const [project, empList] of Object.entries(projectGroups)) {
                const workbook = new ExcelJS.Workbook();
                const sheet = workbook.addWorksheet('Salary Sheet');

                // Headers strictly matching requested format
                sheet.columns = [
                    { header: 'SL', key: 'sl', width: 5 },
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

                    { header: 'Total Working Days', key: 'totalDays', width: 12 },
                    { header: 'Holidays', key: 'holidays', width: 10 },
                    { header: 'Availing Leave', key: 'availingLeave', width: 12 },
                    { header: 'LWP', key: 'lwpDays', width: 10 },
                    { header: 'Actual Present', key: 'actualPresent', width: 12 },
                    { header: 'Net Present', key: 'netPresent', width: 12 },

                    { header: 'Gross Salary', key: 'gross', width: 12 },
                    { header: 'Motobike / Car Maintenance Allowance', key: 'maint', width: 20 },
                    { header: 'Laptop Rent', key: 'laptop', width: 12 },
                    { header: 'Others Allowance', key: 'others', width: 15 },
                    { header: 'Arrear', key: 'arrear', width: 10 },
                    { header: 'Food Allowance', key: 'food', width: 12 },
                    { header: 'Station Allowance', key: 'station', width: 12 },
                    { header: 'Hardship Allowance', key: 'hardship', width: 12 },
                    { header: 'Gross Payable Salary', key: 'grossPayable', width: 15, style: { font: { bold: true } } },

                    { header: 'Subsidized Lunch', key: 'lunch', width: 12 },
                    { header: 'TDS', key: 'tds', width: 10 },
                    { header: 'Motorbike Loan', key: 'bike', width: 12 },
                    { header: 'Welfare Fund', key: 'welfare', width: 12 },
                    { header: 'Salary/ Others Loan', key: 'loan', width: 15 },
                    { header: 'Subsidized Vehicle', key: 'vehicle', width: 12 },
                    { header: 'LWP', key: 'lwpAmt', width: 12 },
                    { header: 'CPF', key: 'cpf', width: 10 },
                    { header: 'Others Adjustment', key: 'adj', width: 15 },
                    { header: 'Attendance Deduction', key: 'attDed', width: 15 },
                    { header: 'Total Deduction', key: 'totalDed', width: 15, style: { font: { bold: true } } },

                    { header: 'Net Salary Payment', key: 'netPay', width: 15, style: { font: { bold: true }, fill: { type: 'pattern', pattern:'solid', fgColor:{argb:'FFFFE0'} } } },
                    { header: 'Remarks', key: 'remarks', width: 20 }
                ];

                empList.forEach((d, index) => {
                    // Note: Handling different variable names from previous 'generateSalaryExcel' output structure
                    // If historical data used 'ded_lunch', use that. If it used nested objects, this needs to adjust.
                    // Assuming past sheets stored FLAT data (like the previous pastSheets code logic).

                    sheet.addRow({
                        sl: index + 1,
                        id: getStr(d.id || d.employeeId),
                        name: getStr(d.name),
                        designation: getStr(d.designation),
                        project: getStr(d.project),
                        projectOffice: getStr(d.projectOffice),
                        reportProject: getStr(d.reportProject),
                        subCenter: getStr(d.subCenter),
                        holderName: getStr(d.holderName),
                        holderId: getStr(d.holderId),
                        accountNo: getStr(d.accountNo || d.bankAccount),
                        bankName: getStr(d.bankName),
                        routeNo: getStr(d.routeNo),

                        totalDays: getVal(d.totalDays),
                        holidays: getVal(d.holidays),
                        availingLeave: getVal(d.availingLeave),
                        lwpDays: getVal(d.lwpDays),
                        actualPresent: getVal(d.actualPresent),
                        netPresent: getVal(d.netPresent),

                        gross: getVal(d.gross),
                        maint: getVal(d.maint),
                        laptop: getVal(d.laptop),
                        others: getVal(d.otherAllow || d.others), // check both keys
                        arrear: getVal(d.arrear),
                        food: getVal(d.food),
                        station: getVal(d.station),
                        hardship: getVal(d.hardship),
                        grossPayable: getVal(d.grossPayable),

                        lunch: getVal(d.ded_lunch || d.lunch),
                        tds: getVal(d.ded_tds || d.tds),
                        bike: getVal(d.ded_bike || d.bike),
                        welfare: getVal(d.ded_welfare || d.welfare),
                        loan: getVal(d.ded_loan || d.loan),
                        vehicle: getVal(d.ded_vehicle || d.vehicle),
                        lwpAmt: getVal(d.ded_lwp || d.lwpAmt),
                        cpf: getVal(d.ded_cpf || d.cpf),
                        adj: getVal(d.ded_adj || d.adj),
                        attDed: getVal(d.ded_attendance || d.attDed),
                        totalDed: getVal(d.totalDeduction || d.totalDed),

                        netPay: getVal(d.netPayment || d.netPay),
                        remarks: getStr(d.remarks)
                    });
                });

                // Advice Sheet
                const adviceSheet = workbook.addWorksheet('Advice');
                adviceSheet.columns = [
                    { header: 'SL', key: 'sl', width: 5 },
                    { header: 'ID', key: 'id', width: 15 },
                    { header: 'Name', key: 'name', width: 25 },
                    { header: 'Account No', key: 'account', width: 20 },
                    { header: 'Amount', key: 'amount', width: 15 },
                    { header: 'Remarks', key: 'remarks', width: 20 }
                ];

                empList.forEach((d, index) => {
                    adviceSheet.addRow({
                        sl: index + 1,
                        id: getStr(d.id || d.employeeId),
                        name: getStr(d.name),
                        account: getStr(d.accountNo || d.bankAccount),
                        amount: getVal(d.netPayment || d.netPay),
                        remarks: ''
                    });
                });

                const buffer = await workbook.xlsx.writeBuffer();
                const safeProjectName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                zip.file(`${safeProjectName}.xlsx`, buffer);
            }

            // Trigger Zip Download
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = `Salary_Sheet_Archive_${sheetMeta.month}.zip`;
            link.click();
            URL.revokeObjectURL(link.href);

        } catch (error) {
            console.error("Download error:", error);
            customAlert("Download Error", "Failed to download the file. " + error.message);
        }
    }
}