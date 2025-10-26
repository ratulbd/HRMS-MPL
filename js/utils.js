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
    $('alertMessage').textContent = message;
    openModal('alertModal');
}

// --- Custom Confirm ---
// Note: Requires corresponding HTML modal elements
let confirmCallback = null;
export function customConfirm(title, message, callback) {
    const confirmModal = $('confirmModal');
    if (!confirmModal) { console.error("Confirm modal element not found!"); if(confirm(message)) callback(); return; }
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    confirmCallback = callback; // Store the callback to be used by the confirm button
    openModal('confirmModal');
}
// Function to handle the actual confirmation action
export function handleConfirmAction() {
    if (confirmCallback) {
        confirmCallback();
    }
    confirmCallback = null;
    closeModal('confirmModal');
}
// Function to handle cancellation
export function handleConfirmCancel() {
    confirmCallback = null;
    closeModal('confirmModal');
}

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

// --- CSV Download Helper ---
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