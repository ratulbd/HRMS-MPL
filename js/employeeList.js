// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';
// Import functions to open modals from other modules
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';

let localEmployees = []; // Module-level state for the employee list

// Function to update the internal state
export function setLocalEmployees(employees) {
    localEmployees = employees || [];
}

// Function to render the list (ensure no references to 'filtered' here)
function renderEmployeeList(listContainer, employeesToRender) {
    if (!listContainer) return;
    listContainer.innerHTML = ''; // Clear previous content

    if (!employeesToRender || employeesToRender.length === 0) {
        listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found matching the current filters.</p></div>`;
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
        else { statusText = 'Terminated'; statusClass = 'status-terminated'; }

        const card = document.createElement('div');
        card.className = 'employee-card bg-white rounded-lg shadow-md p-6 flex flex-col transition hover:shadow-lg';
        card.setAttribute('data-employee-row-id', emp.id);

        let lastTransferHTML = '';
        if (emp.lastTransferDate && emp.lastTransferToSubCenter) {
            let displayDate = emp.lastTransferDate;
            if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) {
                 displayDate = formatDateForDisplay(emp.lastTransferDate);
            }
            lastTransferHTML = `
            <div class="mt-2 text-xs text-purple-700 bg-purple-50 p-2 rounded-md">
                <strong>Last Transfer:</strong> ${displayDate}
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
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Sub Center:</dt> <dd class="text-gray-700">${emp.subCenter || 'N/A'}</dd></div>
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Salary:</dt> <dd class="text-gray-700">৳${Number(emp.salary || 0).toLocaleString('en-IN')}</dd></div>
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Joined:</dt> <dd class="text-gray-700">${formatDateForDisplay(emp.joiningDate)}</dd></div>
                    ${statusText !== 'Active' && statusText !== 'Salary Held' && emp.separationDate ? `<div class="flex"><dt class="font-medium text-gray-500 w-24">Separation:</dt> <dd class="text-gray-700">${formatDateForDisplay(emp.separationDate)}</dd></div>` : ''}
                </dl>

                ${emp.remarks ? `<div class="mt-3 text-xs text-gray-700 bg-gray-100 p-2 rounded-md"><strong>Remarks:</strong> ${emp.remarks}</div>` : ''}
                ${lastTransferHTML}
            </div>

            <div class="border-t border-gray-200 mt-4 pt-4 flex flex-wrap gap-2 justify-end">
                 <button class="view-details-btn text-sm font-medium text-gray-600 hover:text-gray-900" data-id="${emp.id}">View Details</button>
                 <button class="edit-btn text-sm font-medium text-indigo-600 hover:text-indigo-800" data-id="${emp.id}">Edit</button>
                 ${statusText === 'Active' || statusText === 'Salary Held' ? `
                    <button class="toggle-hold-btn text-sm font-medium ${isHeld ? 'text-green-600 hover:text-green-800' : 'text-orange-600 hover:text-orange-800'}" data-id="${emp.id}" data-held="${isHeld}">${isHeld ? 'Unhold Salary' : 'Hold Salary'}</button>
                    <button class="transfer-btn text-sm font-medium text-purple-600 hover:text-purple-800" data-id="${emp.id}">Transfer</button>
                    <button class="resign-btn text-sm font-medium text-yellow-600 hover:text-yellow-800" data-id="${emp.id}">Resign</button>
                    <button class="terminate-btn text-sm font-medium text-red-600 hover:text-red-800" data-id="${emp.id}">Terminate</button>
                ` : ''}
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// Function to filter and render
export function filterAndRenderEmployees(filters, employees) {
    const listContainer = $('employee-list');
    const initialLoadingIndicator = $('initialLoading');

    // Remove loading indicator if it exists
    if (initialLoadingIndicator && initialLoadingIndicator.parentNode === listContainer) {
        listContainer.removeChild(initialLoadingIndicator);
    }

    // Ensure employees is an array before filtering
    if (!Array.isArray(employees)) {
        console.error("filterAndRenderEmployees received non-array for employees:", employees);
        renderEmployeeList(listContainer, []); // Render empty list
        return;
    }

    // Ensure filters object exists and has needed properties
     const safeFilters = {
         name: filters?.name || '',
         status: filters?.status || '',
         designation: filters?.designation || '',
         type: filters?.type || '',
     };
     const nameFilterLower = safeFilters.name.toLowerCase();

    // --- Declare filtered variable correctly ---
    const filtered = employees.filter(emp => {
        // Basic validation of employee object
        if (!emp || typeof emp.name !== 'string' || typeof emp.employeeId !== 'string') {
             console.warn("Skipping invalid employee object during filter:", emp);
             return false;
        }

        let effectiveStatus = emp.status || 'Active';
        if (effectiveStatus === 'Active' && (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE')) {
            effectiveStatus = 'Salary Held';
        }

        const nameMatch = nameFilterLower === '' || emp.name.toLowerCase().includes(nameFilterLower) || emp.employeeId.toLowerCase().includes(nameFilterLower);
        const statusMatch = safeFilters.status === '' || effectiveStatus === safeFilters.status;
        const designationMatch = safeFilters.designation === '' || emp.designation === safeFilters.designation;
        const typeMatch = safeFilters.type === '' || emp.employeeType === safeFilters.type;

        return nameMatch && statusMatch && designationMatch && typeMatch;
    });
    // --- End filtered variable declaration ---

    // Pass the correctly defined 'filtered' array to render function
    renderEmployeeList(listContainer, filtered);
}

// Function to populate filter dropdowns
export function populateFilterDropdowns(employees) {
    const designationFilter = $('filterDesignation');
    if (!designationFilter) return;

    // Ensure employees is an array
    if (!Array.isArray(employees)) {
        console.error("populateFilterDropdowns received non-array for employees:", employees);
        employees = []; // Use empty array to prevent errors
    }


    const designations = [...new Set(employees.map(e => e?.designation).filter(d => d && typeof d === 'string'))]; // Added safe navigation e?.designation
    const currentVal = designationFilter.value;

    designationFilter.innerHTML = '<option value="">All</option>';
    designations.sort().forEach(d => {
        const option = document.createElement('option');
        option.value = d;
        option.textContent = d;
        designationFilter.appendChild(option);
    });

    if (designations.includes(currentVal)) {
        designationFilter.value = currentVal;
    } else if (currentVal !== "") {
         // If a filter was selected but is no longer valid, reset to "All"
         designationFilter.value = "";
    }
}


// Function to set up the main event listener for the list
export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
    const listContainer = $('employee-list');
    if (!listContainer) {
         console.error("Employee list container not found for attaching listeners.");
         return;
    }

    listContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const cardElement = target.closest('.employee-card');
        if (!cardElement) return;
        const localId = cardElement.dataset.employeeRowId;
        if (!localId) return;

        const currentEmployees = getEmployeesFunc(); // Get current full list
        // Find employee using the row ID (emp.id)
        const employee = currentEmployees.find(emp => String(emp.id) === String(localId));

        if (!employee) {
            customAlert("Error", "Could not find employee data. The list might be outdated. Please wait for refresh or try again.");
            console.warn(`Employee not found in local cache for row ID: ${localId}`);
            return;
        }
        const employeeSheetId = employee.employeeId; // Get the actual Employee ID
        if (!employeeSheetId) {
             customAlert("Error", "Employee ID is missing for this record.");
             return;
        }

        // Handle Button Clicks
        if (target.classList.contains('view-details-btn')) {
            // Check if function exists before calling
            if (typeof openViewDetailsModal === 'function') openViewDetailsModal(employee);
        } else if (target.classList.contains('edit-btn')) {
            if (typeof openEmployeeModal === 'function') openEmployeeModal(employee, currentEmployees);
        } else if (target.classList.contains('resign-btn')) {
            if (typeof openStatusChangeModal === 'function') openStatusChangeModal(employee, 'Resigned');
        } else if (target.classList.contains('terminate-btn')) {
            if (typeof openStatusChangeModal === 'function') openStatusChangeModal(employee, 'Terminated');
        } else if (target.classList.contains('toggle-hold-btn')) {
            const isCurrentlyHeld = target.dataset.held === 'true';
            const newHeldStatus = !isCurrentlyHeld;
            try {
                await apiCall('updateStatus', 'POST', {
                    employeeId: employeeSheetId,
                    salaryHeld: newHeldStatus
                });
                console.log(`API call successful for hold status update.`);
                // Call fetch function passed from main.js
                if (typeof fetchEmployeesFunc === 'function') fetchEmployeesFunc();
            } catch (error) {
                customAlert("Error", `Failed to update salary status: ${error.message}`);
            }
        } else if (target.classList.contains('transfer-btn')) {
            if (typeof openTransferModal === 'function') openTransferModal(employee);
        }
    });
}