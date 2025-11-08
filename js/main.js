// js/main.js
// --- Authentication Check ---
if (sessionStorage.getItem('isLoggedIn') !== 'true') {
    // --- User is NOT Logged In ---
    if (!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('login.html')) {
        // User is on a protected page (like index.html) but not logged in.
        console.log("User not logged in. Redirecting to login page.");
        window.location.href = '/login.html';
    } else if (window.location.pathname.endsWith('/')) {
        // User is at the root directory but not logged in.
         console.log("User not logged in at root. Redirecting to login page.");
         window.location.href = '/login.html';
    }
    // If user is on login.html and not logged in, do nothing.
    
} else {
    // --- User IS Logged In ---
    
    // --- THIS IS THE FIX ---
    if (window.location.pathname.endsWith('login.html')) {
        // User is logged in but still on the login page. Redirect to app.
        console.log("User logged in, redirecting from login to index.");
        window.location.href = '/index.html';
    
    } else {
        // User is logged in and on the correct page (index.html or root).
        // Load the app.
        console.log("User is logged in. Adding DOM listener...");
        document.addEventListener('DOMContentLoaded', initializeAppModules);
    }
    // --- END OF FIX ---
}


// --- Main App Logic (only runs if user is logged in and on the correct page) ---
async function initializeAppModules() {
    console.log("DOM loaded. Initializing app modules...");
    
    // --- Dynamic Imports ---
    const { $, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadCSV, formatDateForInput } = await import('./utils.js');
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
    let currentFilters = { 
        name: '', 
        status: [], 
        designation: [], 
        type: [], 
        project: [], 
        projectOffice: [], 
        reportProject: [], 
        subCenter: [] 
    };
    let tomSelects = {};

    // --- State Accessor ---
    const getMainLocalEmployees = () => mainLocalEmployees;
    
    // --- Helper function to populate Tom Select instances ---
    function updateTomSelectFilterOptions(employees) {
        if (!Array.isArray(employees)) employees = [];

        // Helper to create {value: 'x', text: 'x'} format
        const formatOptions = (arr) => arr.map(val => ({ value: val, text: val }));

        // Get unique, sorted lists
        const designations = [...new Set(employees.map(e => e?.designation).filter(Boolean))].sort();
        const types = [...new Set(employees.map(e => e?.employeeType).filter(Boolean))].sort();
        const projects = [...new Set(employees.map(e => e?.project).filter(Boolean))].sort();
        const offices = [...new Set(employees.map(e => e?.projectOffice).filter(Boolean))].sort();
        const reportProjects = [...new Set(employees.map(e => e?.reportProject).filter(Boolean))].sort();
        const subCenters = [...new Set(employees.map(e => e?.subCenter).filter(Boolean))].sort();
        
        // Fixed list for status
        const statusOptions = formatOptions(['Active', 'Salary Held', 'Resigned', 'Terminated']);

        // Update Tom Select instances
        const updateOptions = (instance, newOptions) => {
            if (instance) {
                instance.clearOptions();
                instance.addOptions(newOptions);
            }
        };

        updateOptions(tomSelects.status, statusOptions);
        updateOptions(tomSelects.designation, formatOptions(designations));
        updateOptions(tomSelects.type, formatOptions(types));
        updateOptions(tomSelects.project, formatOptions(projects));
        updateOptions(tomSelects.projectOffice, formatOptions(offices));
        updateOptions(tomSelects.reportProject, formatOptions(reportProjects));
        updateOptions(tomSelects.subCenter, formatOptions(subCenters));
    }

    // --- Main Fetch Function ---
    async function fetchAndRenderEmployees() {
        const countDisplay = $('filterCountDisplay');
        try {
             if (countDisplay) countDisplay.textContent = 'Loading employees...';
            const employees = await apiCall('getEmployees');
            
            if (Array.isArray(employees)) {
                employees.sort((a, b) => {
                    const dateA = new Date(formatDateForInput(a.joiningDate) || '1970-01-01');
                    const dateB = new Date(formatDateForInput(b.joiningDate) || '1970-01-01');
                    return dateB - dateA; 
                });
            }

            mainLocalEmployees = employees || [];
            setLocalEmployees(mainLocalEmployees);
            populateFilterDropdowns(mainLocalEmployees);
            updateTomSelectFilterOptions(mainLocalEmployees);
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
        const tomSelectConfig = {
            plugins: ['remove_button'],
        };

        const nameInput = $('filterName');
        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                currentFilters.name = e.target.value;
                filterAndRenderEmployees(currentFilters, mainLocalEmployees);
            });
        }

        const filterMap = {
            'filterStatus': 'status',
            'filterDesignation': 'designation',
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
                    filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                });
            } else {
                console.warn(`Filter element with ID '${elementId}' not found.`);
            }
        }

        const resetBtn = $('resetFiltersBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                currentFilters = { 
                    name: '', status: [], designation: [], type: [], 
                    project: [], projectOffice: [], reportProject: [], subCenter: [] 
                };
                if (nameInput) nameInput.value = '';
                for (const key in tomSelects) {
                    if (tomSelects[key]) {
                        tomSelects[key].clear();
                    }
                }
                filterAndRenderEmployees(currentFilters, mainLocalEmployees);
            });
        } else {
             console.warn("Reset Filters button (#resetFiltersBtn) not found.");
        }
    }

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
        if (typeof setupPastSheetsModal === 'function') setupPastSheetsModal(getMainLocalEmployees);
        if (typeof setupViewDetailsModal === 'function') setupViewDetailsModal();
        if (typeof setupTransferModal === 'function') setupTransferModal(fetchAndRenderEmployees);
        
        // Initial data load
        fetchAndRenderEmployees();
    }

    // --- Run ---
    try {
        initializeApp();
    } catch (err) {
        console.error("Failed to initialize app:", err);
        const appDiv = $('app'); // Use the imported $ function
        const errorMsg = `Error initializing application components: ${err.message}. Please try refreshing.`;
        if (appDiv) {
            // Don't wipe out the whole page, just the app area
            appDiv.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">${errorMsg}</p></div>`;
        } else {
            // Fallback if #app itself isn't found
            document.body.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">${errorMsg} (Fatal: #app container not found)</div>`;
        }
    }
}