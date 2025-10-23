// js/viewDetails.js
import { $, openModal, closeModal, formatDateForDisplay } from './utils.js';

export function openViewDetailsModal(employee) {
    const contentEl = $('viewDetailsContent');
    const modal = $('viewDetailsModal');
    if (!contentEl || !modal) return;

    const isHeld = (employee.salaryHeld === true || String(employee.salaryHeld).toUpperCase() === 'TRUE');
    const detailsMap = {
        // ... (copy the full detailsMap object from index.html's openViewDetailsModal) ...
        "Employee ID": employee.employeeId, "Employee Name": employee.name, "Status": employee.status, "Salary Held": isHeld ? 'Yes' : 'No',
        "Held Since": isHeld ? (employee.holdTimestamp || 'N/A') : 'N/A',
        "Employee Type": employee.employeeType, /* ... all other fields ... */
        "Bank Account": employee.bankAccount,
        "Separation Date": employee.separationDate || 'N/A', "Remarks": employee.remarks || 'N/A',
    };

    let html = '<dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">'; // Use more gap
    for (const [label, value] of Object.entries(detailsMap)) {
         let displayValue = value;
         // Format dates using the imported helper
         if ((label === "Joining Date" || label === "Date of Birth" || label === "Separation Date") && value && value !== 'N/A') {
             displayValue = formatDateForDisplay(value);
         }
         // Format salary
         else if (label === "Gross Salary" && typeof value === 'string' && value.startsWith('₹')) {
              displayValue = value; // Already formatted potentially
         } else if (label === "Gross Salary") {
              displayValue = `₹${Number(value || 0).toLocaleString('en-IN')}`;
         }

        html += `<div class="border-b border-gray-200 pb-2"><dt class="text-sm font-medium text-gray-500">${label}</dt><dd class="mt-1 text-sm text-gray-900">${displayValue ?? 'N/A'}</dd></div>`;
    }
    html += '</dl>';
    contentEl.innerHTML = html;
    openModal('viewDetailsModal');
}

export function setupViewDetailsModal() {
    const closeBtn = $('closeViewDetailsModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal('viewDetailsModal'));
    }
    // Note: Opening is handled by the event listener in employeeList.js
}