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

    const {
        renderEmployeeList,
        renderSkeletons,
        removeSkeletons,
        populateFilterDropdowns,
        setupEmployeeListEventListeners
    } = await import('./employeeList.js');

    // === Payslip Generator ===
    const { generatePayslipsZip } = await import('./payslipGenerator.js');

    const { setupEmployeeForm, openEmployeeModal } = await import('./employeeForm.js');
    const { setupStatusChangeModal, openStatusChangeModal } = await import('./statusChange.js');
    const { setupFileCloseModal } = await import('./fileClosingModal.js');
    const { setupBulkUploadModal } = await import('./bulkUpload.js');
    const { setupSalarySheetModal } = await import('./salarySheet.js');
    const { setupPastSheetsModal } = await import('./pastSheets.js');
    const { setupViewDetailsModal, openViewDetailsModal } = await import('./viewDetails.js');
    const { setupTransferModal, openTransferModal } = await import('./transferModal.js');

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
            // Note: apiCall defaults to useSpinner=true, which is correct here
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
                // Background fetch: Pass 'false' as 5th arg to disable spinner
                apiCall('getEmployees', 'GET', null, { limit: 5000 }, false)
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

    // === SOLVED: Fixed Loading Spinner Logic with API Control ===
    async function handlePayslipGeneration() {
        showLoading(); // 1. Manually START Global Spinner
        try {
            // 2. Fetch Meta: Pass 'false' to disable internal spinner management
            const archivesMeta = await apiCall('getSalaryArchive', 'GET', null, { metaOnly: 'true' }, false);

            if (!archivesMeta || archivesMeta.length === 0) {
                throw new Error("No past salary records found in archive.");
            }

            archivesMeta.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            const latestMeta = archivesMeta[0];
            const monthTitle = latestMeta.monthYear;

            console.log(`Fetching full data for: ${monthTitle} in chunks...`);

            let allRawData = [];
            let offset = 0;
            const LIMIT = 500;
            let hasMore = true;

            while (hasMore) {
                // 3. Fetch Chunks: Pass 'false' to keep global spinner running
                const fullArchiveResp = await apiCall('getSalaryArchive', 'GET', null, {
                    monthYear: monthTitle,
                    limit: LIMIT,
                    offset: offset
                }, false);

                if (!fullArchiveResp || fullArchiveResp.length === 0) {
                    if (offset === 0) throw new Error(`Failed to retrieve data for ${monthTitle}`);
                    break;
                }

                const batchData = fullArchiveResp[0].jsonData;
                const totalRecords = fullArchiveResp[0].totalRecords || batchData.length;

                if (Array.isArray(batchData)) {
                    allRawData = allRawData.concat(batchData);

                    if (batchData.length < LIMIT || allRawData.length >= totalRecords) {
                        hasMore = false;
                    } else {
                        offset += LIMIT;
                    }
                } else {
                    allRawData = [batchData];
                    hasMore = false;
                }
            }

            if (!Array.isArray(allRawData) || allRawData.length === 0) {
                 throw new Error("Corrupted or empty data in salary archive.");
            }

            const salaryDataForPdf = allRawData.map(emp => {
                const gross = emp.earn?.grossSalary ?? emp.salary ?? 0;
                const days = emp.att?.netPresent ?? emp.daysPresent ?? 0;
                const ded = emp.ded?.totalDeduction ?? emp.deduction ?? 0;
                const net = emp.netPayment ?? emp.netSalary ?? 0;

                return {
                    ...emp,
                    salary: gross,
                    daysPresent: days,
                    deduction: ded,
                    netSalary: net,
                    employeeId: emp.employeeId,
                    name: emp.name
                };
            });

            // 4. Heavy CPU Task (ZIP Generation)
            // Spinner is still ACTIVE here because we never turned it off
            const zipBlob = await generatePayslipsZip(salaryDataForPdf, salaryDataForPdf, monthTitle);

            const link = document.createElement("a");
            link.href = URL.createObjectURL(zipBlob);
            link.download = `Payslips_${monthTitle}.zip`;
            link.click();

            // 5. Success! Now we manually stop the spinner
            hideLoading();
            customAlert("Success", "Payslips generated and downloaded successfully.");
            closeModal('reportModal');

        } catch (error) {
            console.error(error);
            // 6. Error! Manually stop the spinner
            hideLoading();
            customAlert("Error", `Failed to generate payslips: ${error.message}`);
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
         const confirmCancel = $('confirmCancelBtn'); if (confirmCancel) confirmCancel.addEventListener('click', handleConfirmAction);
         const confirmOk = $('confirmOkBtn'); if (confirmOk) confirmOk.addEventListener('click', handleConfirmAction);
         const logoutBtn = $('logoutBtn');
         if (logoutBtn) {
             logoutBtn.addEventListener('click', () => { sessionStorage.removeItem('isLoggedIn'); sessionStorage.removeItem('loggedInUser'); window.location.href = '/login.html'; });
         }
     }

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

            // Generate Payslip Listener
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