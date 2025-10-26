// js/employeeForm.js
import { $, openModal, closeModal, customAlert, formatDateForInput } from './utils.js';
import { apiCall } from './apiClient.js';

let currentlyEditingEmployeeFullData = null;

// List of MANDATORY field IDs for ADD mode
const mandatoryFields = [
    'employeeId', 'name', 'employeeType', 'designation', 'joiningDate',
    'project', 'projectOffice', 'reportProject', 'subCenter',
    'personalMobile', 'dob', 'address', 'identification',
    'salary'
    // Add IDs of other fields from your index.html form if they are mandatory
    // e.g., 'basic', 'identificationType', etc.
];

// List of ALL field IDs present in the employeeForm HTML
const allFormFields = [
    'employeeId', 'name', 'employeeType', 'designation', 'joiningDate', 'workExperience', 'education',
    'project', 'projectOffice', 'reportProject', 'subCenter',
    'fatherName', 'motherName', 'personalMobile', 'dob', 'bloodGroup', 'address', 'identification',
    'nomineeName', 'nomineeMobile', 'officialMobile', 'mobileLimit',
    'salary', 'bankAccount'
    // Add IDs of any other custom fields you added to the HTML form
    // e.g., 'basic', 'tds', 'motorbikeLoan', 'welfareFund', 'salaryLoanOthers',
    // 'subsidizedVehicle', 'lwpcpf', 'othersAdjustment', 'totalDeduction', 'netSalaryPayment'
];

export function openEmployeeModal(employee = null, localEmployees = []) {
    const form = $('employeeForm');
    if (!form) { console.error("Employee form element not found!"); return; }
    form.reset();
    form.querySelectorAll('.input, .input-select').forEach(el => el.classList.remove('border-red-500'));

    const isEditing = Boolean(employee);
    $('modalTitle').textContent = isEditing ? 'Edit Employee' : 'Add New Employee';

    if (isEditing && employee) {
        currentlyEditingEmployeeFullData = { ...employee };
        $('employeeDocId').value = employee.id || '';
        $('originalEmployeeIdHidden').value = employee.employeeId || '';

        // Populate ALL known form fields from the employee data
        allFormFields.forEach(fieldId => {
            const input = $(fieldId);
            if (input) {
                if (fieldId === 'joiningDate' || fieldId === 'dob') {
                    input.value = formatDateForInput(employee[fieldId]);
                } else {
                    input.value = employee[fieldId] ?? ''; // Use ?? for null/undefined
                }
            }
        });

        // Populate hidden fields
        $('employeeStatus').value = employee.status || 'Active';
        $('employeeSalaryHeld').value = String(employee.salaryHeld === true || String(employee.salaryHeld).toUpperCase() === 'TRUE');
        $('separationDateHidden').value = employee.separationDate || '';
        $('remarksHidden').value = employee.remarks || '';
        $('holdTimestampHidden').value = employee.holdTimestamp || '';
        $('lastTransferDateHidden').value = employee.lastTransferDate || '';
        $('lastSubcenterHidden').value = employee.lastSubcenter || '';
        $('lastTransferReasonHidden').value = employee.lastTransferReason || '';

        const empIdInput = $('employeeId');
        if (empIdInput) { empIdInput.setAttribute('readonly', true); empIdInput.classList.add('bg-gray-100', 'cursor-not-allowed'); }
    } else {
        // Add Mode: Clear stored data and set defaults
        currentlyEditingEmployeeFullData = null;
        $('employeeDocId').value = ''; $('originalEmployeeIdHidden').value = '';
        $('employeeStatus').value = 'Active'; $('employeeSalaryHeld').value = 'false';
        $('separationDateHidden').value = ''; $('remarksHidden').value = '';
        $('holdTimestampHidden').value = ''; $('lastTransferDateHidden').value = '';
        $('lastSubcenterHidden').value = ''; $('lastTransferReasonHidden').value = '';

        const empIdInput = $('employeeId');
        if (empIdInput) { empIdInput.removeAttribute('readonly'); empIdInput.classList.remove('bg-gray-100', 'cursor-not-allowed'); }
        $('employeeType').value = 'Permanent';
    }
    openModal('employeeModal');
}

export function setupEmployeeForm(getEmployeesFunc, fetchEmployeesFunc) {
    const form = $('employeeForm');
    const addBtn = $('addEmployeeBtn');
    const cancelBtn = $('cancelEmployeeModal');
    const cancelBtnTop = $('cancelEmployeeModal_top');

    if (addBtn) addBtn.addEventListener('click', () => openEmployeeModal(null, getEmployeesFunc()));
    if (cancelBtn) cancelBtn.addEventListener('click', () => { closeModal('employeeModal'); currentlyEditingEmployeeFullData = null; });
    if (cancelBtnTop) cancelBtnTop.addEventListener('click', () => { closeModal('employeeModal'); currentlyEditingEmployeeFullData = null; });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const isEditing = Boolean($('originalEmployeeIdHidden').value);

            form.querySelectorAll('.input, .input-select').forEach(el => el.classList.remove('border-red-500'));
            let firstErrorField = null;

            // Gather data from ALL known form fields defined in allFormFields array
            const formData = {};
            allFormFields.forEach(fieldId => {
                const element = $(fieldId);
                if (element) {
                    // Convert specific fields to numbers, handle potential NaN/emptiness
                    if (['workExperience', 'mobileLimit', 'salary'].includes(fieldId)) {
                        const numValue = parseFloat(element.value);
                        formData[fieldId] = isNaN(numValue) ? null : numValue; // Use null if invalid number
                    } else {
                        formData[fieldId] = element.value.trim();
                    }
                }
            });

            // Add hidden field data separately
            formData.status = $('employeeStatus').value;
            formData.salaryHeld = $('employeeSalaryHeld').value === 'true';
            formData.separationDate = $('separationDateHidden').value;
            formData.remarks = $('remarksHidden').value;
            formData.holdTimestamp = $('holdTimestampHidden').value;


            // Validation (only for ADD mode)
            if (!isEditing) {
                let isValid = true;
                mandatoryFields.forEach(fieldId => {
                    const element = $(fieldId);
                    let value = formData[fieldId];
                    let isEmpty = (value === null || value === undefined || String(value).trim() === '');

                    if (isEmpty) {
                        isValid = false;
                        if(element) {
                            element.classList.add('border-red-500');
                            if (!firstErrorField) firstErrorField = element;
                        }
                         console.warn(`Validation failed: Mandatory field '${fieldId}' is empty.`);
                    }
                });

                if (!isValid) {
                    customAlert("Validation Error", "Please fill in all mandatory fields marked with *.");
                    firstErrorField?.focus();
                    return;
                }
            }
             // Validate salary format in both modes
             if (formData.salary === null || formData.salary < 0) {
                  customAlert("Validation Error", "Gross Salary must be a valid non-negative number.");
                   const salaryInput = $('salary');
                   if (salaryInput) { salaryInput.classList.add('border-red-500'); if (!firstErrorField) firstErrorField = salaryInput; firstErrorField?.focus(); }
                  return;
             }


            let dataToSend = {};

            if (isEditing) {
                if (!currentlyEditingEmployeeFullData) { customAlert("Error", "Original data missing."); return; }
                dataToSend = {
                    ...currentlyEditingEmployeeFullData, // Start with original full data
                    ...formData,                      // Overwrite with form changes
                    originalEmployeeId: $('originalEmployeeIdHidden').value
                };
            } else {
                const currentEmployees = getEmployeesFunc();
                if (currentEmployees.some(emp => emp.employeeId === formData.employeeId)) {
                     customAlert("Error", `Employee ID "${formData.employeeId}" already exists.`);
                     const idInput = $('employeeId'); if(idInput) { idInput.classList.add('border-red-500'); idInput.focus(); }
                     return;
                }
                dataToSend = {
                     ...formData,
                     status: 'Active', salaryHeld: false, separationDate: '', remarks: '',
                     holdTimestamp: '', lastTransferDate: '', lastSubcenter: '', lastTransferReason: ''
                 };
            }

            // API Call
            try {
                await apiCall('saveEmployee', 'POST', dataToSend);
                customAlert("Success", isEditing ? "Employee updated." : "Employee added.");
                closeModal('employeeModal');
                fetchEmployeesFunc();

            } catch (error) { console.error("Error saving employee:", error); customAlert("Error", `Save failed: ${error.message}`); }
            finally { currentlyEditingEmployeeFullData = null; }
        });
    }
}