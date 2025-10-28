// js/transferModal.js
import { $, openModal, closeModal, customAlert, showLoading, hideLoading } from './utils.js';
import { apiCall } from './apiClient.js';

let mainFetchEmployeesFunc = null;
// Cache fetched lists
let availableProjects = [];
let availableOffices = [];
let availableSubCenters = [];
let availableReportProjects = [];

// Generic function to fetch and populate a dropdown
async function fetchAndPopulateDropdown(action, selectElementId, currentSelectionValue = null, cacheArrayRef) {
    const select = $(selectElementId);
    if (!select) {
        console.error(`Dropdown element #${selectElementId} not found.`);
        return false; // Indicate failure
    }
    select.disabled = true;
    select.innerHTML = '<option value="" disabled selected>Loading...</option>';

    let optionsList = cacheArrayRef;
    if (!Array.isArray(optionsList) || optionsList.length === 0) {
        try {
            console.log(`Fetching data for ${selectElementId} via action ${action}...`);
            const fetchedData = await apiCall(action);
            cacheArrayRef.length = 0; // Clear cache
            if (Array.isArray(fetchedData)) {
                 cacheArrayRef.push(...fetchedData);
            } else {
                 console.warn(`Received non-array data for ${action}:`, fetchedData);
            }
            optionsList = cacheArrayRef;
            console.log(`Data fetched/cached for ${selectElementId}:`, optionsList);
        } catch (error) {
            console.error(`Failed to fetch data for ${selectElementId}:`, error);
            select.innerHTML = '<option value="" disabled selected>Error loading</option>';
            return false;
        }
    } else {
         console.log(`Using cached data for ${selectElementId}.`);
    }

    // Populate dropdown
    select.innerHTML = `<option value="" disabled selected>Select new...</option>`;

    // --- THIS IS THE FIX ---
    // Only filter out the current value for the 'newSubCenter' dropdown
    let options;
    if (selectElementId === 'newSubCenter') {
        options = optionsList.filter(item => item !== currentSelectionValue);
    } else {
        options = optionsList; // For all other dropdowns, show all options
    }
    // --- END FIX ---

    if (options.length === 0 && optionsList.length > 0) {
        // This case might happen if only one subcenter exists
        select.innerHTML = `<option value="" disabled selected>No other options</option>`;
        select.disabled = true;
    } else if (optionsList.length === 0) {
         select.innerHTML = '<option value="" disabled selected>No options available</option>';
         select.disabled = true;
    } else {
        options.forEach(item => {
            const option = document.createElement('option');
            option.value = item;
            option.textContent = item;
            select.appendChild(option);
        });
        select.disabled = false;
    }
    return true;
}


export async function openTransferModal(employee) {
    const form = $('transferForm');
    if (!form || !employee) return;
    form.reset();

    $('transferEmployeeId').value = employee.employeeId;
    $('transferEmployeeName').value = employee.name || 'N/A';
    $('transferEmployeeNameDisplay').textContent = employee.name || 'N/A';
    $('transferEmployeeIdDisplay').textContent = employee.employeeId;
    $('currentSubCenter').value = employee.subCenter || 'N/A';
    $('transferDate').value = new Date().toISOString().split('T')[0];
    $('transferError').classList.add('hidden');

    openModal('transferModal');

    showLoading();
    try {
        // Pass the employee's current value to each function
        await Promise.allSettled([
             fetchAndPopulateDropdown('getProjects', 'transferProject', employee.project, availableProjects),
             fetchAndPopulateDropdown('getProjectOffices', 'transferProjectOffice', employee.projectOffice, availableOffices),
             fetchAndPopulateDropdown('getSubCenters', 'newSubCenter', employee.subCenter, availableSubCenters),
             fetchAndPopulateDropdown('getReportProjects', 'transferReportProject', employee.reportProject, availableReportProjects)
        ]);
        console.log("All transfer dropdowns populated successfully.");
    } catch (error) {
         console.error("Error populating transfer dropdowns:", error);
         customAlert("Error", "Failed to load one or more selection lists for transfer.");
    } finally {
         hideLoading();
    }
}

export function setupTransferModal(fetchEmployeesFunc) {
    mainFetchEmployeesFunc = fetchEmployeesFunc;
    const form = $('transferForm');
    const cancelBtn = $('cancelTransferModal');

    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('transferModal'));

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = $('transferError');
            errorDiv.classList.add('hidden');

            const transferData = {
                employeeId: $('transferEmployeeId').value,
                newProject: $('transferProject').value,
                newProjectOffice: $('transferProjectOffice').value,
                newSubCenter: $('newSubCenter').value,
                newReportProject: $('transferReportProject').value,
                reason: $('transferReason').value.trim(),
                transferDate: $('transferDate').value
            };

            // Validation
            if (!transferData.newProject || !transferData.newProjectOffice || !transferData.newSubCenter || !transferData.newReportProject) {
                errorDiv.textContent = 'Please select new Project, Office, Sub Center, and Report Project.'; errorDiv.classList.remove('hidden'); return;
            }
            if (transferData.newSubCenter === ($('currentSubCenter').value)) {
                 errorDiv.textContent = 'New Sub Center cannot be the same as the Current Sub Center.'; errorDiv.classList.remove('hidden'); return;
            }
            if (!transferData.reason) { errorDiv.textContent = 'Please enter a reason.'; errorDiv.classList.remove('hidden'); return; }
            if (!transferData.transferDate) { errorDiv.textContent = 'Please select a transfer date.'; errorDiv.classList.remove('hidden'); return; }

            try {
                await apiCall('transferEmployee', 'POST', transferData);
                customAlert("Success", "Employee transferred successfully.");
                closeModal('transferModal');
                if (mainFetchEmployeesFunc) mainFetchEmployeesFunc();

            } catch (error) {
                console.error("Error transferring employee:", error);
                errorDiv.textContent = `Transfer failed: ${error.message}`;
                errorDiv.classList.remove('hidden');
            }
        });
    }
}