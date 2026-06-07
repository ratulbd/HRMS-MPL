// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';
import { openFileClosingModal } from './fileClosingModal.js';

// // === NEW: Function to show Skeleton Rows ===
export function renderSkeletons(count = 3, append = false) {
    const listContainer = $('employee-list');
    if (!listContainer) return;

    // If we are NOT appending (new search), clear the list first
    if (!append) listContainer.innerHTML = '';

    // Remove old "Loading..." text if it exists (we use skeletons instead)
    const loadingText = $('filterCountDisplay');
    if(loadingText) loadingText.classList.add('hidden');

    // Create dummy skeleton rows
    for (let i = 0; i < count; i++) {
        const skel = document.createElement('tr');
        skel.className = 'skeleton-row';
        skel.innerHTML = `
            <td><div class="sk-row-pulse" style="width: 70px;"></div></td>
            <td>
                <div class="flex items-center gap-3">
                    <div class="sk-row-pulse" style="width: 2.25rem; height: 2.25rem; border-radius: 50%;"></div>
                    <div class="flex-grow space-y-1.5">
                        <div class="sk-row-pulse" style="width: 120px; height: 0.75rem;"></div>
                        <div class="sk-row-pulse" style="width: 150px; height: 0.625rem;"></div>
                    </div>
                </div>
            </td>
            <td>
                <div class="space-y-1.5">
                    <div class="sk-row-pulse" style="width: 130px; height: 0.75rem;"></div>
                    <div class="sk-row-pulse" style="width: 90px; height: 0.625rem;"></div>
                </div>
            </td>
            <td>
                <div class="space-y-1.5">
                    <div class="sk-row-pulse" style="width: 110px; height: 0.75rem;"></div>
                    <div class="sk-row-pulse" style="width: 140px; height: 0.625rem;"></div>
                </div>
            </td>
            <td><div class="sk-row-pulse" style="width: 90px;"></div></td>
            <td><div class="sk-row-pulse" style="width: 80px; height: 1.5rem; border-radius: 9999px;"></div></td>
            <td style="text-align: center;"><div class="sk-row-pulse" style="width: 24px; height: 24px; border-radius: 4px; margin: auto;"></div></td>
        `;
        listContainer.appendChild(skel);
    }
}

// === NEW: Function to remove Skeleton Rows ===
export function removeSkeletons() {
    const listContainer = $('employee-list');
    if (!listContainer) return;

    // Remove all elements with the skeleton class
    const skeletons = listContainer.querySelectorAll('.skeleton-row');
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
             listContainer.innerHTML = `<tr class="no-results"><td colspan="7" class="text-center p-8 text-gray-500">No employees found matching the current filters.</td></tr>`;
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

            const card = document.createElement('tr');
            card.className = 'employee-card hover:bg-gray-50/80 transition-colors';
            card.setAttribute('data-employee-row-id', emp.id);

            // Use 'index' directly for animation delay if needed
            card.style.setProperty('--card-index', index);

            // --- Info Tags ---
            let infoTagsHTML = '';
            if ((statusText === 'Resigned' || statusText === 'Terminated' || statusText === 'Closed') && emp.remarks) {
                 infoTagsHTML += `<span class="mt-1 mr-1 text-[10px] font-semibold inline-block px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-100" title="Separation Remarks: ${emp.remarks}">Separation: ${emp.remarks.substring(0, 15)}...</span>`;
            }
            if (emp.lastTransferDate && emp.lastSubcenter) {
                let displayDate = emp.lastTransferDate;
                if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) { displayDate = formatDateForDisplay(emp.lastTransferDate); }
                infoTagsHTML += `<span class="mt-1 mr-1 text-[10px] font-semibold inline-block px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100" title="Transferred from ${emp.lastSubcenter} (${emp.lastTransferReason || ''})">Transfer: ${displayDate}</span>`;
            }
            if (statusText === 'Closed' && emp.fileClosingDate) {
                 infoTagsHTML += `<span class="mt-1 mr-1 text-[10px] font-semibold inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200" title="File Closed: ${emp.fileClosingRemarks || ''}">Closed: ${formatDateForDisplay(emp.fileClosingDate)}</span>`;
            }

            // Initials Avatar
            const initials = (emp.name || 'N/A').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() || '?';
            const avatarHtml = `<div class="emp-table-avatar">${initials}</div>`;

            card.innerHTML = `
                <td>
                    <span class="font-mono text-xs font-semibold text-gray-500">${emp.employeeId || 'N/A'}</span>
                </td>
                <td>
                    <div class="flex items-center gap-3">
                        ${avatarHtml}
                        <div>
                            <div class="font-semibold text-gray-900">${emp.name || 'N/A'}</div>
                            <div class="text-xs text-gray-500">${emp.personalMobile || 'No Contact'}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="font-semibold text-gray-800 text-[13px]">${emp.designation || 'N/A'}</div>
                    <div class="text-xs text-gray-500">${emp.functionalRole || 'N/A'}</div>
                </td>
                <td>
                    <div class="text-gray-800 font-medium text-[13px]">${emp.project || 'N/A'}</div>
                    <div class="text-xs text-gray-500 flex items-center gap-1">
                        <i class="fas fa-map-marker-alt text-gray-400"></i> ${emp.subCenter || 'N/A'}
                    </div>
                </td>
                <td>
                    <span class="text-xs text-gray-600 font-medium">${formatDateForDisplay(emp.joiningDate)}</span>
                </td>
                <td>
                    <div class="flex flex-col items-start gap-1">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        ${(statusText === 'Salary Held' && emp.holdTimestamp)
                            ? `<span class="text-[10px] text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">Held: ${formatDateForDisplay(emp.holdTimestamp)}</span>`
                            : ''}
                        ${infoTagsHTML ? `<div class="flex flex-wrap">${infoTagsHTML}</div>` : ''}
                    </div>
                </td>
                <td style="text-align: center; overflow: visible; position: relative;">
                    <div class="action-menu-container">
                        <button class="action-menu-btn" type="button" aria-label="Action menu">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="action-menu">
                            <button class="action-menu-item view-details-btn" data-id="${emp.id}">
                                <i class="fas fa-eye"></i> View Details
                            </button>
                            ${statusText !== 'Closed' ? `
                                <button class="action-menu-item edit-btn" data-id="${emp.id}">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                            ` : ''}
                            ${statusText === 'Active' || statusText === 'Salary Held' ? `
                                <button class="action-menu-item toggle-hold-btn" data-id="${emp.id}" data-held="${isHeld}">
                                    <i class="fas ${isHeld ? 'fa-play' : 'fa-pause'}"></i> ${isHeld ? 'Unhold' : 'Hold Salary'}
                                </button>
                                <button class="action-menu-item transfer-btn" data-id="${emp.id}">
                                    <i class="fas fa-exchange-alt"></i> Transfer
                                </button>
                                <button class="action-menu-item resign-btn" data-id="${emp.id}">
                                    <i class="fas fa-user-minus"></i> Resign
                                </button>
                                <button class="action-menu-item terminate-btn danger" data-id="${emp.id}">
                                    <i class="fas fa-user-slash"></i> Terminate
                                </button>
                            ` : ''}
                            ${(statusText === 'Resigned' || statusText === 'Terminated') ? `
                                <button class="action-menu-item close-file-btn" data-id="${emp.id}">
                                    <i class="fas fa-folder-minus"></i> Close File
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </td>
            `;
            listContainer.appendChild(card);
        });
    } catch (error) {
         console.error("Error during renderEmployeeList loop:", error);
         listContainer.innerHTML = `<tr><td colspan="7" class="text-center p-8"><p class="text-red-600 font-semibold">Error rendering employee list: ${error.message}</p></td></tr>`;
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

    // Toggle action dropdown menu
    listContainer.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.action-menu-btn');
        if (toggleBtn) {
            e.stopPropagation();
            const container = toggleBtn.closest('.action-menu-container');
            const menu = container.querySelector('.action-menu');
            
            // Close all other menus first
            document.querySelectorAll('.action-menu.show').forEach(openMenu => {
                if (openMenu !== menu) openMenu.classList.remove('show');
            });
            
            menu.classList.toggle('show');
            return;
        }
        
        // If clicking on a menu item, close the menu
        const menuItem = e.target.closest('.action-menu-item');
        if (menuItem) {
            const menu = menuItem.closest('.action-menu');
            if (menu) menu.classList.remove('show');
        }
    });

    // Close menus when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.action-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
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
