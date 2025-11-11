// js/utils.js

// --- DOM Selector ---
export const $ = (id) => document.getElementById(id);

// --- Modal Management ---
export function openModal(modalId) {
    $(modalId)?.classList.remove('hidden');
}
export function closeModal(modalId) {
    $(modalId)?.classList.add('hidden');
}

// --- Loading Spinner ---
export const showLoading = () => $('loadingOverlay')?.classList.remove('hidden');
export const hideLoading = () => $('loadingOverlay')?.classList.add('hidden');

// --- Custom Alert ---
// Note: Requires corresponding HTML modal elements
export function customAlert(title, message) {
    const alertModal = $('alertModal');
    if (!alertModal) { console.error("Alert modal element not found!"); alert(`${title}\n${message}`); return; }
    $('alertTitle').textContent = title;
    // --- MODIFICATION: Use innerHTML to allow formatted reports ---
    $('alertMessage').innerHTML = message;
    // --- END MODIFICATION ---
    openModal('alertModal');
}

// --- MODIFICATION: Updated Custom Confirm to return a Promise and use innerHTML ---
// Note: Requires corresponding HTML modal elements
let confirmResolve = null;
export function customConfirm(title, message) {
    return new Promise((resolve) => {
        const confirmModal = $('confirmModal');
        if (!confirmModal) {
            console.error("Confirm modal element not found!");
            resolve(confirm(message.replace(/<br>/g, '\n').replace(/<b>/g, '').replace(/<\/b>/g, ''))); // Fallback
            return;
        }
        $('confirmTitle').textContent = title;
        $('confirmMessage').innerHTML = message; // Use innerHTML for formatted messages
        confirmResolve = resolve; // Store the resolve function
        openModal('confirmModal');
    });
}
// Function to handle the actual confirmation action
export function handleConfirmAction() {
    if (confirmResolve) {
        confirmResolve(true);
    }
    confirmResolve = null;
    closeModal('confirmModal');
}
// Function to handle cancellation
export function handleConfirmCancel() {
    if (confirmResolve) {
        confirmResolve(false);
    }
    confirmResolve = null;
    closeModal('confirmModal');
}
// --- END MODIFICATION ---

// --- Date Formatting ---
export function formatDateForDisplay(dateString) {
    if (!dateString || typeof dateString !== 'string') return 'Invalid Date';
    try {
        let dateObj;
        // Handle M/D/YYYY
        if (dateString.includes('/')) {
            const parts = dateString.split('/');
            if (parts.length !== 3) return 'Invalid Date';
            dateObj = new Date(Date.UTC(parts[2], parts[0] - 1, parts[1]));
        }
        // Handle YYYY-MM-DD
        else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            dateObj = new Date(dateString + 'T00:00:00Z');
        }
        // Handle potential Excel Serial date (basic check)
        else if (!isNaN(dateString) && Number(dateString) > 10000 && Number(dateString) < 60000) {
             const excelEpoch = new Date(1899, 11, 30);
             dateObj = new Date(excelEpoch.getTime() + Number(dateString) * 24 * 60 * 60 * 1000);
        }
        // Fallback: try parsing directly
        else {
            dateObj = new Date(dateString);
        }

        if (isNaN(dateObj.getTime())) return 'Invalid Date';

        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][dateObj.getUTCMonth()];
        const year = String(dateObj.getUTCFullYear()).slice(-2);
        return `${day}-${month}-${year}`;
    } catch (e) {
        console.warn("Date parse error for display:", e);
        return 'Invalid Date';
    }
}

// Format date string (M/D/YYYY or YYYY-MM-DD or Excel Serial) into YYYY-MM-DD for <input type="date">
export function formatDateForInput(dateString) { // <<<< MAKE SURE THIS LINE HAS 'export'
     if (!dateString || (typeof dateString !== 'string' && typeof dateString !== 'number')) return ''; // Allow numbers (Excel dates)
     try {
         let dateObj = null;
         let dateValueStr = String(dateString); // Work with string version

         if (dateValueStr.includes('/')) {
             const parts = dateValueStr.split('/');
             if (parts.length === 3) dateObj = new Date(Date.UTC(parts[2], parts[0] - 1, parts[1]));
         } else if (!isNaN(dateString) && Number(dateString) > 10000 && Number(dateString) < 60000) { // Check original number
             const excelEpoch = new Date(1899, 11, 30);
             dateObj = new Date(excelEpoch.getTime() + Number(dateString) * 24 * 60 * 60 * 1000);
         } else if (dateValueStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
             dateObj = new Date(dateValueStr + 'T00:00:00Z');
         } else {
             dateObj = new Date(dateValueStr); // Fallback
         }

         if (dateObj && !isNaN(dateObj.getTime())) {
             const year = dateObj.getUTCFullYear();
             const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
             const day = String(dateObj.getUTCDate()).padStart(2, '0');
             return `${year}-${month}-${day}`;
         }
         console.warn(`Could not format date for input: ${dateString}`);
         return '';
     } catch (e) {
         console.warn(`Error converting date for input: ${dateString}`, e);
         return '';
     }
}

// --- CSV Download Helper (Kept for fallback, but unused by main flow) ---
export function downloadCSV(content, fileName) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else {
         customAlert("Error", "CSV download is not supported.");
    }
}

// --- *** MODIFIED XLSX Download Helper *** ---
/**
 * Creates and downloads an XLSX file from an array of objects using ExcelJS.
 * @param {Array<Object>} jsonData Array of data objects.
 * @param {string} fileName The desired file name (e.g., "report.xlsx").
 * @param {string} sheetName The name for the worksheet.
 */
export async function downloadXLSX(jsonData, fileName, sheetName = 'Sheet1') {
    if (typeof ExcelJS === 'undefined') {
        console.error("ExcelJS is not loaded.");
        customAlert("Error", "Could not generate XLSX file. Library not found.");
        return;
    }
    
    // --- MODIFICATION: Stronger check for valid data ---
    // This handles [], [null], [undefined], or [{}] (empty object)
    if (!jsonData || jsonData.length === 0 || !jsonData[0] || Object.keys(jsonData[0]).length === 0) {
        customAlert("No Data", "There is no data to export.");
        return;
    }
    // --- END MODIFICATION ---

    showLoading();
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName);

        // Get headers from the keys of the first object
        const headers = Object.keys(jsonData[0]);
        const columns = headers.map(header => ({
            name: header,
            filterButton: true
        }));

        // Get rows
        const rows = jsonData.map(item => {
            // --- MODIFICATION: Handle null/undefined items in array ---
            if (!item) return headers.map(() => ''); // Return empty row
            // --- END MODIFICATION ---
            return headers.map(header => item[header]);
        });

        // Add the table to the worksheet
        worksheet.addTable({
            name: 'ReportData',
            ref: 'A1',
            headerRow: true,
            columns: columns,
            rows: rows,
            style: {
                theme: 'TableStyleMedium9', // "Best table format"
                showRowStripes: true,
            }
        });

        // Auto-fit columns for readability
        worksheet.columns.forEach(column => {
            let maxLang = 0;
            
            // --- MODIFICATION: Add safe check for column.header ---
            // This prevents the exact error "Cannot read... 'length'"
            maxLang = column.header ? String(column.header).length + 2 : 10;
            // --- END MODIFICATION ---

            // Iterate over all cells in the column to find max length
            column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
                 // Skip header row
                if (rowNumber > 1) { 
                    // .value can be null/undefined, String() handles this
                    const colWidth = cell.value ? String(cell.value).length : 10;
                    if (colWidth > maxLang) {
                        maxLang = colWidth;
                    }
                }
            });
            // Set width with a buffer, max 50
            column.width = Math.min(Math.max(maxLang + 2, 10), 50); 
        });

        // Generate the XLSX file buffer
        const buffer = await workbook.xlsx.writeBuffer();
        
        // Create a Blob and trigger download
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const finalFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
        
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", finalFileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            customAlert("Error", "XLSX download is not supported in this browser.");
        }

    } catch (error) {
        console.error("Error generating XLSX file:", error);
        customAlert("Error", `Failed to generate XLSX file: ${error.message}`);
    } finally {
        hideLoading();
    }
}