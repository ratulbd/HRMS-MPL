// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';
import { openFileClosingModal } from './fileClosingModal.js';

// === NEW: Function to show Skeleton Cards ===
export function renderSkeletons(count = 3, append = false) {
    const listContainer = $('employee-list');
    if (!listContainer) return;

    // If we are NOT appending (new search), clear the list first
    if (!append) listContainer.innerHTML = '';

    // Remove old "Loading..." text if it exists (we use skeletons instead)
    const loadingText = $('filterCountDisplay');
    if(loadingText) loadingText.classList.add('hidden');

    // Create dummy skeleton cards
    for (let i = 0; i < count; i++) {
        const skel = document.createElement('div');
        // 'fade-out-target' can be used if you want to animate them out later
        skel.className = 'skeleton-card';
        skel.innerHTML = `
            <div class="skeleton-pulse sk-title"></div>
            <div class="skeleton-pulse sk-badge"></div>
            <div class="skeleton-pulse sk-line"></div>
            <div class="skeleton-pulse sk-line"></div>
            <div class="skeleton-pulse sk-line-short"></div>
            <div class="skeleton-pulse sk-footer"></div>
        `;
        listContainer.appendChild(skel);
    }
}

// === NEW: Function to remove Skeleton Cards ===
export function removeSkeletons() {
    const listContainer = $('employee-list');
    if (!listContainer) return;

    // Remove all elements with the skeleton class
    const skeletons = listContainer.querySelectorAll('.skeleton-card');
    skeletons.forEach(el => el.remove());

    // Show the count text again
    const loadingText = $('filterCountDisplay');
    if(loadingText) loadingText.classList.remove('hidden');
}

export function renderEmployeeList(employeesToRender, append = false) {
    const listContainer = $('employee-list');
    if (!listContainer) { console.error("renderEmployeeList: listContainer element not found."); return; }

    // 1. Remove skeletons before rendering real data
    removeSkeletons();

    let startIndex = 0;
    if (append) {
        startIndex = listContainer.children.length;
    } else {
        listContainer.innerHTML = ''; // Clear for new search
    }

    const noResultsEl = listContainer.querySelector('.no-results');
    if (noResultsEl) noResultsEl.remove();

    if (!employeesToRender || employeesToRender.length === 0) {
        if (!append) {
             listContainer.innerHTML = `<div class="no-results col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-gray-500">No employees found matching the current filters.</p></div>`;
        }
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
            card.className = 'employee-card flex flex-col';
            card.setAttribute('data-employee-row-id', emp.id);

            // Use 'index' directly for animation delay
            card.style.setProperty('--card-index', index);


            // --- Info Tags ---
            let infoTagsHTML = '';

            if ((statusText === 'Resigned' || statusText === 'Terminated' || statusText === 'Closed') && emp.remarks) {
                 infoTagsHTML += `<span class="mt-2 mr-1 text-xs font-medium inline-block px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800" title="Separation Remarks: ${emp.remarks}">Separation: ${emp.remarks.substring(0, 20)}...</span>`;
            }
            if (emp.lastTransferDate && emp.lastSubcenter) {
                let displayDate = emp.lastTransferDate;
                if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) { displayDate = formatDateForDisplay(emp.lastTransferDate); }
                infoTagsHTML += `<span class="mt-2 mr-1 text-xs font-medium inline-block px-2.5 py-0.5 rounded-full bg-green-50 text-green-700" title="Transferred from ${emp.lastSubcenter} (${emp.lastTransferReason || ''})">Transfer: ${displayDate}</span>`;
            }
            if (statusText === 'Closed' && emp.fileClosingDate) {
                 infoTagsHTML += `<span class="mt-2 mr-1 text-xs font-medium inline-block px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700" title="File Closed: ${emp.fileClosingRemarks || ''}">Closed: ${formatDateForDisplay(emp.fileClosingDate)}</span>`;
            }

            // --- REQ 2: Salary Held Date below status ---
            let statusHtml = `
                <div class="flex flex-col items-end">
                    <span class="status-badge ${statusClass} flex-shrink-0 ml-2">${statusText}</span>
                    ${(statusText === 'Salary Held' && emp.holdTimestamp)
                        ? `<span class="text-xs text-red-600 mt-1 font-medium bg-red-50 px-2 py-0.5 rounded border border-red-100">Held: ${formatDateForDisplay(emp.holdTimestamp)}</span>`
                        : ''}
                </div>
            `;

            card.innerHTML = `
                <div class="card-content p-5 pb-16 flex-grow">
                    <div class="flex justify-between items-start mb-3">
                        <h3 class="font-poppins font-semibold text-lg text-green-800">${emp.name || 'N/A'}</h3>
                        ${statusHtml}
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

                    <div class="flex flex-wrap">
                        ${infoTagsHTML}
                    </div>
                </div>

                <div class="card-footer flex flex-wrap gap-1.5 justify-end">
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
                        <button class="close-file-btn btn-pill btn-pill-gray border-gray-300 hover:bg-gray-200" data-id="${emp.id}">Close File</button>
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

// (This function is called from main.js)
export function populateFilterDropdowns(filterData) {
    if (!filterData) return;

    const formatAndPopulate = (key, elementId) => {
        if (filterData[key]) {
            populateDataList(elementId, filterData[key]);
        }
    };

    formatAndPopulate('designation', 'designation-list');
    formatAndPopulate('project', 'project-list');
    formatAndPopulate('projectOffice', 'projectOffice-list');
    formatAndPopulate('reportProject', 'reportProject-list');
    formatAndPopulate('subCenter', 'subCenter-list');

    const identificationTypes = ['NID', 'Passport', 'Birth Certificate'];
    populateDataList('identificationType-list', identificationTypes);
}


export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
     const listContainer = $('employee-list');
    if (!listContainer) { console.error("#employee-list not found for listeners."); return; }

    listContainer.addEventListener('mousemove', (e) => {
        const card = e.target.closest('.employee-card');
        if (card) {
            const rect = card.getBoundingClientRect();

            // Spotlight effect
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);

            // 3D Tilt effect
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const mouseX = x - centerX;
            const mouseY = y - centerY;

            const rotateX = (mouseY / centerY) * -8; // Invert Y for natural tilt
            const rotateY = (mouseX / centerX) * 8;

            card.style.setProperty('--rotate-x', `${rotateX}deg`);
            card.style.setProperty('--rotate-y', `${rotateY}deg`);
        }
    });

    listContainer.addEventListener('mouseleave', (e) => {
         const card = e.target.closest('.employee-card');
         if(card) {
             card.style.setProperty('--rotate-x', `0deg`);
             card.style.setProperty('--rotate-y', `0deg`);
         }
    });

    listContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const actionButton = target.closest('.view-details-btn, .edit-btn, .toggle-hold-btn, .transfer-btn, .resign-btn, .terminate-btn, .close-file-btn');
        const cardElement = target.closest('.employee-card');
        if (!cardElement || !actionButton) return;

        const localId = cardElement.dataset.employeeRowId;
        if (!localId) { console.error("data-employee-row-id missing."); return; }

        const allEmployees = getEmployeesFunc();
        const employee = allEmployees.find(emp => String(emp.id) === String(localId));

        if (!employee) {
            customAlert("Error", "Could not find employee data. The list might be out of date. Please refresh.");
            return;
        }

        const employeeSheetId = employee.employeeId;
        if (!employeeSheetId) { customAlert("Error", "Employee ID missing."); return; }

        // Handle Button Clicks
        if (actionButton.classList.contains('view-details-btn')) {
            if (typeof openViewDetailsModal === 'function') openViewDetailsModal(employee);
        } else if (actionButton.classList.contains('edit-btn')) {
            if (typeof openEmployeeModal === 'function') openEmployeeModal(employee, allEmployees);
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