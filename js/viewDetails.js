// js/viewDetails.js
import { $, openModal, closeModal, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';

// --- MODIFICATION: Improved keyToLabel to handle more cases ---
function keyToLabel(key) {
    if (!key) return '';
    // Handle specific acronyms first
    key = key.replace('dob', 'Date of Birth');
    key = key.replace('tds', 'TDS');
    key = key.replace('lwp', 'LWP');
    key = key.replace('cpf', 'CPF');
    key = key.replace('holdTimestamp', 'Salary Hold Date');

    // Replace 'remarks' from sheet with 'General Remarks' to avoid confusion with Hold Remarks
    if (key === 'remarks') return 'General Remarks';

    // Replace underscores with spaces, handle camelCase by inserting space before uppercase letters
    let label = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1');
    // Uppercase first letter of each word
    label = label.replace(/\b\w/g, char => char.toUpperCase());
    return label.trim();
}
// --- END MODIFICATION ---


export async function openViewDetailsModal(employee) {
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
        'status',
        'salaryHeld',
        // 'holdTimestamp' // REQ 2: REMOVED from exclusion so it shows
    ];

    const currencyKeys = [
        'previousSalary', 'basic', 'others', 'salary', 'motobikeCarMaintenance', 'laptopRent',
        'othersAllowance', 'arrear', 'foodAllowance', 'stationAllowance', 'hardshipAllowance', 'grandTotal', 'gratuity',
        'subsidizedLunch', 'tds', 'motorbikeLoan', 'welfareFund', 'salaryOthersLoan', 'subsidizedVehicle', 'lwp', 'cpf',
        'othersAdjustment', 'totalDeduction', 'netSalaryPayment', 'mobileLimit'
    ];

    // === NEW LOGIC: Fetch Hold Remarks from Log if Held ===
    let holdLogRemarks = null;
    const isHeld = (employee.status === 'Salary Held' || String(employee.salaryHeld).toLowerCase() === 'true');

    if (isHeld) {
        try {
            // Note: apiCall will trigger the global loading spinner
            const logs = await apiCall('getHoldLog');

            // Filter logs for this employee
            if (Array.isArray(logs)) {
                const empLogs = logs.filter(l => String(l.employeeId) === String(employee.employeeId));

                // Get the latest log entry (assuming append order)
                if (empLogs.length > 0) {
                     const latestLog = empLogs[empLogs.length - 1];
                     // Check 'remarks' or 'reason' key depending on log structure
                     holdLogRemarks = latestLog.remarks || latestLog.reason;
                }
            }
        } catch (e) {
            console.error("Failed to fetch hold logs:", e);
        }
    }
    // === END NEW LOGIC ===

    let html = '<dl class="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">';

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

        const label = keyToLabel(key);
        let value = employee[key];
        let displayValue = value;

        // Apply Specific Formatting
        if ((key === "joiningDate" || key === "dob" || key === "separationDate" || key === "lastTransferDate" || key === "fileClosingDate" || key === "holdTimestamp") && value) {
             if (!String(value).match(/^\d{2}-[A-Z]{3}-\d{2}/)) {
                 displayValue = formatDateForDisplay(value);
             } else {
                 displayValue = value;
             }
        }
        else if (currencyKeys.includes(key) && (value || value === 0)) {
            displayValue = `৳${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        // Ensure N/A for empty/null/undefined values
        displayValue = (displayValue === null || displayValue === undefined || String(displayValue).trim() === '') ? 'N/A' : displayValue;

        // Hide hold timestamp if N/A
        if (key === 'holdTimestamp' && displayValue === 'N/A') continue;

        html += `
            <div class="border-b border-gray-200 pb-2">
                <dt class="text-sm font-medium text-gray-500">${label}</dt>
                <dd class="mt-1 text-sm text-gray-900">${displayValue}</dd>
            </div>`;
    }

    // === INJECT HOLD REMARKS ===
    if (isHeld && holdLogRemarks) {
        html += `
            <div class="border-b border-gray-200 pb-2 bg-red-50 p-2 rounded col-span-1 md:col-span-3">
                <dt class="text-sm font-bold text-red-700">Hold Reason (From Log)</dt>
                <dd class="mt-1 text-sm text-gray-900">${holdLogRemarks}</dd>
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