// js/employeeList.js
import { $, customAlert, formatDateForDisplay } from './utils.js';
// ... other imports ...
import { openTransferModal } from './transferModal.js';

// ... setLocalEmployees, renderEmployeeList ...
function renderEmployeeList(listContainer, employeesToRender) {
    // ... (start of function) ...
    employeesToRender.forEach(emp => {
        // ... (status, card setup) ...

        // Prepare Last Transfer Info Display
        let lastTransferHTML = '';
        // --- UPDATED: Use lastSubcenter ---
        if (emp.lastTransferDate && emp.lastSubcenter) {
            let displayDate = emp.lastTransferDate;
            if (!String(displayDate).match(/^\d{2}-[A-Z]{3}-\d{2}/)) {
                 displayDate = formatDateForDisplay(emp.lastTransferDate);
            }
            lastTransferHTML = `
            <div class="mt-2 text-xs text-purple-700 bg-purple-50 p-2 rounded-md">
                <strong>Last Transfer:</strong> ${displayDate}
                to ${emp.lastSubcenter} {/* <-- Use lastSubcenter */}
                ${emp.lastTransferReason ? `(${emp.lastTransferReason.substring(0, 30)}${emp.lastTransferReason.length > 30 ? '...' : ''})` : ''}
            </div>`;
        }
        // --- END UPDATE ---

        card.innerHTML = `
            <div class="flex-grow">
                 {/* ... header ... */}
                 <p class="text-gray-600">${emp.designation || 'N/A'}</p>
                 <p class="text-sm text-gray-500 mb-4">ID: ${emp.employeeId || 'N/A'}</p>
                 <dl class="text-sm space-y-2">
                     {/* ... other dl items ... */}
                      <div class="flex"><dt class="font-medium text-gray-500 w-24">Sub Center:</dt> <dd class="text-gray-700">${emp.subCenter || 'N/A'}</dd></div>
                      {/* ... other dl items ... */}
                 </dl>
                 ${emp.remarks ? `<div class="mt-3 text-xs text-gray-700 bg-gray-100 p-2 rounded-md"><strong>Remarks:</strong> ${emp.remarks}</div>` : ''}
                 ${lastTransferHTML} {/* Display Last Transfer Info */}
            </div>
            <div class="border-t border-gray-200 mt-4 pt-4 flex flex-wrap gap-2 justify-end">
                 {/* ... buttons ... */}
                 ${statusText === 'Active' || statusText === 'Salary Held' ? `
                    {/* ... other buttons ... */}
                    <button class="transfer-btn text-sm font-medium text-purple-600 hover:text-purple-800" data-id="${emp.id}">Transfer</button>
                    {/* ... other buttons ... */}
                ` : ''}
            </div>
        `;
        listContainer.appendChild(card);
    });
}
// ... filterAndRenderEmployees, populateFilterDropdowns, setupEmployeeListEventListeners ...
export function setupEmployeeListEventListeners(fetchEmployeesFunc, getEmployeesFunc) {
    // ... (This function remains the same, calls openTransferModal on transfer-btn click) ...
}