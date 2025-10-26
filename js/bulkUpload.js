// js/bulkUpload.js
import { $, openModal, closeModal, customAlert, downloadCSV } from './utils.js';
import { apiCall } from './apiClient.js';

let mainFetchEmployeesFunc = null;
let getMainLocalEmployeesFunc = null;

// Robust CSV Line Parser
function parseCsvLine(line) {
    const values = []; let currentVal = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i+1] === '"') { currentVal += '"'; i++; } // Escaped quote
            else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) {
            values.push(currentVal.trim()); currentVal = '';
        } else {
            currentVal += char;
        }
    }
    values.push(currentVal.trim()); // Add last value
    return values;
}

// Parses CSV data into employee objects
function parseEmployeeCSV(data) {
    try {
        const lines = data.split(/[\r\n]+/).filter(line => line.trim() !== ''); // Split lines, remove empty ones
        if (lines.length < 1) throw new Error("CSV appears empty or has invalid line breaks.");

        const rawHeader = parseCsvLine(lines.shift()); // Parse header line
        // Normalize headers for matching: lowercase, remove parens, quotes, multiple spaces
        const header = rawHeader.map(h => h.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));

        // Define mapping from JS key to normalized header expected in CSV
        const fieldMapping = {
            employeeId: 'employeeid', name: 'employeename', employeeType: 'employeetype',
            designation: 'designation', joiningDate: 'joiningdate', project: 'project',
            projectOffice: 'projectoffice', reportProject: 'reportproject', subCenter: 'subcenter',
            workExperience: 'workexperience', education: 'education', fatherName: 'fathersname',
            motherName: 'mothersname', personalMobile: 'personalmobilenumber', dob: 'dateofbirth',
            bloodGroup: 'bloodgroup', address: 'address', identification: 'identification',
            nomineeName: 'nomineesname', nomineeMobile: 'nomineesmobilenumber', salary: 'grosssalary',
            officialMobile: 'officialmobilenumber', mobileLimit: 'mobilelimit', bankAccount: 'bankaccountnumber'
             // Add mappings for any other fields you expect in the bulk upload CSV
             // e.g., basic: 'basic', tds: 'tds'
        };

        // Define which fields from the mapping are absolutely required
         const requiredNormalizedFields = [
             'employeeid', 'employeename', 'employeetype', 'designation', 'joiningdate', 'project',
             'projectoffice', 'reportproject', 'subcenter', 'personalmobilenumber', 'dob',
             'address', 'identification', 'grosssalary' // Adjusted based on mandatory fields request
          ];

        // Find column index for each mapped field
        const colIndexes = {};
        let missingHeaders = [];
        for (const key in fieldMapping) {
            const normalizedHeader = fieldMapping[key];
            const index = header.indexOf(normalizedHeader);
            if (index !== -1) {
                colIndexes[key] = index;
            } else if (requiredNormalizedFields.includes(normalizedHeader)) {
                // Try to find original header name for better error message
                const originalHeaderIndex = Object.values(fieldMapping).indexOf(normalizedHeader);
                const originalHeaderName = Object.keys(fieldMapping)[originalHeaderIndex]; // This gives the JS key, maybe not ideal
                 // A better approach would be to map originalHeaderNames based on index if needed
                 missingHeaders.push(normalizedHeader); // Add normalized header name if original mapping complex
            }
        }
         if(missingHeaders.length > 0) {
              throw new Error(`Missing required CSV columns: ${missingHeaders.join(', ')}`);
         }
        if (Object.keys(colIndexes).length === 0) throw new Error("Could not map any headers.");

        // Process data rows
        return lines.map((line, lineIndex) => {
            const values = parseCsvLine(line);
            if (values.length < requiredNormalizedFields.length) { // Check against number of required fields minimum
                 console.warn(`Skipping line ${lineIndex + 2}: Too few columns (${values.length}).`); return null;
            }
            const empData = {};
            for (const key in colIndexes) {
                if (colIndexes[key] < values.length) empData[key] = values[colIndexes[key]] ?? '';
                else empData[key] = ''; // Default for missing optional columns
            }

            // Conversions & Defaults (as done in employeeForm.js add mode)
            empData.workExperience = parseFloat(empData.workExperience) || 0; // Use 0 default for bulk
            empData.salary = parseFloat(empData.salary) || null; // Use null default for bulk
            empData.mobileLimit = parseFloat(empData.mobileLimit) || 0; // Use 0 default for bulk
            empData.status = 'Active'; empData.salaryHeld = false; empData.separationDate = ''; empData.remarks = ''; empData.holdTimestamp = '';
            empData.lastTransferDate = ''; empData.lastSubcenter = ''; empData.lastTransferReason = '';

            // Basic validation for required fields parsed
             if (!empData.employeeId || !empData.name || !empData.joiningDate || empData.salary === null) {
                 console.warn(`Skipping line ${lineIndex + 2}: Missing/invalid essential data (ID, Name, Joining Date, Salary).`);
                 return null;
             }
            // Add other required field checks if necessary based on mandatoryFields list

            return empData;
        }).filter(emp => emp !== null); // Remove skipped lines
    } catch (error) {
         customAlert("CSV Parse Error", `Could not read file: ${error.message}`);
         console.error("CSV Parsing Error:", error);
         return null;
    }
}

// Adds multiple employees via API
async function bulkAddEmployees(employees) {
    if (!getMainLocalEmployeesFunc || !mainFetchEmployeesFunc) { customAlert("Error", "Init error."); return; }
    const currentEmployees = getMainLocalEmployeesFunc();
    const existingIds = new Set(currentEmployees.map(emp => emp.employeeId));
    let addedCount = 0, skippedCount = 0, errorCount = 0;
    const promises = [];

    for (const emp of employees) {
        // Skip duplicates or clearly invalid entries (already filtered by parser mostly)
        if (!emp.employeeId || existingIds.has(emp.employeeId)) {
            skippedCount++; continue;
        }
        promises.push(
            apiCall('saveEmployee', 'POST', emp) // Send parsed employee object
                .then(() => { addedCount++; existingIds.add(emp.employeeId); })
                .catch(error => { console.error(`Error adding ${emp.employeeId} (Bulk):`, error); errorCount++; })
        );
    }
    await Promise.allSettled(promises); // Wait for all, even if some fail
    closeModal('bulkUploadModal');
    customAlert("Bulk Upload Complete", `Added: ${addedCount}. Skipped/Duplicates: ${skippedCount}. Failed: ${errorCount}.`);
    mainFetchEmployeesFunc(); // Refresh list
}

// Generates and downloads the CSV template
function downloadTemplate() {
    // Include ALL headers needed for upload, excluding status/log-related ones
    const headers = [
        "Employee ID", "Employee Name", "Employee Type", "Designation", "Joining Date",
        "Project", "Project Office", "Report Project", "Sub Center", "Work Experience (Years)",
        "Education", "Father's Name", "Mother's Name", "Personal Mobile Number", "Date of Birth",
        "Blood Group", "Address", "Identification", "Nominee's Name", "Nominee's Mobile Number",
        "Gross Salary", "Official Mobile Number", "Mobile Limit", "Bank Account Number"
        // Add headers for any other fields included in the form/HEADER_MAPPING
        // e.g., "Basic", "TDS", "Motorbike Loan", etc.
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
    const fileInput = $('employeeFile'); // Get file input

    if (bulkUploadBtn) bulkUploadBtn.addEventListener('click', () => {
        form?.reset(); // Reset form including file input
        openModal('bulkUploadModal');
    });
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('bulkUploadModal'));
    if (downloadBtn) downloadBtn.addEventListener('click', downloadTemplate);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = fileInput?.files?.[0];
            if (!file) { customAlert("Warning", "Please select a CSV file."); return; }

            const reader = new FileReader();
            reader.onload = async (event) => {
                const csvData = event.target.result;
                const newEmployees = parseEmployeeCSV(csvData);
                if (newEmployees === null) { // Check for null return on parse error
                     if(fileInput) fileInput.value = ''; // Reset file input on error
                     return;
                }
                if (newEmployees.length > 0) {
                    await bulkAddEmployees(newEmployees);
                } else {
                     customAlert("Info", "No valid new employees found in the file to upload.");
                     closeModal('bulkUploadModal');
                }
                 if(fileInput) fileInput.value = ''; // Reset file input after processing
            };
            reader.onerror = () => {
                 customAlert("Error", "Failed to read the selected file.");
                 if(fileInput) fileInput.value = '';
            };
            reader.readAsText(file);
        });
    }
}