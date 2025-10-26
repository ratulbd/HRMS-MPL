// js/main.js

// --- Authentication Check ---
if (sessionStorage.getItem('isLoggedIn') !== 'true') {
    // ... (redirection logic remains the same) ...
} else {
    // --- App Initialization ---
    console.log("User is logged in. Initializing app...");

    async function initializeAppModules() {
        // --- Dynamic Imports ---
        const { $, closeModal, customAlert, customConfirm, handleConfirmAction, handleConfirmCancel, downloadCSV, chartColors, getChartColorPalette } = await import('./utils.js'); // Import chart utils
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
        let currentFilters = { name: '', status: '', designation: '', type: '', projectOffice: '' }; // Include projectOffice
        let activeChartInstance = null;
        let separatedChartInstance = null;
        let heldChartInstance = null;


        // --- State Accessor ---
        const getMainLocalEmployees = () => mainLocalEmployees;

        // --- Chart Data Processing ---
        function aggregateEmployeesByOffice(employees, targetStatus) {
             const counts = {};
             if (!Array.isArray(employees)) return { labels: [], data: [] };

             employees.forEach(emp => {
                 const office = emp.projectOffice || 'Unknown';
                 let matches = false;
                 let effectiveStatus = emp.status || 'Active';
                 const isHeld = (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE');
                 if (effectiveStatus === 'Active' && isHeld) { effectiveStatus = 'Salary Held'; }

                 if (targetStatus === 'Active' && effectiveStatus === 'Active') matches = true;
                 else if (targetStatus === 'Separated' && (effectiveStatus === 'Resigned' || effectiveStatus === 'Terminated')) matches = true;
                 else if (targetStatus === 'Salary Held' && effectiveStatus === 'Salary Held') matches = true;

                 if (matches) counts[office] = (counts[office] || 0) + 1;
             });

             const labels = Object.keys(counts).sort();
             const data = labels.map(label => counts[label]);
             return { labels, data };
        }

         // --- Chart Creation/Update ---
         function createOrUpdateChart(chartInstance, canvasId, data, label, statusFilterOnClick) {
             const ctx = $(canvasId)?.getContext('2d');
             if (!ctx) { console.error(`Canvas element #${canvasId} not found.`); return null; }

             const chartData = {
                 labels: data.labels,
                 datasets: [{
                     label: label, data: data.data,
                     backgroundColor: getChartColorPalette(data.labels.length),
                     borderColor: getChartColorPalette(data.labels.length).map(color => color.replace(')', ', 0.8)')),
                     borderWidth: 1
                 }]
             };

             if (chartInstance) {
                  chartInstance.data = chartData;
                  chartInstance.options.onClick = createChartClickHandler(data, canvasId, statusFilterOnClick); // Re-assign onClick with current data closure
                  chartInstance.update();
                  return chartInstance;
             } else {
                  return new Chart(ctx, {
                      type: 'bar', data: chartData,
                      options: {
                          responsive: true, maintainAspectRatio: false,
                          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.parsed.y}` } } },
                          onClick: createChartClickHandler(data, canvasId, statusFilterOnClick) // Use closure for click handler
                      }
                  });
             }
         }

         // --- Closure Function for Chart Click Handler ---
         function createChartClickHandler(chartDataRef, chartId, statusFilterValue) {
              // This function returns the actual event handler
              return (event, elements) => {
                  if (elements.length > 0) {
                      const elementIndex = elements[0].index;
                      // Use the chartDataRef captured in the closure
                      const clickedLabel = chartDataRef.labels[elementIndex];
                      console.log(`Chart ${chartId} clicked. Label: ${clickedLabel}, Status Filter: ${statusFilterValue}`);

                      // Update filters state
                      currentFilters = {
                           name: '', // Reset other filters on chart click
                           status: statusFilterValue, // Set status based on chart
                           designation: '',
                           type: '',
                           projectOffice: clickedLabel === 'Unknown' ? '' : clickedLabel // Set project office
                      };

                      // Update UI filter elements (optional)
                      $('filterName').value = '';
                      $('filterStatus').value = statusFilterValue;
                      $('filterDesignation').value = '';
                      $('filterType').value = '';
                      $('filterAppliedInfo').textContent = `Showing: ${statusFilterValue || 'Separated'} in ${clickedLabel}`; // Display feedback
                      $('filterCardTitle').textContent = `Filtered Employee List`;

                      // Re-filter and render the employee list
                      filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                  }
              };
         }


        // --- Main Fetch Function ---
        async function fetchAndRenderEmployees() {
            try {
                const employees = await apiCall('getEmployees');
                mainLocalEmployees = employees || [];
                setLocalEmployees(mainLocalEmployees);
                populateFilterDropdowns(mainLocalEmployees);

                const activeData = aggregateEmployeesByOffice(mainLocalEmployees, 'Active');
                const separatedData = aggregateEmployeesByOffice(mainLocalEmployees, 'Separated');
                const heldData = aggregateEmployeesByOffice(mainLocalEmployees, 'Salary Held');

                activeChartInstance = createOrUpdateChart(activeChartInstance, 'activeChart', activeData, '# Active', 'Active');
                // For separated chart, clicking shows both Resigned/Terminated initially
                separatedChartInstance = createOrUpdateChart(separatedChartInstance, 'separatedChart', separatedData, '# Resigned/Terminated', ''); // Empty status filter initially
                heldChartInstance = createOrUpdateChart(heldChartInstance, 'heldChart', heldData, '# Salary Held', 'Salary Held');

                // Render based on filters (might be set by chart click before full load)
                filterAndRenderEmployees(currentFilters, mainLocalEmployees);

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
                          // Reset projectOffice filter if manual filters are changed
                          currentFilters = {
                               ...currentFilters,
                               projectOffice: '', // Clear project office from chart click
                               [filterKey]: e.target.value
                          };
                           $('filterAppliedInfo').textContent = ''; // Clear chart filter info
                           $('filterCardTitle').textContent = `Filters`; // Reset title
                          if (typeof filterAndRenderEmployees === 'function') {
                             filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                          }
                     });
                 }
             });
              const resetBtn = $('#resetFiltersBtn');
              if(resetBtn) {
                  resetBtn.addEventListener('click', () => {
                       currentFilters = { name: '', status: '', designation: '', type: '', projectOffice: '' }; // Reset all
                       $('filterName').value = '';
                       $('filterStatus').value = '';
                       $('filterDesignation').value = '';
                       $('filterType').value = '';
                        $('filterAppliedInfo').textContent = ''; // Clear chart filter info
                        $('filterCardTitle').textContent = `Filters`; // Reset title
                        if (typeof filterAndRenderEmployees === 'function') {
                            filterAndRenderEmployees(currentFilters, mainLocalEmployees);
                        }
                  });
              }
        }

        // --- Export Data ---
        function handleExportData() { /* ... (remains the same) ... */ }

         // --- Setup Global Listeners ---
         function setupGlobalListeners() { /* ... (remains the same) ... */ }

        // --- Initialize Application ---
        function initializeApp() {
            console.log("Initializing HRMS Dashboard...");
            setupFilterListeners();
            setupGlobalListeners();

            // Setup module-specific listeners
            if (typeof setupEmployeeListEventListeners === 'function') setupEmployeeListEventListeners(fetchAndRenderEmployees, getMainLocalEmployees);
            if (typeof setupEmployeeForm === 'function') setupEmployeeForm(getMainLocalEmployees, fetchAndRenderEmployees);
            if (typeof setupStatusChangeModal === 'function') setupStatusChangeModal(fetchAndRenderEmployees);
            if (typeof setupBulkUploadModal === 'function') setupBulkUploadModal(fetchAndRenderEmployees, getMainLocalEmployees);
            if (typeof setupSalarySheetModal === 'function') setupSalarySheetModal(getMainLocalEmployees);
            if (typeof setupPastSheetsModal === 'function') setupPastSheetsModal();
            if (typeof setupViewDetailsModal === 'function') setupViewDetailsModal();
            if (typeof setupTransferModal === 'function') setupTransferModal(fetchAndRenderEmployees);

            // Initial data load (triggers chart rendering)
            fetchAndRenderEmployees();

             // Show the prompt to click a chart initially
             const selectChartPrompt = $('selectChartPrompt');
             if (selectChartPrompt) selectChartPrompt.classList.remove('hidden');
        }

        // --- Run ---
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeApp);
        } else {
            initializeApp();
        }
    } // End async function initializeAppModules

    initializeAppModules().catch(err => { /* ... error handling ... */ });

} // End of the main 'else' block for authenticated users