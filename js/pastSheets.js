// js/pastSheets.js
import { $, openModal, closeModal, customAlert } from './utils.js';
import { apiCall } from './apiClient.js';

// --- Global variable for ExcelJS ---
const ExcelJS = window.ExcelJS;
const JSZip = window.JSZip; // Get JSZip from global scope
let allEmployees = []; // To be populated by getMainLocalEmployees
let allArchives = [];  // To store the RECONSTRUCTED archives

// --- MODIFICATION: Now accepts the button ID from main.js ---
export function setupPastSheetsModal(getMainLocalEmployees, openButtonId) {
    const openBtn = $(openButtonId); // Use the new ID
    const closeBtn = $('closePastSheetsModal');

    if (openBtn) {
        openBtn.addEventListener('click', async () => {
            allEmployees = getMainLocalEmployees(); // Get fresh master employee list
            const listElement = $('pastSheetsList');
            listElement.innerHTML = '<div class="spinner"></div>';
            openModal('viewSheetsModal');

            try {
                // 1. Fetch all raw rows/chunks from the archive sheet
                const rawChunks = await apiCall('getSalaryArchive');

                // 2. Reconstruct archives from chunks
                const reconstructedArchives = reconstructArchivesFromChunks(rawChunks);

                // 3. Sort the reconstructed archives by timestamp (which is the archiveId)
                allArchives = reconstructedArchives.sort((a, b) => {
                    // The 'timestamp' field is the archiveId (ISO date string)
                    return new Date(b.timestamp) - new Date(a.timestamp);
                });

                if (allArchives.length === 0) {
                    listElement.innerHTML = '<p class="text-gray-500">No past salary sheets found in the archive.</p>';
                    return;
                }

                listElement.innerHTML = ''; // Clear spinner
                allArchives.forEach((archive, index) => {
                    let displayTime = 'Generated before timestamping';
                    if (archive.timestamp) {
                        try {
                            displayTime = new Date(archive.timestamp).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                            });
                        } catch (e) { /* ignore bad date */ }
                    }

                    const item = document.createElement('div');
                    item.className = 'flex justify-between items-center p-4 bg-gray-50 rounded-lg border';

                    item.innerHTML = `
                        <div>
                            <span class="font-medium text-gray-700">${archive.monthYear}</span>
                            <span class="block text-xs text-gray-500">${displayTime}</span>
                        </div>
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
            const button = e.target.closest('button[data-index]');
            if (button) {
                const index = parseInt(button.dataset.index, 10);
                const archive = allArchives[index]; // This is our reconstructed archive

                if (!archive || !archive.fullCompressedBase64) {
                    customAlert("Error", "Could not find the archived data.");
                    return;
                }

                button.disabled = true;
                button.textContent = 'Generating...';

                try {
                    let processedData;
                    const salaryMonth = archive.monthYear;

                    if (!window.pako) {
                        throw new Error("Pako.js compression library is not loaded.");
                    }

                    // --- *** DECOMPRESSION LOGIC *** ---
                    // This logic is correct and does not need to change,
                    // as it operates on the `fullCompressedBase64` string
                    // which we are still correctly building.
                    try {
                        // 1. We already have the full Base64 string
                        // 2. Base64-decode
                        const binaryString = atob(archive.fullCompressedBase64);

                        // 3. Convert binary string to Uint8Array
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }

                        // 4. Decompress using pako
                        const decompressedString = window.pako.inflate(bytes, { to: 'string' });

                        // 5. Parse the JSON
                        processedData = JSON.parse(decompressedString);
                    } catch (err) {
                        console.error("Failed to decompress archive:", err);
                        throw new Error(`Failed to read compressed archive: ${err.message}`);
                    }
                    // --- *** END DECOMPRESSION LOGIC *** ---


                    if (!processedData || processedData.length === 0) {
                        throw new Error("Archive data is empty or could not be read.");
                    }

                    const employeesByProject = processedData.reduce((acc, emp) => {
                        const project = emp.project || 'Unknown';
                        if (!acc[project]) acc[project] = [];
                        acc[project].push(emp);
                        return acc;
                    }, {});

                    if (!JSZip) {
                        throw new Error("JSZip library is not loaded. Please check index.html.");
                    }
                    const zip = new JSZip();

                    for (const project of Object.keys(employeesByProject)) {
                        const { fileName, blob } = await generateExcelReport(project, salaryMonth, employeesByProject[project], true);
                        zip.file(fileName, blob);
                    }

                    const zipBlob = await zip.generateAsync({ type: "blob" });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(zipBlob);
                    link.download = `Salary-Reports-${salaryMonth}-Archive.zip`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(link.href);

                    customAlert("Success", `Re-generated salary reports for ${salaryMonth} as a .zip file.`);

                } catch (error) {
                    console.error("Failed to re-generate report:", error);
                    customAlert("Error", `Failed to re-generate report: ${error.message}`);
                } finally {
                    button.disabled = false;
                    button.textContent = 'Re-download';
                }
            }
        });
    }
}

/**
 * Helper function to rebuild full archives from a flat list of chunks.
 */
function reconstructArchivesFromChunks(rawChunks) {
    const chunksById = new Map();

    // 1. Group all chunks by their unique 'timestamp' (which is our archiveId)
    for (const chunkRow of rawChunks) {
        // `chunkRow` is the entire object: { monthYear: "...", timestamp: "...", jsonData: {...} }

        // --- *** THIS IS THE FIX *** ---
        // Check the jsonData *inside* the row
        if (!chunkRow.jsonData || chunkRow.jsonData.v !== 3) {
            // This is old data (v1 or v2) or invalid, skip it.
            continue;
        }

        const id = chunkRow.timestamp; // <-- Read timestamp from the *row*
        if (!id) {
             console.warn("Found chunk row with no timestamp, skipping:", chunkRow);
             continue;
        }

        if (!chunksById.has(id)) {
            chunksById.set(id, []);
        }
        // Store the *entire row*
        chunksById.get(id).push(chunkRow);
        // --- *** END OF FIX *** ---
    }

    const completeArchives = [];

    // 2. Process each group
    for (const [id, chunkRows] of chunksById.entries()) {
        if (chunkRows.length === 0) continue;

        // --- *** THIS IS THE FIX *** ---
        // Get metadata from the first chunk's row and jsonData
        const firstChunkRow = chunkRows[0];
        const firstChunkData = firstChunkRow.jsonData;

        const total = firstChunkData.total;     // Total chunks expected
        const month = firstChunkRow.monthYear;  // <-- Get month from the *row*
        // --- *** END OF FIX *** ---

        // Check if we have all the chunks
        if (chunkRows.length !== total) {
            console.warn(`Incomplete archive ${id}: expected ${total} chunks, found ${chunkRows.length}. Skipping.`);
            continue;
        }

        // Sort chunks by index (which is inside jsonData)
        chunkRows.sort((a, b) => a.jsonData.index - b.jsonData.index);

        // 3. Re-assemble the full compressed string from jsonData.data
        const fullCompressedBase64 = chunkRows.map(row => row.jsonData.data).join('');

        // 4. Add the complete, re-assembled archive to our list
        completeArchives.push({
            archiveId: id,
            monthYear: month, // <-- Use the month from the row
            timestamp: id,    // <-- Use the id (timestamp) for sorting
            fullCompressedBase64: fullCompressedBase64
        });
    }

    return completeArchives;
}


// --- DUPLICATED HELPER FUNCTIONS ---
// (These are unchanged)

/**
 * Uses ExcelJS to build and return one .xlsx file blob for a project.
 */
async function generateExcelReport(project, salaryMonth, projectEmployees, isArchive = false) {
    if (!ExcelJS) throw new Error("ExcelJS library is not loaded.");

    const workbook = new ExcelJS.Workbook();
    workbook.creator = `HR Management System ${isArchive ? '(Archive)' : ''}`;
    workbook.created = new Date();

    // 1. Create Salary Sheet
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
            const accountableEmp = allEmployees.find(e => e.employeeId === key);
            if (accountableEmp) {
                const payment = paymentMap.get(key) || { emp: accountableEmp, amount: 0 };
                payment.amount += emp.calculatedNetSalary;
                paymentMap.set(key, payment);
            } else {
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