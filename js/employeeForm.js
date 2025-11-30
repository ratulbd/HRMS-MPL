// js/employeeForm.js
import { $, openModal, closeModal, customAlert, formatDateForInput, formatDateForDisplay, customConfirm } from './utils.js';
import { apiCall } from './apiClient.js';

let currentlyEditingEmployeeFullData = null;

// List of MANDATORY field IDs for ADD mode
const mandatoryFields = [
    'employeeId', 'name', 'employeeType', 'designation', 'functionalRole',
    'joiningDate', 'project', 'projectOffice', 'reportProject', 'subCenter',
    'personalMobile', 'dob', 'address', 'identification',
    'salary' // Gross Salary (Bank)
];

// List of ALL field IDs
const allFormFields = [
    // Basic
    'employeeId', 'name', 'employeeType', 'designation', 'functionalRole',
    'joiningDate', 'workExperience', 'education',
    // Project
    'project', 'projectOffice', 'reportProject', 'subCenter',
    // Personal
    'fatherName', 'motherName', 'personalMobile', 'dob', 'bloodGroup', 'address', 'identification', 'identificationType',
    // Contact
    'nomineeName', 'nomineeMobile', 'officialMobile', 'mobileLimit',
    // Salary - Earnings
    'salary', 'cashPayment', 'basic', 'others', 'motobikeCarMaintenance', 'laptopRent', 'othersAllowance', // Added cashPayment
    'arrear', 'foodAllowance', 'stationAllowance', 'hardshipAllowance',
    // Salary - Deductions
    'gratuity', 'subsidizedLunch', 'tds', 'motorbikeLoan', 'welfareFund', 'salaryOthersLoan',
    'subsidizedVehicle', 'lwp', 'cpf', 'othersAdjustment',
    // Salary - Totals
    'grandTotal', 'totalDeduction', 'netSalaryPayment',
    // Bank
    'bankAccount'
];

// Helper
function getNumericValue(elementId) {
    const el = $(elementId);
    if (!el) return 0;
    const value = parseFloat(el.value);
    return isNaN(value) ? 0 : value;
}

// Updated Calculation
function calculateSalaryTotals() {
    // 1. Bank Gross (The basis for Basic/Others/Deductions)
    const bankGross = getNumericValue('salary');

    // 2. Allowances (Usually added on top of Gross)
    const allowances = [
        getNumericValue('motobikeCarMaintenance'), getNumericValue('laptopRent'),
        getNumericValue('othersAllowance'), getNumericValue('arrear'),
        getNumericValue('foodAllowance'), getNumericValue('stationAllowance'),
        getNumericValue('hardshipAllowance')
    ];
    const totalAllowances = allowances.reduce((sum, val) => sum + val, 0);

    // 3. Cash Payment (Separate component)
    const cashPayment = getNumericValue('cashPayment');

    // 4. Grand Total = Bank Gross + Allowances + Cash
    const grandTotal = bankGross + totalAllowances + cashPayment;

    // 5. Deductions (Based on Bank Gross usually, depends on company policy, keeping standard)
    const deductions = [
        getNumericValue('subsidizedLunch'),
        getNumericValue('tds'),
        getNumericValue('motorbikeLoan'),
        getNumericValue('welfareFund'),
        getNumericValue('salaryOthersLoan'),
        getNumericValue('subsidizedVehicle'),
        getNumericValue('lwp'),
        getNumericValue('cpf'),
        getNumericValue('othersAdjustment')
    ];

    const totalDeduction = deductions.reduce((sum, val) => sum + val, 0);

    // 6. Net Pay
    const netSalaryPayment = grandTotal - totalDeduction;

    // Set Readonly Fields
    const grandTotalEl = $('grandTotal');
    const totalDeductionEl = $('totalDeduction');
    const netSalaryPaymentEl = $('netSalaryPayment');

    if (grandTotalEl) grandTotalEl.value = grandTotal.toFixed(2);
    if (totalDeductionEl) totalDeductionEl.value = totalDeduction.toFixed(2);
    if (netSalaryPaymentEl) netSalaryPaymentEl.value = netSalaryPayment.toFixed(2);
}

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

        allFormFields.forEach(fieldId => {
            const input = $(fieldId);
            if (input) {
                if (fieldId === 'joiningDate' || fieldId === 'dob') {
                    input.value = formatDateForInput(employee[fieldId]);
                } else {
                    input.value = employee[fieldId] ?? '';
                }
            }
        });

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
        currentlyEditingEmployeeFullData = null;
        $('employeeDocId').value = ''; $('originalEmployeeIdHidden').value = '';
        $('employeeStatus').value = 'Active'; $('employeeSalaryHeld').value = 'false';
        $('separationDateHidden').value = ''; $('remarksHidden').value = '';
        $('holdTimestampHidden').value = ''; $('lastTransferDateHidden').value = '';
        $('lastSubcenterHidden').value = ''; $('lastTransferReasonHidden').value = '';

        const empIdInput = $('employeeId');
        if (empIdInput) { empIdInput.removeAttribute('readonly'); empIdInput.classList.remove('bg-gray-100', 'cursor-not-allowed'); }
        $('employeeType').value = 'Regular';
    }

    calculateSalaryTotals();
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

    const salaryFields = form.querySelectorAll('.salary-component-earning, .salary-component-deduction');
    salaryFields.forEach(field => {
        field.addEventListener('input', calculateSalaryTotals);
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const isEditing = Boolean($('originalEmployeeIdHidden').value);
            let isRejoining = false;
            let existingByIdentification = null;

            form.querySelectorAll('.input, .input-select').forEach(el => el.classList.remove('border-red-500'));
            let firstErrorField = null;

            calculateSalaryTotals();

            const formData = {};
            allFormFields.forEach(fieldId => {
                const element = $(fieldId);
                if (element) {
                    if (element.type === 'number') {
                        const numValue = parseFloat(element.value);
                        formData[fieldId] = isNaN(numValue) ? null : numValue;
                    } else {
                        formData[fieldId] = element.value.trim();
                    }
                }
            });

            formData.status = $('employeeStatus').value;
            formData.salaryHeld = $('employeeSalaryHeld').value === 'true';
            formData.separationDate = $('separationDateHidden').value;
            formData.remarks = $('remarksHidden').value;
            formData.holdTimestamp = $('holdTimestampHidden').value;

            let isValid = true;
            mandatoryFields.forEach(fieldId => {
                const element = $(fieldId);
                let value = formData[fieldId];
                let isEmpty = (value === null || value === undefined || String(value).trim() === '');
                if (fieldId === 'salary' && value === 0) {
                     isEmpty = false;
                }
                if (isEmpty) {
                    isValid = false;
                    if(element) {
                        element.classList.add('border-red-500');
                        if (!firstErrorField) firstErrorField = element;
                    }
                }
            });

            if (!isValid) {
                customAlert("Validation Error", "Please fill in all mandatory fields marked with *.");
                firstErrorField?.focus();
                return;
            }

             if (formData.salary === null || formData.salary < 0) {
                  customAlert("Validation Error", "Gross Salary must be a valid non-negative number.");
                   const salaryInput = $('salary');
                   if (salaryInput) { salaryInput.classList.add('border-red-500'); if (!firstErrorField) firstErrorField = salaryInput; firstErrorField?.focus(); }
                  return;
             }

             if (!isEditing) {
                const currentEmployees = getEmployeesFunc();
                const existingById = currentEmployees.find(emp => emp.employeeId.trim().toLowerCase() === formData.employeeId.trim().toLowerCase());
                if (existingById) {
                    customAlert("Duplicate Entry", `<b>Employee ID "${formData.employeeId}" already exists.</b><br><br>Assigned to: ${existingById.name}`);
                    const idInput = $('employeeId');
                    if(idInput) { idInput.classList.add('border-red-500'); idInput.focus(); }
                    return;
                }

                if (formData.identification && formData.identification.trim() !== '') {
                    existingByIdentification = currentEmployees.find(emp =>
                        emp.identification &&
                        emp.identification.trim().toLowerCase() === formData.identification.trim().toLowerCase()
                    );

                    if (existingByIdentification) {
                        if (existingByIdentification.status === 'Active' || existingByIdentification.status === 'Salary Held') {
                            customAlert("Duplicate Entry", `<b>Identification "${formData.identification}" already exists and is assigned to an ACTIVE employee.</b><br>Name: ${existingByIdentification.name}`);
                            const idenInput = $('identification');
                            if(idenInput) { idenInput.classList.add('border-red-500'); idenInput.focus(); }
                            return;
                        }
                        const confirmMsg = `<b>Identification "${formData.identification}" matches an inactive employee:</b><br><br><b>Name:</b> ${existingByIdentification.name}<br><b>ID:</b> ${existingByIdentification.employeeId}<br><b>Status:</b> ${existingByIdentification.status}<br><br>Do you want to proceed and re-join this person using the <b>new Employee ID (${formData.employeeId})</b>?`;
                        const confirmed = await customConfirm("Re-join Confirmation", confirmMsg);
                        if (!confirmed) return;
                        isRejoining = true;
                    }
                }
             }

            let dataToSend = {};
            if (isEditing) {
                if (!currentlyEditingEmployeeFullData) { customAlert("Error", "Original data missing."); return; }
                dataToSend = {
                    ...currentlyEditingEmployeeFullData,
                    ...formData,
                    originalEmployeeId: $('originalEmployeeIdHidden').value
                };
            } else {
                dataToSend = {
                     ...formData,
                     status: 'Active', salaryHeld: false, separationDate: '', remarks: '',
                     holdTimestamp: '', lastTransferDate: '', lastSubcenter: '', lastTransferReason: ''
                 };
            }

            dataToSend.grandTotal = parseFloat(formData.grandTotal) || 0;
            dataToSend.totalDeduction = parseFloat(formData.totalDeduction) || 0;
            dataToSend.netSalaryPayment = parseFloat(formData.netSalaryPayment) || 0;

            try {
                await apiCall('saveEmployee', 'POST', dataToSend);
                if (isRejoining && existingByIdentification) {
                    try {
                        const reJoinLogData = {
                            previousEmployeeId: existingByIdentification.employeeId,
                            previousSubcenter: existingByIdentification.subCenter || 'N/A',
                            separationDate: existingByIdentification.separationDate || 'N/A',
                            separationReason: existingByIdentification.remarks || 'N/A',
                            newEmployeeId: formData.employeeId,
                            newSubcenter: formData.subCenter,
                            newJoiningDate: formData.joiningDate
                        };
                        await apiCall('logRejoin', 'POST', reJoinLogData);
                    } catch (logError) { console.error("Failed to log re-join event:", logError); }
                }

                customAlert("Success", isEditing ? "Employee updated." : "Employee added.");
                closeModal('employeeModal');
                fetchEmployeesFunc();
            } catch (error) { console.error("Error saving employee:", error); customAlert("Error", `Save failed: ${error.message}`); }
            finally { currentlyEditingEmployeeFullData = null; }
        });
    }
}