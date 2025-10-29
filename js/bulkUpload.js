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

// --- MODIFIED FUNCTION ---
// Parses CSV data into objects, preserving row number and logging errors
function parseEmployeeCSV(data) {
    try {
        const lines = data.split(/[\r\n]+/).filter(line => line.trim() !== '');
        if (lines.length < 1) throw new Error("CSV appears empty or has invalid line breaks.");

        const rawHeader = parseCsvLine(lines.shift());
        
        const header = rawHeader.map(h => 
            h.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/[^a-z0-9]/g, '')
        );

        // --- MODIFICATION: Updated fieldMapping to include all fields ---
        const fieldMapping = {
            // Basic Info
            employeeId: 'employeeid', name: 'employeename', employeeType: 'employeetype',
            designation: 'designation', joiningDate: 'joiningdate',
            workExperience: 'workexperienceyears', education: 'education',
            // Project Info
            project: 'project', projectOffice: 'projectoffice', 
            reportProject: 'reportproject', subCenter: 'subcenter',
            // Personal Info
            fatherName: 'fathersname', motherName: 'mothersname', 
            personalMobile: 'personalmobilenumber', dob: 'dateofbirth',
            bloodGroup: 'bloodgroup', address: 'address', 
            identificationType: 'identificationtype', identification: 'identification',
            // Contact & Nominee
            nomineeName: 'nomineesname', nomineeMobile: 'nomineesmobilenumber',
            officialMobile: 'officialmobilenumber', mobileLimit: 'mobilelimit',
            // Salary - Earnings
            salary: 'grosssalary', 
            basic: 'basic', others: 'others', 
            motobikeCarMaintenance: 'motobikecarmaintenanceallowance',
            laptopRent: 'laptoprent', othersAllowance: 'othersallowance',
            arrear: 'arrear', foodAllowance: 'foodallowance',
            stationAllowance: 'stationallowance', hardshipAllowance: 'hardshipallowance',
            // Salary - Deductions
            gratuity: 'gratuity', subsidizedLunch: 'subsidizedlunch', tds: 'tds',
            motorbikeLoan: 'motorbikeloan', welfareFund: 'welfarefund',
            salaryOthersLoan: 'salaryothersloan', subsidizedVehicle: 'subsidizedvehicle',
            lwp: 'lwp', cpf: 'cpf', othersAdjustment: 'othersadjustment',
            // Bank
            bankAccount: 'bankaccountnumber'
            // Calculated fields are *omitted* here on purpose
        };
        // --- END MODIFICATION ---
        
         const requiredNormalizedFields = [
             'employeeid', 'employeename', 'employeetype', 'designation', 'joiningdate', 'project',
             'projectoffice', 'reportproject', 'subcenter', 'personalmobilenumber', 'dob',
             'address', 'identification', 'grosssalary'
          ];

        const colIndexes = {};
        let missingHeaders = [];
        for (const key in fieldMapping) {
            const normalizedHeader = fieldMapping[key];
            const index = header.indexOf(normalizedHeader);
            if (index !== -1) {
                colIndexes[key] = index;
            } else if (requiredNormalizedFields.includes(normalizedHeader)) {
                 missingHeaders.push(rawHeader[header.indexOf(normalizedHeader)] || normalizedHeader);
            }
        }
         if(missingHeaders.length > 0) {
              throw new Error(`Missing required CSV columns: ${missingHeaders.join(', ')}`);
         }
        if (Object.keys(colIndexes).length === 0) throw new Error("Could not map any headers.");

        // Process data rows
        return lines.map((line, lineIndex) => {
            const rowNumber = lineIndex + 2;
            const values = parseCsvLine(line);
            
            if (values.length < requiredNormalizedFields.length) {
                 console.warn(`Skipping line ${rowNumber}: Too few columns.`); 
                 return null;
            }
            
            const empData = {};
            for (const key in colIndexes) {
                if (colIndexes[key] < values.length) empData[key] = values[colIndexes[key]] ?? '';
                else empData[key] = '';
            }

            // --- MODIFICATION: Convert all number fields ---
            const numberFields = [
                'workExperience', 'mobileLimit', 'salary', 'basic', 'others', 'motobikeCarMaintenance',
                'laptopRent', 'othersAllowance', 'arrear', 'foodAllowance', 'stationAllowance', 'hardshipAllowance',
                'gratuity', 'subsidizedLunch', 'tds', 'motorbikeLoan', 'welfareFund', 'salaryOthersLoan', 
                'subsidizedVehicle', 'lwp', 'cpf', 'othersAdjustment'
            ];
            
            for (const field of numberFields) {
                if (empData[field] !== undefined) {
                    const numValue = parseFloat(empData[field]);
                    empData[field] = isNaN(numValue) ? null : numValue;
                }
            }
            // --- END MODIFICATION ---

            // Defaults
            empData.status = 'Active'; empData.salaryHeld = false; empData.separationDate = ''; empData.remarks = ''; empData.holdTimestamp = '';
            empData.lastTransferDate = ''; empData.lastSubcenter = ''; empData.lastTransferReason = '';

            // Validation for required fields
            let missingField = null;
            if (!empData.employeeId) missingField = "Employee ID";
            else if (!empData.name) missingField = "Employee Name";
            else if (!empData.joiningDate) missingField = "Joining Date";
            else if (!empData.identification) missingField = "Identification";
            else if (empData.salary === null) missingField = "Gross Salary (must be a valid number)";
            
            if (missingField) {
                 console.warn(`Skipping line ${rowNumber}: Missing or invalid essential data: ${missingField}.`);
                 return null;
            }

            // --- MODIFICATION: Auto-calculate totals for bulk upload ---
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
            // --- END MODIFICATION ---

            return { data: empData, rowNumber: rowNumber };
        }).filter(emp => emp !== null);
    } catch (error) {
         customAlert("CSV Parse Error", `Could not read file: ${error.message}`);
         console.error("CSV Parsing Error:", error);
         return null;
    }
}

// Adds multiple employees, performs duplicate checks, and provides a detailed report
async function bulkAddEmployees(employeesWithRow) {
    if (!getMainLocalEmployeesFunc || !mainFetchEmployeesFunc) { 
        customAlert("Error", "Initialization error. Cannot check for duplicates."); 
        return; 
    }
    
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
    const skippedRows = [];

    for (const { data: emp, rowNumber } of employeesWithRow) {
        const newEmployeeId = emp.employeeId.trim().toLowerCase();
        const newIdentification = (emp.identification || '').trim().toLowerCase();

        const existingById = employeeIdMap.get(newEmployeeId);
        if (existingById) {
            skippedRows.push({ row: rowNumber, id: emp.employeeId, reason: `Employee ID already exists for ${existingById.name}` });
            continue;
        }
        
        if (newIdentification) {
            const existingByIdent = identificationMap.get(newIdentification);
            if (existingByIdent) {
                skippedRows.push({ row: rowNumber, id: emp.employeeId, reason: `Identification "${emp.identification}" already exists for ${existingByIdent.name} (ID: ${existingByIdent.employeeId})` });
                continue;
            }
        }
        
        employeesToUpload.push(emp);
        employeeIdMap.set(newEmployeeId, emp);
        if (newIdentification) {
            identificationMap.set(newIdentification, emp);
        }
    }

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
    
    await Promise.allSettled(promises);

    let reportMessage = `<b>Upload Complete</b><br>
                         Successfully Added: ${addedCount}<br>
                         Failed: ${errorCount}`;

    if (skippedRows.length > 0) {
        reportMessage += `<br><br><b>${skippedRows.length} rows were skipped:</b><br>`;
        reportMessage += skippedRows
            .map(skip => `&bull; <b>Row ${skip.row} (ID ${skip.id || 'N/A'})</b>: ${skip.reason}`)
            .join('<br>');
    } else if (employeesToUpload.length > 0) {
        reportMessage += `<br><br>No rows were skipped.`;
    }

    closeModal('bulkUploadModal');
    customAlert("Bulk Upload Report", reportMessage);
    mainFetchEmployeesFunc(); // Refresh list
}

// --- MODIFIED FUNCTION ---
// Generates and downloads the complete CSV template
function downloadTemplate() {
    const headers = [
        // Basic
        "Employee ID", "Employee Name", "Employee Type", "Designation", "Joining Date",
        "Work Experience (Years)", "Education",
        // Project
        "Project", "Project Office", "Report Project", "Sub Center",
        // Personal
        "Father's Name", "Mother's Name", "Personal Mobile Number", "Date of Birth",
        "Blood Group", "Address", "Identification Type", "Identification",
        // Contact
        "Nominee's Name", "Nominee's Mobile Number", "Official Mobile Number", "Mobile Limit",
        // Salary - Earnings
        "Gross Salary", "Basic", "Others", "Motobike / Car Maintenance Allowance", "Laptop Rent",
        "Others Allowance", "Arrear", "Food Allowance", "Station Allowance", "Hardship Allowance",
        // Salary - Deductions
        "Gratuity", "Subsidized Lunch", "TDS", "Motorbike Loan", "Welfare Fund",
        "Salary/ Others Loan", "Subsidized Vehicle", "LWP", "CPF", "Others Adjustment",
        // Bank
        "Bank Account Number"
        // Calculated fields (Grand Total, Total Deduction, Net Salary) are *omitted*
    ];
    downloadCSV(headers.join(','), "employee_upload_template.csv");
}
// --- END MODIFICATION ---

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
                const newEmployees = parseEmployeeCSV(csvData); // Will be array of {data, rowNumber}
                
                if (newEmployees === null) {
                     if(fileInput) fileInput.value = '';
                     return;
                }
                
                if (newEmployees.length > 0) {
                    await bulkAddEmployees(newEmployees);
                } else {
                     customAlert("Info", "No valid new employees found in the file to upload.");
                     closeModal('bulkUploadModal');
                }
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