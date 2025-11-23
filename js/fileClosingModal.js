// js/fileClosingModal.js
import { $, customAlert, closeModal } from './utils.js';
import { apiCall } from './apiClient.js';

// === MODIFICATION: Exported function to open the modal ===
export function openFileCloseModal(employee) {
    const modal = $('fileCloseModal');
    const form = $('fileCloseForm');

    if (!modal || !form) {
        console.error("File Close Modal elements not found.");
        return;
    }

    // Reset form
    form.reset();

    // Set hidden ID and display name
    $('fileCloseEmpId').value = employee.employeeId;
    $('fileCloseEmpNameDisplay').textContent = `${employee.name} (${employee.employeeId})`;

    // Show modal
    modal.classList.remove('hidden');
}
// =========================================================

export function setupFileCloseModal(refreshCallback) {
    const modal = $('fileCloseModal');
    const form = $('fileCloseForm');
    const cancelBtn = $('cancelFileCloseModal');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const empId = $('fileCloseEmpId').value;
            const closeDate = $('fileCloseDate').value;
            const remarks = $('fileCloseRemarks').value;

            if (!closeDate || !remarks) {
                customAlert("Error", "Date and Remarks are required.");
                return;
            }

            try {
                // API Call to 'closeFile' action
                await apiCall('closeFile', 'POST', {
                    employeeId: empId,
                    date: closeDate,
                    remarks: remarks
                });

                customAlert("Success", "Employee file closed successfully.");
                modal.classList.add('hidden');

                if (refreshCallback) refreshCallback(false); // Refresh list

            } catch (error) {
                console.error(error);
                customAlert("Error", error.message || "Failed to close file.");
            }
        });
    }
}