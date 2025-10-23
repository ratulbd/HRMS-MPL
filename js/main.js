// js/main.js
import { $, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadCSV } from './utils.js';
import { apiCall } from './apiClient.js';
import { setLocalEmployees, filterAndRenderEmployees, populateFilterDropdowns, setupEmployeeListEventListeners } from './employeeList.js';
import { setupEmployeeForm, openEmployeeModal } from './employeeForm.js';
import { setupStatusChangeModal, openStatusChangeModal } from './statusChange.js';
import { setupBulkUploadModal } from './bulkUpload.js'; // openBulkUploadModal handled internally now
import { setupSalarySheetModal } from './salarySheet.js'; // openSalarySheetModal handled internally
import { setupPastSheetsModal } from './pastSheets.js'; // openPastSheetsModal handled internally
import { setupViewDetailsModal, openViewDetailsModal } from './viewDetails.js'; // Keep openViewDetailsModal if called from list

// --- Global State ---
let mainLocalEmployees = [];
let currentFilters = { name: '', status: '', designation: '', type: '' };

// --- State Accessor ---
const getMainLocalEmployees = () => mainLocalEmployees;

// --- Main Fetch Function ---
async function fetchAndRenderEmployees() {
    try {
        const employees = await apiCall('getEmployees'); // apiCall handles loading internally
        mainLocalEmployees = employees || [];
        setLocalEmployees(mainLocalEmployees); // Update list module's state if it uses one
        populateFilterDropdowns(mainLocalEmployees);
        filterAndRenderEmployees(currentFilters, mainLocalEmployees); // Pass state explicitly

        const initialLoading = $('#initialLoading');
        if(initialLoading) initialLoading.remove();

    } catch (error) {
         customAlert("Error", `Failed to load employee data: ${error.message}`);
         $('#employee-list').innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Could not load employee data.</p></div>`;
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
                  // For select elements, the key matches directly; for input 'name', it's correct.
                  currentFilters[filterKey] = e.target.value;
                  filterAndRenderEmployees(currentFilters, mainLocalEmployees);
             });
         }
     });
      const resetBtn = $('#resetFiltersBtn');
      if(resetBtn) {
          resetBtn.addEventListener('click', () => {
               currentFilters = { name: '', status: '', designation: '', type: '' };
               // Reset input/select values visually
               $('filterName').value = '';
               $('filterStatus').value = '';
               $('filterDesignation').value = '';
               $('filterType').value = '';
               filterAndRenderEmployees(currentFilters, mainLocalEmployees);
          });
      }
}

// --- Export Data ---
function handleExportData() {
     if (mainLocalEmployees.length === 0) {
        customAlert("No Data", "There are no employees to export.");
        return;
    }
    const headers = [ /* ... copy headers from index.html ... */
        "Employee ID", "Employee Name", /* ... */ "Hold Timestamp"
    ];
    const headerKeys = [ /* ... copy headerKeys from index.html ... */
        "employeeId", "name", /* ... */ "holdTimestamp"
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
    downloadCSV(csvContent, "employee_data_export.csv");
}

// --- Setup Global Listeners ---
function setupGlobalListeners() {
    // Export Button
    const exportBtn = $('exportDataBtn');
    if (exportBtn) exportBtn.addEventListener('click', handleExportData);

    // Alert/Confirm Modal Buttons
    const alertOk = $('alertOkBtn');
    if (alertOk) alertOk.addEventListener('click', () => closeModal('alertModal'));

    const confirmCancel = $('confirmCancelBtn');
    if (confirmCancel) confirmCancel.addEventListener('click', handleConfirmCancel);
    const confirmOk = $('confirmOkBtn');
    if (confirmOk) confirmOk.addEventListener('click', handleConfirmAction);

     // Top Nav buttons that open modals are handled by their respective module setups
}

// --- Initialize Application ---
function initializeApp() {
    console.log("Initializing HRMS App (Modular)...");
    setupFilterListeners();
    setupGlobalListeners(); // Export, Alert, Confirm

    // Setup module-specific listeners, passing dependencies
    // Employee List needs access to other modules' open functions and the main fetch function
    setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
    setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
    setupStatusChangeModal(fetchAndRenderEmployees);
    setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
    setupSalarySheetModal(getMainLocalEmployees);
    setupPastSheetsModal(); // Assumes it uses apiCall and displaySalarySheet internally
    setupViewDetailsModal(); // Sets up its close button

    // Initial data load
    fetchAndRenderEmployees();
}

// --- Run ---
document.addEventListener('DOMContentLoaded', initializeApp);