// js/utils.js

export const $ = (id) => document.getElementById(id);

// --- Modal Management (Compatible with new class based toggling) ---
export function openModal(modalId) {
    const el = $(modalId);
    if(el) {
        el.classList.remove('hidden');
        // Simple animation trigger if needed
        const content = el.querySelector('.modal-content');
        if(content) {
            content.style.transform = 'scale(0.95)';
            content.style.opacity = '0';
            requestAnimationFrame(() => {
                content.style.transform = 'scale(1)';
                content.style.opacity = '1';
            });
        }
    }
}

export function closeModal(modalId) {
    const el = $(modalId);
    if(el) el.classList.add('hidden');
}

export const showLoading = () => $('loadingOverlay')?.classList.remove('hidden');
export const hideLoading = () => $('loadingOverlay')?.classList.add('hidden');

// --- Custom Alert (Mapped to #alertModal) ---
export function customAlert(title, message) {
    const modal = $('alertModal');
    if (!modal) { alert(`${title}\n${message}`); return; }

    $('alertTitle').textContent = title;
    // Handle HTML safely
    const msgEl = $('alertMessage');
    msgEl.innerHTML = message; // Trusting internal calls, sanitization recommended for user input
    openModal('alertModal');
}

// --- Custom Confirm (Mapped to #confirmModal) ---
let confirmResolve = null;

export function customConfirm(title, message) {
    return new Promise((resolve) => {
        $('confirmTitle').textContent = title;
        $('confirmMessage').innerHTML = message;
        confirmResolve = resolve;
        openModal('confirmModal');
    });
}

// Global handlers attached in main.js
export function handleConfirmAction() {
    if (confirmResolve) confirmResolve(true);
    closeModal('confirmModal');
}

export function handleConfirmCancel() {
    if (confirmResolve) confirmResolve(false);
    closeModal('confirmModal');
}

// ... (Keep formatDateForDisplay, formatDateForInput, downloadCSV, downloadXLSX exactly as they were in Batch 2) ...
// Copy those functions here from your Batch 2 upload.