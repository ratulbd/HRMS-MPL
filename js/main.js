// js/main.js

// --- 1. Static Imports ---
import {
    $,
    customAlert,
    closeModal,
    openModal,
    handleConfirmAction,
    handleConfirmCancel,
    downloadXLSX,
    showLoading,
    hideLoading
} from './utils.js';

import { apiCall } from './apiClient.js';

import {
    renderEmployeeList,
    renderSkeletons,
    removeSkeletons,
    populateFilterDropdowns,
    setupEmployeeListEventListeners
} from './employeeList.js';

import { generatePayslipsZip } from './payslipGenerator.js';
import { setupEmployeeForm } from './employeeForm.js';
import { setupStatusChangeModal } from './statusChange.js';
import { setupFileCloseModal } from './fileClosingModal.js';
import { setupBulkUploadModal } from './bulkUpload.js';
import { setupSalarySheetModal } from './salarySheet.js';
import { setupPastSheetsModal } from './pastSheets.js';
import { setupViewDetailsModal } from './viewDetails.js';
import { setupTransferModal } from './transferModal.js';

// --- 2. Authentication Check ---
const isLoggedIn = sessionStorage.getItem('isLoggedIn');
if (isLoggedIn !== 'true' && window.location.pathname.endsWith('index.html')) {
    window.location.href = '/login.html';
}

// --- 3. State Management ---
let mainLocalEmployees = [];
let currentFilters = {
    name: '',
    status: ['Active', 'Salary Held', 'Resigned', 'Terminated'], // Default View
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

// Getter for other modules to access the full local cache
const getMainLocalEmployees = () => mainLocalEmployees;


// --- 4. Core Data Fetching ---
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
        if (countDisplay) countDisplay.textContent = 'Loading more...';
        renderSkeletons(3, true); // Append skeletons
    } else {
        currentPage = 1;
        hasMorePages = true;
        if (countDisplay) countDisplay.textContent = 'Loading...';
        renderSkeletons(6, false); // Clear and show initial skeletons
    }

    // Prepare params for API
    const params = {
        page: currentPage,
        limit: 30,
        ...currentFilters
    };

    // Convert arrays to comma-separated strings for URL params
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

        // Populate filters only once on first load
        if (!allFiltersLoaded) {
            populateFilterDropdowns(filters);
            updateTomSelectFilterOptions(filters);
            allFiltersLoaded = true;
        }

        if (countDisplay) {
            countDisplay.textContent = `Showing ${listContainer.children.length} of ${totalCount}`;
        }

        // Background fetch for Modals (Edit/Transfer dropdowns need full lists)
        if (currentPage === 1) {
            apiCall('getEmployees', 'GET', null, { limit: 5000 }, false)
                .then(fullResponse => {
                    mainLocalEmployees = fullResponse.employees || [];
                    console.log(`Background fetch: ${mainLocalEmployees.length} records cached.`);
                });
        }

    } catch (error) {
        removeSkeletons();
        console.error(error);
        if (countDisplay) countDisplay.textContent = 'Error loading data.';
        if (listContainer && !isLoadMore) {
            listContainer.innerHTML = `<div class="col-span-full text-center p-8"><p class="text-red-500">Failed to load data.</p></div>`;
        }
    } finally {
        isLoading = false;
    }
}

// --- 5. Filtering Logic ---
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

    // Update instances if they exist (requires elements to have specific IDs in HTML)
    // Note: In index.html, ensure you have <select id="filterStatus"> etc.,
    // OR create the inputs in your Sidebar/Filter section.
    // Assuming you might add them to the filter bar later.
    if(tomSelects.status) updateOptions(tomSelects.status, statusOptions);
    if(tomSelects.designation) updateOptions(tomSelects.designation, formatOptions(filterData.designation));
    // ... map other filters similarly if UI elements exist
}

function setupFilterListeners() {
    // Basic search input listener
    const nameInput = $('globalSearch');
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

            // Clear TomSelects if implemented
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

// --- 6. Export & Reports ---
async function handleExportData() {
    try {
        const fullData = await apiCall('getEmployees', 'GET', null, { limit: 5000 });
        const employeesToExport = fullData.employees;

        if (!employeesToExport || employeesToExport.length === 0) {
            customAlert("No Data", "No employees to export.");
            return;
        }

        // Define Headers Mapping (Key in Object -> Excel Header)
        // This relies on the raw data structure
        await downloadXLSX(employeesToExport, "employee_database_export.xlsx", "Employees");

    } catch (error) {
        customAlert("Error", `Export failed: ${error.message}`);
    }
}

async function handleLogReportDownload(logName, apiAction, fileName) {
    try {
        const logData = await apiCall(apiAction);
        if (!logData || logData.length === 0) {
            customAlert("No Data", `No data found for ${logName}.`);
            return;
        }
        await downloadXLSX(logData, fileName, logName);
        closeModal('reportModal');
    } catch (error) {
        customAlert("Error", `Failed to download ${logName}: ${error.message}`);
    }
}

async function handlePayslipGeneration() {
    showLoading();
    try {
        // 1. Get Archive Meta to find latest month
        const archivesMeta = await apiCall('getSalaryArchive', 'GET', null, { metaOnly: 'true' }, false);
        if (!archivesMeta || archivesMeta.length === 0) throw new Error("No salary records found.");

        archivesMeta.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const monthTitle = archivesMeta[0].monthYear;

        // 2. Fetch Full Data for that month
        // (Simplified logic: assuming data fits in one or two calls, logic from payslipGenerator used here)
        console.log(`Generating payslips for: ${monthTitle}`);

        // Fetching with pagination handling (simplified for main.js readability)
        let allRawData = [];
        let offset = 0;
        let hasMore = true;
        while(hasMore) {
            const resp = await apiCall('getSalaryArchive', 'GET', null, { monthYear: monthTitle, limit: 200, offset }, false);
            if(!resp || resp.length === 0) break;
            const batch = resp[0].jsonData;
            allRawData = allRawData.concat(batch);
            if(batch.length < 200) hasMore = false;
            else offset += 200;
        }

        if(allRawData.length === 0) throw new Error("Archive data is empty.");

        // 3. Filter for Active/Eligible employees
        const eligibleEmployees = allRawData.filter(emp => {
            const isHeld = (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE');
            const status = (emp.status || 'Active').trim();
            // Basic filtering logic
            if (isHeld) return false;
            if (status !== 'Active') return false;
            return true;
        });

        // 4. Generate
        const zipBlob = await generatePayslipsZip(eligibleEmployees, null, monthTitle);

        // 5. Download
        const link = document.createElement("a");
        link.href = URL.createObjectURL(zipBlob);
        link.download = `Payslips_${monthTitle}.zip`;
        link.click();

        hideLoading();
        customAlert("Success", "Payslips downloaded.");
        closeModal('reportModal');

    } catch (error) {
        hideLoading();
        console.error(error);
        customAlert("Error", `Payslip generation failed: ${error.message}`);
    }
}


// --- 7. Global Listeners & Init ---
function setupGlobalListeners() {
    // Sidebar
    $('mobileMenuBtn')?.addEventListener('click', () => {
        // Logic to toggle sidebar visibility on mobile
        document.querySelector('aside')?.classList.toggle('hidden');
    });

    // Logout
    $('logoutBtn')?.addEventListener('click', () => {
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('loggedInUser');
        window.location.href = '/login.html';
    });

    // Dark Mode
    $('toggleDarkMode')?.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        const isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('darkMode', isDark);
    });

    // Modals
    $('alertOkBtn')?.addEventListener('click', () => closeModal('alertModal'));
    $('confirmOkBtn')?.addEventListener('click', handleConfirmAction);
    $('confirmCancelBtn')?.addEventListener('click', handleConfirmCancel);

    // Report Modal Actions
    $('reportBtn')?.addEventListener('click', () => openModal('reportModal'));
    $('cancelReportModal')?.addEventListener('click', () => closeModal('reportModal'));

    $('downloadEmployeeDatabase')?.addEventListener('click', handleExportData);
    $('generatePayslipBtn')?.addEventListener('click', handlePayslipGeneration);

    $('downloadHoldLog')?.addEventListener('click', () => handleLogReportDownload('Hold Log', 'getHoldLog', 'hold_log.xlsx'));
    $('downloadSeparationLog')?.addEventListener('click', () => handleLogReportDownload('Separation Log', 'getSeparationLog', 'separation_log.xlsx'));
    $('downloadTransferLog')?.addEventListener('click', () => handleLogReportDownload('Transfer Log', 'getTransferLog', 'transfer_log.xlsx'));
    $('downloadFileCloseLog')?.addEventListener('click', () => handleLogReportDownload('File Close Log', 'getFileCloseLog', 'file_close_log.xlsx'));

    // Infinite Scroll
    window.addEventListener('scroll', () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500 && !isLoading && hasMorePages) {
            fetchAndRenderEmployees(true);
        }
    });
}

function initializeApp() {
    console.log("Initializing Metal Plus HRMS...");

    // Theme Check
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark');
    }

    // Module Setups
    setupGlobalListeners();
    setupFilterListeners();

    setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
    setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
    setupStatusChangeModal(fetchAndRenderEmployees);
    setupFileCloseModal(fetchAndRenderEmployees);
    setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
    setupSalarySheetModal(getMainLocalEmployees);
    setupPastSheetsModal(getMainLocalEmployees, 'pastSalarySheetsBtn');
    setupViewDetailsModal();
    setupTransferModal(fetchAndRenderEmployees);

    // Initial Load
    fetchAndRenderEmployees(false);
}

// Start App
document.addEventListener('DOMContentLoaded', initializeApp);