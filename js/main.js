// js/main.js

// --- Authentication Check ---
const isLoggedIn = sessionStorage.getItem('isLoggedIn');
if (isLoggedIn !== 'true' && window.location.pathname.endsWith('index.html')) {
    console.log("User not logged in. Redirecting to login page.");
    window.location.href = '/login.html';
}
// --- End Authentication Check ---

async function initializeAppModules() {
    console.log("DOM loaded. Initializing app modules...");
    
    const { $, openModal, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadCSV, formatDateForInput, formatDateForDisplay } = await import('./utils.js');
    const { apiCall } = await import('./apiClient.js');
    
    // === MODIFICATION: Removed unused imports, added renderEmployeeList ===
    const { renderEmployeeList, populateFilterDropdowns, setupEmployeeListEventListeners } = await import('./employeeList.js');
    // === END MODIFICATION ===

    const { setupEmployeeForm, openEmployeeModal } = await import('./employeeForm.js');
    const { setupStatusChangeModal, openStatusChangeModal } = await import('./statusChange.js');
    const { setupFileCloseModal } = await import('./fileClosingModal.js'); 
    const { setupBulkUploadModal } = await import('./bulkUpload.js');
    const { setupSalarySheetModal } = await import('./salarySheet.js');
    const { setupPastSheetsModal } = await import('./pastSheets.js');
    const { setupViewDetailsModal, openViewDetailsModal } = await import('./viewDetails.js');
    const { setupTransferModal, openTransferModal } = await import('./transferModal.js');

    // === MODIFICATION: New Pagination & Filter State ===
    let mainLocalEmployees = []; // Still needed for edit/duplicate checks and modal data
    
    // Default filter: Hide "Closed" employees, as requested
    let currentFilters = { 
        name: '', 
        status: ['Active', 'Salary Held', 'Resigned', 'Terminated'], 
        designation: [], 
        functionalRole: [],
        type: [], 
        project: [], 
        projectOffice: [], 
        reportProject: [], 
        subCenter: [] 
    };
    let tomSelects = {};
    
    // Pagination state
    let currentPage = 1;
    let totalPages = 1;
    let isLoading = false;
    let hasMorePages = true;
    let allFiltersLoaded = false; // Flag to stop reloading dropdowns
    
    // === END MODIFICATION ===

    // State Accessor
    const getMainLocalEmployees = () => mainLocalEmployees;
    
    // --- Helper function to populate Tom Select instances ---
    function updateTomSelectFilterOptions(filterData) {
        if (!filterData) return;

        const formatOptions = (arr) => arr.map(val => ({ value: val, text: val }));

        const statusOptions = formatOptions(['Active', 'Salary Held', 'Resigned', 'Terminated', 'Closed']);

        const updateOptions = (instance, newOptions) => {
            if (instance) {
                const currentVal = instance.getValue(); // Save current selection
                instance.clearOptions();
                instance.addOptions(newOptions);
                instance.setValue(currentVal, true); // Restore selection silently
            }
        };

        updateOptions(tomSelects.status, statusOptions);
        updateOptions(tomSelects.designation, formatOptions(filterData.designation));
        updateOptions(tomSelects.functionalRole, formatOptions(filterData.functionalRole));
        updateOptions(tomSelects.type, formatOptions(filterData.type));
        updateOptions(tomSelects.project, formatOptions(filterData.project));
        updateOptions(tomSelects.projectOffice, formatOptions(filterData.projectOffice));
        updateOptions(tomSelects.reportProject, formatOptions(filterData.reportProject));
        updateOptions(tomSelects.subCenter, formatOptions(filterData.subCenter));
    }

    // === MODIFICATION: Main Fetch Function rebuilt for Pagination ===
    async function fetchAndRenderEmployees(isLoadMore = false) {
        if (isLoading) return;
        isLoading = true;
        
        if (isLoadMore && !hasMorePages) {
            isLoading = false;
            return; // No more pages to load
        }

        const countDisplay = $('filterCountDisplay');
        const listContainer = $('employee-list');
        const initialLoading = $('initialLoading');

        if (isLoadMore) {
            currentPage++;
            if (countDisplay) countDisplay.textContent = 'Loading more employees...';
        } else {
            currentPage = 1;
            hasMorePages = true;
            if (countDisplay) countDisplay.textContent = 'Loading employees...';
            if (listContainer) listContainer.innerHTML = ''; // Clear for new search
            if (initialLoading) initialLoading.classList.remove('hidden');
        }

        // Prepare API parameters
        const params = {
            page: currentPage,
            limit: 30,
            ...currentFilters
        };
        // Convert array filters to comma-separated strings for the API
        for (const key in params) {
            if (Array.isArray(params[key])) {
                params[key] = params[key].join(',');
            }
        }
        
        try {
            // Use new 'params' argument in apiCall
            const response = await apiCall('getEmployees', 'GET', null, params);
            
            if (initialLoading) initialLoading.remove();

            if (!response || !response.employees) {
                throw new Error("Invalid API response format.");
            }

            const { employees, totalPages, totalCount, filters } = response;

            // Render the new batch of employees
            renderEmployeeList(employees, isLoadMore); // 'true' to append

            // Update pagination state
            hasMorePages = currentPage < totalPages;
            
            // Update filter dropdowns *only on the first load*
            if (!allFiltersLoaded) {
                populateFilterDropdowns(filters); // For modals
                updateTomSelectFilterOptions(filters); // For dashboard
                allFiltersLoaded = true;
            }

            if (countDisplay) {
                countDisplay.textContent = `Showing ${listContainer.children.length} of ${totalCount} employees.`;
            }
            
            // --- Background load of ALL employees for modal/edit logic ---
            // This is the compromise for not having a getEmployeeById API
            if (currentPage === 1) {
                apiCall('getEmployees', 'GET', null, { limit: 5000 }) // Fetch all
                    .then(fullResponse => {
                        mainLocalEmployees = fullResponse.employees || [];
                        console.log(`Background fetch complete: ${mainLocalEmployees.length} employees loaded for modals.`);
                    });
            }

        } catch (error) {
             customAlert("Error", `Failed to load employee data: ${error.message}`);
             if(countDisplay) countDisplay.textContent = 'Error loading data.';
             if(listContainer) listContainer.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Could not load employee data.</p></div>`;
             if (initialLoading) initialLoading.remove();
        } finally {
            isLoading = false;
        }
    }
    // === END MODIFICATION ===

    // === MODIFICATION: Setup Filter Listeners ---
    function setupFilterListeners() {
        const tomSelectConfig = {
            plugins: ['remove_button'],
        };

        const nameInput = $('filterName');
        if (nameInput) {
            // Use debounce to prevent API call on every keystroke
            let debounceTimer;
            nameInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    currentFilters.name = e.target.value;
                    fetchAndRenderEmployees(false); // New search
                }, 300); // 300ms delay
            });
        }

        const filterMap = {
            'filterStatus': 'status',
            'filterDesignation': 'designation',
            'filterFunctionalRole': 'functionalRole',
            'filterType': 'type',
            'filterProject': 'project',
            'filterProjectOffice': 'projectOffice',
            'filterReportProject': 'reportProject',
            'filterSubCenter': 'subCenter'
        };

        for (const [elementId, filterKey] of Object.entries(filterMap)) {
            const el = $(elementId);
            if (el) {
                tomSelects[filterKey] = new TomSelect(el, tomSelectConfig);
                tomSelects[filterKey].on('change', (values) => {
                    currentFilters[filterKey] = values;
                    fetchAndRenderEmployees(false); // New search
                });
            } else {
                console.warn(`Filter element with ID '${elementId}' not found.`);
            }
        }
        
        // Set default filter values in the UI
        if(tomSelects.status) {
            tomSelects.status.setValue(currentFilters.status, true); // Set default silently
        }

        const resetBtn = $('resetFiltersBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                // Reset to default (hiding 'Closed')
                currentFilters = { 
                    name: '', 
                    status: ['Active', 'Salary Held', 'Resigned', 'Terminated'], 
                    designation: [], functionalRole: [], type: [], 
                    project: [], projectOffice: [], reportProject: [], subCenter: [] 
                };
                if (nameInput) nameInput.value = '';
                for (const key in tomSelects) {
                    if (tomSelects[key]) {
                        // Reset to default, not just clear
                        const defaultVal = (key === 'status') ? currentFilters.status : [];
                        tomSelects[key].setValue(defaultVal, false); // Set default with event
                    }
                }
                // Manually trigger render after all values are set
                fetchAndRenderEmployees(false);
            });
        } else {
             console.warn("Reset Filters button (#resetFiltersBtn) not found.");
        }
    }
    // === END MODIFICATION ===
    
    // --- MODIFICATION: Infinite Scroll Listener ---
    function setupInfiniteScroll() {
        window.addEventListener('scroll', () => {
            // Check if near bottom, not loading, and has more pages
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500 &&
                !isLoading &&
                hasMorePages) {
                console.log("Loading more employees...");
                fetchAndRenderEmployees(true); // Load more
            }
        });
    }
    // --- END MODIFICATION ---

    // --- MODIFICATION: This function now only handles the *Employee Database* export ---
    async function handleExportData() {
         // This now has to fetch all data, as mainLocalEmployees might be stale
         try {
            const fullData = await apiCall('getEmployees', 'GET', null, { limit: 5000 });
            const employeesToExport = fullData.employees;
            
            if (!employeesToExport || employeesToExport.length === 0) { 
                customAlert("No Data", "No employees to export."); 
                return; 
            }
            
            const headers = [
                "Employee ID", "Employee Name", "Employee Type", "Designation", "Functional Role", "Joining Date", "Project", "Project Office", "Report Project", "Sub Center",
                "Work Experience (Years)", "Education", "Father's Name", "Mother's Name", "Personal Mobile Number", "Official Mobile Number",
                "Mobile Limit", "Date of Birth", "Blood Group", "Address", "Identification Type", "Identification", "Nominee's Name",
                "Nominee's Mobile Number", "Previous Salary", "Basic", "Others", "Gross Salary", "Motobike / Car Maintenance Allowance", "Laptop Rent",
                "Others Allowance", "Arrear", "Food Allowance", "Station Allowance", "Hardship Allowance", "Grand Total", "Gratuity",
                "Subsidized Lunch", "TDS", "Motorbike Loan", "Welfare Fund", "Salary/ Others Loan", "Subsidized Vehicle", "LWP", "CPF",
                "Others Adjustment", "Total Deduction", "Net Salary Payment", "Bank Account Number", "Status", "Salary Held", "Hold Timestamp",
                "Separation Date", "Remarks", "Last Transfer Date", "Last Subcenter", "Last Transfer Reason",
                "File Close Date", "File Close Remarks"
            ];
            
            const headerKeys = [
                "employeeId", "name", "employeeType", "designation", "functionalRole", "joiningDate", "project", "projectOffice", "reportProject", "subCenter",
                "workExperience", "education", "fatherName", "motherName", "personalMobile", "officialMobile",
                "mobileLimit", "dob", "bloodGroup", "address", "identificationType", "identification", "nomineeName",
                "nomineeMobile", "previousSalary", "basic", "others", "salary", "motobikeCarMaintenance", "laptopRent",
                "othersAllowance", "arrear", "foodAllowance", "stationAllowance", "hardshipAllowance", "grandTotal", "gratuity",
                "subsidizedLunch", "tds", "motorbikeLoan", "welfareFund", "salaryOthersLoan", "subsidizedVehicle", "lwp", "cpf",
                "othersAdjustment", "totalDeduction", "netSalaryPayment", "bankAccount", "status", "salaryHeld", "holdTimestamp",
                "separationDate", "remarks", "lastTransferDate", "lastSubcenter", "lastTransferReason",
                "fileClosingDate", "fileClosingRemarks" // Fixed key names
            ];
            
            let csvContent = headers.join(',') + '\n';
            employeesToExport.forEach(emp => {
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
         } catch (error) {
             customAlert("Error", `Failed to export data: ${error.message}`);
         }
    }
    // --- END MODIFICATION ---

    // --- ADDITION: Helper to convert JSON log data to CSV ---
    function jsonToCsv(jsonData) {
        if (!jsonData || jsonData.length === 0) {
            return ""; // No data
        }
        const headers = Object.keys(jsonData[0]);
        let csvContent = headers.join(',') + '\n';
        
        jsonData.forEach(item => {
            const row = headers.map(header => {
                let value = item[header] ?? '';
                value = String(value).replace(/"/g, '""');
                if (String(value).includes(',') || String(value).includes('"') || String(value).includes('\n')) return `"${value}"`;
                return value;
            });
            csvContent += row.join(',') + '\n';
        });
        return csvContent;
    }

    // --- ADDITION: Helper function to download log reports ---
    async function handleLogReportDownload(logName, apiAction, fileName) {
        try {
            const logData = await apiCall(apiAction);
            if (!logData || logData.length === 0) {
                customAlert("No Data", `No data found for the ${logName}.`);
                return;
            }
            const csvContent = jsonToCsv(logData);
            downloadCSV(csvContent, fileName);
            closeModal('reportModal');
        } catch (error) {
            customAlert("Error", `Failed to download ${logName}: ${error.message}`);
        }
    }

     function setupGlobalListeners() {
         const reportBtn = $('reportBtn'); 
         if (reportBtn) {
             reportBtn.addEventListener('click', () => openModal('reportModal'));
         } else {
             console.warn("Report button (#reportBtn) not found.");
         }
         
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
        setupInfiniteScroll(); // <-- Setup the new scroll listener
        
        const reportModal = $('reportModal');
        if (reportModal) {
            $('cancelReportModal').addEventListener('click', () => closeModal('reportModal'));
            $('downloadEmployeeDatabase').addEventListener('click', () => {
                handleExportData(); // Use the new async version
                closeModal('reportModal');
            });
            $('downloadHoldLog').addEventListener('click', () => {
                handleLogReportDownload('Hold Log', 'getHoldLog', 'salary_hold_log.csv');
            });
            $('downloadSeparationLog').addEventListener('click', () => {
                handleLogReportDownload('Separation Log', 'getSeparationLog', 'separation_log.csv');
            });
            $('downloadTransferLog').addEventListener('click', () => {
                handleLogReportDownload('Transfer Log', 'getTransferLog', 'transfer_log.csv');
            });
            $('downloadFileCloseLog').addEventListener('click', () => {
                handleLogReportDownload('File Close Log', 'getFileCloseLog', 'file_close_log.csv');
            });
        }
        
        // Setup module-specific listeners
        // Note: We pass the *full* list getter to these functions for modal operations
        if (typeof setupEmployeeListEventListeners === 'function') setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
        if (typeof setupEmployeeForm === 'function') setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
        if (typeof setupStatusChangeModal === 'function') setupStatusChangeModal(fetchAndRenderEmployees);
        if (typeof setupFileCloseModal === 'function') setupFileCloseModal(fetchAndRenderEmployees);
        if (typeof setupBulkUploadModal === 'function') setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
        if (typeof setupSalarySheetModal === 'function') setupSalarySheetModal(getMainLocalEmployees);
        if (typeof setupPastSheetsModal === 'function') {
            setupPastSheetsModal(getMainLocalEmployees, 'pastSalarySheetsBtn'); 
        }
        if (typeof setupViewDetailsModal === 'function') setupViewDetailsModal();
        if (typeof setupTransferModal === 'function') setupTransferModal(fetchAndRenderEmployees);
        
        // Initial data load (Page 1)
        fetchAndRenderEmployees(false);
    }

    // --- Run ---
    try {
        initializeApp();
    } catch (err) {
        console.error("Failed to initialize app:", err);
        const appDiv = $('app');
        const errorMsg = `Error initializing application components: ${err.message}. Please try refreshing.`;
        if (appDiv) {
            appDiv.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">${errorMsg}</p></div>`;
        } else {
            document.body.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">${errorMsg} (Fatal: #app container not found)</div>`;
        }
    }
}

// --- Run the initialization ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppModules);
} else {
    initializeAppModules();
}