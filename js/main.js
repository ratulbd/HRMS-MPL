// js/main.js
// --- Authentication Check ---
if (sessionStorage.getItem('isLoggedIn') !== 'true') {
  if (!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('login.html')) {
    window.location.href = '/login.html';
  } else if (window.location.pathname.endsWith('/')) {
    window.location.href = '/login.html';
  }
} else {
  if (window.location.pathname.endsWith('login.html')) {
    window.location.href = '/index.html';
  } else {
    // We are logged in and on the correct page, wait for DOM to load
    document.addEventListener('DOMContentLoaded', initializeAppModules);
  }
}

// --- Main App Logic ---
async function initializeAppModules() {
  
  // --- Dynamic Imports ---
  const { $, openModal, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadCSV, formatDateForInput } = await import('./utils.js');
  const { apiCall } = await import('./apiClient.js');
  const { setLocalEmployees, filterAndRenderEmployees, populateFilterDropdowns, setupEmployeeListEventListeners } = await import('./employeeList.js');
  const { setupEmployeeForm } = await import('./employeeForm.js');
  const { setupStatusChangeModal } = await import('./statusChange.js');
  const { setupBulkUploadModal } = await import('./bulkUpload.js');
  const { setupSalarySheetModal } = await import('./salarySheet.js');
  const { setupPastSheetsModal } = await import('./pastSheets.js');
  const { setupViewDetailsModal } = await import('./viewDetails.js');
  const { setupTransferModal } = await import('./transferModal.js');

  // --- Global State ---
  let mainLocalEmployees = [];
  let currentFilters = {
    name: '', status: [], designation: [], type: [],
    project: [], projectOffice: [], reportProject: [], subCenter: []
  };
  let tomSelects = {};
  const getMainLocalEmployees = () => mainLocalEmployees;

  // --- Populate Tom Select instances ---
  function updateTomSelectFilterOptions(employees) {
    if (!Array.isArray(employees)) employees = [];
    const formatOptions = (arr) => arr.map(val => ({ value: val, text: val }));
    const designations   = [...new Set(employees.map(e => e?.designation).filter(Boolean))].sort();
    const types          = [...new Set(employees.map(e => e?.employeeType).filter(Boolean))].sort();
    const projects       = [...new Set(employees.map(e => e?.project).filter(Boolean))].sort();
    const offices        = [...new Set(employees.map(e => e?.projectOffice).filter(Boolean))].sort();
    const reportProjects = [...new Set(employees.map(e => e?.reportProject).filter(Boolean))].sort();
    const subCenters     = [...new Set(employees.map(e => e?.subCenter).filter(Boolean))].sort();
    const statusOptions  = formatOptions(['Active', 'Salary Held', 'Resigned', 'Terminated']);

    const updateOptions = (instance, newOptions) => { if (instance) { instance.clearOptions(); instance.addOptions(newOptions); } };
    
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
    const countDisplay = $('#filterCountDisplay');
    try {
      if (countDisplay) countDisplay.textContent = 'Loading employees...';
      $('#initialLoading')?.classList?.remove('hidden');
      
      const employees = await apiCall('getEmployees');
      
      if (Array.isArray(employees)) {
        employees.sort((a, b) => {
          const dateA = new Date(formatDateForInput(a.joiningDate) ?? '1970-01-01');
          const dateB = new Date(formatDateForInput(b.joiningDate) ?? '1970-01-01');
          return dateB - dateA; // Sort descending (newest first)
        });
      }
      mainLocalEmployees = employees ?? [];
      setLocalEmployees(mainLocalEmployees);
      
      populateFilterDropdowns(mainLocalEmployees); 
      updateTomSelectFilterOptions(mainLocalEmployees); 
      filterAndRenderEmployees(currentFilters, mainLocalEmployees);
      
      const initialLoading = $('#initialLoading');
      if (initialLoading) initialLoading.style.display = 'none';
      
    } catch (error) {
      console.error("Failed to load employee data:", error);
      customAlert("Error", `Failed to load employee data: ${error.message}`);
      if (countDisplay) countDisplay.textContent = 'Error loading data.';
      const employeeListElement = $('#employee-list');
      if (employeeListElement) {
        employeeListElement.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Could not load employee data.</p></div>`;
      }
      const initialLoading = $('#initialLoading');
      if (initialLoading) initialLoading.style.display = 'none';
    }
  }

  // --- Setup Filter Listeners ---
  function setupFilterListeners() {
    const nameInput = $('#filterName');
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

    const tomSelectConfig = { plugins: ['remove_button'] };
    const hasTomSelect = typeof TomSelect !== 'undefined';

    for (const [elementId, filterKey] of Object.entries(filterMap)) {
      const el = $(elementId);
      if (!el) {
        console.warn(`Filter element #${elementId} not found.`);
        continue;
      }

      if (hasTomSelect) {
        if (!tomSelects[filterKey]) { 
            tomSelects[filterKey] = new TomSelect(el, tomSelectConfig);
        }
        tomSelects[filterKey].on('change', (values) => {
          currentFilters[filterKey] = values;
          filterAndRenderEmployees(currentFilters, mainLocalEmployees);
        });
      } else {
        console.warn("TomSelect is not loaded. Filters will not work correctly.");
      }
    }

    const resetBtn = $('#resetFiltersBtn');
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
    }
  }

  // --- JSON -> CSV helper (for logs) ---
  function jsonToCsv(jsonData) {
    if (!jsonData || jsonData.length === 0) return "";
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

  // --- Download log reports ---
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
  
  // --- Global Listeners ---
  function setupGlobalListeners() {
    // Top nav buttons
    $('#reportBtn')?.addEventListener('click', () => openModal('reportModal'));
    $('#logoutBtn')?.addEventListener('click', async () => {
      const confirmed = await customConfirm("Confirm Logout", "Are you sure you want to log out?");
      if (confirmed) {
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('loggedInUser');
        window.location.href = '/login.html';
      }
    });

    // Modal close buttons
    $('#alertOkBtn')?.addEventListener('click', () => closeModal('alertModal'));
    $('#confirmCancelBtn')?.addEventListener('click', handleConfirmCancel);
    $('#confirmOkBtn')?.addEventListener('click', handleConfirmAction);

    // Generic modal close triggers (backdrop, 'x' buttons)
    $('#cancelEmployeeModal_top')?.addEventListener('click', (e) => { e.preventDefault(); closeModal('employeeModal'); });
    $('#cancelEmployeeModal')?.addEventListener('click', (e) => { e.preventDefault(); closeModal('employeeModal'); });
    $('#cancelBulkUploadModal')?.addEventListener('click', () => closeModal('bulkUploadModal'));
    $('#cancelStatusChangeModal')?.addEventListener('click', () => closeModal('statusChangeModal'));
    $('#closeViewDetailsModal')?.addEventListener('click', () => closeModal('viewDetailsModal'));
    $('#cancelAttendanceModal')?.addEventListener('click', () => closeModal('attendanceModal'));
    $('#closeSheetModal')?.addEventListener('click', () => closeModal('salarySheetModal'));
    $('#closePastSheetsModal')?.addEventListener('click', () => closeModal('viewSheetsModal'));
    $('#cancelTransferModal')?.addEventListener('click', () => closeModal('transferModal'));
    
    // --- THIS WAS THE FIX ---
    // Removed the underscore from 'addEventListener_'
    $('#cancelReportModal')?.addEventListener('click', () => closeModal('reportModal'));
    // --- END OF FIX ---

    // Report Modal button bindings
    $('#downloadEmployeeDatabase')?.addEventListener('click', () => {
        handleExportData();
        closeModal('reportModal');
      });
    $('#downloadHoldLog')?.addEventListener('click', () =>
        handleLogReportDownload('Hold Log', 'getHoldLog', 'salary_hold_log.csv')
      );
    $('#downloadSeparationLog')?.addEventListener('click', () =>
        handleLogReportDownload('Separation Log', 'getSeparationLog', 'separation_log.csv')
      );
    $('#downloadTransferLog')?.addEventListener('click', () =>
        handleLogReportDownload('Transfer Log', 'getTransferLog', 'transfer_log.csv')
      );
  }

  // --- Export: Employee Database only ---
  function handleExportData() {
    if (mainLocalEmployees.length === 0) {
      customAlert("No Data", "No employees to export.");
      return;
    }
    const headers = [
      "Employee ID","Employee Name","Employee Type","Designation","Joining Date","Project","Project Office","Report Project","Sub Center",
      "Work Experience (Years)","Education","Father's Name","Mother's Name","Personal Mobile Number","Official Mobile Number",
      "Mobile Limit","Date of Birth","Blood Group","Address","Identification Type","Identification","Nominee's Name",
      "Nominee's Mobile Number","Previous Salary","Basic","Others","Gross Salary","Motobike / Car Maintenance Allowance","Laptop Rent",
      "Others Allowance","Arrear","Food Allowance","Station Allowance","Hardship Allowance","Grand Total","Gratuity",
      "Subsidized Lunch","TDS","Motorbike Loan","Welfare Fund","Salary/ Others Loan","Subsididized Vehicle","LWP","CPF",
      "Others Adjustment","Total Deduction","Net Salary Payment","Bank Account Number","Status","Salary Held","Hold Timestamp",
      "Separation Date","Remarks","Last Transfer Date","Last Subcenter","Last Transfer Reason"
    ];
    const headerKeys = [
      "employeeId","name","employeeType","designation","joiningDate","project","projectOffice","reportProject","subCenter",
      "workExperience","education","fatherName","motherName","personalMobile","officialMobile",
      "mobileLimit","dob","bloodGroup","address","identificationType","identification","nomineeName",
      "nomineeMobile","previousSalary","basic","others","salary","motobikeCarMaintenance","laptopRent",
      "othersAllowance","arrear","foodAllowance","stationAllowance","hardshipAllowance","grandTotal","gratuity",
      "subsidizedLunch","tds","motorbikeLoan","welfareFund","salaryOthersLoan","subsidizedVehicle","lwp","cpf",
      "othersAdjustment","totalDeduction","netSalaryPayment","bankAccount","status","salaryHeld","holdTimestamp",
      "separationDate","remarks","lastTransferDate","lastSubcenter","lastTransferReason"
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

  // --- Initialize Application ---
  function initializeApp() {
    setupFilterListeners();
    setupGlobalListeners(); // This was crashing, but is now fixed.

    try {
      if (typeof setupEmployeeListEventListeners === 'function')
        setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
      if (typeof setupEmployeeForm === 'function')
        setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
      if (typeof setupStatusChangeModal === 'function')
        setupStatusChangeModal(fetchAndRenderEmployees);
      if (typeof setupBulkUploadModal === 'function')
        setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
      if (typeof setupSalarySheetModal === 'function')
        setupSalarySheetModal(getMainLocalEmployees, $('#uploadAttendanceBtn'));
      if (typeof setupPastSheetsModal === 'function')
        setupPastSheetsModal(getMainLocalEmployees, 'pastSalarySheetsBtn');
      if (typeof setupViewDetailsModal === 'function')
        setupViewDetailsModal();
      if (typeof setupTransferModal === 'function')
        setupTransferModal(fetchAndRenderEmployees);
    } catch (setupError) {
        console.error("Error during module setup:", setupError);
        customAlert("Initialization Error", `A part of the application failed to load: ${setupError.message}`);
    }

    // Initial load
    fetchAndRenderEmployees();
  }

  // --- Run ---
  try {
    initializeApp();
  } catch (err) {
    const appDiv = $('app');
    const errorMsg = `Error initializing application components: ${err.message}. Please try refreshing.`;
    if (appDiv) {
      appDiv.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">${errorMsg}</p></div>`;
    } else {
      document.body.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">${errorMsg} (Fatal: #app container not found)</div>`;
    }
    console.error("Fatal Initialization Error:", err);
  }
}