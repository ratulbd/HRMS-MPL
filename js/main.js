// js/main.js

// --- Authentication Check ---
// This script runs before any module loads.
// If not logged in, redirect to login.html.
const isLoggedIn = sessionStorage.getItem('isLoggedIn');
if (isLoggedIn !== 'true' && window.location.pathname.endsWith('index.html')) {
    console.log("User not logged in. Redirecting to login page.");
    window.location.href = '/login.html';
}
// --- End Authentication Check ---

async function initializeAppModules() {
    console.log("DOM loaded. Initializing app modules...");
    
    // --- Dynamic Imports ---
    const { $, openModal, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadCSV, formatDateForInput, formatDateForDisplay } = await import('./utils.js');
    const { apiCall } = await import('./apiClient.js');
    const { setLocalEmployees, filterAndRenderEmployees, populateFilterDropdowns, setupEmployeeListEventListeners } = await import('./employeeList.js');
    const { setupEmployeeForm, openEmployeeModal } = await import('./employeeForm.js');
    const { setupStatusChangeModal, openStatusChangeModal } = await import('./statusChange.js');
    
    // --- MODIFICATION: Fixed the broken imports ---
    // We are importing 'fileClosingModal.js' (which you have)
    const { setupFileCloseModal } = await import('./fileClosingModal.js'); 
    // We are *not* importing 'holdChange.js' or 'fileClose.js' (which you don't have)
    // --- END MODIFICATION ---

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
        // --- ADDITION: Add new filter ---
        functionalRole: [],
        // --- END ADDITION ---
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
        // --- ADDITION: Get Functional Roles ---
        const functionalRoles = [...new Set(employees.map(e => e?.functionalRole).filter(Boolean))].sort();
        // --- END ADDITION ---
        const types = [...new Set(employees.map(e => e?.employeeType).filter(Boolean))].sort();
        const projects = [...new Set(employees.map(e => e?.project).filter(Boolean))].sort();
        const offices = [...new Set(employees.map(e => e?.projectOffice).filter(Boolean))].sort();
        const reportProjects = [...new Set(employees.map(e => e?.reportProject).filter(Boolean))].sort();
        const subCenters = [...new Set(employees.map(e => e?.subCenter).filter(Boolean))].sort();
        
        // --- MODIFICATION: Added 'Closed' status ---
        const statusOptions = formatOptions(['Active', 'Salary Held', 'Resigned', 'Terminated', 'Closed']);
        // --- END MODIFICATION ---

        // Update Tom Select instances
        const updateOptions = (instance, newOptions) => {
            if (instance) {
                instance.clearOptions();
                instance.addOptions(newOptions);
            }
        };

        updateOptions(tomSelects.status, statusOptions);
        updateOptions(tomSelects.designation, formatOptions(designations));
        // --- ADDITION: Update new filter ---
        updateOptions(tomSelects.functionalRole, formatOptions(functionalRoles));
        // --- END ADDITION ---
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
            populateFilterDropdowns(mainLocalEmployees); // This populates modal datalists
            updateTomSelectFilterOptions(mainLocalEmployees); // This populates dashboard TomSelects
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
            // --- ADDITION: Add new filter ---
            'filterFunctionalRole': 'functionalRole',
            // --- END ADDITION ---
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
                    name: '', status: [], designation: [], 
                    // --- ADDITION: Reset new filter ---
                    functionalRole: [], 
                    // --- END ADDITION ---
                    type: [], 
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

    // --- MODIFICATION: This function now only handles the *Employee Database* export ---
    function handleExportData() {
         if (mainLocalEmployees.length === 0) { customAlert("No Data", "No employees to export."); return; }
         
         // --- MODIFICATION: Added new fields ---
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
            "othersAdjustment", "totalDDeduction", "netSalaryPayment", "bankAccount", "status", "salaryHeld", "holdTimestamp",
            "separationDate", "remarks", "lastTransferDate", "lastSubcenter", "lastTransferReason",
            "fileCloseDate", "fileCloseRemarks"
         ];
         // --- END MODIFICATION ---
         
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
    // --- END ADDITION ---

     // --- MODIFICATION: Updated setupGlobalListeners ---
     function setupGlobalListeners() {
         // This button now opens the new report modal
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
     // --- END MODIFICATION ---

    // --- Initialize Application ---
    function initializeApp() {
        console.log("Initializing HRMS App (Modular & Authenticated)...");
        setupFilterListeners();
        setupGlobalListeners();
        
        // --- ADDITION: Setup listeners for the new Report Modal ---
        const reportModal = $('reportModal');
        if (reportModal) {
            $('cancelReportModal').addEventListener('click', () => closeModal('reportModal'));
            
            // 1. Employee Database
            $('downloadEmployeeDatabase').addEventListener('click', () => {
                handleExportData(); // Re-use the existing function
                closeModal('reportModal');
            });
            
            // 2. Hold Log
            $('downloadHoldLog').addEventListener('click', () => {
                handleLogReportDownload('Hold Log', 'getHoldLog', 'salary_hold_log.csv');
            });
            
            // 3. Separation Log
            $('downloadSeparationLog').addEventListener('click', () => {
                handleLogReportDownload('Separation Log', 'getSeparationLog', 'separation_log.csv');
            });
            
            // 4. Transfer Log
            $('downloadTransferLog').addEventListener('click', () => {
                handleLogReportDownload('Transfer Log', 'getTransferLog', 'transfer_log.csv');
            });

            // --- ADDITION: File Close Log ---
            $('downloadFileCloseLog').addEventListener('click', () => { // Assuming you add this button to index.html
                handleLogReportDownload('File Close Log', 'getFileCloseLog', 'file_close_log.csv');
            });
            // --- END ADDITION ---
        }
        // --- END ADDITION ---
        
        // Setup module-specific listeners
        if (typeof setupEmployeeListEventListeners === 'function') setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
        if (typeof setupEmployeeForm === 'function') setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
        if (typeof setupStatusChangeModal === 'function') setupStatusChangeModal(fetchAndRenderEmployees);
        
        // --- MODIFICATION: Setup new modals (and removed old broken ones) ---
        if (typeof setupFileCloseModal === 'function') setupFileCloseModal(fetchAndRenderEmployees);
        // --- END MODIFICATION ---

        if (typeof setupBulkUploadModal === 'function') setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
        if (typeof setupSalarySheetModal === 'function') setupSalarySheetModal(getMainLocalEmployees);
        
        // --- MODIFICATION: Pass the new button ID to the setup function ---
        if (typeof setupPastSheetsModal === 'function') {
            setupPastSheetsModal(getMainLocalEmployees, 'pastSalarySheetsBtn'); 
        }
        
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

// --- Run the initialization ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppModules);
} else {
    initializeAppModules();
}
