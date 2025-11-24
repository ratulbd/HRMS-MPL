import { $, customAlert } from './utils.js';
import { apiCall } from './apiClient.js';

// === FIX: Added 'export' keyword here ===
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
    const idField = $('fileCloseEmpId');
    const nameDisplay = $('fileCloseEmpNameDisplay');

    if (idField) idField.value = employee.employeeId;
    if (nameDisplay) nameDisplay.textContent = `${employee.name} (${employee.employeeId})`;

    // Show modal
    modal.classList.remove('hidden');
}

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
                await apiCall('closeFile', 'POST', {
                    employeeId: empId,
                    date: closeDate,
                    remarks: remarks
                });

                customAlert("Success", "Employee file closed successfully.");
                modal.classList.add('hidden');

                if (refreshCallback) refreshCallback(false);

            } catch (error) {
                console.error(error);
                customAlert("Error", error.message || "Failed to close file.");
            }
        });
    }
}