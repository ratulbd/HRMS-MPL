// js/utils.js

// --- DOM Selector ---
export const $ = (id) => document.getElementById(id);

// --- Modal Management ---
export function openModal(modalId) { $(modalId)?.classList.remove('hidden'); }
export function closeModal(modalId) { $(modalId)?.classList.add('hidden'); }

// --- Loading Spinner ---
export const showLoading = () => $('loadingOverlay')?.classList.remove('hidden');
export const hideLoading = () => $('loadingOverlay')?.classList.add('hidden');

// --- Optional: minimal sanitization helper for innerHTML ---
// Use only if you need formatted HTML messages in alert/confirm.
// For plain text, prefer textContent instead.
function setHTMLSafe(el, html) {
  const clean = String(html)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '') // strip script blocks
    .replace(/\son\w+="[^"]*"/gi, '');                   // strip inline event handlers
  el.innerHTML = clean;
}

// --- Custom Alert ---
export function customAlert(title, message) {
  const alertModal = $('alertModal');
  if (!alertModal) {
    console.error("Alert modal element not found!");
    alert(`${title}\n${message}`);
    return;
  }
  $('alertTitle').textContent = title;
  // Choose ONE approach:
  // (A) Plain text (safe): $('alertMessage').textContent = String(message);
  // (B) Formatted HTML: setHTMLSafe($('alertMessage'), message);
  setHTMLSafe($('alertMessage'), message);
  openModal('alertModal');
}

// --- Custom Confirm (Promise-based) ---
let confirmResolve = null;
export function customConfirm(title, message) {
  return new Promise((resolve) => {
    const confirmModal = $('confirmModal');
    if (!confirmModal) {
      console.error("Confirm modal element not found!");
      // Fallback to native confirm
      resolve(confirm(String(message).replace(/\n/g, '\n')));
      return;
    }
    $('confirmTitle').textContent = title;
    setHTMLSafe($('confirmMessage'), message);
    confirmResolve = resolve;
    openModal('confirmModal');
  });
}
export function handleConfirmAction() {
  if (confirmResolve) confirmResolve(true);
  confirmResolve = null;
  closeModal('confirmModal');
}
export function handleConfirmCancel() {
  if (confirmResolve) confirmResolve(false);
  confirmResolve = null;
  closeModal('confirmModal');
}

// --- Date Formatting ---
export function formatDateForDisplay(dateString) {
  if (!dateString || typeof dateString !== 'string') return 'Invalid Date';
  try {
    let dateObj;
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length !== 3) return 'Invalid Date';
      dateObj = new Date(Date.UTC(parts[2], parts[0] - 1, parts[1]));
    } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateObj = new Date(dateString + 'T00:00:00Z');
    } else if (!isNaN(dateString) && Number(dateString) > 10000 && Number(dateString) < 60000) {
      const excelEpoch = new Date(1899, 11, 30);
      dateObj = new Date(excelEpoch.getTime() + Number(dateString) * 86400000);
    } else {
      dateObj = new Date(dateString);
    }
    if (isNaN(dateObj.getTime())) return 'Invalid Date';
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    const month = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][dateObj.getUTCMonth()];
    const year = String(dateObj.getUTCFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  } catch (e) {
    console.warn("Date parse error for display:", e);
    return 'Invalid Date';
  }
}

export function formatDateForInput(dateString) {
  if (!dateString || (typeof dateString !== 'string' && typeof dateString !== 'number')) return '';
  try {
    let dateObj = null;
    const dateValueStr = String(dateString);
    if (dateValueStr.includes('/')) {
      const parts = dateValueStr.split('/');
      if (parts.length === 3) dateObj = new Date(Date.UTC(parts[2], parts[0] - 1, parts[1]));
    } else if (!isNaN(dateString) && Number(dateString) > 10000 && Number(dateString) < 60000) {
      const excelEpoch = new Date(1899, 11, 30);
      dateObj = new Date(excelEpoch.getTime() + Number(dateString) * 86400000);
    } else if (dateValueStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateObj = new Date(dateValueStr + 'T00:00:00Z');
    } else {
      dateObj = new Date(dateValueStr);
    }
    if (dateObj && !isNaN(dateObj.getTime())) {
      const y = dateObj.getUTCFullYear();
      const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    console.warn(`Could not format date for input: ${dateString}`);
    return '';
  } catch (e) {
    console.warn(`Error converting date for input: ${dateString}`, e);
    return '';
  }
}

// --- CSV Download Helper ---
export function downloadCSV(content, fileName) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    customAlert("Error", "CSV download is not supported.");
  }
}

// --- XLSX Download Helper ---
export async function downloadXLSX(jsonData, fileName, sheetName = 'Sheet1') {
  if (typeof ExcelJS === 'undefined') {
    console.error("ExcelJS is not loaded.");
    customAlert("Error", "Could not generate XLSX file. Library not found.");
    return;
  }
  if (!jsonData || jsonData.length === 0 || !jsonData[0] || Object.keys(jsonData[0]).length === 0) {
    customAlert("No Data", "There is no data to export.");
    return;
  }
  showLoading();
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    const headers = Object.keys(jsonData[0]);
    const columns = headers.map(header => ({ name: header, filterButton: true }));
    const rows = jsonData.map(item => item ? headers.map(h => item[h]) : headers.map(() => ''));

    worksheet.addTable({
      name: 'ReportData',
      ref: 'A1',
      headerRow: true,
      columns,
      rows,
      style: { theme: 'TableStyleMedium9', showRowStripes: true }
    });

    worksheet.columns.forEach((column) => {
      let maxLang = column.header ? String(column.header).length + 2 : 10;
      column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber > 1) {
          const colWidth = cell.value ? String(cell.value).length : 10;
          if (colWidth > maxLang) maxLang = colWidth;
        }
      });
      column.width = Math.min(Math.max(maxLang + 2, 10), 50);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const finalFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", finalFileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      customAlert("Error", "XLSX download is not supported in this browser.");
    }
  } catch (error) {
    console.error("Error generating XLSX file:", error);
    customAlert("Error", `Failed to generate XLSX file: ${error.message}`);
  } finally {
    hideLoading();
  }
}
