// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';
// Import functions to open modals from other modules
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';

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
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Salary:</dt> <dd class="text-gray-700">₹${Number(emp.salary || 0).toLocaleString('en-IN')}</dd></div>
                    <div class="flex"><dt class="font-medium text-gray-500 w-24">Joined:</dt> <dd class="text-gray-700">${formatDateForDisplay(emp.joiningDate)}</dd></div>
                    ${statusText !== 'Active' && statusText !== 'Salary Held' && emp.separationDate ? `<div class="flex"><dt class="font-medium text-gray-500 w-24">Separation:</dt> <dd class="text-gray-700">${formatDateForDisplay(emp.separationDate)}</dd></div>` : ''}
                </dl>

                ${emp.remarks ? `<div class="mt-3 text-xs text-gray-700 bg-gray-100 p-2 rounded-md"><strong>Remarks:</strong> ${emp.remarks}</div>` : ''}
            </div>

            <div class="border-t border-gray-200 mt-4 pt-4 flex flex-wrap gap-2 justify-end">
                 <button class="view-details-btn text-sm font-medium text-gray-600 hover:text-gray-900" data-id="${emp.id}">View Details</button>
                 <button class="edit-btn text-sm font-medium text-indigo-600 hover:text-indigo-800" data-id="${emp.id}">Edit</button>
                 ${statusText === 'Active' || statusText === 'Salary Held' ? `
                    <button class="toggle-hold-btn text-sm font-medium ${isHeld ? 'text-green-600 hover:text-green-800' : 'text-orange-600 hover:text-orange-800'}" data-id="${emp.id}" data-held="${isHeld}">${isHeld ? 'Unhold Salary' : 'Hold Salary'}</button>
                    <button class="resign-btn text-sm font-medium text-yellow-600 hover:text-yellow-800" data-id="${emp.id}">Resign</button>
                    <button class="terminate-btn text-sm font-medium text-red-600 hover:text-red-800" data-id="${emp.id}">Terminate</button>
                ` : ''}
            </div>
             <style jsx>{/* Badge styles */}</style>
        `; // Add badge styles inline or ensure they are in global CSS
        listContainer.appendChild(card);
    });
}

// Function to filter and render
export function filterAndRenderEmployees(filters, employees) {
    const listContainer = $('employee-list');
    const initialLoadingIndicator = $('initialLoading'); // May already be removed

    // Ensure initial loading is removed if it's still there
    if (initialLoadingIndicator && initialLoadingIndicator.parentNode === listContainer) {
        listContainer.removeChild(initialLoadingIndicator);
    }

    const nameFilterLower = filters.name.toLowerCase();

    const filtered = employees.filter(emp => {
        if (!emp || typeof emp.name !== 'string' || typeof emp.employeeId !== 'string') return false;

        let effectiveStatus = emp.status || 'Active';
        if (effectiveStatus === 'Active' && (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE')) {
            effectiveStatus = 'Salary Held';
        }

        const nameMatch = nameFilterLower === '' || emp.name.toLowerCase().includes(nameFilterLower) || emp.employeeId.toLowerCase().includes(nameFilterLower);
        const statusMatch = filters.status === '' || effectiveStatus === filters.status;
        const designationMatch = filters.designation === '' || emp.designation === filters.designation;
        const typeMatch = filters.type === '' || emp.employeeType === filters.type;

        return nameMatch && statusMatch && designationMatch && typeMatch;
    });

    renderEmployeeList(listContainer, filtered);
}

// Function to populate filter dropdowns
export function populateFilterDropdowns(employees) {
    const designationFilter = $('filterDesignation');
    if (!designationFilter) return;

    const designations = [...new Set(employees.map(e => e.designation).filter(d => d && typeof d === 'string'))];
    const currentVal = designationFilter.value; // Preserve selection

    designationFilter.innerHTML = '<option value="">All</option>'; // Reset
    designations.sort().forEach(d => {
        const option = document.createElement('option');
        option.value = d;
        option.textContent = d;
        designationFilter.appendChild(option);
    });

    if (designations.includes(currentVal)) {
        designationFilter.value = currentVal; // Restore if possible
    }
}


// Function to set up the main event listener for the list
// Needs the main fetch function to refresh data after actions
export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
    const listContainer = $('employee-list');
    if (!listContainer) return;

    listContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const cardElement = target.closest('.employee-card');
        if (!cardElement) return;
        const localId = cardElement.dataset.employeeRowId; // This is the row number (id)
        if (!localId) return;

        // Find the employee in the current list (use the function passed from main.js)
        const currentEmployees = getEmployeesFunc();
        const employee = currentEmployees.find(emp => String(emp.id) === String(localId)); // Compare as strings

        if (!employee) {
            customAlert("Error", "Could not find employee data. Please refresh.");
            return;
        }
        const employeeSheetId = employee.employeeId; // This is the actual Employee ID
        if (!employeeSheetId) {
             customAlert("Error", "Employee ID is missing."); return;
        }

        // --- Handle Button Clicks ---
        if (target.classList.contains('view-details-btn')) {
            openViewDetailsModal(employee);
        } else if (target.classList.contains('edit-btn')) {
            openEmployeeModal(employee, currentEmployees); // Pass current list for duplicate check context if needed
        } else if (target.classList.contains('resign-btn')) {
            openStatusChangeModal(employee, 'Resigned');
        } else if (target.classList.contains('terminate-btn')) {
            openStatusChangeModal(employee, 'Terminated');
        } else if (target.classList.contains('toggle-hold-btn')) {
            const isCurrentlyHeld = target.dataset.held === 'true';
            const newHeldStatus = !isCurrentlyHeld;
            try {
                // Call API directly - UI will update on refetch
                await apiCall('updateStatus', 'POST', {
                    employeeId: employeeSheetId,
                    salaryHeld: newHeldStatus
                });
                console.log(`API call successful for hold status update.`);
                fetchEmployeesFunc(); // Refresh the list from the server
            } catch (error) {
                customAlert("Error", `Failed to update salary status: ${error.message}`);
                // No rollback needed as we didn't do optimistic update here
            }
        }
    });
}