// js/viewDetails.js
import { $, openModal, closeModal, formatDateForDisplay } from './utils.js';

export function openViewDetailsModal(employee) {
    const contentEl = $('viewDetailsContent');
    const modal = $('viewDetailsModal');
    if (!contentEl || !modal) return;

    const isHeld = (employee.salaryHeld === true || String(employee.salaryHeld).toUpperCase() === 'TRUE');

    const detailsMap = {
        "Employee ID": employee.employeeId,
        "Employee Name": employee.name,
        // ... (most other fields) ...
        "Gross Salary": `৳${Number(employee.salary || 0).toLocaleString('en-IN')}`,
        "Bank Account": employee.bankAccount || 'N/A',
        // --- UPDATED Transfer Fields ---
        "Last Transfer Date": employee.lastTransferDate || 'N/A',
        "Last Subcenter": employee.lastSubcenter || 'N/A', // <-- Use new key/label
        "Last Transfer Reason": employee.lastTransferReason || 'N/A',
        // --- END UPDATE ---
        "Separation Date": employee.separationDate || 'N/A',
        "Remarks": employee.remarks || 'N/A',
    };

    let html = '<dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">';
    for (const [label, value] of Object.entries(detailsMap)) {
         let displayValue = value;
         // Format Dates (including Last Transfer Date)
         if ((label === "Joining Date" || label === "Date of Birth" || label === "Separation Date" || label === "Last Transfer Date") && value && value !== 'N/A') {
             if (!String(value).match(/^\d{2}-[A-Z]{3}-\d{2}/)) {
                  displayValue = formatDateForDisplay(value);
             }
         }
         displayValue = (displayValue === null || displayValue === undefined || String(displayValue).trim() === '') ? 'N/A' : displayValue;
        html += `<div class="border-b border-gray-200 pb-2"><dt class="text-sm font-medium text-gray-500">${label}</dt><dd class="mt-1 text-sm text-gray-900">${displayValue}</dd></div>`;
    }
    html += '</dl>';
    contentEl.innerHTML = html;
    openModal('viewDetailsModal');
}

export function setupViewDetailsModal() {
    // ... (remains the same) ...
}