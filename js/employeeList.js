// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';
import { openFileClosingModal } from './fileClosingModal.js';

let localEmployees = []; // Module-level state for the employee list

// Function to update the internal state
export function setLocalEmployees(employees) {
    localEmployees = Array.isArray(employees) ? employees : [];
}

// === MODIFICATION: Re-designed renderEmployeeList function ===
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
            else if (statusText === 'Closed') { statusClass = 'status-closed'; }
            else if (statusText !== 'Active') { statusText = 'Terminated'; statusClass = 'status-terminated'; }


            const card = document.createElement('div');
            // New card style: themed left border, subtle shadow, and hover animation
            card.className = 'employee-card bg-white rounded-lg shadow-sm border-l-4 border-green-700 flex flex-col transition-all duration-300 hover:shadow-xl hover:scale-[1.02]';
            card.setAttribute('data-employee-row-id', emp.id);

            // --- Info Tags (replaces big boxes) ---
            let infoTagsHTML = '';
            
            // Separation Remarks
            if ((statusText === 'Resigned' || statusText === 'Terminated' || statusText === 'Closed') && emp.remarks) {
                 infoTagsHTML += `<span class="mt-2 mr-1 text-xs font-medium inline-block px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800" title="Separation Remarks: ${emp.remarks}">Separation: ${emp.remarks.substring(0, 20)}...</span>`;
            }
            
            // Last Transfer
            if (emp.lastTransferDate && emp.lastSubcenter) {
                let displayDate = emp.lastTransferDate;
                if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) { displayDate = formatDateForDisplay(emp.lastTransferDate); }
                infoTagsHTML += `<span class="mt-2 mr-1 text-xs font-medium inline-block px-2.5 py-0.5 rounded-full bg-green-50 text-green-700" title="Transferred from ${emp.lastSubcenter} (${emp.lastTransferReason || ''})">Transfer: ${displayDate}</span>`;
            }

            // File Closed
            if (statusText === 'Closed' && emp.fileClosingDate) {
                 infoTagsHTML += `<span class="mt-2 mr-1 text-xs font-medium inline-block px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700" title="File Closed: ${emp.fileClosingRemarks || ''}">Closed: ${formatDateForDisplay(emp.fileClosingDate)}</span>`;
            }

            // --- New Concise Card HTML ---
            card.innerHTML = `
                <div class="p-5 flex-grow">
                    <div class="flex justify-between items-start mb-3">
                        <h3 class="font-poppins font-semibold text-lg text-green-800">${emp.name || 'N/A'}</h3>
                        <span class="status-badge ${statusClass} flex-shrink-0 ml-2">${statusText}</span>
                    </div>
                    
                    <div class="mb-4 space-y-1.5">
                        <p class="text-sm text-gray-700">${emp.designation || 'N/A'}</p>
                        <p class="text-sm text-gray-500">ID: ${emp.employeeId || 'N/A'}</p>
                        
                        <div class="flex items-center text-xs text-gray-600 pt-1">
                            <i class="fas fa-map-marker-alt w-4 mr-1.5 text-gray-400"></i>
                            <span>${emp.subCenter || 'N/A'}</span>
                        </div>
                        <div class="flex items-center text-xs text-gray-600">
                            <i class="fas fa-calendar-alt w-4 mr-1.5 text-gray-400"></i>
                            <span>Joined: ${formatDateForDisplay(emp.joiningDate)}</span>
                        </div>
                    </div>
                    
                    <!-- Info Tags Area -->
                    <div class="flex flex-wrap">
                        ${infoTagsHTML}
                    </div>
                </div>
                
                <!-- Action Buttons Footer -->
                <div class="border-t border-gray-100 bg-gray-50 px-5 py-3 flex flex-wrap gap-1.5 justify-end rounded-b-lg"> 
                    <button class="view-details-btn btn-pill btn-pill-gray" data-id="${emp.id}">View Details</button> 
                    
                    ${statusText !== 'Closed' ? `
                        <button class="edit-btn btn-pill btn-pill-green" data-id="${emp.id}">Edit</button> 
                    ` : ''}

                    ${statusText === 'Active' || statusText === 'Salary Held' ? ` 
                        <button class="toggle-hold-btn btn-pill ${isHeld ? 'btn-pill-green' : 'btn-pill-orange'}" data-id="${emp.id}" data-held="${isHeld}">${isHeld ? 'Unhold Salary' : 'Hold Salary'}</button> 
                        <button class="transfer-btn btn-pill btn-pill-green" data-id="${emp.id}">Transfer</button> 
                        <button class="resign-btn btn-pill btn-pill-yellow" data-id="${emp.id}">Resign</button> 
                        <button class="terminate-btn btn-pill btn-pill-red" data-id="${emp.id}">Terminate</button> 
                    ` : ''} 

                    ${(statusText === 'Resigned' || statusText === 'Terminated') ? `
                        <button class="close-file-btn btn-pill btn-pill-gray" data-id="${emp.id}">Close File</button>
                    ` : ''}
                </div>
                `;
            listContainer.appendChild(card);
        });
    } catch (error) {
         console.error("Error during renderEmployeeList loop:", error);
         listContainer.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Error rendering employee list: ${error.message}</p></div>`;
         customAlert("Render Error", `Failed to display employee list: ${error.message}`);
    }
}
// === END MODIFICATION ===


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

    // Define safe filters, defaulting to arrays for multi-select
     const safeFilters = {
         name: filters?.name || '', 
         status: filters?.status || [],
         designation: filters?.designation || [], 
         functionalRole: filters?.functionalRole || [],
         type: filters?.type || [],
         project: filters?.project || [],
         projectOffice: filters?.projectOffice || [],
         reportProject: filters?.reportProject || [],
         subCenter: filters?.subCenter || []
     };
     const nameFilterLower = safeFilters.name.toLowerCase();

    const filtered = employees.filter(emp => {
        if (!emp || typeof emp.name !== 'string' || typeof emp.employeeId !== 'string') return false;
        
        // Determine the single effective status for the employee
        let effectiveStatus = emp.status || 'Active';
        if (effectiveStatus === 'Active' && (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE')) { 
            effectiveStatus = 'Salary Held'; 
        }

        // Check each filter
        const nameMatch = nameFilterLower === '' || emp.name.toLowerCase().includes(nameFilterLower) || emp.employeeId.toLowerCase().includes(nameFilterLower);
        const statusMatch = safeFilters.status.length === 0 || safeFilters.status.includes(effectiveStatus);
        const designationMatch = safeFilters.designation.length === 0 || safeFilters.designation.includes(emp.designation);
        const functionalRoleMatch = safeFilters.functionalRole.length === 0 || safeFilters.functionalRole.includes(emp.functionalRole);
        const typeMatch = safeFilters.type.length === 0 || safeFilters.type.includes(emp.employeeType);
        const projectMatch = safeFilters.project.length === 0 || safeFilters.project.includes(emp.project);
        const projectOfficeMatch = safeFilters.projectOffice.length === 0 || safeFilters.projectOffice.includes(emp.projectOffice);
        const reportProjectMatch = safeFilters.reportProject.length === 0 || safeFilters.reportProject.includes(emp.reportProject);
        const subCenterMatch = safeFilters.subCenter.length === 0 || safeFilters.subCenter.includes(emp.subCenter);

        return nameMatch && statusMatch && designationMatch && functionalRoleMatch && typeMatch && projectMatch && projectOfficeMatch && reportProjectMatch && subCenterMatch;
    });

    if(countDisplay) {
        countDisplay.textContent = `Showing ${filtered.length} of ${employees.length} employees.`;
    }

    renderEmployeeList(listContainer, filtered);
}

// Helper to populate a <datalist>
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
        console.warn(`Datalist element with ID '${elementId}' not found.`);
    }
}


export function populateFilterDropdowns(employees) {
    if (!Array.isArray(employees)) employees = [];

    // --- Get unique, sorted lists for MODAL datalists ---
    const designations = [...new Set(employees.map(e => e?.designation).filter(Boolean))].sort();
    const functionalRoles = [...new Set(employees.map(e => e?.functionalRole).filter(Boolean))].sort();
    const offices = [...new Set(employees.map(e => e?.projectOffice).filter(Boolean))].sort();
    const projects = [...new Set(employees.map(e => e?.project).filter(Boolean))].sort();
    const reportProjects = [...new Set(employees.map(e => e?.reportProject).filter(Boolean))].sort();
    const subCenters = [...new Set(employees.map(e => e?.subCenter).filter(Boolean))].sort();
    const identificationTypes = [...new Set(employees.map(e => e?.identificationType).filter(Boolean))].sort();

    // --- Populate Modal <datalist> Autocompletes ---
    populateDataList('designation-list', designations);
    // Note: We need to add a datalist for functionalRole in index.html for this to work
    // populateDataList('functionalRole-list', functionalRoles); 
    populateDataList('project-list', projects);
    populateDataList('projectOffice-list', offices);
    populateDataList('reportProject-list', reportProjects);
    populateDataList('subCenter-list', subCenters);
    populateDataList('identificationType-list', identificationTypes);
}

// Function to set up the main event listener for the list
export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
     const listContainer = $('employee-list');
    if (!listContainer) { console.error("#employee-list not found for listeners."); return; }

    listContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const actionButton = target.closest('.view-details-btn, .edit-btn, .toggle-hold-btn, .transfer-btn, .resign-btn, .terminate-btn, .close-file-btn');
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
            if (typeof openStatusChangeModal === 'function') {
                openStatusChangeModal(employee, isCurrentlyHeld ? 'Unhold' : 'Hold');
            }
        } else if (actionButton.classList.contains('transfer-btn')) {
            if (typeof openTransferModal === 'function') openTransferModal(employee);
        } else if (actionButton.classList.contains('close-file-btn')) {
            if (typeof openFileClosingModal === 'function') {
                openFileClosingModal(employee);
            }
        }
    });
}