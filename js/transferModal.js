// js/transferModal.js
import { $, openModal, closeModal, customAlert, formatDateForInput } from './utils.js';
import { apiCall } from './apiClient.js';

let mainFetchEmployeesFunc = null; // To store the main fetch function
let availableSubCenters = []; // Cache sub centers

// Fetch sub centers if not already fetched
async function fetchSubCenters() {
    if (availableSubCenters.length === 0) {
        try {
            console.log("Fetching sub centers...");
            availableSubCenters = await apiCall('getSubCenters');
             console.log("Sub centers fetched:", availableSubCenters);
        } catch (error) {
            console.error("Failed to fetch sub centers:", error);
            customAlert("Error", "Could not load sub center list for transfer.");
            availableSubCenters = []; // Reset on error
        }
    }
    return availableSubCenters;
}

// Populate the dropdown
function populateSubCenterDropdown(currentSubCenter) {
    const select = $('newSubCenter');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Select new sub center...</option>'; // Reset
    const options = availableSubCenters.filter(sc => sc !== currentSubCenter); // Exclude current

    if (options.length === 0) {
         select.innerHTML = '<option value="" disabled selected>No other sub centers available</option>';
         select.disabled = true;
    } else {
         options.forEach(sc => {
            const option = document.createElement('option');
            option.value = sc;
            option.textContent = sc;
            select.appendChild(option);
        });
         select.disabled = false;
    }
}


export async function openTransferModal(employee) {
    const form = $('transferForm');
    if (!form || !employee) return;
    form.reset();

    // Populate employee info
    $('transferEmployeeId').value = employee.employeeId;
    $('transferEmployeeName').value = employee.name || 'N/A'; // Store for logging maybe?
    $('transferEmployeeNameDisplay').textContent = employee.name || 'N/A';
    $('transferEmployeeIdDisplay').textContent = employee.employeeId;
    $('currentSubCenter').value = employee.subCenter || 'N/A';

    // Set default transfer date to today
    $('transferDate').value = new Date().toISOString().split('T')[0];
    $('transferError').classList.add('hidden'); // Hide errors

    // Fetch and populate sub centers (await ensures list is ready)
    await fetchSubCenters();
    populateSubCenterDropdown(employee.subCenter);

    openModal('transferModal');
}

export function setupTransferModal(fetchEmployeesFunc) {
    mainFetchEmployeesFunc = fetchEmployeesFunc; // Store the function
    const form = $('transferForm');
    const cancelBtn = $('cancelTransferModal');

    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('transferModal'));

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = $('transferError');
            errorDiv.classList.add('hidden'); // Hide previous errors

            const transferData = {
                employeeId: $('transferEmployeeId').value,
                newSubCenter: $('newSubCenter').value,
                reason: $('transferReason').value.trim(),
                transferDate: $('transferDate').value
            };

            // Basic validation
            if (!transferData.newSubCenter) {
                errorDiv.textContent = 'Please select a new sub center.';
                errorDiv.classList.remove('hidden');
                return;
            }
             if (!transferData.reason) {
                errorDiv.textContent = 'Please enter a reason for the transfer.';
                errorDiv.classList.remove('hidden');
                return;
            }
             if (!transferData.transferDate) {
                errorDiv.textContent = 'Please select a transfer date.';
                errorDiv.classList.remove('hidden');
                return;
            }


            try {
                await apiCall('transferEmployee', 'POST', transferData);
                customAlert("Success", "Employee transferred successfully.");
                closeModal('transferModal');
                if (mainFetchEmployeesFunc) {
                    mainFetchEmployeesFunc(); // Refresh the main employee list
                }
            } catch (error) {
                console.error("Error transferring employee:", error);
                errorDiv.textContent = `Transfer failed: ${error.message}`;
                errorDiv.classList.remove('hidden');
            }
        });
    }
}