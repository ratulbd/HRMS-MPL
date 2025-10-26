// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';

let localEmployees = [];

export function setLocalEmployees(employees) {
    localEmployees = Array.isArray(employees) ? employees : [];
}

function renderEmployeeList(listContainer, employeesToRender) {
    if (!listContainer) { console.error("renderEmployeeList: listContainer element not found."); return; }
    listContainer.innerHTML = ''; // Clear

    const selectChartPrompt = $('selectChartPrompt'); // Get prompt element

    if (!employeesToRender || employeesToRender.length === 0) {
         // Only show 'no matching filters' if some filters ARE applied (excluding the prompt state)
         const filtersApplied = document.getElementById('filterAppliedInfo')?.textContent !== '';
        if (filtersApplied) {
             listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found matching the current filters.</p></div>`;
        } else if (selectChartPrompt) {
            // If no filters applied and no employees, keep the prompt visible
             selectChartPrompt.classList.remove('hidden');
        } else {
             // Fallback if prompt doesn't exist but no employees
             listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found.</p></div>`;
        }
        return;
    } else {
         // Hide prompt if we are rendering cards
         if (selectChartPrompt) selectChartPrompt.classList.add('hidden');
    }


    try {
        employeesToRender.forEach((emp, index) => {
            if (!emp || typeof emp.id === 'undefined') { console.warn(`Skipping invalid employee data at index ${index}:`, emp); return; }

            let statusText = emp.status || 'Active';
            let statusClass = 'status-active';
            const isHeld = (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE');
            if (statusText === 'Active' && isHeld) { statusText = 'Salary Held'; statusClass = 'status-held'; }
            else if (statusText === 'Resigned') { statusClass = 'status-resigned'; }
            else if (statusText === 'Terminated') { statusClass = 'status-terminated'; }
            else if (statusText !== 'Active') { statusText = 'Terminated'; statusClass = 'status-terminated'; }

            const card = document.createElement('div');
            card.className = 'employee-card bg-white rounded-lg shadow-md p-6 flex flex-col transition hover:shadow-lg';
            card.setAttribute('data-employee-row-id', emp.id);

            let lastTransferHTML = '';
            if (emp.lastTransferDate && emp.lastSubcenter) {
                let displayDate = emp.lastTransferDate;
                if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) { displayDate = formatDateForDisplay(emp.lastTransferDate); }
                lastTransferHTML = `<div class="mt-2 text-xs text-purple-700 bg-purple-50 p-2 rounded-md"><strong>Last Transfer:</strong> ${displayDate} from ${emp.lastSubcenter} ${emp.lastTransferReason ? `(${emp.lastTransferReason.substring(0, 30)}${emp.lastTransferReason.length > 30 ? '...' : ''})` : ''}</div>`;
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
                    <div class="text-sm space-y-1">
                       <p><strong>Type:</strong> ${emp.employeeType || 'N/A'}</p>
                       <p><strong>Project:</strong> ${emp.project || 'N/A'}</p>
                       <p><strong>Sub Center:</strong> ${emp.subCenter || 'N/A'}</p>
                       <p><strong>Salary:</strong> ৳${Number(emp.salary || 0).toLocaleString('en-IN')}</p>
                       <p><strong>Joined:</strong> ${formatDateForDisplay(emp.joiningDate)}</p>
                       ${statusText !== 'Active' && statusText !== 'Salary Held' && emp.separationDate ? `<p><strong>Separation Date:</strong> ${formatDateForDisplay(emp.separationDate)}</p>` : ''}
                    </div>
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
    } catch (error) { /* ... error handling ... */ }
}

export function filterAndRenderEmployees(filters, employees) {
    const listContainer = $('employee-list');
    const initialLoadingIndicator = $('initialLoading');
    const selectChartPrompt = $('selectChartPrompt');

    if (initialLoadingIndicator && initialLoadingIndicator.parentNode === listContainer) {
        listContainer.removeChild(initialLoadingIndicator);
    }

    if (!Array.isArray(employees)) {
        renderEmployeeList(listContainer, []); return;
    }

     const safeFilters = {
         name: filters?.name || '', status: filters?.status || '',
         designation: filters?.designation || '', type: filters?.type || '',
         projectOffice: filters?.projectOffice || '' // Include projectOffice
     };
     const nameFilterLower = safeFilters.name.toLowerCase();

     // Show prompt only if NO filters are applied at all
     if (selectChartPrompt) {
         const noFiltersApplied = !safeFilters.name && !safeFilters.status && !safeFilters.designation && !safeFilters.type && !safeFilters.projectOffice;
         selectChartPrompt.classList.toggle('hidden', !noFiltersApplied);
     }


    const filtered = employees.filter(emp => {
        if (!emp || typeof emp.name !== 'string' || typeof emp.employeeId !== 'string') return false;
        let effectiveStatus = emp.status || 'Active';
        if (effectiveStatus === 'Active' && (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE')) { effectiveStatus = 'Salary Held'; }

        const nameMatch = nameFilterLower === '' || emp.name.toLowerCase().includes(nameFilterLower) || emp.employeeId.toLowerCase().includes(nameFilterLower);
        const statusMatch = safeFilters.status === '' || effectiveStatus === safeFilters.status;
        const designationMatch = safeFilters.designation === '' || emp.designation === safeFilters.designation;
        const typeMatch = safeFilters.type === '' || emp.employeeType === safeFilters.type;
        const projectOfficeMatch = safeFilters.projectOffice === '' || emp.projectOffice === safeFilters.projectOffice; // Add match condition

        return nameMatch && statusMatch && designationMatch && typeMatch && projectOfficeMatch; // Include projectOfficeMatch
    });

    renderEmployeeList(listContainer, filtered);
}

export function populateFilterDropdowns(employees) {
    // ... (This function remains the same) ...
}

export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
    // ... (This function remains the same) ...
}