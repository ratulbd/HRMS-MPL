// js/bulkUpload.js
import { $, openModal, closeModal, customAlert, downloadCSV } from './utils.js';
import { apiCall } from './apiClient.js';

let mainFetchEmployeesFunc = null;
let getMainLocalEmployeesFunc = null;

// --- MODIFICATION: Define mandatory fields for bulk upload ---
const mandatoryFieldsBulk = [
    { key: 'employeeId', name: 'Employee ID' },
    { key: 'name', name: 'Employee Name' },
    { key: 'employeeType', name: 'Employee Type' },
    { key: 'designation', name: 'Designation' },
    { key: 'joiningDate', name: 'Joining Date' },
    { key: 'project', name: 'Project' },
    { key: 'projectOffice', name: 'Project Office' },
    { key: 'reportProject', name: 'Report Project' },
    { key: 'subCenter', name: 'Sub Center' },
    { key: 'personalMobile', name: 'Personal Mobile Number' },
    { key: 'dob', name: 'Date of Birth' },
    { key: 'address', name: 'Address' },
    { key: 'identificationType', name: 'Identification Type' },
    { key: 'identification', name: 'Identification' },
    { key: 'salary', name: 'Gross Salary', isNumeric: true }, // Mark numeric for specific validation
    { key: 'basic', name: 'Basic', isNumeric: true },
    { key: 'others', name: 'Others', isNumeric: true }
];
// --- END MODIFICATION ---

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

// --- MODIFIED FUNCTION ---
// Parses CSV, validates mandatory fields, returns valid employees and skipped rows info
function parseEmployeeCSV(data) {
    const skippedForMissingData = []; // Store rows skipped due to missing data
    const validEmployees = []; // Store valid employee data objects with row numbers

    try {
        const lines = data.split(/[\r\n]+/).filter(line => line.trim() !== '');
        if (lines.length < 1) throw new Error("CSV appears empty or has invalid line breaks.");

        const rawHeader = parseCsvLine(lines.shift());
        const header = rawHeader.map(h => h.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/[^a-z0-9]/g, ''));

        const fieldMapping = {
            employeeId: 'employeeid', name: 'employeename', employeeType: 'employeetype',
            designation: 'designation', joiningDate: 'joiningdate',
            workExperience: 'workexperienceyears', education: 'education',
            project: 'project', projectOffice: 'projectoffice', reportProject: 'reportproject', subCenter: 'subcenter',
            fatherName: 'fathersname', motherName: 'mothersname', personalMobile: 'personalmobilenumber', dob: 'dateofbirth',
            bloodGroup: 'bloodgroup', address: 'address', identificationType: 'identificationtype', identification: 'identification',
            nomineeName: 'nomineesname', nomineeMobile: 'nomineesmobilenumber', officialMobile: 'officialmobilenumber', mobileLimit: 'mobilelimit',
            salary: 'grosssalary', basic: 'basic', others: 'others', motobikeCarMaintenance: 'motobikecarmaintenanceallowance',
            laptopRent: 'laptoprent', othersAllowance: 'othersallowance', arrear: 'arrear', foodAllowance: 'foodallowance',
            stationAllowance: 'stationallowance', hardshipAllowance: 'hardshipallowance',
            gratuity: 'gratuity', subsidizedLunch: 'subsidizedlunch', tds: 'tds', motorbikeLoan: 'motorbikeloan', welfareFund: 'welfarefund',
            salaryOthersLoan: 'salaryothersloan', subsidizedVehicle: 'subsidizedvehicle', lwp: 'lwp', cpf: 'cpf', othersAdjustment: 'othersadjustment',
            bankAccount: 'bankaccountnumber'
        };

         const requiredNormalizedFields = mandatoryFieldsBulk.map(f => fieldMapping[f.key]);

        const colIndexes = {};
        let missingHeaders = [];
        for (const key in fieldMapping) {
            const normalizedHeader = fieldMapping[key];
            const index = header.indexOf(normalizedHeader);
            if (index !== -1) {
                colIndexes[key] = index;
            } else if (requiredNormalizedFields.includes(normalizedHeader)) {
                 const originalHeader = rawHeader.find((h, i) => header[i] === normalizedHeader) || normalizedHeader;
                 missingHeaders.push(originalHeader);
            }
        }
         if(missingHeaders.length > 0) {
              throw new Error(`Missing required CSV columns: ${missingHeaders.join(', ')}`);
         }
        if (Object.keys(colIndexes).length === 0) throw new Error("Could not map any headers.");

        // Process data rows
        lines.forEach((line, lineIndex) => {
            const rowNumber = lineIndex + 2; // +1 for 0-index, +1 for header
            const values = parseCsvLine(line);

            if (values.length < rawHeader.length) { // Basic check if columns mismatch header length significantly
                 console.warn(`Row ${rowNumber}: Number of columns (${values.length}) doesn't match header (${rawHeader.length}). Potential issues.`);
                 // Decide whether to skip or try processing
            }

            const empData = {};
            for (const key in colIndexes) {
                if (colIndexes[key] < values.length) empData[key] = values[colIndexes[key]] ?? '';
                else empData[key] = '';
            }

            // Conversions & Defaults
            const numberFields = [
                'workExperience', 'mobileLimit', 'salary', 'basic', 'others', 'motobikeCarMaintenance',
                'laptopRent', 'othersAllowance', 'arrear', 'foodAllowance', 'stationAllowance', 'hardshipAllowance',
                'gratuity', 'subsidizedLunch', 'tds', 'motorbikeLoan', 'welfareFund', 'salaryOthersLoan',
                'subsidizedVehicle', 'lwp', 'cpf', 'othersAdjustment'
            ];

            for (const field of numberFields) {
                if (empData[field] !== undefined) {
                    const numValue = parseFloat(empData[field]);
                    // Store as number or null if invalid/empty
                    empData[field] = isNaN(numValue) ? null : numValue;
                }
            }
            empData.status = 'Active'; empData.salaryHeld = false; empData.separationDate = ''; empData.remarks = ''; empData.holdTimestamp = '';
            empData.lastTransferDate = ''; empData.lastSubcenter = ''; empData.lastTransferReason = '';

            // --- MODIFICATION: Perform mandatory field validation ---
            let missingField = null;
            let invalidNumericField = null;
            for (const fieldInfo of mandatoryFieldsBulk) {
                const value = empData[fieldInfo.key];
                const isEmpty = (value === null || value === undefined || String(value).trim() === '');

                if (isEmpty) {
                    missingField = fieldInfo.name;
                    break; // Stop checking on first missing field
                }
                // Specific check for mandatory numeric fields
                if (fieldInfo.isNumeric && (value === null || value < 0)) {
                    invalidNumericField = fieldInfo.name;
                    break; // Stop checking on first invalid numeric field
                }
            }

            if (missingField) {
                 console.warn(`Skipping row ${rowNumber}: Missing mandatory field: ${missingField}.`);
                 skippedForMissingData.push({ row: rowNumber, id: empData.employeeId || 'N/A', reason: `Missing mandatory field: ${missingField}` });
                 return; // Skip this row
            }
            if (invalidNumericField) {
                console.warn(`Skipping row ${rowNumber}: Invalid numeric value for mandatory field: ${invalidNumericField}.`);
                 skippedForMissingData.push({ row: rowNumber, id: empData.employeeId || 'N/A', reason: `Invalid/negative number for mandatory field: ${invalidNumericField}` });
                 return; // Skip this row
            }
            // --- END MODIFICATION ---

            // Auto-calculate totals (Only if row is valid so far)
            const getNum = (key) => empData[key] || 0;
            const earnings = [
                getNum('salary'), getNum('motobikeCarMaintenance'), getNum('laptopRent'), getNum('othersAllowance'),
                getNum('arrear'), getNum('foodAllowance'), getNum('stationAllowance'), getNum('hardshipAllowance')
            ];
            empData.grandTotal = earnings.reduce((sum, val) => sum + val, 0);

            const deductions = [
                getNum('gratuity'), getNum('subsidizedLunch'), getNum('tds'), getNum('motorbikeLoan'),
                getNum('welfareFund'), getNum('salaryOthersLoan'), getNum('subsidizedVehicle'),
                getNum('lwp'), getNum('cpf')
            ];
            empData.totalDeduction = deductions.reduce((sum, val) => sum + val, 0);

            empData.netSalaryPayment = empData.grandTotal - empData.totalDeduction;

            // If all checks pass, add to valid list
            validEmployees.push({ data: empData, rowNumber: rowNumber });
        });

        // Return both valid employees and skipped rows info
        return { validEmployees, skippedForMissingData };

    } catch (error) {
         customAlert("CSV Parse Error", `Could not read file: ${error.message}`);
         console.error("CSV Parsing Error:", error);
         return null; // Indicate a critical parsing failure
    }
}
// --- END MODIFIED FUNCTION ---

// --- MODIFIED FUNCTION ---
// Accepts parsed result, performs duplicate checks, uploads, and reports all skipped rows
async function bulkAddEmployees(parsedResult) {
    if (!getMainLocalEmployeesFunc || !mainFetchEmployeesFunc) {
        customAlert("Error", "Initialization error. Cannot check for duplicates.");
        return;
    }
    if (!parsedResult) return; // Handle critical parsing error

    const { validEmployees, skippedForMissingData } = parsedResult;
    const currentEmployees = getMainLocalEmployeesFunc();

    const employeeIdMap = new Map();
    const identificationMap = new Map();

    for (const emp of currentEmployees) {
        if (emp.employeeId) {
             employeeIdMap.set(emp.employeeId.trim().toLowerCase(), emp);
        }
        if (emp.identification) {
             identificationMap.set(emp.identification.trim().toLowerCase(), emp);
        }
    }

    const employeesToUpload = [];
    const skippedForDuplicates = []; // Keep duplicate skips separate initially

    // --- First pass: Check valid employees for duplicates ---
    for (const { data: emp, rowNumber } of validEmployees) {
        const newEmployeeId = emp.employeeId.trim().toLowerCase();
        const newIdentification = (emp.identification || '').trim().toLowerCase();

        // 1. Check against existing DB employees
        const existingById = employeeIdMap.get(newEmployeeId);
        if (existingById) {
            skippedForDuplicates.push({ row: rowNumber, id: emp.employeeId, reason: `Employee ID already exists for ${existingById.name}` });
            continue;
        }

        if (newIdentification) {
            const existingByIdent = identificationMap.get(newIdentification);
            if (existingByIdent) {
                skippedForDuplicates.push({ row: rowNumber, id: emp.employeeId, reason: `Identification "${emp.identification}" already exists for ${existingByIdent.name} (ID: ${existingByIdent.employeeId})` });
                continue;
            }
        }

        // 2. Check for duplicates *within the file* (by adding to maps as we go)
        if (employeeIdMap.has(newEmployeeId)) {
             skippedForDuplicates.push({ row: rowNumber, id: emp.employeeId, reason: `Duplicate Employee ID found within the upload file` });
             continue;
        }
        if (newIdentification && identificationMap.has(newIdentification)) {
             skippedForDuplicates.push({ row: rowNumber, id: emp.employeeId, reason: `Duplicate Identification "${emp.identification}" found within the upload file` });
             continue;
        }

        // If no duplicates, add to upload list and to Maps
        employeesToUpload.push(emp);
        employeeIdMap.set(newEmployeeId, emp);
        if (newIdentification) {
            identificationMap.set(newIdentification, emp);
        }
    }

    // --- Second pass: Upload valid, non-duplicate employees ---
    let addedCount = 0;
    let errorCount = 0;

    const promises = employeesToUpload.map(emp =>
        apiCall('saveEmployee', 'POST', emp)
            .then(() => { addedCount++; })
            .catch(error => {
                console.error(`Error adding ${emp.employeeId} (Bulk):`, error);
                errorCount++;
            })
    );

    await Promise.allSettled(promises); // Wait for all, even if some fail

    // --- Final Report ---
    let reportMessage = `<b>Upload Complete</b><br>
                         Successfully Added: ${addedCount}<br>
                         Failed: ${errorCount}`;

    // Combine all skipped rows
    const allSkippedRows = [...skippedForMissingData, ...skippedForDuplicates];
    // Sort skipped rows by original row number for clarity
    allSkippedRows.sort((a, b) => a.row - b.row);

    if (allSkippedRows.length > 0) {
        reportMessage += `<br><br><b>${allSkippedRows.length} rows were skipped:</b><br>`;
        reportMessage += allSkippedRows
            .map(skip => `&bull; <b>Row ${skip.row} (ID ${skip.id || 'N/A'})</b>: ${skip.reason}`)
            .join('<br>');
    } else if (employeesToUpload.length > 0 || validEmployees.length > 0) { // Check if there were any valid rows initially
        reportMessage += `<br><br>No rows were skipped due to missing data or duplicates.`;
    } else {
         // This case means the file might have only had rows with missing data
         reportMessage += `<br><br>No valid employee rows found to process.`;
    }


    closeModal('bulkUploadModal');
    customAlert("Bulk Upload Report", reportMessage);
    mainFetchEmployeesFunc(); // Refresh list
}
// --- END MODIFIED FUNCTION ---


// Generates and downloads the complete CSV template
function downloadTemplate() {
    const headers = [
        "Employee ID", "Employee Name", "Employee Type", "Designation", "Joining Date",
        "Work Experience (Years)", "Education",
        "Project", "Project Office", "Report Project", "Sub Center",
        "Father's Name", "Mother's Name", "Personal Mobile Number", "Date of Birth",
        "Blood Group", "Address", "Identification Type", "Identification",
        "Nominee's Name", "Nominee's Mobile Number", "Official Mobile Number", "Mobile Limit",
        "Gross Salary", "Basic", "Others", "Motobike / Car Maintenance Allowance", "Laptop Rent",
        "Others Allowance", "Arrear", "Food Allowance", "Station Allowance", "Hardship Allowance",
        "Gratuity", "Subsidized Lunch", "TDS", "Motorbike Loan", "Welfare Fund",
        "Salary/ Others Loan", "Subsidized Vehicle", "LWP", "CPF", "Others Adjustment",
        "Bank Account Number"
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
    const fileInput = $('employeeFile');

    if (bulkUploadBtn) bulkUploadBtn.addEventListener('click', () => {
        form?.reset();
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
                // --- MODIFICATION: parseEmployeeCSV now returns an object ---
                const parsedResult = parseEmployeeCSV(csvData);

                if (parsedResult === null) { // Critical parsing error
                     if(fileInput) fileInput.value = '';
                     return;
                }

                if (parsedResult.validEmployees.length > 0) {
                    // Pass the whole result object to bulkAddEmployees
                    await bulkAddEmployees(parsedResult);
                } else {
                     // Generate report even if no valid employees, but some were skipped
                     if (parsedResult.skippedForMissingData.length > 0) {
                          let reportMessage = `<b>Upload Processed</b><br>
                                               No employees were added.<br><br>
                                               <b>${parsedResult.skippedForMissingData.length} rows were skipped due to missing/invalid mandatory data:</b><br>`;
                          reportMessage += parsedResult.skippedForMissingData
                               .sort((a, b) => a.row - b.row)
                               .map(skip => `&bull; <b>Row ${skip.row} (ID ${skip.id || 'N/A'})</b>: ${skip.reason}`)
                               .join('<br>');
                          customAlert("Bulk Upload Report", reportMessage);
                     } else {
                          customAlert("Info", "No valid new employees found in the file to upload.");
                     }
                     closeModal('bulkUploadModal');
                }
                // --- END MODIFICATION ---
                 if(fileInput) fileInput.value = ''; // Clear file input after processing
            };
            reader.onerror = () => {
                 customAlert("Error", "Failed to read the selected file.");
                 if(fileInput) fileInput.value = '';
            };
            reader.readAsText(file);
        });
    }
}