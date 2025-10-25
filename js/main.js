// js/main.js

// --- Authentication Check ---
// Redirect to login if not logged in
if (sessionStorage.getItem('isLoggedIn') !== 'true') {
    // Check if we are already on login.html to prevent redirect loop
    // Adjust the path check if login.html is not in the root
    if (!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('login.html')) {
        console.log("User not logged in. Redirecting to login page.");
        window.location.href = '/login.html'; // Use absolute path from root
    } else if (window.location.pathname.endsWith('/')) {
         // If at the root path, redirect to login
         console.log("User not logged in at root. Redirecting to login page.");
         window.location.href = '/login.html';
    }
    // If already on login.html, do nothing and let the login page script run.

} else {
    // --- Only run app initialization if logged in ---
    console.log("User is logged in. Initializing app...");

    // Dynamically import modules *after* checking login status
    async function initializeAppModules() {
        // --- Standard Imports ---
        const { $, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadCSV } = await import('./utils.js');
        const { apiCall } = await import('./apiClient.js');
        const { setLocalEmployees, filterAndRenderEmployees, populateFilterDropdowns, setupEmployeeListEventListeners } = await import('./employeeList.js');
        const { setupEmployeeForm, openEmployeeModal } = await import('./employeeForm.js');
        const { setupStatusChangeModal, openStatusChangeModal } = await import('./statusChange.js');
        const { setupBulkUploadModal } = await import('./bulkUpload.js');
        const { setupSalarySheetModal } = await import('./salarySheet.js');
        const { setupPastSheetsModal } = await import('./pastSheets.js');
        const { setupViewDetailsModal, openViewDetailsModal } = await import('./viewDetails.js');
        // --- Corrected Transfer Modal Import ---
        const { setupTransferModal, openTransferModal } = await import('./transferModal.js');

        // --- Global State (Scoped to logged-in state) ---
        let mainLocalEmployees = [];
        let currentFilters = { name: '', status: '', designation: '', type: '' };

        // --- State Accessor ---
        const getMainLocalEmployees = () => mainLocalEmployees;

        // --- Main Fetch Function ---
        async function fetchAndRenderEmployees() {
            try {
                const employees = await apiCall('getEmployees'); // apiCall handles loading internally
                mainLocalEmployees = employees || [];
                if (typeof setLocalEmployees === 'function') {
                    setLocalEmployees(mainLocalEmployees);
                }
                 if (typeof populateFilterDropdowns === 'function') {
                     populateFilterDropdowns(mainLocalEmployees);
                 }
                 if (typeof filterAndRenderEmployees === 'function') {
                     filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                 }

                const initialLoading = $('#initialLoading');
                if(initialLoading) initialLoading.remove();

            } catch (error) {
                 if (typeof customAlert === 'function') {
                    customAlert("Error", `Failed to load employee data: ${error.message}`);
                 } else {
                     alert(`Failed to load employee data: ${error.message}`); // Fallback
                 }
                 const employeeListElement = $('#employee-list');
                 if(employeeListElement) {
                     employeeListElement.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Could not load employee data.</p></div>`;
                 }
                  const initialLoading = $('#initialLoading');
                  if(initialLoading) initialLoading.remove();
            }
        }

        // --- Setup Filter Listeners ---
        function setupFilterListeners() {
             ['filterName', 'filterStatus', 'filterDesignation', 'filterType'].forEach(id => {
                 const element = $(id);
                 if(element) {
                     element.addEventListener('input', (e) => {
                          const filterKey = id.replace('filter','').toLowerCase();
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
                       currentFilters = { name: '', status: '', designation: '', type: '' };
                       const nameInput = $('filterName'); if(nameInput) nameInput.value = '';
                       const statusSelect = $('filterStatus'); if(statusSelect) statusSelect.value = '';
                       const desSelect = $('filterDesignation'); if(desSelect) desSelect.value = '';
                       const typeSelect = $('filterType'); if(typeSelect) typeSelect.value = '';
                        if (typeof filterAndRenderEmployees === 'function') {
                            filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                        }
                  });
              }
        }

        // --- Export Data ---
        function handleExportData() {
             if (mainLocalEmployees.length === 0) {
                 if (typeof customAlert === 'function') customAlert("No Data", "There are no employees to export.");
                 else alert("There are no employees to export.");
                return;
            }
             const headers = [ /* ... headers ... */ ];
             const headerKeys = [ /* ... headerKeys ... */ ];
             // ... (rest of CSV generation logic) ...
             if (typeof downloadCSV === 'function') {
                downloadCSV(csvContent, "employee_data_export.csv");
            }
        }

         // --- Setup Global Listeners ---
         function setupGlobalListeners() {
             const exportBtn = $('exportDataBtn');
             if (exportBtn && typeof handleExportData === 'function') {
                 exportBtn.addEventListener('click', handleExportData);
             }
             const alertOk = $('alertOkBtn');
             if (alertOk && typeof closeModal === 'function') {
                 alertOk.addEventListener('click', () => closeModal('alertModal'));
             }
             const confirmCancel = $('confirmCancelBtn');
             if (confirmCancel && typeof handleConfirmCancel === 'function') {
                 confirmCancel.addEventListener('click', handleConfirmCancel);
             }
             const confirmOk = $('confirmOkBtn');
             if (confirmOk && typeof handleConfirmAction === 'function') {
                 confirmOk.addEventListener('click', handleConfirmAction);
             }
             const logoutBtn = $('logoutBtn');
             if (logoutBtn) {
                 logoutBtn.addEventListener('click', () => {
                     sessionStorage.removeItem('isLoggedIn');
                     sessionStorage.removeItem('loggedInUser');
                     window.location.href = '/login.html';
                 });
             } else {
                  console.warn("Logout button (#logoutBtn) not found in HTML.");
             }
         }

        // --- Initialize Application ---
        function initializeApp() {
            console.log("Initializing HRMS App (Modular & Authenticated)...");
            setupFilterListeners();
            setupGlobalListeners();

            if (typeof setupEmployeeListEventListeners === 'function') setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
            if (typeof setupEmployeeForm === 'function') setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
            if (typeof setupStatusChangeModal === 'function') setupStatusChangeModal(fetchAndRenderEmployees);
            if (typeof setupBulkUploadModal === 'function') setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
            if (typeof setupSalarySheetModal === 'function') setupSalarySheetModal(getMainLocalEmployees);
            if (typeof setupPastSheetsModal === 'function') setupPastSheetsModal();
            if (typeof setupViewDetailsModal === 'function') setupViewDetailsModal();
            // Call setupTransferModal (it's now imported correctly)
            if (typeof setupTransferModal === 'function') setupTransferModal(fetchAndRenderEmployees);

            // Initial data load
            fetchAndRenderEmployees();
        }

        // --- Run ---
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeApp);
        } else {
            initializeApp();
        }
    } // End async function initializeAppModules

    // Call the async function to load modules and initialize
    initializeAppModules().catch(err => {
        console.error("Failed to initialize app modules:", err);
         document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Error loading application components. Please try refreshing.</div>';
    });

} // End of the main 'else' block for authenticated users