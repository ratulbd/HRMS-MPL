// js/transferModal.js
import { $, openModal, closeModal, customAlert, showLoading, hideLoading } from './utils.js'; // Added show/hideLoading
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
        return false;
    }
    select.disabled = true;
    select.innerHTML = '<option value="" disabled selected>Loading...</option>';

    // Use cache if available and not empty
    let optionsList = cacheArrayRef;
    if (!Array.isArray(optionsList) || optionsList.length === 0) {
        try {
            console.log(`Fetching data for ${selectElementId} via action ${action}...`);
            const fetchedData = await apiCall(action); // apiCall handles loading indicator
            // Clear cache before pushing new data
            cacheArrayRef.length = 0;
            // Ensure fetchedData is an array before spreading
            if (Array.isArray(fetchedData)) {
                 cacheArrayRef.push(...fetchedData);
            } else {
                 console.warn(`Received non-array data for ${action}:`, fetchedData);
            }
            optionsList = cacheArrayRef; // Update optionsList with fetched/cached data
            console.log(`Data fetched/cached for ${selectElementId}:`, optionsList);
        } catch (error) {
            console.error(`Failed to fetch data for ${selectElementId}:`, error);
            // Don't show alert here, let the caller handle overall failure maybe
            // customAlert("Error", `Could not load list for ${selectElementId}.`);
            select.innerHTML = '<option value="" disabled selected>Error loading</option>';
            return false; // Indicate failure
        }
    } else {
         console.log(`Using cached data for ${selectElementId}.`);
    }


    // Populate dropdown
    select.innerHTML = `<option value="" disabled ${!currentSelectionValue ? 'selected' : ''}>Select new...</option>`;
    // Exclude the current value from the options shown
    const options = optionsList.filter(item => item !== currentSelectionValue);

    if (options.length === 0 && optionsList.length > 0) { // Only current value exists
        select.innerHTML = `<option value="" disabled selected>No other options</option>`;
        select.disabled = true;
    } else if (optionsList.length === 0) { // No values found at all
         select.innerHTML = '<option value="" disabled selected>No options available</option>';
         select.disabled = true;
    } else {
        options.forEach(item => {
            const option = document.createElement('option');
            option.value = item; option.textContent = item;
            select.appendChild(option);
        });
        select.disabled = false; // Enable if there are other options
    }
    return true; // Indicate success
}


export async function openTransferModal(employee) {
    const form = $('transferForm');
    if (!form || !employee) return;
    form.reset();

    $('transferEmployeeId').value = employee.employeeId;
    $('transferEmployeeName').value = employee.name || 'N/A';
    $('transferEmployeeNameDisplay').textContent = employee.name || 'N/A';
    $('transferEmployeeIdDisplay').textContent = employee.employeeId;
    $('currentSubCenter').value = employee.subCenter || 'N/A'; // Show current subcenter
    $('transferDate').value = new Date().toISOString().split('T')[0];
    $('transferError').classList.add('hidden');

    openModal('transferModal'); // Open modal first so elements exist

    // Fetch and populate all dropdowns concurrently
    showLoading(); // Show global loading indicator
    const results = await Promise.allSettled([ // Use allSettled to continue even if one fails
         fetchAndPopulateDropdown('getProjects', 'transferProject', employee.project, availableProjects),
         fetchAndPopulateDropdown('getProjectOffices', 'transferProjectOffice', employee.projectOffice, availableOffices),
         fetchAndPopulateDropdown('getSubCenters', 'newSubCenter', employee.subCenter, availableSubCenters), // Corrected action name
         fetchAndPopulateDropdown('getReportProjects', 'transferReportProject', employee.reportProject, availableReportProjects)
    ]);
    hideLoading(); // Hide global loading indicator

    // Check if any dropdown failed to load
    if (results.some(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === false))) {
         customAlert("Error", "Failed to load one or more selection lists for transfer. Please try again later.");
         // Optionally close modal or disable form here
    } else {
         console.log("All transfer dropdowns populated successfully.");
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
                // Get values from new dropdowns
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