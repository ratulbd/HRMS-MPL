// js/statusChange.js
import { $, openModal, closeModal, customAlert, formatDateForInput } from './utils.js';
import { apiCall } from './apiClient.js';

let mainFetchEmployeesFunc = null; // To store the main fetch function

export function openStatusChangeModal(employee, newStatusOrAction) {
    const form = $('statusChangeForm');
    const separationDateContainer = $('separationDateContainer');
    const remarksInput = $('remarks');
    const titleEl = $('statusChangeTitle');
    const dateLabelEl = $('separationDateLabel');

    if (!form || !separationDateContainer || !remarksInput || !titleEl || !dateLabelEl) {
        console.error("Status change modal elements not found!");
        return;
    }
    form.reset();

    $('statusChangeEmployeeId').value = employee.employeeId;
    $('statusChangeNewStatus').value = newStatusOrAction; // This will be 'Resigned', 'Terminated', 'Hold', or 'Unhold'
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];

    if (newStatusOrAction === 'Resigned' || newStatusOrAction === 'Terminated') {
        // --- Handle Resignation / Termination ---
        separationDateContainer.classList.remove('hidden');
        titleEl.textContent = `Mark as ${newStatusOrAction}`;
        dateLabelEl.textContent = newStatusOrAction === 'Resigned' ? 'Resignation Date' : 'Termination Date';
        
        // Use existing separation date or today
        $('separationDate').value = employee.separationDate ? formatDateForInput(employee.separationDate) : today;
        remarksInput.value = employee.remarks || ''; // Use existing remarks if available

    } else if (newStatusOrAction === 'Hold' || newStatusOrAction === 'Unhold') {
        // --- Handle Hold / Unhold ---
        // Hide the separation date field as it's not relevant
        separationDateContainer.classList.add('hidden');
        $('separationDate').value = today; // Set to today, but it won't be used
        
        titleEl.textContent = (newStatusOrAction === 'Hold') ? 'Hold Salary' : 'Unhold Salary';
        remarksInput.value = ''; // Always require new remarks for hold/unhold
        remarksInput.placeholder = 'Remarks are mandatory...';
    }

    openModal('statusChangeModal');
}

export function setupStatusChangeModal(fetchEmployeesFunc) {
    mainFetchEmployeesFunc = fetchEmployeesFunc; // Store the function
    const form = $('statusChangeForm');
    const cancelBtn = $('cancelStatusChangeModal');

    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('statusChangeModal'));

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const employeeId = $('statusChangeEmployeeId').value;
            const statusOrAction = $('statusChangeNewStatus').value;
            const separationDate = $('separationDate').value;
            const remarks = $('remarks').value;

            // Remarks are mandatory for all actions in this modal
            if (!remarks) {
                customAlert("Validation Error", "Remarks are mandatory.");
                $('remarks').focus();
                return;
            }

            let apiPayload = {
                employeeId: employeeId,
                remarks: remarks
            };

            if (statusOrAction === 'Resigned' || statusOrAction === 'Terminated') {
                if (!separationDate) {
                    customAlert("Validation Error", "Separation date is mandatory.");
                    return;
                }
                apiPayload.status = statusOrAction;
                apiPayload.separationDate = separationDate;

            } else if (statusOrAction === 'Hold') {
                apiPayload.salaryHeld = true;

            } else if (statusOrAction === 'Unhold') {
                apiPayload.salaryHeld = false;
                
            } else {
                customAlert("Error", "Unknown action.");
                return;
            }

            try {
                await apiCall('updateStatus', 'POST', apiPayload);
                
                customAlert("Success", "Employee status updated successfully.");
                closeModal('statusChangeModal');
                
                if (mainFetchEmployeesFunc) {
                    mainFetchEmployeesFunc(); // Refresh the list
                }
            } catch (error) {
                customAlert("Error", `Failed to update status: ${error.message}`);
            }
        });
    }
}