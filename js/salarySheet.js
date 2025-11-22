// js/salarySheet.js
import { $, customAlert, closeModal } from './utils.js';
import { apiCall } from './apiClient.js';
// Relying on global Papa, JSZip, and ExcelJS loaded via index.html script tags

export function setupSalarySheetModal(getEmployeesFunc) {
  const modal = $('attendanceModal');
// ... (Lines 11-44: setup)

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const monthVal = $('salaryMonth').value;          // YYYY-MM
      const attendanceFile = $('attendanceFile').files[0];
      const holderFile = $('accountabilityFile').files[0];

      if (!monthVal || !attendanceFile || !holderFile) {
// ... (Lines 53-56: validation)

      try {
        const employees = getEmployeesFunc();
// ... (Lines 60-67: data parsing)

        customAlert("Processing", "Generating report project wise sheets...");
        const zipContent = await generateProjectWiseZip(employees, attendanceData, holderData, monthVal);

        // --- ADDITION: ARCHIVE THE DATA (NEW LOGIC CALL) ---
        customAlert("Processing", "Archiving data for record keeping...");
        const archiveData = {
          monthYear: monthVal,
          timestamp: new Date().toISOString(),
          jsonData: employees // Send the full calculated employee data array
        };
        await apiCall('saveSalaryArchive', 'POST', archiveData); // This triggers the multi-row save

        // --- CONTINUE WITH DOWNLOAD ---
        const link = document.createElement('a');
// ... (Lines 77-83: download and closing)
      } catch (error) {
// ... (Lines 86-89: error handling)
      }
    });
  }
}

/* ---------------- CSV & validation ---------------- */
// ... (Lines 94-118: parseCSV, validateAttendanceHeaders, validateHolderHeaders)

/* ---------------- Utilities ---------------- */
// ... (Lines 121-147: convertNumberToWords, getFormattedMonthYear)

/* ---------------- MAIN GENERATION ---------------- */
// ... (Lines 150-427: generateProjectWiseZip)
async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal) {
// ... (The large function body remains unchanged, ensuring employees is correctly mutated with netPayment, etc.)
}