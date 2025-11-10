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
    document.addEventListener('DOMContentLoaded', initializeAppModules);
  }
}

// --- Main App Logic ---
async function initializeAppModules() {
  // --- CARD ACTION BUTTONS: compact pills mapper ---
  try {
    const classifyButtons = (root = document) => {
      const btns = root.querySelectorAll('.employee-card button, .employee-card .btn');
      btns.forEach(b => {
        const t = (b.textContent ?? '').toLowerCase().trim();
        b.classList.add('btn', 'btn-chip');
        if (t.includes('terminate')) { b.classList.add('chip-danger'); }
        else if (t.includes('resign')) { b.classList.add('chip-warning'); }
        else if (t.includes('hold salary') || t.includes('unhold salary')) { b.classList.add('chip-brand'); }
        else if (t.includes('transfer')) { b.classList.add('chip-brand'); }
        else if (t.includes('edit')) { b.classList.add('chip-neutral'); }
        else if (t.includes('view details')) { b.classList.add('chip-neutral'); }
      });
    };
    classifyButtons();
    const list = document.querySelector('#employee-list');
    if (list) {
      const mo = new MutationObserver(() => classifyButtons(list));
      mo.observe(list, { childList: true, subtree: true });
    }
  } catch (e) {
    console.warn('Card button mapper failed:', e);
  }

  // --- Ripple micro-interaction (global) ---
  try {
    const addRipple = (e) => {
      const target = e.target.closest('button, .btn');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      target.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    };
    document.addEventListener('click', addRipple);
  } catch (e) {}

  // --- Dynamic Imports ---
  const { $, openModal, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadCSV, formatDateForInput } = await import('/js/utils.js');
  const { apiCall } = await import('/js/apiClient.js');
  const { setLocalEmployees, filterAndRenderEmployees, populateFilterDropdowns, setupEmployeeListEventListeners } = await import('/js/employeeList.js');
  const { setupEmployeeForm } = await import('/js/employeeForm.js');
  const { setupStatusChangeModal } = await import('/js/statusChange.js');
  const { setupBulkUploadModal } = await import('/js/bulkUpload.js');
  const { setupSalarySheetModal } = await import('/js/salarySheet.js');
  const { setupPastSheetsModal } = await import('/js/pastSheets.js');
  const { setupViewDetailsModal } = await import('/js/viewDetails.js');
  const { setupTransferModal } = await import('/js/transferModal.js');

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
  const getMainLocalEmployees = () => mainLocalEmployees;

  // --- Populate Tom Select instances (guarded) ---
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
      const employees = await apiCall('getEmployees');
      if (Array.isArray(employees)) {
        employees.sort((a, b) => {
          const dateA = new Date(formatDateForInput(a.joiningDate) ?? '1970-01-01');
          const dateB = new Date(formatDateForInput(b.joiningDate) ?? '1970-01-01');
          return dateB - dateA;
        });
      }
      mainLocalEmployees = employees ?? [];
      setLocalEmployees(mainLocalEmployees);
      populateFilterDropdowns(mainLocalEmployees);
      updateTomSelectFilterOptions(mainLocalEmployees);
      filterAndRenderEmployees(currentFilters, mainLocalEmployees);
      const initialLoading = $('#initialLoading');
      if (initialLoading) initialLoading.remove();
    } catch (error) {
      customAlert("Error", `Failed to load employee data: ${error.message}`);
      if (countDisplay) countDisplay.textContent = 'Error loading data.';
      const employeeListElement = $('#employee-list');
      if (employeeListElement) {
        employeeListElement.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow"><p class="text-red-500 font-semibold">Could not load employee data.</p></div>`;
      }
      const initialLoading = $('#initialLoading');
      if (initialLoading) initialLoading.remove();
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
      if (!el) continue;

      if (hasTomSelect) {
        tomSelects[filterKey] = new TomSelect(el, tomSelectConfig);
        tomSelects[filterKey].on('change', (values) => {
          currentFilters[filterKey] = values;
          filterAndRenderEmployees(currentFilters, mainLocalEmployees);
        });
      } else {
        // Fallback to native multi-select
        el.addEventListener('change', () => {
          const values = Array.from(el.options).filter(o => o.selected).map(o => o.value);
          currentFilters[filterKey] = values;
          filterAndRenderEmployees(currentFilters, mainLocalEmployees);
        });
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
        for (const key in tomSelects) if (tomSelects[key]) tomSelects[key].clear();
        if (!hasTomSelect) {
          for (const id of Object.keys(filterMap)) {
            const s = $(id);
            if (s) Array.from(s.options).forEach(o => o.selected = false);
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
      closeModalWithLock('reportModal');
    } catch (error) {
      customAlert("Error", `Failed to download ${logName}: ${error.message}`);
    }
  }

  // --- Modal helpers: add body scroll lock while open ---
  const _openModal = openModal;
  const _closeModal = closeModal;
  function openModalWithLock(id)  { document.body.classList.add('modal-open');  _openModal(id); }
  function closeModalWithLock(id) { _closeModal(id); document.body.classList.remove('modal-open'); }

  // --- Global Listeners ---
  function setupGlobalListeners() {
    document.getElementById('reportBtn')?.addEventListener('click', () => openModalWithLock('reportModal'));
    document.getElementById('alertOkBtn')?.addEventListener('click', () => closeModalWithLock('alertModal'));
    document.getElementById('confirmCancelBtn')?.addEventListener('click', handleConfirmCancel);
    document.getElementById('confirmOkBtn')?.addEventListener('click', handleConfirmAction);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      sessionStorage.removeItem('isLoggedIn');
      sessionStorage.removeItem('loggedInUser');
      window.location.href = '/login.html';
    });

    // Close modals when clicking backdrop or any [data-close]
    document.addEventListener('click', (e) => {
      const closeEl = e.target.closest('[data-close]');
      if (closeEl) {
        const modal = closeEl.closest('.modal');
        if (modal?.id) closeModalWithLock(modal.id);
      }
    });

    // Report Modal button bindings
    const reportModal = document.getElementById('reportModal');
    if (reportModal) {
      document.getElementById('cancelReportModal')?.addEventListener('click', () => closeModalWithLock('reportModal'));
      document.getElementById('downloadEmployeeDatabase')?.addEventListener('click', () => {
        handleExportData();
        closeModalWithLock('reportModal');
      });
      document.getElementById('downloadHoldLog')?.addEventListener('click', () =>
        handleLogReportDownload('Hold Log', 'getHoldLog', 'salary_hold_log.csv')
      );
      document.getElementById('downloadSeparationLog')?.addEventListener('click', () =>
        handleLogReportDownload('Separation Log', 'getSeparationLog', 'separation_log.csv')
      );
      document.getElementById('downloadTransferLog')?.addEventListener('click', () =>
        handleLogReportDownload('Transfer Log', 'getTransferLog', 'transfer_log.csv')
      );
    }
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
    setupGlobalListeners();

    // Module listeners
    if (typeof setupEmployeeListEventListeners === 'function')
      setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
    if (typeof setupEmployeeForm === 'function')
      setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
    if (typeof setupStatusChangeModal === 'function')
      setupStatusChangeModal(fetchAndRenderEmployees);
    if (typeof setupBulkUploadModal === 'function')
      setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
    if (typeof setupSalarySheetModal === 'function')
      setupSalarySheetModal(getMainLocalEmployees);
    if (typeof setupPastSheetsModal === 'function')
      setupPastSheetsModal(getMainLocalEmployees, 'pastSalarySheetsBtn');
    if (typeof setupViewDetailsModal === 'function')
      setupViewDetailsModal();
    if (typeof setupTransferModal === 'function')
      setupTransferModal(fetchAndRenderEmployees);

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
  }
}
