// js/employeeList.js
import { $, formatDateForDisplay } from './utils.js';
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';
// === IMPORT ADDED: Import the open function for file closing ===
import { openFileCloseModal } from './fileClosingModal.js';

export function renderSkeletons(count = 6, append = false) {
    const listContainer = $('employee-list');
    if (!listContainer) return;

    const skeletonHTML = `
        <div class="bg-white rounded-lg shadow p-6 animate-pulse flex flex-col items-center space-y-4">
            <div class="rounded-full bg-gray-200 h-24 w-24"></div>
            <div class="h-4 bg-gray-200 rounded w-3/4"></div>
            <div class="h-3 bg-gray-200 rounded w-1/2"></div>
            <div class="flex space-x-2 mt-4 w-full justify-center">
                <div class="h-8 bg-gray-200 rounded w-8"></div>
                <div class="h-8 bg-gray-200 rounded w-8"></div>
                <div class="h-8 bg-gray-200 rounded w-8"></div>
            </div>
        </div>
    `;

    if (!append) listContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.innerHTML = skeletonHTML;
        listContainer.appendChild(div.firstElementChild);
    }
}

export function removeSkeletons() {
    const listContainer = $('employee-list');
    if (!listContainer) return;
    // Skeletons usually don't have a specific class identifying them exclusively vs content
    // but in our flow, renderEmployeeList clears container or appends real data.
    // If we appended skeletons, we might need to remove specifically them.
    // For simplicity in this architecture, renderEmployeeList handles clearing if not append.
    // If append=true was used, we assume the API call finished and we replace skeletons or just append data.
    // A simple way to remove strictly skeletons is finding elements with 'animate-pulse':
    const skeletons = listContainer.querySelectorAll('.animate-pulse');
    skeletons.forEach(el => el.remove());
}

export function renderEmployeeList(employees, append = false) {
    const listContainer = $('employee-list');
    if (!listContainer) return;

    // Remove existing skeletons before rendering new data
    removeSkeletons();

    if (!append) {
        listContainer.innerHTML = '';
    }

    if (employees.length === 0 && !append) {
        listContainer.innerHTML = '<div class="col-span-full text-center text-gray-500 py-8">No employees found matching your criteria.</div>';
        return;
    }

    employees.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow hover:shadow-md transition-shadow duration-200 overflow-hidden flex flex-col';

        // Status Color Logic
        let statusColor = 'bg-gray-100 text-gray-800';
        if (emp.status === 'Active') statusColor = 'bg-green-100 text-green-800';
        else if (emp.status === 'Salary Held') statusColor = 'bg-yellow-100 text-yellow-800';
        else if (emp.status === 'Resigned') statusColor = 'bg-orange-100 text-orange-800';
        else if (emp.status === 'Terminated') statusColor = 'bg-red-100 text-red-800';
        else if (emp.status === 'Closed') statusColor = 'bg-gray-800 text-white';

        // === MODIFICATION: Status Date Logic ===
        let statusDisplay = emp.status;
        if (emp.status === 'Salary Held' && emp.holdTimestamp) {
            // Format: "Salary Held (Nov 22, 2025)"
            statusDisplay += ` <span style="font-size: 0.75em; opacity: 0.8;">(${formatDateForDisplay(emp.holdTimestamp)})</span>`;
        }
        // =======================================

        card.innerHTML = `
            <div class="p-5 flex-grow flex flex-col items-center text-center">
                <div class="mb-3">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">
                        ${statusDisplay}
                    </span>
                </div>

                <h3 class="text-lg font-bold text-gray-900 mb-1">${emp.name || 'No Name'}</h3>
                <p class="text-sm text-gray-600 font-medium mb-1">${emp.designation || '-'}</p>
                <p class="text-xs text-gray-500 mb-3">ID: ${emp.employeeId}</p>

                <div class="w-full border-t border-gray-100 my-2"></div>

                <div class="w-full text-left text-sm space-y-1">
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">Project:</span>
                        <span class="font-medium text-xs truncate ml-2" title="${emp.project || ''}">${emp.project || '-'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">Office:</span>
                        <span class="font-medium text-xs truncate ml-2" title="${emp.projectOffice || ''}">${emp.projectOffice || '-'}</span>
                    </div>
                     <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">Joined:</span>
                        <span class="font-medium text-xs ml-2">${formatDateForDisplay(emp.joiningDate)}</span>
                    </div>
                </div>
            </div>

            <div class="bg-gray-50 px-4 py-3 border-t border-gray-200 flex justify-center space-x-3">
                <button class="text-blue-600 hover:text-blue-800 p-1 tooltip-btn" data-action="view" data-id="${emp.employeeId}" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="text-green-600 hover:text-green-800 p-1 tooltip-btn" data-action="edit" data-id="${emp.employeeId}" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="text-orange-600 hover:text-orange-800 p-1 tooltip-btn" data-action="status" data-id="${emp.employeeId}" title="Change Status">
                    <i class="fas fa-user-clock"></i>
                </button>
                <button class="text-purple-600 hover:text-purple-800 p-1 tooltip-btn" data-action="transfer" data-id="${emp.employeeId}" title="Transfer">
                    <i class="fas fa-exchange-alt"></i>
                </button>
                <button class="text-gray-600 hover:text-gray-800 p-1 tooltip-btn" data-action="fileclose" data-id="${emp.employeeId}" title="File Close">
                    <i class="fas fa-folder-minus"></i>
                </button>
                </div>
        `;
        listContainer.appendChild(card);
    });
}

export function populateFilterDropdowns(filters) {
    // This function logic remains handled by main.js or if exported here,
    // it fills the <select> options for modals (not the main dashboard TomSelects).
    const populate = (id, options) => {
        const el = $(id);
        if (!el) return;
        // Keep placeholder
        const placeholder = el.firstElementChild;
        el.innerHTML = '';
        if (placeholder) el.appendChild(placeholder);

        if (options && Array.isArray(options)) {
            options.sort().forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                el.appendChild(option);
            });
        }
    };

    populate('empDesignation', filters.designation);
    populate('empFunctionalRole', filters.functionalRole);
    populate('empProject', filters.project);
    populate('empProjectOffice', filters.projectOffice);
    populate('empReportProject', filters.reportProject);
    populate('empSubCenter', filters.subCenter);
    populate('empType', filters.type);
}

export function setupEmployeeListEventListeners(refreshCallback, getEmployeesCallback) {
    const listContainer = $('employee-list');

    listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (!action || !id) return;

        // Find employee object
        const employees = getEmployeesCallback();
        const employee = employees.find(emp => String(emp.employeeId) === String(id));

        if (!employee) {
            console.error("Employee not found for ID:", id);
            return;
        }

        if (action === 'view') {
            openViewDetailsModal(employee);
        } else if (action === 'edit') {
            openEmployeeModal(employee); // Edit Mode
        } else if (action === 'status') {
            openStatusChangeModal(employee);
        } else if (action === 'transfer') {
            openTransferModal(employee);
        } else if (action === 'fileclose') {
            // === MODIFICATION: Handle File Close Click ===
            openFileCloseModal(employee);
            // ============================================
        }
    });
}