// js/viewDetails.js
import { $, openModal, closeModal, formatDateForDisplay } from './utils.js';

// Helper to convert camelCase/snake_case keys to Title Case Labels
function keyToLabel(key) {
    if (!key) return '';
    // Replace underscores with spaces, handle camelCase by inserting space before uppercase letters
    let label = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1');
    // Uppercase first letter of each word
    label = label.replace(/\b\w/g, char => char.toUpperCase());
    return label.trim();
}


export function openViewDetailsModal(employee) {
    const contentEl = $('viewDetailsContent');
    const modal = $('viewDetailsModal');
    if (!contentEl || !modal) {
        console.error("View details modal content or container not found");
        return;
    }

    // List of keys to EXCLUDE from dynamic display
    const excludedKeys = [
        'id', // Internal row ID
        'originalEmployeeId', // Internal edit logic key
        // Explicitly excluded fields as requested
        'status', 'salaryHeld', 'holdTimestamp', 'separationDate',
        'remarks', 'lastTransferDate', 'lastSubcenter', 'lastTransferReason'
    ];

    let html = '<dl class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">';

    // Dynamically iterate through employee object properties
    for (const key in employee) {
        // Skip excluded keys
        if (excludedKeys.includes(key)) {
            continue;
        }

        // Skip properties that might come from the object prototype
        if (!employee.hasOwnProperty(key)) {
            continue;
        }

        const label = keyToLabel(key); // Generate label from key
        let value = employee[key];
        let displayValue = value;

        // Apply Specific Formatting for KNOWN keys
        if ((key === "joiningDate" || key === "dob") && value) {
             // Check if it needs formatting or might already be formatted
             if (!String(value).match(/^\d{2}-[A-Z]{3}-\d{2}/)) {
                 displayValue = formatDateForDisplay(value);
             } else {
                 displayValue = value; // Assume already formatted correctly
             }
        }
        else if (key === "salary" && (value || value === 0)) {
            displayValue = `৳${Number(value).toLocaleString('en-IN')}`;
        }
        // Add more specific formatting rules here if needed for other known keys

        // Ensure N/A for empty/null/undefined values AFTER potential formatting
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

// Function to handle closing the modal
function handleCloseViewDetails() {
    closeModal('viewDetailsModal');
}

// Sets up the close button listener
export function setupViewDetailsModal() {
    const closeBtn = $('closeViewDetailsModal');
    if (closeBtn) {
        // Ensure only one listener
        const listener = handleCloseViewDetails;
        closeBtn.removeEventListener('click', listener);
        closeBtn.addEventListener('click', listener);
        console.log("View Details modal close listener attached.");
    } else {
        console.error("Close button #closeViewDetailsModal not found during setup.");
    }
}