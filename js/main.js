// js/main.js
import { $, debounce, customAlert } from './utils.js';
import { apiCall } from './apiClient.js';
import { setupEmployeeForm } from './employeeForm.js';
import { setupStatusChangeModal } from './statusChange.js';
import { setupViewDetailsModal } from './viewDetails.js';
import { setupTransferModal } from './transferModal.js';
import { setupSalarySheetModal } from './salarySheet.js';
import { setupPastSheetsModal } from './pastSheets.js';
import { setupLogin } from './login.js';
import { setupFileCloseModal } from './fileClosingModal.js';

// State
let allEmployees = [];
let currentPage = 1;
const limit = 30;
let totalCount = 0;
let isLoading = false;
let currentFilters = {
    name: '',
    status: 'Active,Salary Held,Resigned,Terminated', // Default statuses
    designation: '',
    functionalRole: '',
    type: '',
    project: '',
    projectOffice: '',
    reportProject: '',
    subCenter: ''
};

// DOM Elements
const searchInput = $('searchInput');
const loadMoreBtn = $('loadMoreBtn');
const totalCountDisplay = $('totalCountDisplay');

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded. Initializing app modules...");
    initializeAppModules();
});

async function initializeAppModules() {
    try {
        // Dynamic import to handle potential circular dependencies or loading order
        const {
            renderEmployeeList,
            populateFilterDropdowns,
            setupEmployeeListEventListeners
        } = await import('./employeeList.js');

        // Store functions in a closure or pass them where needed
        window.renderEmployeeList = renderEmployeeList;
        window.populateFilterDropdowns = populateFilterDropdowns;
        window.setupEmployeeListEventListeners = setupEmployeeListEventListeners;

        // Check Auth
        const user = localStorage.getItem('hrms_user');
        if (!user) {
            setupLogin(initializeApp); // Show login, pass init callback
        } else {
            initializeApp();
        }
    } catch (error) {
        console.error("Failed to load modules:", error);
    }
}

async function initializeApp() {
    console.log("Initializing HRMS App (Modular & Authenticated)...");
    $('loginSection').classList.add('hidden');
    $('appSection').classList.remove('hidden');

    // Update User Info in UI
    const userObj = JSON.parse(localStorage.getItem('hrms_user'));
    if (userObj) {
        const userNameDisplay = $('userNameDisplay');
        if (userNameDisplay) userNameDisplay.textContent = userObj.username;
    }

    // Setup Modals
    setupEmployeeForm(getStoredEmployees, fetchAndRenderEmployees); // Pass fetch as refresh callback
    setupStatusChangeModal(fetchAndRenderEmployees);
    setupViewDetailsModal();
    setupTransferModal(fetchAndRenderEmployees);
    setupSalarySheetModal(getStoredEmployees);
    setupPastSheetsModal(getStoredEmployees, 'pastSheetsBtn');
    setupFileCloseModal(fetchAndRenderEmployees); // Setup the new File Close modal

    // Setup List Event Listeners (Delegation)
    if (window.setupEmployeeListEventListeners) {
        window.setupEmployeeListEventListeners(fetchAndRenderEmployees, getStoredEmployees);
    }

    // Initial Fetch
    await fetchAndRenderEmployees(true); // reset page to 1

    // Setup Filters
    setupFilterListeners();

    // Setup Logout
    $('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('hrms_user');
        location.reload();
    });
}

function getStoredEmployees() {
    return allEmployees;
}

async function fetchAndRenderEmployees(reset = false) {
    if (isLoading) return;
    isLoading = true;

    if (reset) {
        currentPage = 1;
        allEmployees = [];
        // Clear list immediately to show loading state if desired, or keep old data until new arrives
        const list = $('employee-list');
        if(list) list.innerHTML = '<div class="col-span-full text-center py-4">Loading...</div>';
    }

    // Prepare Params
    const params = {
        page: currentPage,
        limit: limit,
        ...currentFilters
    };

    // Handle "All Statuses" logic
    if (currentFilters.status === 'All') {
        params.status = ''; // Send empty to API to get all
    }

    try {
        // === FIX: Removed renderSkeletons() call ===

        const data = await apiCall('getEmployees', 'GET', null, params);

        // === FIX: Removed removeSkeletons() call ===

        if (data && data.employees) {
            if (reset) allEmployees = data.employees;
            else allEmployees = [...allEmployees, ...data.employees];

            // Update Global Store/Cache if needed
            // ...

            if (window.renderEmployeeList) {
                window.renderEmployeeList(data.employees, !reset); // append if not reset
            }

            totalCount = data.totalCount;
            if (totalCountDisplay) totalCountDisplay.textContent = `Showing ${allEmployees.length} of ${totalCount} employees`;

            // Handle Load More Button
            if (allEmployees.length < totalCount) {
                loadMoreBtn.classList.remove('hidden');
            } else {
                loadMoreBtn.classList.add('hidden');
            }

            // Populate Filters (only on first load or explicit refresh to keep options available)
            if (reset && data.filters && window.populateFilterDropdowns) {
                window.populateFilterDropdowns(data.filters);
            }

            currentPage++;
        }
    } catch (error) {
        console.error("Fetch error:", error);
        const list = $('employee-list');
        if(list && reset) list.innerHTML = '<div class="col-span-full text-center text-red-500">Failed to load data.</div>';
    } finally {
        isLoading = false;
    }
}

function setupFilterListeners() {
    // Search Input
    searchInput.addEventListener('input', debounce(() => {
        currentFilters.name = searchInput.value.trim();
        fetchAndRenderEmployees(true);
    }, 500));

    // Load More
    loadMoreBtn.addEventListener('click', () => {
        fetchAndRenderEmployees(false);
    });

    // Helper for Selects
    const bindSelect = (id, filterKey) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('change', () => {
            currentFilters[filterKey] = el.value;
            fetchAndRenderEmployees(true);
        });
    };

    // Status Filters (TomSelect or standard select)
    // Assuming standard selects for now based on previous code structure
    // If using TomSelect, event listeners might differ slightly.

    // Bind all filter dropdowns
    const filterMap = {
        'filterStatus': 'status',
        'empDesignation': 'designation', // Note: ID matches populate function
        'empFunctionalRole': 'functionalRole',
        'empType': 'type',
        'empProject': 'project',
        'empProjectOffice': 'projectOffice',
        'empReportProject': 'reportProject',
        'empSubCenter': 'subCenter'
    };

    for (const [id, key] of Object.entries(filterMap)) {
        const el = $(id);
        if (el) {
            el.addEventListener('change', () => {
                // Special case for status 'All'
                if (key === 'status' && el.value === 'All') {
                    currentFilters[key] = '';
                } else {
                    currentFilters[key] = el.value;
                }
                fetchAndRenderEmployees(true);
            });
        }
    }

    // Reset Filters
    const resetBtn = document.querySelector('.reset-filters-btn') || $('resetFiltersBtn'); // Adjust selector if needed
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            // Reset UI
            searchInput.value = '';
            Object.keys(filterMap).forEach(id => {
                const el = $(id);
                if (el) el.value = (id === 'filterStatus') ? 'Active,Salary Held,Resigned,Terminated' : '';
            });

            // Reset State
            currentFilters = {
                name: '',
                status: 'Active,Salary Held,Resigned,Terminated',
                designation: '',
                functionalRole: '',
                type: '',
                project: '',
                projectOffice: '',
                reportProject: '',
                subCenter: ''
            };

            fetchAndRenderEmployees(true);
        });
    }

    // Background Fetch for complete list (for Salary Sheet generation)
    // This ensures we have all employees for local calculations if needed
    // or just rely on backend paging.
    // If salary sheet needs ALL data, we might trigger a background load:
    setTimeout(async () => {
        try {
            const allData = await apiCall('getEmployees', 'GET', null, { limit: 5000 });
            if (allData && allData.employees) {
                console.log(`Background fetch complete: ${allData.employees.length} employees loaded for modals.`);
                // Update the modal-specific list if separate from the main view list
                // or simply let getStoredEmployees return what's available.
                // For Salary Sheet generation, usually we want the full list.
                // Here we update a separate cache or append to allEmployees carefully?
                // Actually, for 'generateSalarySheet', we probably want a fresh full pull or use this cache.
                // Let's simply store it in a separate variable if needed, or just update allEmployees if we weren't paging.
                // Since we ARE paging, mixing full list into allEmployees breaks the list view.
                // Let's store it on window for the salary generator to grab.
                window.fullEmployeeListCache = allData.employees;
            }
        } catch (e) {
            console.warn("Background fetch failed", e);
        }
    }, 2000);
}

// Override getStoredEmployees to prefer full cache if available (for Salary Sheet)
const originalGetStored = getStoredEmployees;
window.getEmployeesForExport = function() {
    return window.fullEmployeeListCache || allEmployees;
};
// Update salary sheet setup to use this new getter
// (Note: You might need to update the call in initializeApp if you want strict correctness,
// but passing getStoredEmployees usually works if user scrolled enough,
// otherwise window.fullEmployeeListCache is safer).