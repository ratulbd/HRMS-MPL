// netlify/functions/lib/_employeeActions.js

// Constants needed for logEvent
const HOLD_LOG_SHEET_NAME = 'Hold_Log';
const SEPARATION_LOG_SHEET_NAME = 'Separation_Log';
const TRANSFER_LOG_SHEET_NAME = 'Transfer_Log';
const HOLD_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Action'];
const SEPARATION_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Separation Date', 'Status', 'Remarks'];
const TRANSFER_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Employee Name', 'Old Sub Center', 'New Sub Center', 'Reason', 'Transfer Date'];

// --- Helper to create JS-friendly keys from headers ---
function headerToKey(header) {
    if (!header) return '';
    // Basic conversion: lowercase, replace spaces/symbols with underscore
    return header.trim().toLowerCase()
        .replace(/\(.*\)/g, '') // Remove content in parentheses
        .replace(/[^a-z0-9_]+/g, '_') // Replace non-alphanumeric/underscore with underscore
        .replace(/_+/g, '_') // Replace multiple underscores with one
        .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
}

// Reverse mapping for saving (Normalized Header -> JS Key)
function createReverseHeaderMapping(mapping) {
    const reverseMap = {};
    for (const key in mapping) {
        reverseMap[mapping[key]] = key;
    }
    return reverseMap;
}


async function getEmployees(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    console.log("Executing getEmployees");
    try {
        // --- Fetch Actual Headers ---
        const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${EMPLOYEE_SHEET_NAME}!1:1`,
        });
        const actualHeaders = headerResponse.data.values ? headerResponse.data.values[0] : [];
        if (actualHeaders.length === 0) {
             console.warn(`No headers found in ${EMPLOYEE_SHEET_NAME}. Returning empty list.`);
             return { statusCode: 200, body: JSON.stringify([]) };
        }
        // Normalize headers for internal use and create keys
        const normalizedHeaders = actualHeaders.map(h => (h || '').trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));
        const reverseMapping = createReverseHeaderMapping(HEADER_MAPPING); // For mapping known headers back to JS keys

        // --- Fetch Data for all columns ---
        const lastColumnLetter = helpers.getColumnLetter(actualHeaders.length - 1);
        const range = `${EMPLOYEE_SHEET_NAME}!A2:${lastColumnLetter}`; // Read all columns based on header count
        console.log(`Fetching employee data from range: ${range}`);
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const dataRows = response.data.values;

        if (!dataRows || dataRows.length === 0) {
             console.log(`No data rows found in ${EMPLOYEE_SHEET_NAME}.`);
             return { statusCode: 200, body: JSON.stringify([]) };
        }
        console.log(`Fetched ${dataRows.length} data rows.`);

        const employees = dataRows.map((row, index) => {
            const emp = { id: index + 2 }; // Row number as ID

            actualHeaders.forEach((header, i) => {
                const normalizedHeader = normalizedHeaders[i];
                // Use the key from HEADER_MAPPING if available, otherwise generate one
                const key = reverseMapping[normalizedHeader] || headerToKey(header); // Use JS key if known, else generated key

                if (key) { // Only add if a key could be determined
                    const value = row[i] ?? '';
                    // Handle specific type conversions for known keys
                    if (key === 'salaryHeld') {
                        emp[key] = (String(value).toUpperCase() === 'TRUE');
                    } else if (key === 'salary' || key === 'mobileLimit' || key === 'workExperience') {
                        emp[key] = parseFloat(value) || 0; // Attempt number conversion for known numeric fields
                    }
                    else {
                        emp[key] = value; // Store others as string
                    }
                }
            });

            // Ensure essential known fields have defaults
            emp.status = emp.status || 'Active';
            emp.salaryHeld = (emp.salaryHeld === true); // Ensure boolean

            return emp;
        });

        console.log(`Processed ${employees.length} employees dynamically.`);
        // Optionally return headers if frontend needs them: return { statusCode: 200, body: JSON.stringify({ employees, headers: actualHeaders }) };
        return { statusCode: 200, body: JSON.stringify(employees) }; // Return only employees for now

    } catch (error) {
        console.error("Error inside getEmployees action:", error.stack || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error fetching employees.', details: error.message })};
    }
}

async function saveEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, employeeData) {
     console.log("Executing saveEmployee with dynamic data:", employeeData);
    // --- Get Current Headers from Sheet ---
    const actualHeaders = (await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${EMPLOYEE_SHEET_NAME}!1:1` })).data.values?.[0] || [];
    if (actualHeaders.length === 0) throw new Error("Cannot save: No headers found in sheet.");
    const normalizedHeaders = actualHeaders.map(h => (h || '').trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));

    // Prepare data based on ACTUAL headers
    const newRow = actualHeaders.map((header, index) => {
         const normalizedHeader = normalizedHeaders[index];
         // Find the corresponding JS key
         let key = null;
         for (const jsKey in HEADER_MAPPING) {
              if (HEADER_MAPPING[jsKey] === normalizedHeader) {
                   key = jsKey;
                   break;
              }
         }
         // If not in mapping, try the generated key
         if (!key) {
              key = headerToKey(header);
         }

         let value = employeeData[key] ?? ''; // Get value using the determined key

         // Format specific known fields back for sheet
         if (key === 'salaryHeld') {
              value = (value === true || String(value).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
         }
         // Ensure other values are strings (unless specific formatting needed)
         value = (value == null) ? '' : String(value);

         return value;
    });
    console.log("Mapped dynamic row data for save/update:", newRow);


    const lookupId = employeeData.originalEmployeeId || employeeData.employeeId;
    if (!lookupId) throw new Error("Employee ID missing for save.");

    // Use getSheetHeaders (which reads actual headers) for findEmployeeRow
    const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, lookupId);

    if (rowIndex !== -1) { // Update
        // Revert Employee ID change attempt (keep this logic)
        if (employeeData.originalEmployeeId && employeeData.employeeId !== employeeData.originalEmployeeId) {
             console.warn(`Attempted ID change. Reverting.`);
             const idColIndex = normalizedHeaders.indexOf(HEADER_MAPPING.employeeId);
             if (idColIndex !== -1) newRow[idColIndex] = employeeData.originalEmployeeId;
        }

        console.log(`Updating employee at row ${rowIndex}`);
        const lastColumnLetter = helpers.getColumnLetter(actualHeaders.length - 1); // Use actual header count
        const range = `${EMPLOYEE_SHEET_NAME}!A${rowIndex}:${lastColumnLetter}${rowIndex}`;
        await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range, valueInputOption: 'USER_ENTERED', resource: { values: [newRow] } });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee updated.' }) };
    } else { // Append
        if (employeeData.originalEmployeeId) throw new Error(`Original ID ${employeeData.originalEmployeeId} not found for update.`);
        const checkAgainIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeData.employeeId);
        if (checkAgainIndex !== -1) return { statusCode: 409, body: JSON.stringify({ error: `Employee ID ${employeeData.employeeId} already exists.` }) };

        console.log(`Appending new employee: ${employeeData.employeeId}`);
        await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${EMPLOYEE_SHEET_NAME}!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: [newRow] } });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee added.' }) };
    }
}

async function updateStatus(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, statusData) {
    // ... (This function primarily updates specific known columns, keep as is) ...
}

async function getSubCenters(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    // ... (This function remains the same) ...
}

async function transferEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, { employeeId, newSubCenter, reason, transferDate }) {
    // ... (This function updates specific known columns, keep as is, using the corrected lastSubcenter logic) ...
}

module.exports = {
    getEmployees,
    saveEmployee,
    updateStatus,
    getSubCenters,
    transferEmployee
};