// js/employeeForm.js
import { $, openModal, closeModal, customAlert, formatDateForInput } from './utils.js';
import { apiCall } from './apiClient.js';
// We don't import fetchEmployees directly, it will be passed into setupEmployeeForm

/**
 * Opens and populates the employee modal for adding or editing.
 * @param {object | null} employee - The employee object to edit, or null to add.
 * @param {Array} localEmployees - The current list of employees (used for duplicate check).
 */
export function openEmployeeModal(employee = null, localEmployees = []) {
    const form = $('employeeForm');
    if (!form) {
        console.error("Employee form element not found!");
        return;
    }
    form.reset(); // Clear previous entries

    const isEditing = Boolean(employee);
    $('modalTitle').textContent = isEditing ? 'Edit Employee' : 'Add New Employee';
    $('employeeDocId').value = employee?.id || ''; // Stores the row ID if editing
    $('originalEmployeeIdHidden').value = employee?.employeeId || ''; // Stores original ID for backend lookup if editing

    // --- Populate hidden fields ---
    // These hold state that isn't directly edited in the main form view but needs to be preserved/sent
    $('employeeStatus').value = employee?.status || 'Active'; // Default to Active
    // Ensure boolean string 'true'/'false'
    $('employeeSalaryHeld').value = String(employee?.salaryHeld === true || String(employee?.salaryHeld).toUpperCase() === 'TRUE');
    $('separationDateHidden').value = employee?.separationDate || '';
    $('remarksHidden').value = employee?.remarks || '';
    $('holdTimestampHidden').value = employee?.holdTimestamp || '';

    // --- Populate visible form fields ---
    if (isEditing && employee) {
        // Loop through keys of a typical employee object to populate form
        Object.keys(employee).forEach(key => {
            const input = $(key); // Get input element by ID (assuming IDs match keys)
            // Skip hidden fields handled above
            if (input && !['status', 'salaryHeld', 'separationDate', 'remarks', 'holdTimestamp', 'id', 'originalEmployeeId'].includes(key)) {
                if (key === 'joiningDate' || key === 'dob') {
                    // Format dates specifically for <input type="date"> (YYYY-MM-DD)
                    input.value = formatDateForInput(employee[key]);
                } else {
                    // For other fields, set the value directly (use empty string if null/undefined)
                    input.value = employee[key] ?? '';
                }
            }
        });
        // Make Employee ID readonly when editing
        const empIdInput = $('employeeId');
        if (empIdInput) {
             empIdInput.setAttribute('readonly', true);
             empIdInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        }
    } else {
        // Add mode: Ensure Employee ID is editable
        const empIdInput = $('employeeId');
        if (empIdInput) {
            empIdInput.removeAttribute('readonly');
            empIdInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        }
        // Set default Employee Type if needed
        $('employeeType').value = 'Permanent';
    }

    openModal('employeeModal'); // Show the modal
}

/**
 * Attaches event listeners for the employee form (submit, add button, cancel buttons).
 * @param {Function} getEmployeesFunc - Function to get the current list of employees.
 * @param {Function} fetchEmployeesFunc - Function to trigger fetching/refreshing the employee list.
 */
export function setupEmployeeForm(getEmployeesFunc, fetchEmployeesFunc) {
    const form = $('employeeForm');
    const addBtn = $('addEmployeeBtn'); // Button in the main nav/header
    const cancelBtn = $('cancelEmployeeModal'); // Button at the bottom of the modal
    const cancelBtnTop = $('cancelEmployeeModal_top'); // 'x' button at the top of the modal

    // --- Attach Listeners ---
    if (addBtn) {
        addBtn.addEventListener('click', () => {
             // Pass the current employee list for duplicate check when opening in add mode
             openEmployeeModal(null, getEmployeesFunc());
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => closeModal('employeeModal'));
    }

    if (cancelBtnTop) {
        cancelBtnTop.addEventListener('click', () => closeModal('employeeModal'));
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent default browser form submission

            const isEditing = Boolean($('originalEmployeeIdHidden').value);
            const originalEmployeeId = $('originalEmployeeIdHidden').value || undefined; // Use undefined if empty

            // --- Gather Data from Form ---
            // Create data object directly from form elements
            const employeeData = {
                // Core Info
                employeeId: $('employeeId').value.trim(),
                name: $('name').value.trim(),
                employeeType: $('employeeType').value,
                designation: $('designation').value.trim(),
                joiningDate: $('joiningDate').value, // YYYY-MM-DD format from input
                workExperience: parseFloat($('workExperience').value) || 0,
                education: $('education').value.trim(),
                // Project Info
                project: $('project').value.trim(),
                projectOffice: $('projectOffice').value.trim(),
                reportProject: $('reportProject').value.trim(),
                subCenter: $('subCenter').value.trim(),
                // Personal Info
                fatherName: $('fatherName').value.trim(),
                motherName: $('motherName').value.trim(),
                personalMobile: $('personalMobile').value.trim(),
                dob: $('dob').value, // YYYY-MM-DD format from input
                bloodGroup: $('bloodGroup').value.trim(),
                address: $('address').value.trim(),
                identification: $('identification').value.trim(),
                // Contact & Nominee
                nomineeName: $('nomineeName').value.trim(),
                nomineeMobile: $('nomineeMobile').value.trim(),
                officialMobile: $('officialMobile').value.trim() || '', // Optional
                mobileLimit: parseFloat($('mobileLimit').value) || 0, // Optional
                // Salary Info
                salary: parseFloat($('salary').value) || 0,
                bankAccount: $('bankAccount').value.trim() || '', // Optional
                // Hidden State (preserved during edit)
                status: $('employeeStatus').value,
                salaryHeld: $('employeeSalaryHeld').value === 'true', // Convert string back to boolean
                separationDate: $('separationDateHidden').value,
                remarks: $('remarksHidden').value,
                holdTimestamp: $('holdTimestampHidden').value,
            };

            // Add originalEmployeeId only if it exists (i.e., we are editing)
            if (originalEmployeeId) {
                employeeData.originalEmployeeId = originalEmployeeId;
            }

            // --- Basic Client-Side Validation ---
            if (!employeeData.employeeId || !employeeData.name || !employeeData.joiningDate) {
                 customAlert("Validation Error", "Employee ID, Name, and Joining Date are required.");
                 return; // Stop submission
            }
            if (isNaN(employeeData.salary) || employeeData.salary < 0) {
                 customAlert("Validation Error", "Gross Salary must be a valid non-negative number.");
                 return; // Stop submission
            }
             if (employeeData.workExperience < 0) {
                  customAlert("Validation Error", "Work Experience cannot be negative.");
                  return;
             }
             // Add more specific validations as needed (e.g., phone number format)


            // --- Client-side Duplicate Check (for NEW employees only) ---
            if (!isEditing) {
                const currentEmployees = getEmployeesFunc(); // Get current list
                const empExists = currentEmployees.some(emp => emp.employeeId === employeeData.employeeId);
                if (empExists) {
                    customAlert("Error", `An employee with ID "${employeeData.employeeId}" already exists.`);
                    return; // Stop submission
                }
                // Ensure correct defaults for a *new* employee being sent to API
                employeeData.status = 'Active';
                employeeData.salaryHeld = false;
                employeeData.separationDate = '';
                employeeData.remarks = '';
                employeeData.holdTimestamp = '';
            }

            // --- API Call ---
            try {
                // Call the unified 'saveEmployee' endpoint
                await apiCall('saveEmployee', 'POST', employeeData);

                customAlert("Success", isEditing ? "Employee details updated successfully." : "New employee added successfully.");
                closeModal('employeeModal'); // Close modal on success
                fetchEmployeesFunc(); // Refresh the employee list

            } catch (error) {
                console.error("Error saving employee:", error);
                // Display specific backend errors if available, otherwise generic message
                customAlert("Error", `Failed to save employee data: ${error.message}`);
            }
        });
    }
}