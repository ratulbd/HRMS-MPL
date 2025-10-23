// js/statusChange.js
import { $, openModal, closeModal, customAlert } from './utils.js';
import { apiCall } from './apiClient.js';

let mainFetchEmployeesFunc = null; // To store the main fetch function

export function openStatusChangeModal(employee, newStatus) {
    const form = $('statusChangeForm');
    if (!form) return;
    form.reset();

    $('statusChangeEmployeeId').value = employee.employeeId;
    $('statusChangeNewStatus').value = newStatus;

    // Use current date as default if no separation date exists
    const today = new Date().toISOString().split('T')[0];
    $('separationDate').value = employee.separationDate ? formatDateForInput(employee.separationDate) : today;
    $('remarks').value = employee.remarks || '';

    const title = `Mark as ${newStatus}`;
    const dateLabel = newStatus === 'Resigned' ? 'Resignation Date' : 'Termination Date';
    $('statusChangeTitle').textContent = title;
    $('separationDateLabel').textContent = dateLabel;

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
            const newStatus = $('statusChangeNewStatus').value;
            const separationDate = $('separationDate').value;
            const remarks = $('remarks').value;

            if (!employeeId || !newStatus || !separationDate) {
                customAlert("Error", "Missing required information.");
                return;
            }

            try {
                await apiCall('updateStatus', 'POST', {
                    employeeId: employeeId,
                    status: newStatus,
                    separationDate: separationDate,
                    remarks: remarks || ''
                });
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