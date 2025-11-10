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
            
            if (statusText === 'Active' && isHeld) { 
                statusText = 'Salary Held'; 
                statusClass = 'status-held'; 
            }
            else if (statusText === 'Resigned') { statusClass = 'status-resigned'; }
            else if (statusText === 'Terminated') { statusClass = 'status-terminated'; }
            else if (statusText !== 'Active') { 
                statusText = 'Terminated'; 
                statusClass = 'status-terminated'; 
            }

            const card = document.createElement('div');
            // Use the new Tailwind classes from index.html
            card.className = 'employee-card bg-white rounded-lg shadow-md p-6 flex flex-col transition hover:shadow-lg';
            card.setAttribute('data-employee-row-id', emp.id);

            let lastTransferHTML = '';
            if (emp.lastTransferDate && emp.lastSubcenter) {
                let displayDate = emp.lastTransferDate;
                if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) { displayDate = formatDateForDisplay(emp.lastTransferDate); }
                // Use new Tailwind classes for transfer info
                lastTransferHTML = `<div class="mt-2 text-xs text-purple-700 bg-purple-50 p-2 rounded-md"><strong>Last Transfer:</strong> ${displayDate} from ${emp.lastSubcenter} ${emp.lastTransferReason ? `(${emp.lastTransferReason.substring(0, 30)}${emp.lastTransferReason.length > 30 ? '...' : ''})` : ''}</div>`;
            }
            
            // --- [START] MODIFIED CARD INNERHTML ---
            // Updated all buttons to use the new .btn classes from index.html
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
                        <p><strong>Net Salary:</strong> ৳${Number(emp.netSalaryPayment || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p><strong>Joined:</strong> ${formatDateForDisplay(emp.joiningDate)}</p>
                        ${statusText !== 'Active' && statusText !== 'Salary Held' && emp.separationDate ? `<p><strong>Separation Date:</strong> ${formatDateForDisplay(emp.separationDate)}</p>` : ''}
                    </div>
                    
                    ${(statusText === 'Resigned' || statusText === 'Terminated') && emp.remarks ? 
                        `<div class="mt-3 text-xs text-yellow-800 bg-yellow-100 p-2 rounded-md"><strong>Separation Remarks:</strong> ${emp.remarks}</div>` : ''}
                    
                    ${(statusText === 'Active' || statusText === 'Salary Held') && emp.remarks ? 
                        `<div class="mt-3 text-xs text-gray-700 bg-gray-100 p-2 rounded-md"><strong>Remarks:</strong> ${emp.remarks}</div>` : ''}
                    
                    ${lastTransferHTML}
                </div>

                <div class="border-t border-gray-200 mt-4 pt-4 flex flex-wrap gap-2 justify-end">
                    <button class="view-details-btn btn btn-secondary" data-id="${emp.id}">View Details</button>
                    <button class="edit-btn btn btn-secondary" data-id="${emp.id}">Edit</button>
                    ${statusText === 'Active' || statusText === 'Salary Held' ? `
                        <button class="toggle-hold-btn btn ${isHeld ? 'btn-green' : 'btn-primary'}" data-id="${emp.id}" data-held="${isHeld}">
                            ${isHeld ? 'Unhold Salary' : 'Hold Salary'}
                        </button>
                        <button class="transfer-btn btn btn-purple-light" data-id="${emp.id}">Transfer</button>
                        <button class="resign-btn btn btn-secondary border-yellow-400 text-yellow-700 hover:bg-yellow-50" data-id="${emp.id}">Resign</button>
                        <button class="terminate-btn btn btn-danger" data-id="${emp.id}">Terminate</button>
                    ` : ''}
                </div>
                `;
            // --- [END] MODIFIED CARD INNERHTML ---
            
            listContainer.appendChild(card);
        });
    } catch (error) {
         console.error("Error during renderEmployeeList loop:", error);
         listContainer.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Error rendering employee list: ${error.message}</p></div>`;
         customAlert("Render Error", `Failed to display employee list: ${error.message}`);
    }
}

// ---
// The rest of this file is unchanged
// ---

export function filterAndRenderEmployees(filters, employees) {
    const listContainer = $('employee-list');
    const countDisplay = $('filterCountDisplay');
    const initialLoadingIndicator = $('initialLoading');

    if (initialLoadingIndicator && initialLoadingIndicator.parentNode === listContainer) {
        listContainer.removeChild(initialLoadingIndicator);
    }

    if (!Array.isArray(employees)) {
        console.error("filterAndRender received non-array:", employees);
        if(countDisplay) countDisplay.textContent = 'Error loading data.';
        renderEmployeeList(listContainer, []); return;
    }

     const safeFilters = {
         name: filters?.name || '',
         status: filters?.status || [],
         designation: filters?.designation || [],
         type: filters?.type || [],
         project: filters?.project || [],
         projectOffice: filters?.projectOffice || [],
         reportProject: filters?.reportProject || [],
         subCenter: filters?.subCenter || []
     };
     const nameFilterLower = safeFilters.name.toLowerCase();

    const filtered = employees.filter(emp => {
        if (!emp || typeof emp.name !== 'string' || typeof emp.employeeId !== 'string') return false;

        let effectiveStatus = emp.status || 'Active';
        if (effectiveStatus === 'Active' && (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE')) {
            effectiveStatus = 'Salary Held';
        }

        const nameMatch = nameFilterLower === '' || emp.name.toLowerCase().includes(nameFilterLower) || emp.employeeId.toLowerCase().includes(nameFilterLower);
        const statusMatch = safeFilters.status.length === 0 || safeFilters.status.includes(effectiveStatus);
        const designationMatch = safeFilters.designation.length === 0 || safeFilters.designation.includes(emp.designation);
        const typeMatch = safeFilters.type.length === 0 || safeFilters.type.includes(emp.employeeType);
        const projectMatch = safeFilters.project.length === 0 || safeFilters.project.includes(emp.project);
        const projectOfficeMatch = safeFilters.projectOffice.length === 0 || safeFilters.projectOffice.includes(emp.projectOffice);
        const reportProjectMatch = safeFilters.reportProject.length === 0 || safeFilters.reportProject.includes(emp.reportProject);
        const subCenterMatch = safeFilters.subCenter.length === 0 || safeFilters.subCenter.includes(emp.subCenter);

        return nameMatch && statusMatch && designationMatch && typeMatch && projectMatch && projectOfficeMatch && reportProjectMatch && subCenterMatch;
    });

    if(countDisplay) {
        countDisplay.textContent = `Showing ${filtered.length} of ${employees.length} employees.`;
    }

    renderEmployeeList(listContainer, filtered);
}

function populateDataList(elementId, values) {
    const datalist = $(elementId);
    if (datalist) {
        datalist.innerHTML = '';
        values.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            datalist.appendChild(option);
        });
    } else {
        // console.warn(`Datalist element with ID '${elementId}' not found.`);
    }
}

export function populateFilterDropdowns(employees) {
    if (!Array.isArray(employees)) employees = [];

    const designations = [...new Set(employees.map(e => e?.designation).filter(Boolean))].sort();
    const offices = [...new Set(employees.map(e => e?.projectOffice).filter(Boolean))].sort();
    const projects = [...new Set(employees.map(e => e?.project).filter(Boolean))].sort();
    const reportProjects = [...new Set(employees.map(e => e?.reportProject).filter(Boolean))].sort();
    const subCenters = [...new Set(employees.map(e => e?.subCenter).filter(Boolean))].sort();
    const identificationTypes = [...new Set(employees.map(e => e?.identificationType).filter(Boolean))].sort();

    // These IDs are defined in your new index.html
    populateDataList('designation-list', designations);
    populateDataList('project-list', projects);
    populateDataList('projectOffice-list', offices);
    populateDataList('reportProject-list', reportProjects);
    populateDataList('subCenter-list', subCenters);
    populateDataList('identificationType-list', identificationTypes);
}

export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
     const listContainer = $('employee-list');
    if (!listContainer) { console.error("#employee-list not found for listeners."); return; }

    listContainer.addEventListener('click', async (e) => {
        const target = e.target;
        // Find the closest button that has one of our action classes
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
            // --- THIS WAS THE FIX ---
            // Removed the extra '.' before 'employee'
            if (typeof openStatusChangeModal === 'function') openStatusChangeModal(employee, 'Terminated');
            // --- END OF FIX ---
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