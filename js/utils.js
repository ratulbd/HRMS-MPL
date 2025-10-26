// js/utils.js

export const $ = (id) => document.getElementById(id);

export function openModal(modalId) { $(modalId)?.classList.remove('hidden'); }
export function closeModal(modalId) { $(modalId)?.classList.add('hidden'); }

export const showLoading = () => $('loadingOverlay')?.classList.remove('hidden');
export const hideLoading = () => $('loadingOverlay')?.classList.add('hidden');

export function customAlert(title, message) {
    const alertModal = $('alertModal');
    if (!alertModal) { console.error("Alert modal element not found!"); alert(`${title}\n${message}`); return; }
    $('alertTitle').textContent = title;
    $('alertMessage').textContent = message;
    openModal('alertModal');
}

let confirmCallback = null;
export function customConfirm(title, message, callback) {
    const confirmModal = $('confirmModal');
    if (!confirmModal) { console.error("Confirm modal element not found!"); if(confirm(message)) callback(); return; }
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    confirmCallback = callback;
    openModal('confirmModal');
}
export function handleConfirmAction() {
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
    closeModal('confirmModal');
}
export function handleConfirmCancel() {
    confirmCallback = null;
    closeModal('confirmModal');
}

export function formatDateForDisplay(dateString) {
    // ... (keep existing function) ...
    if (!dateString || (typeof dateString !== 'string' && typeof dateString !== 'number')) return 'Invalid Date';
    try { /* ... parsing logic ... */ } catch (e) { /* ... */ return 'Invalid Date'; }
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][dateObj.getUTCMonth()];
    const year = String(dateObj.getUTCFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
}

export function formatDateForInput(dateString) {
    // ... (keep existing function) ...
     if (!dateString || (typeof dateString !== 'string' && typeof dateString !== 'number')) return '';
     try { /* ... parsing logic ... */ } catch (e) { /* ... */ return ''; }
     const year = dateObj.getUTCFullYear();
     const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
     const day = String(dateObj.getUTCDate()).padStart(2, '0');
     return `${year}-${month}-${day}`;
}

export function downloadCSV(content, fileName) {
    // ... (keep existing function) ...
}

// --- Chart Colors ---
export const chartColors = {
	blue: 'rgb(59, 130, 246)',
	green: 'rgb(34, 197, 94)',
	red: 'rgb(239, 68, 68)',
	yellow: 'rgb(234, 179, 8)',
	orange: 'rgb(249, 115, 22)',
	purple: 'rgb(168, 85, 247)',
    gray: 'rgb(107, 114, 128)'
};

export function getChartColorPalette(count) {
    const palette = [ chartColors.blue, chartColors.green, chartColors.purple, chartColors.orange, chartColors.red, chartColors.yellow, chartColors.gray ];
    return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}