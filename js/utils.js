// js/utils.js
export const $ = (id) => document.getElementById(id);

export function openModal(modalId) { $(modalId)?.classList.remove('hidden'); }
export function closeModal(modalId) { $(modalId)?.classList.add('hidden'); }

// Basic Alert/Confirm - Consider replacing with proper modal components later
export function customAlert(title, message) {
    const alertModal = $('alertModal');
    if (!alertModal) { console.error("Alert modal not found!"); alert(`${title}\n${message}`); return; }
    $('alertTitle').textContent = title;
    $('alertMessage').textContent = message;
    openModal('alertModal');
}
// Setup alert close button listener (can be done once in main.js)
// $('alertOkBtn').addEventListener('click', () => closeModal('alertModal'));

let confirmCallback = null;
export function customConfirm(title, message, callback) {
    const confirmModal = $('confirmModal');
     if (!confirmModal) { console.error("Confirm modal not found!"); if(confirm(message)) callback(); return; }
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    confirmCallback = callback;
    openModal('confirmModal');
}
// Setup confirm button listeners (can be done once in main.js)
// $('confirmCancelBtn').addEventListener('click', () => { confirmCallback = null; closeModal('confirmModal'); });
// $('confirmOkBtn').addEventListener('click', () => { if (confirmCallback) confirmCallback(); confirmCallback = null; closeModal('confirmModal'); });


export function formatDateForDisplay(dateString) { /* ... copy from index.html ... */ }
export function downloadCSV(content, fileName) { /* ... copy from index.html ... */ }

// Add Loading Spinner functions
export const showLoading = () => $('loadingOverlay')?.classList.remove('hidden');
export const hideLoading = () => $('loadingOverlay')?.classList.add('hidden');