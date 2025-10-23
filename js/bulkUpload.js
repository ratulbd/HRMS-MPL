// js/bulkUpload.js
import { $, openModal, closeModal, customAlert, downloadCSV } from './utils.js';
import { apiCall } from './apiClient.js';

let mainFetchEmployeesFunc = null;
let getMainLocalEmployeesFunc = null;

function parseCsvLine(line) {
    // ... (copy your parseCsvLine logic here) ...
    const values = []; let currentVal = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) { const char = line[i];
        if (char === '"') { if (inQuotes && line[i+1] === '"') { currentVal += '"'; i++; } else { inQuotes = !inQuotes; }}
        else if (char === ',' && !inQuotes) { values.push(currentVal.trim()); currentVal = ''; }
        else { currentVal += char; }
    } values.push(currentVal.trim()); return values;
}


function parseEmployeeCSV(data) {
    try {
        const lines = data.split(/[\r\n]+/).filter(line => line.trim() !== '');
        if (lines.length < 1) throw new Error("CSV appears empty or has invalid line breaks.");

        const rawHeader = parseCsvLine(lines.shift()); // Use robust parser for header too
        const header = rawHeader.map(h => h.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));

        const fieldMapping = { /* ... copy your full fieldMapping ... */
             employeeId: 'employeeid', name: 'employeename', employeeType: 'employeetype',
             // ... all other fields ...
             salary: 'grosssalary', bankAccount: 'bankaccountnumber'
        };
         const requiredNormalizedFields = [ /* ... copy your requiredNormalizedFields ... */
             'employeeid', 'employeename', /* ... etc ... */ 'grosssalary'
         ];

        const colIndexes = {};
        for (const key in fieldMapping) {
            const normalizedHeader = fieldMapping[key];
            const index = header.indexOf(normalizedHeader);
            if (index !== -1) colIndexes[key] = index;
            else if (requiredNormalizedFields.includes(normalizedHeader)) {
                 throw new Error(`Missing required CSV column: '${rawHeader[header.indexOf(normalizedHeader)] || normalizedHeader}'`); // Show original header name if possible
            }
        }
        if (Object.keys(colIndexes).length === 0) throw new Error("Could not map any headers.");

        return lines.map((line, lineIndex) => {
            const values = parseCsvLine(line); // Use robust parser
            // Allow slightly fewer columns than headers, but log warning
            if (values.length < requiredNormalizedFields.length) {
                 console.warn(`Skipping line ${lineIndex + 2}: Too few columns (${values.length}).`);
                 return null;
            }
            const empData = {};
            for (const key in colIndexes) {
                // Check if index exists for optional columns
                if (colIndexes[key] < values.length) {
                    empData[key] = values[colIndexes[key]] ?? '';
                } else {
                    empData[key] = ''; // Default for missing optional columns
                }
            }
            // Conversions & Defaults
            empData.workExperience = parseFloat(empData.workExperience) || 0;
            empData.salary = parseFloat(empData.salary) || 0;
            empData.mobileLimit = parseFloat(empData.mobileLimit) || 0;
            empData.status = 'Active'; empData.salaryHeld = false; empData.separationDate = ''; empData.remarks = ''; empData.holdTimestamp = '';

            if (!empData.employeeId || !empData.name || !empData.joiningDate) {
                 console.warn(`Skipping line ${lineIndex + 2}: Missing required data (ID, Name, or Joining Date).`);
                 return null;
            }
            if (isNaN(empData.salary)) {
                 console.warn(`Skipping line ${lineIndex + 2}: Invalid Gross Salary.`);
                 return null;
            }
            return empData;
        }).filter(emp => emp !== null);
    } catch (error) {
         customAlert("CSV Parse Error", `Could not read file: ${error.message}`);
         console.error("CSV Parsing Error:", error);
         return null; // Return null on error
    }
}


async function bulkAddEmployees(employees) {
    if (!getMainLocalEmployeesFunc || !mainFetchEmployeesFunc) {
        customAlert("Error", "Initialization error in bulk upload.");
        return;
    }
    const currentEmployees = getMainLocalEmployeesFunc();
    const existingIds = new Set(currentEmployees.map(emp => emp.employeeId));
    let addedCount = 0, skippedCount = 0, errorCount = 0;
    const promises = [];

    for (const emp of employees) {
        // Skip if ID exists or required fields missing (already checked in parser, but double-check)
        if (!emp.employeeId || existingIds.has(emp.employeeId) || !emp.name || !emp.joiningDate || isNaN(emp.salary)) {
            skippedCount++;
            continue;
        }
        // Add API call to promise array
        promises.push(
            apiCall('saveEmployee', 'POST', emp)
                .then(() => {
                    addedCount++;
                    existingIds.add(emp.employeeId); // Prevent adding duplicates within the same file run
                })
                .catch(error => {
                    console.error(`Error adding employee ${emp.employeeId} via bulk upload:`, error);
                    errorCount++;
                    // Optionally: Keep track of specific errors to show user
                })
        );
    }

    // Wait for all API calls to finish
    await Promise.all(promises);

    closeModal('bulkUploadModal'); // Close modal after processing
    customAlert("Bulk Upload Complete", `Added: ${addedCount}. Skipped/Duplicates: ${skippedCount}. Failed: ${errorCount}.`);
    mainFetchEmployeesFunc(); // Refresh the main employee list
}

function downloadTemplate() {
    const headers = [ /* ... copy your template headers ... */
        "Employee ID", "Employee Name", "Employee Type", /* ... */ "Bank Account Number"
    ];
    downloadCSV(headers.join(','), "employee_upload_template.csv");
}

export function setupBulkUploadModal(fetchFunc, getEmployeesFunc) {
    mainFetchEmployeesFunc = fetchFunc;
    getMainLocalEmployeesFunc = getEmployeesFunc;

    const bulkUploadBtn = $('bulkUploadBtn');
    const cancelBtn = $('cancelBulkUploadModal');
    const form = $('bulkUploadForm');
    const downloadBtn = $('downloadTemplateBtn');

    if (bulkUploadBtn) bulkUploadBtn.addEventListener('click', () => {
        form?.reset(); // Reset file input
        openModal('bulkUploadModal');
    });
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('bulkUploadModal'));
    if (downloadBtn) downloadBtn.addEventListener('click', downloadTemplate);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = $('employeeFile');
            const file = fileInput?.files?.[0];
            if (!file) { customAlert("Warning", "Please select a CSV file."); return; }

            const reader = new FileReader();
            reader.onload = async (event) => {
                const csvData = event.target.result;
                const newEmployees = parseEmployeeCSV(csvData);
                if (newEmployees === null) return; // Error handled in parser

                if (newEmployees.length > 0) {
                    await bulkAddEmployees(newEmployees);
                } else {
                     customAlert("Info", "No valid new employees found in the file to upload.");
                     closeModal('bulkUploadModal'); // Close if nothing to upload
                }
                 // Reset file input after processing
                 if(fileInput) fileInput.value = '';
            };
            reader.onerror = () => {
                 customAlert("Error", "Failed to read the selected file.");
                 if(fileInput) fileInput.value = '';
            };
            reader.readAsText(file);
        });
    }
}