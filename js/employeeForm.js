// js/employeeForm.js
// --- MODIFICATION: Import customConfirm AND formatDateForDisplay ---
import { $, openModal, closeModal, customAlert, formatDateForInput, formatDateForDisplay, customConfirm } from './utils.js';
// --- END MODIFICATION ---
import { apiCall } from './apiClient.js';

let currentlyEditingEmployeeFullData = null;

// List of MANDATORY field IDs for ADD mode
const mandatoryFields = [
    'employeeId', 'name', 'employeeType', 'designation', 
    // --- MODIFICATION: Add functionalRole ---
    'functionalRole', 
    // --- END MODIFICATION ---
    'joiningDate',
    'project', 'projectOffice', 'reportProject', 'subCenter',
    'personalMobile', 'dob', 'address', 'identification',
    'salary' // Gross Salary
];

// List of ALL field IDs present in the employeeForm HTML
const allFormFields = [
    // Basic
    'employeeId', 'name', 'employeeType', 'designation', 
    // --- MODIFICATION: Add functionalRole ---
    'functionalRole', 
    // --- END MODIFICATION ---
    'joiningDate', 'workExperience', 'education',
    // Project
    'project', 'projectOffice', 'reportProject', 'subCenter',
    // Personal
    'fatherName', 'motherName', 'personalMobile', 'dob', 'bloodGroup', 'address', 'identification', 'identificationType',
    // Contact
    'nomineeName', 'nomineeMobile', 'officialMobile', 'mobileLimit',
    // Salary - Earnings
    'salary', 'basic', 'others', 'motobikeCarMaintenance', 'laptopRent', 'othersAllowance',
    'arrear', 'foodAllowance', 'stationAllowance', 'hardshipAllowance',
    // Salary - Deductions
    'gratuity', 'subsidizedLunch', 'tds', 'motorbikeLoan', 'welfareFund', 'salaryOthersLoan',
    'subsidizedVehicle', 'lwp', 'cpf', 'othersAdjustment',
    // Salary - Totals
    'grandTotal', 'totalDeduction', 'netSalaryPayment',
    // Bank
    'bankAccount'
];

// --- NEW FUNCTION: Auto-calculates salary totals ---
function getNumericValue(elementId) {
    const el = $(elementId);
    if (!el) return 0;
    const value = parseFloat(el.value);
    return isNaN(value) ? 0 : value;
}

function calculateSalaryTotals() {
    // Sum Earnings
    const earnings = [
        getNumericValue('salary'), getNumericValue('motobikeCarMaintenance'), getNumericValue('laptopRent'),
        getNumericValue('othersAllowance'), getNumericValue('arrear'), getNumericValue('foodAllowance'),
        getNumericValue('stationAllowance'), getNumericValue('hardshipAllowance')
    ];
    const grandTotal = earnings.reduce((sum, val) => sum + val, 0);

    // === FIX: 'gratuity' REMOVED, 'othersAdjustment' ADDED ===
    // Sum Deductions
    const deductions = [
        // getNumericValue('gratuity'), // REMOVED as requested
        getNumericValue('subsidizedLunch'), 
        getNumericValue('tds'),
        getNumericValue('motorbikeLoan'), 
        getNumericValue('welfareFund'), 
        getNumericValue('salaryOthersLoan'),
        getNumericValue('subsidizedVehicle'), 
        getNumericValue('lwp'), 
        getNumericValue('cpf'),
        getNumericValue('othersAdjustment') // ADDED
    ];
    // === END FIX ===
    
    const totalDeduction = deductions.reduce((sum, val) => sum + val, 0);

    // Calculate Net
    const netSalaryPayment = grandTotal - totalDeduction;

    // Set Readonly Fields
    const grandTotalEl = $('grandTotal');
    const totalDeductionEl = $('totalDeduction');
    const netSalaryPaymentEl = $('netSalaryPayment');
    
    if (grandTotalEl) grandTotalEl.value = grandTotal.toFixed(2);
    if (totalDeductionEl) totalDeductionEl.value = totalDeduction.toFixed(2);
    if (netSalaryPaymentEl) netSalaryPaymentEl.value = netSalaryPayment.toFixed(2);
}
// --- END NEW FUNCTION ---

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
                    // Use ?? for null/undefined, ensures 0 is displayed
                    input.value = employee[fieldId] ?? ''; 
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
        // --- MODIFICATION: Default to "Regular" ---
        $('employeeType').value = 'Regular';
        // --- END MODIFICATION ---
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

            // --- MODIFICATION: Define re-join flags ---
            let isRejoining = false;
            let existingByIdentification = null;
            // --- END MODIFICATION ---

            form.querySelectorAll('.input, .input-select').forEach(el => el.classList.remove('border-red-500'));
            let firstErrorField = null;
            
            calculateSalaryTotals();

            // Gather data from ALL known form fields defined in allFormFields array
            const formData = {};
            allFormFields.forEach(fieldId => {
                const element = $(fieldId);
                if (element) {
                    if (element.type === 'number') {
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


            // Validation (Mandatory Fields)
            let isValid = true;
            mandatoryFields.forEach(fieldId => {
                const element = $(fieldId);
                let value = formData[fieldId];
                // For 'salary', 0 is valid, but null is not
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
                     console.warn(`Validation failed: Mandatory field '${fieldId}' is empty.`);
                }
            });

            if (!isValid) {
                customAlert("Validation Error", "Please fill in all mandatory fields marked with *.");
                firstErrorField?.focus();
                return;
            }
             
             // Validate salary format in both modes
             if (formData.salary === null || formData.salary < 0) {
                  customAlert("Validation Error", "Gross Salary must be a valid non-negative number.");
                   const salaryInput = $('salary');
                   if (salaryInput) { salaryInput.classList.add('border-red-500'); if (!firstErrorField) firstErrorField = salaryInput; firstErrorField?.focus(); }
                  return;
             }
             
             if (!isEditing) {
                const currentEmployees = getEmployeesFunc();
                
                // 1. Check Employee ID
                const existingById = currentEmployees.find(emp => emp.employeeId.trim().toLowerCase() === formData.employeeId.trim().toLowerCase());
                if (existingById) {
                    customAlert("Duplicate Entry", 
                        `<b>Employee ID "${formData.employeeId}" already exists.</b><br><br>
                         Assigned to: ${existingById.name}<br>
                         Designation: ${existingById.designation || 'N/A'}`);
                    const idInput = $('employeeId'); 
                    if(idInput) { idInput.classList.add('border-red-500'); idInput.focus(); }
                    return;
                }
                
                // --- MODIFICATION: Check Identification and handle re-join prompt ---
                if (formData.identification && formData.identification.trim() !== '') {
                    existingByIdentification = currentEmployees.find(emp => 
                        emp.identification && 
                        emp.identification.trim().toLowerCase() === formData.identification.trim().toLowerCase()
                    );
                    
                    if (existingByIdentification) {
                        // If employee is Active or Held, it's a hard block.
                        if (existingByIdentification.status === 'Active' || existingByIdentification.status === 'Salary Held') {
                            customAlert("Duplicate Entry", 
                                `<b>Identification "${formData.identification}" already exists and is assigned to an ACTIVE employee.</b><br><br>
                                 Assigned to: ${existingByIdentification.name}<br>
                                 Employee ID: ${existingByIdentification.employeeId}`);
                            const idenInput = $('identification'); 
                            if(idenInput) { idenInput.classList.add('border-red-500'); idenInput.focus(); }
                            return;
                        }

                        // If employee is Inactive, prompt for re-join
                        // This is line 269 where the error occurred
                        const confirmMsg = `<b>Identification "${formData.identification}" matches an inactive employee:</b><br><br>
                                            <b>Name:</b> ${existingByIdentification.name}<br>
                                            <b>Employee ID:</b> ${existingByIdentification.employeeId}<br>
                                            <b>Status:</b> ${existingByIdentification.status}<br>
                                            <b>Separation Date:</b> ${formatDateForDisplay(existingByIdentification.separationDate) || 'N/A'}<br><br>
                                            Do you want to proceed and re-join this person using the <b>new Employee ID (${formData.employeeId})</b>?`;
                        
                        const confirmed = await customConfirm("Re-join Confirmation", confirmMsg);

                        if (!confirmed) {
                            customAlert("Action Cancelled", "Employee addition has been cancelled.");
                            const idenInput = $('identification'); 
                            if(idenInput) { idenInput.classList.add('border-red-500'); idenInput.focus(); }
                            return;
                        }
                        
                        // User confirmed re-join
                        isRejoining = true;
                    }
                }
                // --- END MODIFICATION ---
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
                dataToSend = {
                     ...formData,
                     status: 'Active', salaryHeld: false, separationDate: '', remarks: '',
                     holdTimestamp: '', lastTransferDate: '', lastSubcenter: '', lastTransferReason: ''
                 };
            }
            
            // Ensure calculated fields are numbers
            dataToSend.grandTotal = parseFloat(formData.grandTotal) || 0;
            dataToSend.totalDeduction = parseFloat(formData.totalDeduction) || 0;
            dataToSend.netSalaryPayment = parseFloat(formData.netSalaryPayment) || 0;


            // API Call
            try {
                // Save the employee first
                await apiCall('saveEmployee', 'POST', dataToSend);

                // --- MODIFICATION: If re-join, log it ---
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
                    } catch (logError) {
                        console.error("Failed to log re-join event:", logError);
                        customAlert("Warning", "Employee saved, but failed to log the re-join event. Please notify admin.");
                    }
                }
                // --- END MODIFICATION ---

                customAlert("Success", isEditing ? "Employee updated." : "Employee added.");
                closeModal('employeeModal');
                fetchEmployeesFunc();

            } catch (error) { console.error("Error saving employee:", error); customAlert("Error", `Save failed: ${error.message}`); }
            finally { currentlyEditingEmployeeFullData = null; }
        });
    }
}