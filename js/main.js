// js/main.js

// --- Authentication Check ---
if (sessionStorage.getItem('isLoggedIn') !== 'true') {
    if (!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('login.html')) {
        window.location.href = '/login.html';
    } else if (window.location.pathname.endsWith('/')) {
         window.location.href = '/login.html';
    }
} else {
    // --- App Initialization ---
    async function initializeAppModules() {
        const { $, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadCSV } = await import('./utils.js');
        const { apiCall } = await import('./apiClient.js');
        const { setLocalEmployees, filterAndRenderEmployees, populateFilterDropdowns, setupEmployeeListEventListeners } = await import('./employeeList.js');
        const { setupEmployeeForm, openEmployeeModal } = await import('./employeeForm.js');
        const { setupStatusChangeModal, openStatusChangeModal } = await import('./statusChange.js');
        const { setupBulkUploadModal } = await import('./bulkUpload.js');
        const { setupSalarySheetModal } = await import('./salarySheet.js');
        const { setupPastSheetsModal } = await import('./pastSheets.js');
        const { setupViewDetailsModal, openViewDetailsModal } = await import('./viewDetails.js');
        const { setupTransferModal, openTransferModal } = await import('./transferModal.js');

        // --- Global State ---
        let mainLocalEmployees = [];
        // Add projectOffice to filters state
        let currentFilters = { name: '', status: '', designation: '', type: '', projectOffice: '' };

        // --- State Accessor ---
        const getMainLocalEmployees = () => mainLocalEmployees;

        // --- Main Fetch Function ---
        async function fetchAndRenderEmployees() {
            const countDisplay = $('filterCountDisplay');
            try {
                 if (countDisplay) countDisplay.textContent = 'Loading employees...';
                const employees = await apiCall('getEmployees');
                mainLocalEmployees = employees || [];
                setLocalEmployees(mainLocalEmployees); // Pass to list module
                populateFilterDropdowns(mainLocalEmployees); // Populate ALL dropdowns
                filterAndRenderEmployees(currentFilters, mainLocalEmployees); // Initial render with count

                const initialLoading = $('#initialLoading');
                if(initialLoading) initialLoading.remove();

            } catch (error) {
                 customAlert("Error", `Failed to load employee data: ${error.message}`);
                 if(countDisplay) countDisplay.textContent = 'Error loading data.';
                 const employeeListElement = $('#employee-list');
                 if(employeeListElement) employeeListElement.innerHTML = `<div class="col-span-full ..."><p class="text-red-500 ...">Could not load employee data.</p></div>`;
                  const initialLoading = $('#initialLoading');
                  if(initialLoading) initialLoading.remove();
            }
        }

        // --- Setup Filter Listeners ---
        function setupFilterListeners() {
             // Add filterProjectOffice to the list
             ['filterName', 'filterStatus', 'filterDesignation', 'filterType', 'filterProjectOffice'].forEach(id => {
                 const element = $(id);
                 if(element) {
                     element.addEventListener('input', (e) => {
                          // Derive key from ID
                          const filterKey = id.replace('filter','').charAt(0).toLowerCase() + id.slice(7);
                          currentFilters[filterKey] = e.target.value;
                          if (typeof filterAndRenderEmployees === 'function') {
                             filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                          }
                     });
                 }
             });
              const resetBtn = $('#resetFiltersBtn');
              if(resetBtn) {
                  resetBtn.addEventListener('click', () => {
                       // Reset projectOffice filter
                       currentFilters = { name: '', status: '', designation: '', type: '', projectOffice: '' };
                       $('filterName').value = '';
                       $('filterStatus').value = '';
                       $('filterDesignation').value = '';
                       $('filterType').value = '';
                       $('filterProjectOffice').value = ''; // Clear the new dropdown

                        if (typeof filterAndRenderEmployees === 'function') {
                            filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                        }
                  });
              }
        }

        // --- Export Data ---
        function handleExportData() {
             if (mainLocalEmployees.length === 0) { customAlert("No Data", "No employees to export."); return; }
             const headers = [ "Employee ID", "Employee Name", /* ... ALL HEADERS ... */ "Last Transfer Reason"];
             const headerKeys = [ "employeeId", "name", /* ... ALL KEYS ... */ "lastTransferReason"];
             let csvContent = headers.join(',') + '\n';
             mainLocalEmployees.forEach(emp => { /* ... generate row ... */ });
             if (typeof downloadCSV === 'function') downloadCSV(csvContent, "employee_data_export.csv");
        }

         // --- Setup Global Listeners ---
         function setupGlobalListeners() {
             const exportBtn = $('exportDataBtn'); if (exportBtn) exportBtn.addEventListener('click', handleExportData);
             const alertOk = $('alertOkBtn'); if (alertOk) alertOk.addEventListener('click', () => closeModal('alertModal'));
             const confirmCancel = $('confirmCancelBtn'); if (confirmCancel) confirmCancel.addEventListener('click', handleConfirmCancel);
             const confirmOk = $('confirmOkBtn'); if (confirmOk) confirmOk.addEventListener('click', handleConfirmAction);
             const logoutBtn = $('logoutBtn');
             if (logoutBtn) {
                 logoutBtn.addEventListener('click', () => { sessionStorage.removeItem('isLoggedIn'); sessionStorage.removeItem('loggedInUser'); window.location.href = '/login.html'; });
             } else { console.warn("Logout button (#logoutBtn) not found."); }
         }

        // --- Initialize Application ---
        function initializeApp() {
            setupFilterListeners();
            setupGlobalListeners();
            // Setup module-specific listeners
            if (typeof setupEmployeeListEventListeners === 'function') setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
            if (typeof setupEmployeeForm === 'function') setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
            if (typeof setupStatusChangeModal === 'function') setupStatusChangeModal(fetchAndRenderEmployees);
            if (typeof setupBulkUploadModal === 'function') setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
            if (typeof setupSalarySheetModal === 'function') setupSalarySheetModal(getMainLocalEmployees);
            if (typeof setupPastSheetsModal === 'function') setupPastSheetsModal();
            if (typeof setupViewDetailsModal === 'function') setupViewDetailsModal();
            if (typeof setupTransferModal === 'function') setupTransferModal(fetchAndRenderEmployees);
            // Initial data load
            fetchAndRenderEmployees();
        }

        // --- Run ---
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initializeApp); }
        else { initializeApp(); }
    }
    initializeAppModules().catch(err => { console.error("Failed to init app modules:", err); /* Show error */ });
} // End auth check else block