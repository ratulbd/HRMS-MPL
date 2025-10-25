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

// Function to render the list
function renderEmployeeList(listContainer, employeesToRender) {
    // console.log("Starting renderEmployeeList..."); // Optional: Keep for debugging if needed
    if (!listContainer) {
        console.error("renderEmployeeList: listContainer element not found.");
        return;
    }
    listContainer.innerHTML = ''; // Clear previous content

    if (!employeesToRender || employeesToRender.length === 0) {
        // console.log("renderEmployeeList: No employees to render.");
        listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found matching the current filters.</p></div>`;
        return;
    }

    // console.log(`renderEmployeeList: Rendering ${employeesToRender.length} employee cards.`);
    try {
        employeesToRender.forEach((emp, index) => {
             if (!emp || typeof emp.id === 'undefined') {
                  console.warn(`renderEmployeeList: Skipping invalid employee data at index ${index}:`, emp);
                  return;
             }

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
            // IMPORTANT: Use emp.id (row number from backend) for reliable identification
            card.setAttribute('data-employee-row-id', emp.id);

            let lastTransferHTML = '';
            if (emp.lastTransferDate && emp.lastSubcenter) {
                let displayDate = emp.lastTransferDate;
                if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) {
                     displayDate = formatDateForDisplay(emp.lastTransferDate);
                }
                lastTransferHTML = `
                <div class="mt-2 text-xs text-purple-700 bg-purple-50 p-2 rounded-md">
                    <strong>Last Transfer:</strong> ${displayDate}
                    to ${emp.lastSubcenter}
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
                     {/* Ensure data-id attribute uses emp.id */}
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
        // console.log("renderEmployeeList: Finished rendering cards.");
    } catch (error) {
         console.error("Error during renderEmployeeList loop:", error);
         listContainer.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Error rendering employee list: ${error.message}</p></div>`;
         customAlert("Render Error", `Failed to display employee list: ${error.message}`);
    }
}

// Function to filter and render
export function filterAndRenderEmployees(filters, employees) {
    // console.log("Starting filterAndRenderEmployees...");
    const listContainer = $('employee-list');
    const initialLoadingIndicator = $('initialLoading');

    if (initialLoadingIndicator && initialLoadingIndicator.parentNode === listContainer) {
        listContainer.removeChild(initialLoadingIndicator);
    }

    if (!Array.isArray(employees)) {
        console.error("filterAndRenderEmployees received non-array for employees:", employees);
        renderEmployeeList(listContainer, []);
        return;
    }

     const safeFilters = {
         name: filters?.name || '', status: filters?.status || '',
         designation: filters?.designation || '', type: filters?.type || '',
     };
     const nameFilterLower = safeFilters.name.toLowerCase();
     // console.log("Applying filters:", safeFilters);

    const filtered = employees.filter(emp => {
        if (!emp || typeof emp.name !== 'string' || typeof emp.employeeId !== 'string') {
             console.warn("Skipping invalid employee during filter:", emp);
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

    // console.log(`Filtering complete. ${filtered.length} employees match.`);
    renderEmployeeList(listContainer, filtered);
    // console.log("Finished filterAndRenderEmployees.");
}

// Function to populate filter dropdowns
export function populateFilterDropdowns(employees) {
    const designationFilter = $('filterDesignation');
    if (!designationFilter) return;
    if (!Array.isArray(employees)) employees = [];

    const designations = [...new Set(employees.map(e => e?.designation).filter(d => d && typeof d === 'string'))];
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
         designationFilter.value = "";
    }
}


// Function to set up the main event listener for the list
export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
    const listContainer = $('employee-list');
    if (!listContainer) {
         console.error("Employee list container #employee-list not found for attaching listeners.");
         return;
    }

    listContainer.addEventListener('click', async (e) => {
        const target = e.target; // The specific element clicked (e.g., the button)
         console.log('List item clicked:', target); // Log the clicked element

        // Find the closest ancestor which is an employee card
        const cardElement = target.closest('.employee-card');
        if (!cardElement) {
             console.log('Click was not inside an employee card.');
             return; // Exit if the click wasn't on a button within a card
        }

        // Get the employee's unique row ID stored on the card
        const localId = cardElement.dataset.employeeRowId;
        if (!localId) {
             console.error("Could not find data-employee-row-id on the card.");
             return;
        }
        console.log(`Card row ID found: ${localId}`);

        const currentEmployees = getEmployeesFunc(); // Get the current full list from main.js
        // Find the employee object using the row ID (emp.id)
        const employee = currentEmployees.find(emp => String(emp.id) === String(localId));

        if (!employee) {
            customAlert("Error", "Could not find employee data associated with this card. The list might be refreshing. Please try again.");
            console.warn(`Employee object not found in local cache for row ID: ${localId}`);
            return;
        }
        // Get the actual Employee ID (e.g., CL-6216) needed for API calls
        const employeeSheetId = employee.employeeId;
        if (!employeeSheetId) {
             customAlert("Error", "Employee ID (e.g., CL-XXXX) is missing for this record. Cannot perform action.");
             return;
        }
        console.log(`Found employee: ${employee.name} (ID: ${employeeSheetId})`);


        // --- Handle Button Clicks ---
        // Check if the clicked element *is* one of the buttons
        if (target.classList.contains('view-details-btn')) {
             console.log('View Details button clicked');
            if (typeof openViewDetailsModal === 'function') openViewDetailsModal(employee);
            else console.error('openViewDetailsModal function not found');
        } else if (target.classList.contains('edit-btn')) {
             console.log('Edit button clicked');
            if (typeof openEmployeeModal === 'function') openEmployeeModal(employee, currentEmployees);
             else console.error('openEmployeeModal function not found');
        } else if (target.classList.contains('resign-btn')) {
             console.log('Resign button clicked');
            if (typeof openStatusChangeModal === 'function') openStatusChangeModal(employee, 'Resigned');
             else console.error('openStatusChangeModal function not found');
        } else if (target.classList.contains('terminate-btn')) {
             console.log('Terminate button clicked');
            if (typeof openStatusChangeModal === 'function') openStatusChangeModal(employee, 'Terminated');
             else console.error('openStatusChangeModal function not found');
        } else if (target.classList.contains('toggle-hold-btn')) {
             console.log('Toggle Hold button clicked');
            const isCurrentlyHeld = target.dataset.held === 'true';
            const newHeldStatus = !isCurrentlyHeld;
            console.log(`Attempting to set hold status to: ${newHeldStatus}`);
            try {
                await apiCall('updateStatus', 'POST', {
                    employeeId: employeeSheetId,
                    salaryHeld: newHeldStatus
                });
                console.log(`API call successful for hold status update.`);
                // Call fetch function passed from main.js
                if (typeof fetchEmployeesFunc === 'function') fetchEmployeesFunc();
                 else console.error('fetchEmployeesFunc function not found');
            } catch (error) {
                 console.error('Error during toggle hold API call:', error);
                customAlert("Error", `Failed to update salary status: ${error.message}`);
            }
        } else if (target.classList.contains('transfer-btn')) {
             console.log('Transfer button clicked');
            if (typeof openTransferModal === 'function') openTransferModal(employee);
             else console.error('openTransferModal function not found');
        } else {
             console.log('Click detected inside card, but not on a recognized action button.');
        }
    });
    console.log("Employee list event listener attached."); // Confirm attachment
}