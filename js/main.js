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

    const { $, openModal, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadXLSX, formatDateForInput, formatDateForDisplay, showLoading, hideLoading } = await import('./utils.js');
    const { apiCall } = await import('./apiClient.js');

    // === MODIFICATION: Imported new skeleton functions ===
    const {
        renderEmployeeList,
        renderSkeletons,
        removeSkeletons,
        populateFilterDropdowns,
        setupEmployeeListEventListeners
    } = await import('./employeeList.js');
    // === END MODIFICATION ===

    // === NEW IMPORT: Payslip Generator ===
    const { generatePayslipsZip } = await import('./payslipGenerator.js');

    const { setupEmployeeForm, openEmployeeModal } = await import('./employeeForm.js');
    const { setupStatusChangeModal, openStatusChangeModal } = await import('./statusChange.js');
    const { setupFileCloseModal } = await import('./fileClosingModal.js');
    const { setupBulkUploadModal } = await import('./bulkUpload.js');
    const { setupSalarySheetModal } = await import('./salarySheet.js');
    const { setupPastSheetsModal } = await import('./pastSheets.js');
    const { setupViewDetailsModal, openViewDetailsModal } = await import('./viewDetails.js');
    const { setupTransferModal, openTransferModal } = await import('./transferModal.js');

    // ... (Existing state variables: mainLocalEmployees, currentFilters, etc.) ...
    let mainLocalEmployees = [];

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

    let currentPage = 1;
    let totalPages = 1;
    let isLoading = false;
    let hasMorePages = true;
    let allFiltersLoaded = false;

    // ... (Existing helper functions: getMainLocalEmployees, updateTomSelectFilterOptions, etc.) ...
    const getMainLocalEmployees = () => mainLocalEmployees;

    function updateTomSelectFilterOptions(filterData) {
        if (!filterData) return;

        const formatOptions = (arr) => arr.map(val => ({ value: val, text: val }));

        const statusOptions = formatOptions(['Active', 'Salary Held', 'Resigned', 'Terminated', 'Closed']);

        const updateOptions = (instance, newOptions) => {
            if (instance) {
                const currentVal = instance.getValue();
                instance.clearOptions();
                instance.addOptions(newOptions);
                instance.setValue(currentVal, true);
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


    async function fetchAndRenderEmployees(isLoadMore = false) {
        // ... (Existing fetchAndRenderEmployees logic) ...
        if (isLoading) return;
        isLoading = true;

        if (isLoadMore && !hasMorePages) {
            isLoading = false;
            return;
        }

        const countDisplay = $('filterCountDisplay');
        const listContainer = $('employee-list');

        if (isLoadMore) {
            currentPage++;
            if (countDisplay) countDisplay.textContent = 'Loading more employees...';
            renderSkeletons(3, true);
        } else {
            currentPage = 1;
            hasMorePages = true;
            if (countDisplay) countDisplay.textContent = 'Loading employees...';
            renderSkeletons(6, false);
        }

        const params = {
            page: currentPage,
            limit: 30,
            ...currentFilters
        };

        for (const key in params) {
            if (Array.isArray(params[key])) {
                params[key] = params[key].join(',');
            }
        }

        try {
            const response = await apiCall('getEmployees', 'GET', null, params);

            if (!response || !response.employees) {
                throw new Error("Invalid API response format.");
            }

            const { employees, totalPages: tPages, totalCount, filters } = response;
            totalPages = tPages;

            renderEmployeeList(employees, isLoadMore);

            hasMorePages = currentPage < totalPages;

            if (!allFiltersLoaded) {
                populateFilterDropdowns(filters);
                updateTomSelectFilterOptions(filters);
                allFiltersLoaded = true;
            }

            if (countDisplay) {
                countDisplay.textContent = `Showing ${listContainer.children.length} of ${totalCount} employees.`;
            }

            if (currentPage === 1) {
                apiCall('getEmployees', 'GET', null, { limit: 5000 })
                    .then(fullResponse => {
                        mainLocalEmployees = fullResponse.employees || [];
                        console.log(`Background fetch complete: ${mainLocalEmployees.length} employees loaded for modals.`);
                    });
            }

        } catch (error) {
             removeSkeletons();
             customAlert("Error", `Failed to load employee data: ${error.message}`);
             if(countDisplay) countDisplay.textContent = 'Error loading data.';
             if(listContainer && !isLoadMore) listContainer.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Could not load employee data.</p></div>`;
        } finally {
            isLoading = false;
        }
    }

    // ... (Existing setupFilterListeners, setupInfiniteScroll, handleExportData, handleLogReportDownload) ...
    function setupFilterListeners() {
        const tomSelectConfig = {
            plugins: ['remove_button'],
        };

        const nameInput = $('filterName');
        if (nameInput) {
            let debounceTimer;
            nameInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    currentFilters.name = e.target.value;
                    fetchAndRenderEmployees(false);
                }, 300);
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
                    fetchAndRenderEmployees(false);
                });
            } else {
                console.warn(`Filter element with ID '${elementId}' not found.`);
            }
        }

        if(tomSelects.status) {
            tomSelects.status.setValue(currentFilters.status, true);
        }

        const resetBtn = $('resetFiltersBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                currentFilters = {
                    name: '',
                    status: ['Active', 'Salary Held', 'Resigned', 'Terminated'],
                    designation: [], functionalRole: [], type: [],
                    project: [], projectOffice: [], reportProject: [], subCenter: []
                };
                if (nameInput) nameInput.value = '';
                for (const key in tomSelects) {
                    if (tomSelects[key]) {
                        const defaultVal = (key === 'status') ? currentFilters.status : [];
                        tomSelects[key].setValue(defaultVal, false);
                    }
                }
                fetchAndRenderEmployees(false);
            });
        }
    }

    function setupInfiniteScroll() {
        window.addEventListener('scroll', () => {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500 &&
                !isLoading &&
                hasMorePages) {
                console.log("Loading more employees...");
                fetchAndRenderEmployees(true);
            }
        });
    }

    async function handleExportData() {
         try {
            const fullData = await apiCall('getEmployees', 'GET', null, { limit: 5000 });
            const employeesToExport = fullData.employees;

            if (!employeesToExport || employeesToExport.length === 0) {
                customAlert("No Data", "No employees to export.");
                return;
            }
            // ... (Export Headers mapping same as previous code) ...
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
                "fileClosingDate", "fileClosingRemarks"
            ];

            const dataToExport = employeesToExport.map(emp => {
                const newRow = {};
                headerKeys.forEach((key, index) => {
                    const headerName = headers[index];
                    let value = emp[key] ?? '';
                    if (key === 'salaryHeld') {
                        value = (value === true || String(value).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
                    }
                    newRow[headerName] = value;
                });
                return newRow;
            });

            await downloadXLSX(dataToExport, "employee_data_export.xlsx", "Employees");

         } catch (error) {
             customAlert("Error", `Failed to export data: ${error.message}`);
         }
    }

    async function handleLogReportDownload(logName, apiAction, fileName) {
        try {
            const logData = await apiCall(apiAction);
            if (!logData || logData.length === 0) {
                customAlert("No Data", `No data found for the ${logName}.`);
                return;
            }
            await downloadXLSX(logData, fileName, logName);
            closeModal('reportModal');
        } catch (error) {
            customAlert("Error", `Failed to download ${logName}: ${error.message}`);
        }
    }

    // === NEW: Handle Payslip Generation ===
    async function handlePayslipGeneration() {
        showLoading();
        try {
            // 1. Fetch Past Sheets to find the last generated one
            const pastSheets = await apiCall('getPastSheets');
            if (!pastSheets || pastSheets.length === 0) {
                throw new Error("No past salary sheets found.");
            }
            // Sort to get the latest (assuming sheet IDs are sortable or standard format "Month-Year")
            // Ideally, the API returns them in a list. We pick the first or implement sort if needed.
            // Assuming format like "2025-10" or similar, reverse sorting works.
            const latestSheet = pastSheets[pastSheets.length - 1]; // Simply picking the last one added

            // 2. Fetch Data from the Latest Sheet
            const sheetDataResponse = await apiCall('getSheetData', 'GET', null, { sheetId: latestSheet.sheetId });
            if (!sheetDataResponse || !sheetDataResponse.sheetData) {
                throw new Error(`Failed to load data for sheet: ${latestSheet.sheetId}`);
            }

            // 3. Ensure we have the full employee DB for details (Designation, etc.)
            let employeesDB = mainLocalEmployees;
            if (!employeesDB || employeesDB.length === 0) {
                const fullResp = await apiCall('getEmployees', 'GET', null, { limit: 5000 });
                employeesDB = fullResp.employees;
            }

            // 4. Generate ZIP
            const monthTitle = latestSheet.sheetId; // e.g., "Oct_2025" or similar
            const zipBlob = await generatePayslipsZip(sheetDataResponse.sheetData, employeesDB, monthTitle);

            // 5. Trigger Download
            const link = document.createElement("a");
            link.href = URL.createObjectURL(zipBlob);
            link.download = `Payslips_${monthTitle}.zip`;
            link.click();

            customAlert("Success", "Payslips generated and downloaded successfully.");
            closeModal('reportModal');

        } catch (error) {
            console.error(error);
            customAlert("Error", `Failed to generate payslips: ${error.message}`);
        } finally {
            hideLoading();
        }
    }

    function setupAutoLogout() {
        const IDLE_TIMEOUT = 20 * 60 * 1000;
        let idleTimer;
        const logoutUser = () => {
            sessionStorage.removeItem('isLoggedIn');
            sessionStorage.removeItem('loggedInUser');
            window.location.href = '/login.html';
        };
        const resetTimer = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(logoutUser, IDLE_TIMEOUT);
        };
        const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'];
        activityEvents.forEach(event => {
            document.addEventListener(event, resetTimer, { passive: true });
        });
        resetTimer();
    }

     function setupGlobalListeners() {
         const reportBtn = $('reportBtn');
         if (reportBtn) {
             reportBtn.addEventListener('click', () => openModal('reportModal'));
         }

         const alertOk = $('alertOkBtn'); if (alertOk) alertOk.addEventListener('click', () => closeModal('alertModal'));
         const confirmCancel = $('confirmCancelBtn'); if (confirmCancel) confirmCancel.addEventListener('click', handleConfirmCancel);
         const confirmOk = $('confirmOkBtn'); if (confirmOk) confirmOk.addEventListener('click', handleConfirmAction);
         const logoutBtn = $('logoutBtn');
         if (logoutBtn) {
             logoutBtn.addEventListener('click', () => { sessionStorage.removeItem('isLoggedIn'); sessionStorage.removeItem('loggedInUser'); window.location.href = '/login.html'; });
         }
     }

    // --- Initialize Application ---
    function initializeApp() {
        console.log("Initializing HRMS App (Modular & Authenticated)...");
        setupAutoLogout();
        setupFilterListeners();
        setupGlobalListeners();
        setupInfiniteScroll();

        const reportModal = $('reportModal');
        if (reportModal) {
            $('cancelReportModal').addEventListener('click', () => closeModal('reportModal'));
            $('downloadEmployeeDatabase').addEventListener('click', () => {
                handleExportData();
                closeModal('reportModal');
            });
            $('downloadHoldLog').addEventListener('click', () => {
                handleLogReportDownload('Hold Log', 'getHoldLog', 'salary_hold_log.xlsx');
            });
            $('downloadSeparationLog').addEventListener('click', () => {
                handleLogReportDownload('Separation Log', 'getSeparationLog', 'separation_log.xlsx');
            });
            $('downloadTransferLog').addEventListener('click', () => {
                handleLogReportDownload('Transfer Log', 'getTransferLog', 'transfer_log.xlsx');
            });
            $('downloadFileCloseLog').addEventListener('click', () => {
                handleLogReportDownload('File Close Log', 'getFileCloseLog', 'file_close_log.xlsx');
            });
            // NEW LISTENER
            $('generatePayslipBtn').addEventListener('click', handlePayslipGeneration);
        }

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

    try {
        initializeApp();
    } catch (err) {
        console.error("Failed to initialize app:", err);
        const appDiv = $('app');
        if (appDiv) {
            appDiv.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Error initializing application components: ${err.message}</p></div>`;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppModules);
} else {
    initializeAppModules();
}