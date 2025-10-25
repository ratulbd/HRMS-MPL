// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';
// Import functions to open modals from other modules
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js'; // <-- Import openTransferModal

let localEmployees = []; // Module-level state for the employee list

// Function to update the internal state
export function setLocalEmployees(employees) {
    localEmployees = employees || [];
}

// Function to render the list
function renderEmployeeList(listContainer, employeesToRender) {
    if (!listContainer) return;
    listContainer.innerHTML = ''; // Clear previous content

    if (!employeesToRender || employeesToRender.length === 0) {
        listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found.</p></div>`;
        return;
    }

    employeesToRender.forEach(emp => {
        let statusText = emp.status || 'Active';
        let statusClass = 'status-active';
        const isHeld = (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE');

        if (statusText === 'Active') {
            if (isHeld) { statusText = 'Salary Held'; statusClass = 'status-held'; }
            else { statusClass = 'status-active'; }
        } else if (statusText === 'Resigned') { statusClass = 'status-resigned'; }
        else if (statusText === 'Terminated') { statusClass = 'status-terminated'; }
        else { statusText = 'Terminated'; statusClass = 'status-terminated'; } // Default unknown status

        const card = document.createElement('div');
        card.className = 'employee-card bg-white rounded-lg shadow-md p-6 flex flex-col transition hover:shadow-lg';
        card.setAttribute('data-employee-row-id', emp.id); // Use the row ID from backend

        // --- Prepare Last Transfer Info Display ---
        let lastTransferHTML = '';
        if (emp.lastTransferDate && emp.lastTransferToSubCenter) {
            // Check if date needs formatting or is already DD-MMM-YY
            let displayDate = emp.lastTransferDate;
            if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}$/)) {
                 displayDate = formatDateForDisplay(emp.lastTransferDate);
            }
            lastTransferHTML = `
            <div class="mt-2 text-xs text-purple-700 bg-purple-50 p-2 rounded-md"> <strong>Last Transfer:</strong> ${displayDate}
                to ${emp.lastTransferToSubCenter}
                ${emp.lastTransferReason ? `(${emp.lastTransferReason.substring(0, 30)}${emp.lastTransferReason.length > 30 ? '...' : ''})` : ''}
            </div>`;
        }

        card.innerHTML = `
            <div class="flex-grow">
                <div class="flex justify-between items-start">
                     <h3 class="text-xl font-bold text-gray-900">${emp.name || 'N/A'}</h3>
                     <div class="text-right flex-shrink-0 ml-4">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        ${isHeld && emp.holdTimestamp ? `<p class="text-xs font-medium text-orange-600 pt-1">${emp.holdTimestamp}</p>` : ''}
                     </div>
                </div>
                <p class="text-gray-600">${emp.designation || 'N/A'}</p>
                <p class="text-sm text-gray-500 mb-4">ID: ${emp.employeeId || 'N/A'}</p>

                <dl class="text-sm space-y-2">
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Type:</dt> <dd class="text-gray-700">${emp.employeeType || 'N/A'}</dd></div>
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Project:</dt> <dd class="text-gray-700">${emp.project || 'N/A'}</dd></div>
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Sub Center:</dt> <dd class="text-gray-700">${emp.subCenter || 'N/A'}</dd></div> {/* Display Sub Center */}
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Salary:</dt> <dd class="text-gray-700">৳${Number(emp.salary || 0).toLocaleString('en-IN')}</dd></div>
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Joined:</dt> <dd class="text-gray-700">${formatDateForDisplay(emp.joiningDate)}</dd></div>
                    ${statusText !== 'Active' && statusText !== 'Salary Held' && emp.separationDate ? `<div class="flex"><dt class="font-medium text-gray-500 w-24">Separation:</dt> <dd class="text-gray-700">${formatDateForDisplay(emp.separationDate)}</dd></div>` : ''}
                </dl>

                ${emp.remarks ? `<div class="mt-3 text-xs text-gray-700 bg-gray-100 p-2 rounded-md"><strong>Remarks:</strong> ${emp.remarks}</div>` : ''}
                ${lastTransferHTML} {/* Display Last Transfer Info */}
            </div>

            <div class="border-t border-gray-200 mt-4 pt-4 flex flex-wrap gap-2 justify-end">
                 <button class="view-details-btn text-sm font-medium text-gray-600 hover:text-gray-900" data-id="${emp.id}">View Details</button>
                 <button class="edit-btn text-sm font-medium text-indigo-600 hover:text-indigo-800" data-id="${emp.id}">Edit</button>
                 ${statusText === 'Active' || statusText === 'Salary Held' ? `
                    <button class="toggle-hold-btn text-sm font-medium ${isHeld ? 'text-green-600 hover:text-green-800' : 'text-orange-600 hover:text-orange-800'}" data-id="${emp.id}" data-held="${isHeld}">${isHeld ? 'Unhold Salary' : 'Hold Salary'}</button>
                    {/* --- Transfer Button Added --- */}
                    <button class="transfer-btn text-sm font-medium text-purple-600 hover:text-purple-800" data-id="${emp.id}">Transfer</button>
                    <button class="resign-btn text-sm font-medium text-yellow-600 hover:text-yellow-800" data-id="${emp.id}">Resign</button>
                    <button class="terminate-btn text-sm font-medium text-red-600 hover:text-red-800" data-id="${emp.id}">Terminate</button>
                ` : ''}
            </div>
             {/* Removed inline style jsx block for badges, assuming they are in global CSS or style tag */}
        `;
        listContainer.appendChild(card);
    });
}

// Function to filter and render
export function filterAndRenderEmployees(filters, employees) {
    // ... (This function remains the same as before) ...
    const listContainer = $('employee-list'); /* ... rest ... */
    renderEmployeeList(listContainer, filtered);
}

// Function to populate filter dropdowns
export function populateFilterDropdowns(employees) {
    // ... (This function remains the same as before) ...
}

// Function to set up the main event listener for the list
export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
    const listContainer = $('employee-list');
    if (!listContainer) return;

    listContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const cardElement = target.closest('.employee-card');
        if (!cardElement) return;
        const localId = cardElement.dataset.employeeRowId;
        if (!localId) return;

        const currentEmployees = getEmployeesFunc();
        const employee = currentEmployees.find(emp => String(emp.id) === String(localId));

        if (!employee) {
            customAlert("Error", "Could not find employee data. Please refresh.");
            return;
        }
        const employeeSheetId = employee.employeeId;
        if (!employeeSheetId) {
             customAlert("Error", "Employee ID is missing."); return;
        }

        // --- Handle Button Clicks ---
        if (target.classList.contains('view-details-btn')) {
            openViewDetailsModal(employee);
        } else if (target.classList.contains('edit-btn')) {
            openEmployeeModal(employee, currentEmployees);
        } else if (target.classList.contains('resign-btn')) {
            openStatusChangeModal(employee, 'Resigned');
        } else if (target.classList.contains('terminate-btn')) {
            openStatusChangeModal(employee, 'Terminated');
        } else if (target.classList.contains('toggle-hold-btn')) {
            const isCurrentlyHeld = target.dataset.held === 'true';
            const newHeldStatus = !isCurrentlyHeld;
            try {
                await apiCall('updateStatus', 'POST', {
                    employeeId: employeeSheetId,
                    salaryHeld: newHeldStatus
                });
                console.log(`API call successful for hold status update.`);
                fetchEmployeesFunc();
            } catch (error) {
                customAlert("Error", `Failed to update salary status: ${error.message}`);
            }
        } else if (target.classList.contains('transfer-btn')) { // <-- Added Handler
             openTransferModal(employee);                       // <-- Call openTransferModal
         }
    });
}