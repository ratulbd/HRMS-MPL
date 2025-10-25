// js/employeeList.js

import { $, customAlert, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';

let localEmployees = [];

/** Safely store employees locally */
export function setLocalEmployees(employees) {
  localEmployees = Array.isArray(employees) ? employees : [];
}

/** Normalize status with salary-hold */
function effectiveStatusOf(emp) {
  const base = emp?.status ?? 'Active';
  const isHeld = emp?.salaryHeld === true || String(emp?.salaryHeld).toUpperCase() === 'TRUE';
  return base === 'Active' && isHeld ? 'Salary Held' : base;
}

/** Render cards into the container */
function renderEmployeeList(listContainer, employeesToRender) {
  if (!listContainer) {
    console.error('renderEmployeeList: listContainer element not found.');
    return;
  }

  listContainer.innerHTML = '';

  if (!employeesToRender || employeesToRender.length === 0) {
    listContainer.innerHTML = `
      <div class="text-center text-slate-500 py-8">
        No employees found matching the current filters.
      </div>`;
    return;
  }

  try {
    employeesToRender.forEach((emp, index) => {
      if (!emp || typeof emp.id === 'undefined') {
        console.warn(`renderEmployeeList: Skipping invalid employee at index ${index}:`, emp);
        return;
      }

      const statusText = effectiveStatusOf(emp);
      const isHeld = statusText === 'Salary Held';
      let statusClass = 'status-active';
      if (statusText === 'Resigned') statusClass = 'status-resigned';
      else if (statusText === 'Terminated') statusClass = 'status-terminated';
      else if (isHeld) statusClass = 'status-held';

      const card = document.createElement('div');
      card.className = 'employee-card bg-white rounded-lg shadow-md p-6 flex flex-col transition hover:shadow-lg';
      card.setAttribute('data-employee-row-id', emp.id);

      // Last transfer info
      let lastTransferHTML = '';
      if (emp.lastTransferDate && emp.lastSubcenter) {
        let displayDate = emp.lastTransferDate;
        if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) {
          displayDate = formatDateForDisplay(emp.lastTransferDate);
        }
        lastTransferHTML = `
          <div class="text-xs text-slate-500 mt-1">
            <span class="font-medium">Last Transfer:</span> ${displayDate} to ${emp.lastSubcenter}
            ${emp.lastTransferReason
              ? `(<span title="${emp.lastTransferReason}">${emp.lastTransferReason.substring(0, 30)}${emp.lastTransferReason.length > 30 ? '…' : ''}</span>)`
              : ''}
          </div>`;
      }

      const salary = Number(emp.salary ?? 0).toLocaleString('en-IN');

      card.innerHTML = `
        <div class="flex items-start justify-between gap-4">
          <div>
            <h4 class="text-lg font-semibold">${emp.name ?? 'N/A'}</h4>

            <div class="mt-1 text-sm">
              <span class="inline-flex items-center gap-2">
                <span class="${statusClass} inline-block h-2 w-2 rounded-full"></span>
                <span class="font-medium">${statusText}</span>
                ${isHeld && emp.holdTimestamp ? `<span class="text-xs text-slate-500">${emp.holdTimestamp}</span>` : ''}
              </span>
            </div>

            <div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm text-slate-700">
              <div><span class="text-slate-500">Designation:</span> ${emp.designation ?? 'N/A'}</div>
              <div><span class="text-slate-500">ID:</span> ${emp.employeeId ?? 'N/A'}</div>
              <div><span class="text-slate-500">Type:</span> ${emp.employeeType ?? 'N/A'}</div>
              <div><span class="text-slate-500">Project:</span> ${emp.project ?? 'N/A'}</div>
              <div><span class="text-slate-500">Sub Center:</span> ${emp.subCenter ?? 'N/A'}</div>
              <div><span class="text-slate-500">Salary:</span> ৳${salary}</div>
              <div><span class="text-slate-500">Joined:</span> ${formatDateForDisplay(emp.joiningDate)}</div>
              ${
                statusText !== 'Active' && statusText !== 'Salary Held' && emp.separationDate
                  ? `<div><span class="text-slate-500">Separation:</span> ${formatDateForDisplay(emp.separationDate)}</div>`
                  : ''
              }
            </div>

            ${emp.remarks ? `<div class="mt-2 text-sm"><span class="text-slate-500">Remarks:</span> ${emp.remarks}</div>` : ''}
            ${lastTransferHTML}
          </div>

          <div class="flex flex-col gap-2">
            <button class="view-details-btn px-3 py-1.5 text-sm rounded border text-slate-700 hover:bg-slate-50">View Details</button>
            <button class="edit-btn px-3 py-1.5 text-sm rounded border text-slate-700 hover:bg-slate-50">Edit</button>
            ${
              statusText === 'Active' || statusText === 'Salary Held'
                ? `
              <button class="toggle-hold-btn px-3 py-1.5 text-sm rounded border text-slate-700 hover:bg-slate-50" data-held="${isHeld}">
                ${isHeld ? 'Unhold Salary' : 'Hold Salary'}
              </button>
              <button class="transfer-btn px-3 py-1.5 text-sm rounded border text-slate-700 hover:bg-slate-50">Transfer</button>
              <button class="resign-btn px-3 py-1.5 text-sm rounded border text-orange-600 hover:bg-orange-50">Resign</button>
              <button class="terminate-btn px-3 py-1.5 text-sm rounded border text-red-600 hover:bg-red-50">Terminate</button>
            `
                : ''
            }
          </div>
        </div>

        <!-- The invalid comment that was previously here has been removed -->
      `;

      listContainer.appendChild(card);
    });
  } catch (error) {
    console.error('Error during renderEmployeeList loop:', error);
    listContainer.innerHTML = `
      <div class="text-red-600">Error rendering employee list: ${error.message}</div>
    `;
    customAlert('Render Error', `Failed to display employee list: ${error.message}`);
  }
}

/** Filter + render with current filters */
export function filterAndRenderEmployees(filters, employees) {
  const listContainer = $('employee-list');
  const initialLoadingIndicator = $('initialLoading');

  if (initialLoadingIndicator && initialLoadingIndicator.parentNode === listContainer) {
    listContainer.removeChild(initialLoadingIndicator);
  }

  if (!Array.isArray(employees)) {
    console.error('filterAndRenderEmployees received non-array:', employees);
    renderEmployeeList(listContainer, []);
    return;
  }

  const safeFilters = {
    name: (filters?.name ?? '').trim(),
    status: (filters?.status ?? '').trim(),
    designation: (filters?.designation ?? '').trim(),
    type: (filters?.type ?? '').trim(),
  };

  const nameFilterLower = safeFilters.name.toLowerCase();

  const filtered = employees.filter((emp) => {
    if (!emp || typeof emp.name !== 'string' || typeof emp.employeeId !== 'string') return false;

    const statusNow = effectiveStatusOf(emp);

    const nameMatch =
      nameFilterLower === '' ||
      emp.name.toLowerCase().includes(nameFilterLower) ||
      emp.employeeId.toLowerCase().includes(nameFilterLower);

    const statusMatch = safeFilters.status === '' || statusNow === safeFilters.status;
    const designationMatch = safeFilters.designation === '' || emp.designation === safeFilters.designation;
    const typeMatch = safeFilters.type === '' || emp.employeeType === safeFilters.type;

    return nameMatch && statusMatch && designationMatch && typeMatch;
  });

  renderEmployeeList(listContainer, filtered);
}

/** Populate the Designation filter dropdown */
export function populateFilterDropdowns(employees) {
  const designationFilter = $('filterDesignation');
  if (!designationFilter) return;

  if (!Array.isArray(employees)) employees = [];

  const designations = [...new Set(employees.map((e) => e?.designation).filter((d) => d && typeof d === 'string'))].sort();

  const currentVal = designationFilter.value;
  designationFilter.innerHTML = ''; // reset

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All';
  designationFilter.appendChild(allOption);

  designations.forEach((d) => {
    const option = document.createElement('option');
    option.value = d;
    option.textContent = d;
    designationFilter.appendChild(option);
  });

  if (designations.includes(currentVal)) {
    designationFilter.value = currentVal;
  } else {
    designationFilter.value = '';
  }
}

/** Attach delegated handlers for card buttons */
export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
  const listContainer = $('employee-list');
  if (!listContainer) {
    console.error('Employee list container #employee-list not found for attaching listeners.');
    return;
  }

  listContainer.addEventListener('click', async (e) => {
    const target = e.target;
    const actionButton = target.closest(
      '.view-details-btn, .edit-btn, .toggle-hold-btn, .transfer-btn, .resign-btn, .terminate-btn'
    );
    const cardElement = target.closest('.employee-card');

    if (!cardElement || !actionButton) return; // Not an action inside a card

    const localId = cardElement.dataset.employeeRowId;
    if (!localId) {
      console.error('Could not find data-employee-row-id on the card.');
      return;
    }

    const currentEmployees = typeof getEmployeesFunc === 'function' ? getEmployeesFunc() : localEmployees;
    const employee = currentEmployees.find((row) => String(row.id) === String(localId));

    if (!employee) {
      customAlert('Error', 'Could not find employee data. Please refresh.');
      console.warn(`Employee object not found for row ID: ${localId}`);
      return;
    }

    const employeeSheetId = employee.employeeId;
    if (!employeeSheetId) {
      customAlert('Error', 'Employee ID missing. Cannot perform action.');
      return;
    }

    // --- Actions ---
    if (actionButton.classList.contains('view-details-btn')) {
      if (typeof openViewDetailsModal === 'function') openViewDetailsModal(employee);
      else console.error('openViewDetailsModal function not imported or defined');
    } else if (actionButton.classList.contains('edit-btn')) {
      if (typeof openEmployeeModal === 'function') openEmployeeModal(employee, currentEmployees);
      else console.error('openEmployeeModal function not imported or defined');
    } else if (actionButton.classList.contains('resign-btn')) {
      if (typeof openStatusChangeModal === 'function') openStatusChangeModal(employee, 'Resigned');
      else console.error('openStatusChangeModal function not imported or defined');
    } else if (actionButton.classList.contains('terminate-btn')) {
      if (typeof openStatusChangeModal === 'function') openStatusChangeModal(employee, 'Terminated');
      else console.error('openStatusChangeModal function not imported or defined');
    } else if (actionButton.classList.contains('toggle-hold-btn')) {
      const isCurrentlyHeld = actionButton.dataset.held === 'true';
      const newHeldStatus = !isCurrentlyHeld;
      try {
        await apiCall('updateStatus', 'POST', { employeeId: employeeSheetId, salaryHeld: newHeldStatus });
        if (typeof fetchEmployeesFunc === 'function') fetchEmployeesFunc();
        else console.error('fetchEmployeesFunc function not available');
      } catch (error) {
        console.error('Error during toggle hold API call:', error);
        customAlert('Error', `Failed to update salary status: ${error.message}`);
      }
    } else if (actionButton.classList.contains('transfer-btn')) {
      if (typeof openTransferModal === 'function') openTransferModal(employee);
      else console.error('openTransferModal function not imported or defined');
    }
  });
}