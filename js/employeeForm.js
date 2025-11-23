import { $, customAlert, closeModal, formatDateForInput } from './utils.js';
import { apiCall } from './apiClient.js';

export function setupEmployeeForm(getEmployeesFunc, refreshCallback) {
    const form = $('employeeForm');
    const modal = $('employeeModal');

    $('cancelEmployeeModal').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const employeeData = Object.fromEntries(formData.entries());

        if (!employeeData.employeeId || !employeeData.name) {
            customAlert("Error", "ID and Name are required.");
            return;
        }

        const numFields = [
            'workExperience', 'mobileLimit', 'previousSalary', 'basic', 'others', 'salary',
            'motobikeCarMaintenance', 'laptopRent', 'othersAllowance', 'arrear',
            'foodAllowance', 'stationAllowance', 'hardshipAllowance', 'grandTotal',
            'gratuity', 'subsidizedLunch', 'tds', 'motorbikeLoan', 'welfareFund',
            'salaryOthersLoan', 'subsidizedVehicle', 'lwp', 'cpf', 'othersAdjustment',
            'totalDeduction', 'netSalaryPayment'
        ];

        numFields.forEach(field => {
            if (employeeData[field]) {
                employeeData[field] = parseFloat(employeeData[field]) || 0;
            } else {
                employeeData[field] = 0;
            }
        });

        try {
            await apiCall('saveEmployee', 'POST', employeeData);
            customAlert("Success", "Employee saved successfully.");
            modal.classList.add('hidden');
            if (refreshCallback) refreshCallback(false);
        } catch (error) {
            console.error(error);
            customAlert("Error", error.message || "Failed to save employee.");
        }
    });

    const addBtn = $('addNewBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            openEmployeeModal();
        });
    }
}

export function openEmployeeModal(employee = null) {
    const modal = $('employeeModal');
    const form = $('employeeForm');
    const title = $('employeeModalTitle');

    form.reset();
    modal.classList.remove('hidden');

    if (employee) {
        title.textContent = "Edit Employee";
        $('empId').readOnly = true;

        $('empId').value = employee.employeeId || '';
        $('empName').value = employee.name || '';
        $('empType').value = employee.employeeType || '';
        $('empDesignation').value = employee.designation || '';
        $('empFunctionalRole').value = employee.functionalRole || '';
        $('empJoiningDate').value = formatDateForInput(employee.joiningDate);
        $('empProject').value = employee.project || '';
        $('empProjectOffice').value = employee.projectOffice || '';
        $('empReportProject').value = employee.reportProject || '';
        $('empSubCenter').value = employee.subCenter || '';

        $('empWorkExperience').value = employee.workExperience || 0;
        $('empEducation').value = employee.education || '';
        $('empFatherName').value = employee.fatherName || '';
        $('empMotherName').value = employee.motherName || '';
        $('empPersonalMobile').value = employee.personalMobile || '';
        $('empOfficialMobile').value = employee.officialMobile || '';
        $('empMobileLimit').value = employee.mobileLimit || 0;
        $('empDob').value = formatDateForInput(employee.dob);
        $('empBloodGroup').value = employee.bloodGroup || '';
        $('empAddress').value = employee.address || '';
        $('empIdType').value = employee.identificationType || 'NID';
        $('empIdentification').value = employee.identification || '';

        $('empNomineeName').value = employee.nomineeName || '';
        $('empNomineeMobile').value = employee.nomineeMobile || '';

        // --- REQUEST 2: Populate Previous Salary ---
        $('empPreviousSalary').value = employee.previousSalary || 0;
        // -------------------------------------------

        $('empBasic').value = employee.basic || 0;
        $('empOthers').value = employee.others || 0;
        $('empSalary').value = employee.salary || 0;

        $('empMotobikeCar').value = employee.motobikeCarMaintenance || 0;
        $('empLaptop').value = employee.laptopRent || 0;
        $('empOthersAllow').value = employee.othersAllowance || 0;
        $('empArrear').value = employee.arrear || 0;
        $('empFood').value = employee.foodAllowance || 0;
        $('empStation').value = employee.stationAllowance || 0;
        $('empHardship').value = employee.hardshipAllowance || 0;

        $('empLunch').value = employee.subsidizedLunch || 0;
        $('empTds').value = employee.tds || 0;
        $('empBikeLoan').value = employee.motorbikeLoan || 0;
        $('empWelfare').value = employee.welfareFund || 0;
        $('empOtherLoan').value = employee.salaryOthersLoan || 0;
        $('empVehicle').value = employee.subsidizedVehicle || 0;
        $('empLwp').value = employee.lwp || 0;
        $('empCpf').value = employee.cpf || 0;
        $('empAdj').value = employee.othersAdjustment || 0;

        $('empBankAccount').value = employee.bankAccount || '';
        $('empStatus').value = employee.status || 'Active';
        $('empRemarks').value = employee.remarks || '';

    } else {
        title.textContent = "Add New Employee";
        $('empId').readOnly = false;
        $('empStatus').value = 'Active';
    }
}