// js/viewDetails.js
import { $, openModal, closeModal, formatDateForDisplay } from './utils.js';

export function openViewDetailsModal(employee) {
    const contentEl = $('viewDetailsContent');
    const modal = $('viewDetailsModal');
    if (!contentEl || !modal) {
        console.error("View details modal content or container not found");
        return;
    }

    const isHeld = (employee.salaryHeld === true || String(employee.salaryHeld).toUpperCase() === 'TRUE');

    // --- COMPLETE detailsMap including Transfer fields ---
    const detailsMap = {
        "Employee ID": employee.employeeId,
        "Employee Name": employee.name,
        "Status": employee.status || 'Active',
        "Salary Held": isHeld ? 'Yes' : 'No',
        "Held Since": isHeld ? (employee.holdTimestamp || 'N/A') : 'N/A',
        "Employee Type": employee.employeeType,
        "Designation": employee.designation,
        "Joining Date": employee.joiningDate, // Formatted below
        "Work Experience (Years)": employee.workExperience,
        "Education": employee.education,
        "Project": employee.project,
        "Project Office": employee.projectOffice,
        "Report Project": employee.reportProject,
        "Sub Center": employee.subCenter, // Added Sub Center
        "Father's Name": employee.fatherName,
        "Mother's Name": employee.motherName,
        "Personal Mobile": employee.personalMobile,
        "Date of Birth": employee.dob, // Formatted below
        "Blood Group": employee.bloodGroup,
        "Address": employee.address,
        "Identification (NID/etc.)": employee.identification,
        "Nominee's Name": employee.nomineeName,
        "Nominee's Mobile": employee.nomineeMobile,
        "Official Mobile": employee.officialMobile || 'N/A',
        "Mobile Limit": employee.mobileLimit != null ? employee.mobileLimit : 'N/A',
        "Gross Salary": `৳${Number(employee.salary || 0).toLocaleString('en-IN')}`,
        "Bank Account": employee.bankAccount || 'N/A',
        // --- Added Transfer Fields ---
        "Last Transfer Date": employee.lastTransferDate || 'N/A', // Formatted below if exists
        "Last Transfer To Sub Center": employee.lastTransferToSubCenter || 'N/A',
        "Last Transfer Reason": employee.lastTransferReason || 'N/A',
        // --- End Transfer Fields ---
        "Separation Date": employee.separationDate || 'N/A', // Formatted below if exists
        "Remarks": employee.remarks || 'N/A',
    };

    let html = '<dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">';
    for (const [label, value] of Object.entries(detailsMap)) {
         let displayValue = value;

         // Format Dates (including Last Transfer Date)
         if ((label === "Joining Date" || label === "Date of Birth" || label === "Separation Date" || label === "Last Transfer Date") && value && value !== 'N/A') {
             // Check if it's already in DD-MMM-YY format (from holdTimestamp perhaps)
             if (!String(value).match(/^\d{2}-[A-Z]{3}-\d{2}/)) { // Check start of string only
                  displayValue = formatDateForDisplay(value);
             }
         }

         // Ensure N/A for empty/null values AFTER potential formatting
         displayValue = (displayValue === null || displayValue === undefined || String(displayValue).trim() === '') ? 'N/A' : displayValue;

        html += `
            <div class="border-b border-gray-200 pb-2">
                <dt class="text-sm font-medium text-gray-500">${label}</dt>
                <dd class="mt-1 text-sm text-gray-900">${displayValue}</dd>
            </div>`;
    }
    html += '</dl>';
    contentEl.innerHTML = html;
    openModal('viewDetailsModal');
}

// Sets up the close button listener
export function setupViewDetailsModal() {
    const closeBtn = $('closeViewDetailsModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal('viewDetailsModal'));
    }
}