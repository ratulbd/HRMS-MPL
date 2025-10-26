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
    listContainer.innerHTML = ''; // Clear previous content (cards or 'no results')

    // Get prompt element
    const selectChartPrompt = $('selectChartPrompt');

    if (!employeesToRender || employeesToRender.length === 0) {
        // Determine if any filters *other than* the prompt state are active
        const filtersApplied = document.getElementById('filterAppliedInfo')?.textContent !== '' ||
                               document.getElementById('filterName')?.value !== '' ||
                               document.getElementById('filterStatus')?.value !== '' ||
                               document.getElementById('filterDesignation')?.value !== '' ||
                               document.getElementById('filterType')?.value !== '';

        if (filtersApplied) {
             // If filters are applied but yield no results, show "no results" message
             listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found matching the current filters.</p></div>`;
             if (selectChartPrompt) selectChartPrompt.classList.add('hidden'); // Hide prompt
        } else if (selectChartPrompt) {
            // If no filters applied and no employees (initial state likely), show prompt
             selectChartPrompt.classList.remove('hidden');
        } else {
             // Fallback if prompt doesn't exist but no employees
             listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found.</p></div>`;
        }
        return; // Stop rendering
    } else {
         // If we have employees to render, always hide the prompt
         if (selectChartPrompt) selectChartPrompt.classList.add('hidden');
    }

    // --- Render Cards ---
    try {
        employeesToRender.forEach((emp, index) => {
            // ... (card creation logic remains exactly the same as the last correct version) ...
             if (!emp || typeof emp.id === 'undefined') { console.warn(`Skipping invalid employee data at index ${index}:`, emp); return; }
             let statusText = emp.status || 'Active'; let statusClass = 'status-active';
             const isHeld = (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE');
             if (statusText === 'Active' && isHeld) { statusText = 'Salary Held'; statusClass = 'status-held'; }
             else if (statusText === 'Resigned') { statusClass = 'status-resigned'; }
             else if (statusText === 'Terminated') { statusClass = 'status-terminated'; }
             else if (statusText !== 'Active') { statusText = 'Terminated'; statusClass = 'status-terminated'; }
             const card = document.createElement('div'); card.className = 'employee-card bg-white rounded-lg shadow-md p-6 flex flex-col transition hover:shadow-lg'; card.setAttribute('data-employee-row-id', emp.id);
             let lastTransferHTML = '';
             if (emp.lastTransferDate && emp.lastSubcenter) { /* ... create lastTransferHTML ... */ }
             card.innerHTML = `
                 <div class="flex-grow">
                     <div class="flex justify-between items-start">
                          <h3 class="text-xl font-bold text-gray-900">${emp.name || 'N/A'}</h3>
                          <div class="text-right flex-shrink-0 ml-4"> <span class="status-badge ${statusClass}">${statusText}</span> ${isHeld && emp.holdTimestamp ? `<p class="text-xs font-medium text-orange-600 pt-1">${emp.holdTimestamp}</p>` : ''} </div>
                     </div>
                     <p class="text-gray-600">${emp.designation || 'N/A'}</p> <p class="text-sm text-gray-500 mb-4">ID: ${emp.employeeId || 'N/A'}</p>
                     <div class="text-sm space-y-1"> <p><strong>Type:</strong> ${emp.employeeType || 'N/A'}</p> <p><strong>Project:</strong> ${emp.project || 'N/A'}</p> <p><strong>Sub Center:</strong> ${emp.subCenter || 'N/A'}</p> <p><strong>Salary:</strong> ৳${Number(emp.salary || 0).toLocaleString('en-IN')}</p> <p><strong>Joined:</strong> ${formatDateForDisplay(emp.joiningDate)}</p> ${statusText !== 'Active' && statusText !== 'Salary Held' && emp.separationDate ? `<p><strong>Separation Date:</strong> ${formatDateForDisplay(emp.separationDate)}</p>` : ''} </div>
                     ${emp.remarks ? `<div class="mt-3 text-xs text-gray-700 bg-gray-100 p-2 rounded-md"><strong>Remarks:</strong> ${emp.remarks}</div>` : ''}
                     ${lastTransferHTML}
                 </div>
                 <div class="border-t border-gray-200 mt-4 pt-4 flex flex-wrap gap-2 justify-end"> <button class="view-details-btn ..." data-id="${emp.id}">View Details</button> <button class="edit-btn ..." data-id="${emp.id}">Edit</button> ${statusText === 'Active' || statusText === 'Salary Held' ? ` <button class="toggle-hold-btn ..." data-id="${emp.id}" data-held="${isHeld}">${isHeld ? 'Unhold Salary' : 'Hold Salary'}</button> <button class="transfer-btn ..." data-id="${emp.id}">Transfer</button> <button class="resign-btn ..." data-id="${emp.id}">Resign</button> <button class="terminate-btn ..." data-id="${emp.id}">Terminate</button> ` : ''} </div>
             `;
            listContainer.appendChild(card);
        });
    } catch (error) { /* ... error handling ... */ }
}

export function filterAndRenderEmployees(filters, employees) {
    console.log("filterAndRenderEmployees called with filters:", filters); // Log received filters
    const listContainer = $('employee-list');
    const initialLoadingIndicator = $('initialLoading');
    const selectChartPrompt = $('selectChartPrompt');

    if (initialLoadingIndicator && initialLoadingIndicator.parentNode === listContainer) {
        listContainer.removeChild(initialLoadingIndicator);
    }

    if (!Array.isArray(employees)) {
        console.error("filterAndRenderEmployees received non-array for employees:", employees);
        renderEmployeeList(listContainer, []); return;
    }

     const safeFilters = {
         name: filters?.name || '', status: filters?.status || '',
         designation: filters?.designation || '', type: filters?.type || '',
         projectOffice: filters?.projectOffice || ''
     };
     const nameFilterLower = safeFilters.name.toLowerCase();

    // Determine if any filter is actually active
    const isAnyFilterActive = !!(safeFilters.name || safeFilters.status || safeFilters.designation || safeFilters.type || safeFilters.projectOffice);

    // Show/Hide Prompt based ONLY on whether *any* filter is active
    if (selectChartPrompt) {
         selectChartPrompt.classList.toggle('hidden', isAnyFilterActive);
    }

    // Filter logic
    const filtered = employees.filter(emp => {
        if (!emp || typeof emp.name !== 'string' || typeof emp.employeeId !== 'string') return false;
        let effectiveStatus = emp.status || 'Active';
        if (effectiveStatus === 'Active' && (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE')) { effectiveStatus = 'Salary Held'; }

        // --- Check each match condition ---
        const nameMatch = nameFilterLower === '' || emp.name.toLowerCase().includes(nameFilterLower) || emp.employeeId.toLowerCase().includes(nameFilterLower);
        const statusMatch = safeFilters.status === '' || effectiveStatus === safeFilters.status;
        const designationMatch = safeFilters.designation === '' || emp.designation === safeFilters.designation;
        const typeMatch = safeFilters.type === '' || emp.employeeType === safeFilters.type;
        // Trim both sides for comparison to handle potential whitespace differences
        const projectOfficeMatch = safeFilters.projectOffice === '' || (emp.projectOffice && emp.projectOffice.trim() === safeFilters.projectOffice.trim());

        // --- Log individual matches for debugging ---
        // if (safeFilters.projectOffice !== '' && emp.projectOffice) { // Log only when project office filter is active
        //     console.log(`Comparing: Filter='${safeFilters.projectOffice}', Employee='${emp.projectOffice}', Match=${projectOfficeMatch} (Emp ID: ${emp.employeeId})`);
        // }

        return nameMatch && statusMatch && designationMatch && typeMatch && projectOfficeMatch;
    });

    console.log(`Filtering complete. ${filtered.length} employees match.`); // Log count AFTER filtering
    renderEmployeeList(listContainer, filtered); // Render the results
}

export function populateFilterDropdowns(employees) {
    // ... (This function remains the same) ...
}

export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
    // ... (This function remains the same) ...
}