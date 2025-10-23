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

    // --- COMPLETE detailsMap ---
    const detailsMap = {
        "Employee ID": employee.employeeId,
        "Employee Name": employee.name,
        "Status": employee.status || 'Active', // Show default if missing
        "Salary Held": isHeld ? 'Yes' : 'No',
        "Held Since": isHeld ? (employee.holdTimestamp || 'N/A') : 'N/A',
        "Employee Type": employee.employeeType,
        "Designation": employee.designation,
        "Joining Date": employee.joiningDate, // Will be formatted below
        "Work Experience (Years)": employee.workExperience,
        "Education": employee.education,
        "Project": employee.project,
        "Project Office": employee.projectOffice,
        "Report Project": employee.reportProject,
        "Sub Center": employee.subCenter,
        "Father's Name": employee.fatherName,
        "Mother's Name": employee.motherName,
        "Personal Mobile": employee.personalMobile,
        "Date of Birth": employee.dob, // Will be formatted below
        "Blood Group": employee.bloodGroup,
        "Address": employee.address,
        "Identification (NID/etc.)": employee.identification,
        "Nominee's Name": employee.nomineeName,
        "Nominee's Mobile": employee.nomineeMobile,
        "Official Mobile": employee.officialMobile || 'N/A', // Show N/A if empty
        "Mobile Limit": employee.mobileLimit != null ? employee.mobileLimit : 'N/A', // Show N/A if empty/0
        "Gross Salary": `৳${Number(employee.salary || 0).toLocaleString('en-IN')}`, // Format currency
        "Bank Account": employee.bankAccount || 'N/A', // Show N/A if empty
        "Separation Date": employee.separationDate || 'N/A', // Will be formatted below if exists
        "Remarks": employee.remarks || 'N/A', // Show N/A if empty
    };

    let html = '<dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">'; // Grid layout
    for (const [label, value] of Object.entries(detailsMap)) {
         let displayValue = value;

         // Format Dates using the imported helper
         if ((label === "Joining Date" || label === "Date of Birth" || label === "Separation Date") && value && value !== 'N/A') {
             displayValue = formatDateForDisplay(value);
         }

         // Ensure N/A for genuinely empty/null values after potential formatting
         displayValue = (displayValue === null || displayValue === undefined || displayValue === '') ? 'N/A' : displayValue;

        // Add Tailwind classes for definition list styling
        html += `
            <div class="border-b border-gray-200 pb-2">
                <dt class="text-sm font-medium text-gray-500">${label}</dt>
                <dd class="mt-1 text-sm text-gray-900">${displayValue}</dd>
            </div>`;
    }
    html += '</dl>';
    contentEl.innerHTML = html; // Set the generated HTML
    openModal('viewDetailsModal'); // Show the modal
}

// Sets up the close button listener for the View Details modal
export function setupViewDetailsModal() {
    const closeBtn = $('closeViewDetailsModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal('viewDetailsModal'));
    }
    // Note: The opening of this modal is handled by the event listener in employeeList.js
}