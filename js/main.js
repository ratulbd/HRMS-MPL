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
    // This prevents trying to access DOM elements that don't exist if redirected
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
                // Check if setLocalEmployees function exists before calling
                if (typeof setLocalEmployees === 'function') {
                    setLocalEmployees(mainLocalEmployees); // Update list module's state if needed
                }
                 if (typeof populateFilterDropdowns === 'function') {
                     populateFilterDropdowns(mainLocalEmployees);
                 }
                 if (typeof filterAndRenderEmployees === 'function') {
                     filterAndRenderEmployees(currentFilters, mainLocalEmployees); // Pass state explicitly
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
                       // Reset input/select values visually
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
            // Define headers inside the function or ensure they are accessible
             const headers = [
                 "Employee ID", "Employee Name", "Employee Type", "Designation", "Joining Date",
                 "Project", "Project Office", "Report Project", "Sub Center", "Work Experience (Years)",
                 "Education", "Father's Name", "Mother's Name", "Personal Mobile Number", "Date of Birth",
                 "Blood Group", "Address", "Identification", "Nominee's Name", "Nominee's Mobile Number",
                 "Gross Salary", "Official Mobile Number", "Mobile Limit", "Bank Account Number",
                 "Status", "Salary Held", "Separation Date", "Remarks", "Hold Timestamp"
             ];
             const headerKeys = [
                 "employeeId", "name", "employeeType", "designation", "joiningDate",
                 "project", "projectOffice", "reportProject", "subCenter", "workExperience",
                 "education", "fatherName", "motherName", "personalMobile", "dob",
                 "bloodGroup", "address", "identification", "nomineeName", "nomineeMobile",
                 "salary", "officialMobile", "mobileLimit", "bankAccount",
                 "status", "salaryHeld", "separationDate", "remarks", "holdTimestamp"
              ];


            let csvContent = headers.join(',') + '\n';
            mainLocalEmployees.forEach(emp => {
                const row = headerKeys.map(key => {
                     let value = emp[key] ?? '';
                     if (key === 'salaryHeld') value = (value === true || String(value).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
                     value = String(value).replace(/"/g, '""'); // Escape double quotes
                    if (String(value).includes(',') || String(value).includes('"') || String(value).includes('\n')) return `"${value}"`; // Quote if necessary
                    return value;
                });
                csvContent += row.join(',') + '\n';
            });
            if (typeof downloadCSV === 'function') {
                downloadCSV(csvContent, "employee_data_export.csv");
            }
        }

         // --- Setup Global Listeners ---
         function setupGlobalListeners() {
             // Export Button
             const exportBtn = $('exportDataBtn');
             if (exportBtn && typeof handleExportData === 'function') {
                 exportBtn.addEventListener('click', handleExportData);
             }

             // Alert/Confirm Modal Buttons
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

             // --- Logout Button ---
             // ** Add a button with id="logoutBtn" to your index.html nav bar **
             const logoutBtn = $('logoutBtn');
             if (logoutBtn) {
                 logoutBtn.addEventListener('click', () => {
                     sessionStorage.removeItem('isLoggedIn');
                     sessionStorage.removeItem('loggedInUser'); // Clear user info too
                     window.location.href = '/login.html'; // Redirect to login
                 });
             } else {
                  console.warn("Logout button (#logoutBtn) not found in HTML.");
             }
         }

        // --- Initialize Application ---
        function initializeApp() {
            console.log("Initializing HRMS App (Modular & Authenticated)...");
            setupFilterListeners();
            setupGlobalListeners(); // Export, Alert, Confirm, Logout

            // Setup module-specific listeners, passing dependencies
            if (typeof setupEmployeeListEventListeners === 'function') setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
            if (typeof setupEmployeeForm === 'function') setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
            if (typeof setupStatusChangeModal === 'function') setupStatusChangeModal(fetchAndRenderEmployees);
            if (typeof setupBulkUploadModal === 'function') setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
            if (typeof setupSalarySheetModal === 'function') setupSalarySheetModal(getMainLocalEmployees);
            if (typeof setupPastSheetsModal === 'function') setupPastSheetsModal();
            if (typeof setupViewDetailsModal === 'function') setupViewDetailsModal();

            // Initial data load
            fetchAndRenderEmployees();
        }

        // --- Run ---
        // Use DOMContentLoaded inside the 'else' block
        // Wrap module loading and init in DOMContentLoaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeApp);
        } else {
            // DOMContentLoaded has already fired
            initializeApp();
        }
    } // End async function initializeAppModules

    // Call the async function to load modules and initialize
    initializeAppModules().catch(err => {
        console.error("Failed to initialize app modules:", err);
         // Display a fallback error message if module loading fails
         document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Error loading application components. Please try refreshing.</div>';
    });


} // End of the main 'else' block for authenticated users