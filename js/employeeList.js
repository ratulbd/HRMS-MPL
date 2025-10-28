// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';

let localEmployees = []; // Module-level state for the employee list

// Function to update the internal state
export function setLocalEmployees(employees) {
    localEmployees = Array.isArray(employees) ? employees : [];
}

// Function to render the list
function renderEmployeeList(listContainer, employeesToRender) {
    if (!listContainer) { console.error("renderEmployeeList: listContainer element not found."); return; }
    listContainer.innerHTML = ''; // Clear previous content

    if (!employeesToRender || employeesToRender.length === 0) {
        listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found matching the current filters.</p></div>`;
        return;
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
            if (emp.lastTransferDate && emp.lastSubcenter) { // lastSubcenter is 'FROM'
                let displayDate = emp.lastTransferDate;
                if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) { displayDate = formatDateForDisplay(emp.lastTransferDate); }
                lastTransferHTML = `<div class="mt-2 text-xs text-purple-700 bg-purple-50 p-2 rounded-md"><strong>Last Transfer:</strong> ${displayDate} from ${emp.lastSubcenter} ${emp.lastTransferReason ? `(${emp.lastTransferReason.substring(0, 30)}${emp.lastTransferReason.length > 30 ? '...' : ''})` : ''}</div>`;
            }

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
                <div class="border-t border-gray-200 mt-4 pt-4 flex flex-wrap gap-2 justify-end"> <button class="view-details-btn text-sm font-medium text-gray-600 hover:text-gray-900" data-id="${emp.id}">View Details</button> <button class="edit-btn text-sm font-medium text-indigo-600 hover:text-indigo-800" data-id="${emp.id}">Edit</button> ${statusText === 'Active' || statusText === 'Salary Held' ? ` <button class="toggle-hold-btn text-sm font-medium ${isHeld ? 'text-green-600 hover:text-green-800' : 'text-orange-600 hover:text-orange-800'}" data-id="${emp.id}" data-held="${isHeld}">${isHeld ? 'Unhold Salary' : 'Hold Salary'}</button> <button class="transfer-btn text-sm font-medium text-purple-600 hover:text-purple-800" data-id="${emp.id}">Transfer</button> <button class="resign-btn text-sm font-medium text-yellow-600 hover:text-yellow-800" data-id="${emp.id}">Resign</button> <button class="terminate-btn text-sm font-medium text-red-600 hover:text-red-800" data-id="${emp.id}">Terminate</button> ` : ''} </div>
            `;
            listContainer.appendChild(card);
        });
    } catch (error) {
         console.error("Error during renderEmployeeList loop:", error);
         listContainer.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Error rendering employee list: ${error.message}</p></div>`;
         customAlert("Render Error", `Failed to display employee list: ${error.message}`);
    }
}

// Function to filter and render, including updating the count
export function filterAndRenderEmployees(filters, employees) {
    const listContainer = $('employee-list');
    const countDisplay = $('filterCountDisplay'); // Get count element
    const initialLoadingIndicator = $('initialLoading');

    if (initialLoadingIndicator && initialLoadingIndicator.parentNode === listContainer) {
        listContainer.removeChild(initialLoadingIndicator);
    }

    if (!Array.isArray(employees)) {
        console.error("filterAndRender received non-array:", employees);
        if(countDisplay) countDisplay.textContent = 'Error loading data.';
        renderEmployeeList(listContainer, []); return;
    }

     // Ensure all filter keys exist
     const safeFilters = {
         name: filters?.name || '', status: filters?.status || '',
         designation: filters?.designation || '', type: filters?.type || '',
         projectOffice: filters?.projectOffice || '' // Added projectOffice
     };
     const nameFilterLower = safeFilters.name.toLowerCase();

    // Filter logic
    const filtered = employees.filter(emp => {
        if (!emp || typeof emp.name !== 'string' || typeof emp.employeeId !== 'string') return false;
        let effectiveStatus = emp.status || 'Active';
        if (effectiveStatus === 'Active' && (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE')) { effectiveStatus = 'Salary Held'; }

        const nameMatch = nameFilterLower === '' || emp.name.toLowerCase().includes(nameFilterLower) || emp.employeeId.toLowerCase().includes(nameFilterLower);
        const statusMatch = safeFilters.status === '' || effectiveStatus === safeFilters.status;
        const designationMatch = safeFilters.designation === '' || emp.designation === safeFilters.designation;
        const typeMatch = safeFilters.type === '' || emp.employeeType === safeFilters.type;
        const projectOfficeMatch = safeFilters.projectOffice === '' || (emp.projectOffice && emp.projectOffice.trim() === safeFilters.projectOffice.trim());

        return nameMatch && statusMatch && designationMatch && typeMatch && projectOfficeMatch;
    });

    // Update Count Display
    if(countDisplay) {
        countDisplay.textContent = `Showing ${filtered.length} of ${employees.length} employees.`;
    }

    renderEmployeeList(listContainer, filtered); // Render the filtered results
}

// --- NEW HELPER FUNCTION ---
// Helper to populate a <datalist>
function populateDataList(elementId, values) {
    const datalist = $(elementId);
    if (datalist) {
        datalist.innerHTML = ''; // Clear old options
        values.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            datalist.appendChild(option);
        });
    } else {
        console.warn(`Datalist element with ID '${elementId}' not found.`);
    }
}
// --- END NEW HELPER ---


// --- MODIFIED FUNCTION ---
// Function to populate filter dropdowns AND modal datalists
export function populateFilterDropdowns(employees) {
    const designationFilter = $('filterDesignation');
    const projectOfficeFilter = $('filterProjectOffice'); // Get the new dropdown

    if (!Array.isArray(employees)) employees = [];

    // --- Get unique, sorted lists ---
    const designations = [...new Set(employees.map(e => e?.designation).filter(d => d && typeof d === 'string'))].sort();
    const offices = [...new Set(employees.map(e => e?.projectOffice).filter(o => o && typeof o === 'string'))].sort();
    const projects = [...new Set(employees.map(e => e?.project).filter(p => p && typeof p === 'string'))].sort();
    const reportProjects = [...new Set(employees.map(e => e?.reportProject).filter(r => r && typeof r === 'string'))].sort();
    const subCenters = [...new Set(employees.map(e => e?.subCenter).filter(s => s && typeof s === 'string'))].sort();


    // --- Populate Filter Dropdowns ---
    if (designationFilter) {
        const currentDes = designationFilter.value;
        designationFilter.innerHTML = '<option value="">All</option>';
        designations.forEach(d => {
            const option = document.createElement('option'); option.value = d; option.textContent = d; designationFilter.appendChild(option);
        });
        designationFilter.value = designations.includes(currentDes) ? currentDes : "";
    }

    if (projectOfficeFilter) {
        const currentOffice = projectOfficeFilter.value;
        projectOfficeFilter.innerHTML = '<option value="">All</option>';
        offices.forEach(o => {
            const option = document.createElement('option'); option.value = o; option.textContent = o; projectOfficeFilter.appendChild(option);
        });
        projectOfficeFilter.value = offices.includes(currentOffice) ? currentOffice : "";
    }

    // --- Populate Modal Datalists ---
    populateDataList('designation-list', designations);
    populateDataList('project-list', projects);
    populateDataList('projectOffice-list', offices);
    populateDataList('reportProject-list', reportProjects);
    populateDataList('subCenter-list', subCenters);
}
// --- END MODIFIED FUNCTION ---


// Function to set up the main event listener for the list
export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
     const listContainer = $('employee-list');
    if (!listContainer) { console.error("#employee-list not found for listeners."); return; }

    listContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const actionButton = target.closest('.view-details-btn, .edit-btn, .toggle-hold-btn, .transfer-btn, .resign-btn, .terminate-btn');
        const cardElement = target.closest('.employee-card');
        if (!cardElement || !actionButton) return;

        const localId = cardElement.dataset.employeeRowId;
        if (!localId) { console.error("data-employee-row-id missing."); return; }

        const currentEmployees = getEmployeesFunc();
        const employee = currentEmployees.find(emp => String(emp.id) === String(localId));
        if (!employee) { customAlert("Error", "Could not find employee data. Please refresh."); return; }
        const employeeSheetId = employee.employeeId;
        if (!employeeSheetId) { customAlert("Error", "Employee ID missing."); return; }

        // Handle Button Clicks
        if (actionButton.classList.contains('view-details-btn')) {
            if (typeof openViewDetailsModal === 'function') openViewDetailsModal(employee);
        } else if (actionButton.classList.contains('edit-btn')) {
            if (typeof openEmployeeModal === 'function') openEmployeeModal(employee, currentEmployees);
        } else if (actionButton.classList.contains('resign-btn')) {
            if (typeof openStatusChangeModal === 'function') openStatusChangeModal(employee, 'Resigned');
        } else if (actionButton.classList.contains('terminate-btn')) {
            if (typeof openStatusChangeModal === 'function') openStatusChangeModal(employee, 'Terminated');
        } else if (actionButton.classList.contains('toggle-hold-btn')) {
            const isCurrentlyHeld = actionButton.dataset.held === 'true';
            try {
                await apiCall('updateStatus', 'POST', { employeeId: employeeSheetId, salaryHeld: !isCurrentlyHeld });
                if (typeof fetchEmployeesFunc === 'function') fetchEmployeesFunc();
            } catch (error) { customAlert("Error", `Failed to update salary status: ${error.message}`); }
        } else if (actionButton.classList.contains('transfer-btn')) {
            if (typeof openTransferModal === 'function') openTransferModal(employee);
        }
    });
}