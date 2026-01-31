import { $, customAlert, formatDateForDisplay } from './utils.js';
import { openEmployeeModal } from './employeeForm.js';
import { openStatusChangeModal } from './statusChange.js';
import { openViewDetailsModal } from './viewDetails.js';
import { openTransferModal } from './transferModal.js';
import { openFileClosingModal } from './fileClosingModal.js';

// ... (Keep renderSkeletons and removeSkeletons functions) ...

export function renderEmployeeList(employeesToRender, append = false) {
    const listContainer = $('employee-list');
    if (!listContainer) return;

    if (!append) listContainer.innerHTML = '';
    
    // ... (Keep your existing skeleton removal logic) ...

    employeesToRender.forEach((emp, index) => {
        const card = document.createElement('div');
        // Add Glassmorphism classes to card
        card.className = 'glass-card card-3d rounded-2xl p-6 relative group cursor-pointer flex flex-col justify-between h-full';
        card.setAttribute('data-employee-row-id', emp.id); // Critical for event delegation
        
        // Status styling logic
        let statusColor = 'bg-green-100 text-green-700';
        if (emp.status === 'Salary Held' || emp.salaryHeld === true) statusColor = 'bg-amber-100 text-amber-700';
        else if (emp.status === 'Resigned') statusColor = 'bg-yellow-100 text-yellow-700';
        else if (emp.status === 'Terminated') statusColor = 'bg-red-100 text-red-700';
        else if (emp.status === 'Closed') statusColor = 'bg-gray-200 text-gray-600';

        card.innerHTML = `
            <div class="card-content-glow rounded-2xl"></div>
            
            <div class="relative z-10">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                            ${emp.name.charAt(0)}
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-900 dark:text-white leading-tight">${emp.name}</h3>
                            <p class="text-xs text-gray-500">${emp.designation}</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 rounded text-xs font-bold ${statusColor} border border-white/50">
                        ${emp.salaryHeld === true ? 'Held' : emp.status}
                    </span>
                </div>
                
                <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300 mb-4">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-id-card w-5 text-center text-gray-400"></i> ${emp.employeeId}
                    </div>
                    <div class="flex items-center gap-2">
                        <i class="fas fa-map-marker-alt w-5 text-center text-gray-400"></i> ${emp.subCenter || 'N/A'}
                    </div>
                    <div class="flex items-center gap-2">
                        <i class="fas fa-project-diagram w-5 text-center text-gray-400"></i> ${emp.project || 'N/A'}
                    </div>
                </div>
            </div>

            <div class="relative z-10 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2 justify-end">
                 <button class="view-details-btn p-2 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700" data-id="${emp.id}">Details</button>
                 
                 ${emp.status !== 'Closed' ? `
                    <button class="edit-btn p-2 text-xs bg-blue-50 hover:bg-blue-100 rounded text-blue-700" data-id="${emp.id}"><i class="fas fa-edit"></i></button>
                 ` : ''}

                 ${(emp.status === 'Active' || emp.status === 'Salary Held') ? `
                    <button class="toggle-hold-btn p-2 text-xs ${emp.salaryHeld ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'} rounded" data-id="${emp.id}" data-held="${emp.salaryHeld}">
                        ${emp.salaryHeld ? 'Unhold' : 'Hold'}
                    </button>
                    <button class="transfer-btn p-2 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 rounded" data-id="${emp.id}"><i class="fas fa-exchange-alt"></i></button>
                    <button class="resign-btn p-2 text-xs bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded" data-id="${emp.id}"><i class="fas fa-user-minus"></i></button>
                 ` : ''}

                 ${(emp.status === 'Resigned' || emp.status === 'Terminated') ? `
                    <button class="close-file-btn p-2 text-xs bg-gray-800 text-white rounded hover:bg-black" data-id="${emp.id}">Close File</button>
                 ` : ''}
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// ... (Keep populateFilterDropdowns) ...
// ... (Keep event listeners logic, it matches the classes in the HTML above) ...