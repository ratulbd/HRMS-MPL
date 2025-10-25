// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';

let localEmployees = [];

export function setLocalEmployees(employees) {
    localEmployees = employees || [];
}

// Function to render the list
function renderEmployeeList(listContainer, employeesToRender) {
    console.log("Starting renderEmployeeList..."); // Log start
    if (!listContainer) {
        console.error("renderEmployeeList: listContainer element not found.");
        return;
    }
    listContainer.innerHTML = ''; // Clear previous content

    if (!employeesToRender || employeesToRender.length === 0) {
        console.log("renderEmployeeList: No employees to render.");
        listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found matching the current filters.</p></div>`;
        return;
    }

    console.log(`renderEmployeeList: Rendering ${employeesToRender.length} employee cards.`);
    try { // Add try...catch around the loop
        employeesToRender.forEach((emp, index) => {
             // Basic check inside loop
             if (!emp || typeof emp.id === 'undefined') {
                  console.warn(`renderEmployeeList: Skipping invalid employee data at index ${index}:`, emp);
                  return; // Skip this employee
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
            card.setAttribute('data-employee-row-id', emp.id);

            let lastTransferHTML = '';
            if (emp.lastTransferDate && emp.lastSubcenter) {
                let displayDate = emp.lastTransferDate;
                // Avoid re-formatting if already in desired format
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

            // Construct card HTML (ensure all properties like emp.name, emp.designation exist or use defaults)
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
        console.log("renderEmployeeList: Finished rendering cards."); // Log finish
    } catch (error) {
         console.error("Error during renderEmployeeList loop:", error); // Log error from loop
         // Optionally display an error message in the list container
         listContainer.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Error rendering employee list: ${error.message}</p></div>`;
         customAlert("Render Error", `Failed to display employee list: ${error.message}`);
    }
}

// Function to filter and render
export function filterAndRenderEmployees(filters, employees) {
    console.log("Starting filterAndRenderEmployees..."); // Log start
    const listContainer = $('employee-list');
    const initialLoadingIndicator = $('initialLoading');

    if (initialLoadingIndicator && initialLoadingIndicator.parentNode === listContainer) {
        console.log("filterAndRenderEmployees: Removing initial loading indicator.");
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
     console.log("Applying filters:", safeFilters);

    // --- Filter logic ---
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
    // --- End filter logic ---

    console.log(`Filtering complete. ${filtered.length} employees match.`);
    // Call render function
    renderEmployeeList(listContainer, filtered);
    console.log("Finished filterAndRenderEmployees."); // Log finish
}

// Function to populate filter dropdowns
export function populateFilterDropdowns(employees) {
    // ... (This function remains the same) ...
}

// Function to set up the main event listener for the list
export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
    // ... (This function remains the same) ...
}