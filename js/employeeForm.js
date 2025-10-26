// js/employeeForm.js
import { $, openModal, closeModal, customAlert, formatDateForInput } from './utils.js';
import { apiCall } from './apiClient.js';

// Module-level variable to store the full data of the employee being edited
let currentlyEditingEmployeeFullData = null;

export function openEmployeeModal(employee = null, localEmployees = []) {
    const form = $('employeeForm');
    if (!form) { console.error("Employee form element not found!"); return; }
    form.reset();

    const isEditing = Boolean(employee);
    $('modalTitle').textContent = isEditing ? 'Edit Employee' : 'Add New Employee';

    if (isEditing && employee) {
        // Store Full Data
        currentlyEditingEmployeeFullData = { ...employee }; // Store a copy
        console.log("Storing full data for edit:", currentlyEditingEmployeeFullData);

        $('employeeDocId').value = employee.id || '';
        $('originalEmployeeIdHidden').value = employee.employeeId || '';

        // Populate ONLY KNOWN form fields that exist in the HTML form
        // Use ?? '' for default empty string
        $('employeeId').value = employee.employeeId ?? '';
        $('name').value = employee.name ?? '';
        $('employeeType').value = employee.employeeType ?? 'Permanent';
        $('designation').value = employee.designation ?? '';
        $('joiningDate').value = formatDateForInput(employee.joiningDate); // Format date for input
        $('workExperience').value = employee.workExperience ?? '';
        $('education').value = employee.education ?? '';
        $('project').value = employee.project ?? '';
        $('projectOffice').value = employee.projectOffice ?? '';
        $('reportProject').value = employee.reportProject ?? '';
        $('subCenter').value = employee.subCenter ?? '';
        $('fatherName').value = employee.fatherName ?? '';
        $('motherName').value = employee.motherName ?? '';
        $('personalMobile').value = employee.personalMobile ?? '';
        $('dob').value = formatDateForInput(employee.dob); // Format date for input
        $('bloodGroup').value = employee.bloodGroup ?? '';
        $('address').value = employee.address ?? '';
        $('identification').value = employee.identification ?? '';
        $('nomineeName').value = employee.nomineeName ?? '';
        $('nomineeMobile').value = employee.nomineeMobile ?? '';
        $('officialMobile').value = employee.officialMobile ?? '';
        $('mobileLimit').value = employee.mobileLimit ?? '';
        $('salary').value = employee.salary ?? '';
        $('bankAccount').value = employee.bankAccount ?? '';

        // Populate hidden fields (these might be needed by backend logic)
        $('employeeStatus').value = employee.status || 'Active';
        $('employeeSalaryHeld').value = String(employee.salaryHeld === true || String(employee.salaryHeld).toUpperCase() === 'TRUE');
        $('separationDateHidden').value = employee.separationDate || '';
        $('remarksHidden').value = employee.remarks || '';
        $('holdTimestampHidden').value = employee.holdTimestamp || '';

        // Make ID readonly
        const empIdInput = $('employeeId');
        if (empIdInput) {
             empIdInput.setAttribute('readonly', true);
             empIdInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        }
    } else {
        // Add Mode: Clear stored data and set defaults
        currentlyEditingEmployeeFullData = null;
        $('employeeDocId').value = '';
        $('originalEmployeeIdHidden').value = '';
        $('employeeStatus').value = 'Active';
        $('employeeSalaryHeld').value = 'false';
        $('separationDateHidden').value = '';
        $('remarksHidden').value = '';
        $('holdTimestampHidden').value = '';
        const empIdInput = $('employeeId');
        if (empIdInput) {
            empIdInput.removeAttribute('readonly');
            empIdInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        }
        $('employeeType').value = 'Permanent'; // Set default select
    }
    openModal('employeeModal');
}

export function setupEmployeeForm(getEmployeesFunc, fetchEmployeesFunc) {
    const form = $('employeeForm');
    const addBtn = $('addEmployeeBtn');
    const cancelBtn = $('cancelEmployeeModal');
    const cancelBtnTop = $('cancelEmployeeModal_top');

    if (addBtn) addBtn.addEventListener('click', () => openEmployeeModal(null, getEmployeesFunc()));
    if (cancelBtn) cancelBtn.addEventListener('click', () => { closeModal('employeeModal'); currentlyEditingEmployeeFullData = null; }); // Clear stored data on cancel
    if (cancelBtnTop) cancelBtnTop.addEventListener('click', () => { closeModal('employeeModal'); currentlyEditingEmployeeFullData = null; }); // Clear stored data on cancel

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const isEditing = Boolean($('originalEmployeeIdHidden').value);

            // Gather data ONLY from known form fields
            const formData = {
                employeeId: $('employeeId').value.trim(),
                name: $('name').value.trim(),
                employeeType: $('employeeType').value,
                designation: $('designation').value.trim(),
                joiningDate: $('joiningDate').value,
                workExperience: parseFloat($('workExperience').value) || 0,
                education: $('education').value.trim(),
                project: $('project').value.trim(),
                projectOffice: $('projectOffice').value.trim(),
                reportProject: $('reportProject').value.trim(),
                subCenter: $('subCenter').value.trim(),
                fatherName: $('fatherName').value.trim(),
                motherName: $('motherName').value.trim(),
                personalMobile: $('personalMobile').value.trim(),
                dob: $('dob').value,
                bloodGroup: $('bloodGroup').value.trim(),
                address: $('address').value.trim(),
                identification: $('identification').value.trim(),
                nomineeName: $('nomineeName').value.trim(),
                nomineeMobile: $('nomineeMobile').value.trim(),
                officialMobile: $('officialMobile').value.trim() || '',
                mobileLimit: parseFloat($('mobileLimit').value) || 0,
                salary: parseFloat($('salary').value) || 0,
                bankAccount: $('bankAccount').value.trim() || '',
                // Include hidden fields that might be relevant for backend
                status: $('employeeStatus').value,
                salaryHeld: $('employeeSalaryHeld').value === 'true',
                separationDate: $('separationDateHidden').value,
                remarks: $('remarksHidden').value,
                holdTimestamp: $('holdTimestampHidden').value
            };

            // Basic Validation
            if (!formData.employeeId || !formData.name || !formData.joiningDate) {
                 customAlert("Validation Error", "ID, Name, Joining Date required."); return;
            }
            if (isNaN(formData.salary) || formData.salary < 0) {
                 customAlert("Validation Error", "Gross Salary must be a valid non-negative number."); return;
            }
             if (formData.workExperience < 0) {
                  customAlert("Validation Error", "Work Experience cannot be negative."); return;
             }

            let dataToSend = {};

            if (isEditing) {
                if (!currentlyEditingEmployeeFullData) {
                    customAlert("Error", "Original employee data not found. Cannot save edit.");
                    return;
                }
                // Merge known form field changes onto the full original data
                dataToSend = {
                    ...currentlyEditingEmployeeFullData, // Start with original (includes extra fields)
                    ...formData, // Overwrite with values from the form
                    originalEmployeeId: $('originalEmployeeIdHidden').value // Ensure original ID is included
                };
                 console.log("Merged data for edit:", dataToSend);
            } else {
                // Add Mode: Client-side duplicate check
                const currentEmployees = getEmployeesFunc();
                const empExists = currentEmployees.some(emp => emp.employeeId === formData.employeeId);
                if (empExists) { customAlert("Error", `Employee ID "${formData.employeeId}" already exists.`); return; }

                // Send only form data + defaults for new employee
                dataToSend = {
                     ...formData,
                     status: 'Active',
                     salaryHeld: false,
                     separationDate: '',
                     remarks: '',
                     holdTimestamp: '',
                     // Explicitly set transfer fields to empty for new employees
                     lastTransferDate: '',
                     lastSubcenter: '',
                     lastTransferReason: ''
                 };
                 console.log("Data for add:", dataToSend);
            }

            // API Call
            try {
                await apiCall('saveEmployee', 'POST', dataToSend);
                customAlert("Success", isEditing ? "Employee updated." : "Employee added.");
                closeModal('employeeModal');
                fetchEmployeesFunc(); // Refresh list

            } catch (error) {
                console.error("Error saving employee:", error);
                customAlert("Error", `Save failed: ${error.message}`);
            } finally {
                 currentlyEditingEmployeeFullData = null; // Clear stored data after attempt
            }
        });
    }
}