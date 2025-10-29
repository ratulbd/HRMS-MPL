// js/main.js

// --- Authentication Check ---
if (sessionStorage.getItem('isLoggedIn') !== 'true') {
    if (!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('login.html')) {
        console.log("User not logged in. Redirecting to login page.");
        window.location.href = '/login.html'; // Use absolute path from root
    } else if (window.location.pathname.endsWith('/')) {
         console.log("User not logged in at root. Redirecting to login page.");
         window.location.href = '/login.html';
    }
} else {
    // --- App Initialization ---
    console.log("User is logged in. Initializing app...");

    async function initializeAppModules() {
        // --- Dynamic Imports ---
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
                setLocalEmployees(mainLocalEmployees);
                populateFilterDropdowns(mainLocalEmployees);
                filterAndRenderEmployees(currentFilters, mainLocalEmployees);

                const initialLoading = $('#initialLoading');
                if(initialLoading) initialLoading.remove();

            } catch (error) {
                 customAlert("Error", `Failed to load employee data: ${error.message}`);
                 if(countDisplay) countDisplay.textContent = 'Error loading data.';
                 const employeeListElement = $('#employee-list');
                 if(employeeListElement) employeeListElement.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Could not load employee data.</p></div>`;
                  const initialLoading = $('#initialLoading');
                  if(initialLoading) initialLoading.remove();
            }
        }

        // --- Setup Filter Listeners ---
        function setupFilterListeners() {
             ['filterName', 'filterStatus', 'filterDesignation', 'filterType', 'filterProjectOffice'].forEach(id => {
                 const element = $(id);
                 if(element) {
                     element.addEventListener('input', (e) => {
                          const filterKeyMap = { // Map IDs to state keys
                               filterName: 'name',
                               filterStatus: 'status',
                               filterDesignation: 'designation',
                               filterType: 'type',
                               filterProjectOffice: 'projectOffice'
                          };
                          const filterKey = filterKeyMap[id];
                          if (filterKey) { // Check if key exists
                               currentFilters[filterKey] = e.target.value;
                               if (typeof filterAndRenderEmployees === 'function') {
                                  filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                               }
                          } else {
                               console.warn(`No filter key mapping found for ID: ${id}`);
                          }
                     });
                 } else {
                      console.warn(`Filter element with ID '${id}' not found.`);
                 }
             });

              const resetBtn = $('resetFiltersBtn');
              if(resetBtn) {
                  resetBtn.addEventListener('click', () => {
                       // Reset the state object
                       currentFilters = { name: '', status: '', designation: '', type: '', projectOffice: '' };

                       // --- FIX: Reset the values of the HTML elements ---
                       const nameInput = $('filterName'); if(nameInput) nameInput.value = '';
                       const statusSelect = $('filterStatus'); if(statusSelect) statusSelect.value = '';
                       const desSelect = $('filterDesignation'); if(desSelect) desSelect.value = '';
                       const typeSelect = $('filterType'); if(typeSelect) typeSelect.value = '';
                       const officeSelect = $('filterProjectOffice'); if(officeSelect) officeSelect.value = '';
                       // --- END FIX ---

                        // Re-filter and render with empty filters
                        if (typeof filterAndRenderEmployees === 'function') {
                            filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                        }
                  });
              } else {
                   console.warn("Reset Filters button (#resetFiltersBtn) not found.");
              }
        }

        // --- MODIFICATION: Updated Export Headers and Keys ---
        function handleExportData() {
             if (mainLocalEmployees.length === 0) { customAlert("No Data", "No employees to export."); return; }
             
             const headers = [
                "Employee ID", "Employee Name", "Employee Type", "Designation", "Joining Date", "Project", "Project Office", "Report Project", "Sub Center",
                "Work Experience (Years)", "Education", "Father's Name", "Mother's Name", "Personal Mobile Number", "Official Mobile Number",
                "Mobile Limit", "Date of Birth", "Blood Group", "Address", "Identification Type", "Identification", "Nominee's Name",
                "Nominee's Mobile Number", "Previous Salary", "Basic", "Others", "Gross Salary", "Motobike / Car Maintenance Allowance", "Laptop Rent",
                "Others Allowance", "Arrear", "Food Allowance", "Station Allowance", "Hardship Allowance", "Grand Total", "Gratuity",
                "Subsidized Lunch", "TDS", "Motorbike Loan", "Welfare Fund", "Salary/ Others Loan", "Subsidized Vehicle", "LWP", "CPF",
                "Others Adjustment", "Total Deduction", "Net Salary Payment", "Bank Account Number", "Status", "Salary Held", "Hold Timestamp",
                "Separation Date", "Remarks", "Last Transfer Date", "Last Subcenter", "Last Transfer Reason"
             ];
             
             const headerKeys = [
                "employeeId", "name", "employeeType", "designation", "joiningDate", "project", "projectOffice", "reportProject", "subCenter",
                "workExperience", "education", "fatherName", "motherName", "personalMobile", "officialMobile",
                "mobileLimit", "dob", "bloodGroup", "address", "identificationType", "identification", "nomineeName",
                "nomineeMobile", "previousSalary", "basic", "others", "salary", "motobikeCarMaintenance", "laptopRent",
                "othersAllowance", "arrear", "foodAllowance", "stationAllowance", "hardshipAllowance", "grandTotal", "gratuity",
                "subsidizedLunch", "tds", "motorbikeLoan", "welfareFund", "salaryOthersLoan", "subsidizedVehicle", "lwp", "cpf",
                "othersAdjustment", "totalDeduction", "netSalaryPayment", "bankAccount", "status", "salaryHeld", "holdTimestamp",
                "separationDate", "remarks", "lastTransferDate", "lastSubcenter", "lastTransferReason"
             ];
             
             let csvContent = headers.join(',') + '\n';
             mainLocalEmployees.forEach(emp => {
                const row = headerKeys.map(key => {
                     let value = emp[key] ?? '';
                     if (key === 'salaryHeld') value = (value === true || String(value).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
                     value = String(value).replace(/"/g, '""');
                    if (String(value).includes(',') || String(value).includes('"') || String(value).includes('\n')) return `"${value}"`;
                    return value;
                });
                csvContent += row.join(',') + '\n';
             });
             if (typeof downloadCSV === 'function') downloadCSV(csvContent, "employee_data_export.csv");
        }
        // --- END MODIFICATION ---

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
            console.log("Initializing HRMS App (Modular & Authenticated)...");
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
    initializeAppModules().catch(err => { console.error("Failed to init app modules:", err); document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Error loading application components. Please try refreshing.</div>'; });
}