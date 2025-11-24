// js/fileClosingModal.js
import { $, openModal, closeModal, customAlert, formatDateForInput } from './utils.js';
import { apiCall } from './apiClient.js';

let mainFetchEmployeesFunc = null;

export function openFileClosingModal(employee) {
    const form = $('fileClosingForm');
    if (!form) {
        console.error("File closing form not found");
        return;
    }
    form.reset();

    // Set employee ID in hidden field
    $('fileClosingEmployeeId').value = employee.employeeId;

    // Set modal title
    const titleEl = $('fileClosingModalTitle');
    if (titleEl) {
        titleEl.textContent = `Close File for ${employee.name} (${employee.employeeId})`;
    }

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    $('fileClosingDate').value = today;
    
    // Clear remarks
    $('fileClosingRemarks').value = '';

    openModal('fileClosingModal');
}

export function setupFileCloseModal(fetchEmployeesFunc) {
    mainFetchEmployeesFunc = fetchEmployeesFunc; // Store the main fetch function
    const form = $('fileClosingForm');
    const cancelBtn = $('cancelFileClosingModal');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => closeModal('fileClosingModal'));
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const employeeId = $('fileClosingEmployeeId').value;
            const fileClosingDate = $('fileClosingDate').value;
            const fileClosingRemarks = $('fileClosingRemarks').value;

            if (!employeeId || !fileClosingDate || !fileClosingRemarks) {
                customAlert("Validation Error", "Please fill in all fields (Date and Remarks).");
                return;
            }

            try {
                // Call the new 'closeFile' API action
                await apiCall('closeFile', 'POST', {
                    employeeId: employeeId,
                    fileClosingDate: fileClosingDate,
                    fileClosingRemarks: fileClosingRemarks
                });
                
                customAlert("Success", "Employee file has been closed.");
                closeModal('fileClosingModal');
                
                if (mainFetchEmployeesFunc) {
                    mainFetchEmployeesFunc(); // Refresh the employee list
                }
            } catch (error) {
                customAlert("Error", `Failed to close file: ${error.message}`);
            }
        });
    }
}