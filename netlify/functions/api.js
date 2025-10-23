const { google } = require('googleapis');

// --- Authorization ---
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1NH4_rlOgOu68QrqQA1IsNw1CwvUecRSdW6PnfcatnZQ';
const EMPLOYEE_SHEET_NAME = 'Employees';
const SALARY_SHEET_PREFIX = 'Salary_'; // Prefix for salary sheets
const HOLD_LOG_SHEET_NAME = 'Hold_Log'; // New sheet for hold/unhold actions
const SEPARATION_LOG_SHEET_NAME = 'Separation_Log'; // New sheet for resign/terminate actions

// Maps frontend object keys to sheet header names (after normalization).
const HEADER_MAPPING = {
    employeeId: 'employeeid', name: 'employeename', employeeType: 'employeetype',
    designation: 'designation', joiningDate: 'joiningdate', project: 'project',
    projectOffice: 'projectoffice', reportProject: 'reportproject', subCenter: 'subcenter',
    workExperience: 'workexperience', education: 'education', fatherName: 'fathersname',
    motherName: 'mothersname', personalMobile: 'personalmobilenumber', dob: 'dateofbirth',
    bloodGroup: 'bloodgroup', address: 'address', identification: 'identification',
    nomineeName: 'nomineesname', nomineeMobile: 'nomineesmobilenumber', salary: 'grosssalary',
    officialMobile: 'officialmobilenumber', mobileLimit: 'mobilelimit', bankAccount: 'bankaccountnumber',
    status: 'status', salaryHeld: 'salaryheld', remarks: 'remarks', separationDate: 'separationdate'
};

// Standard headers for the new log sheets
const HOLD_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Action'];
const SEPARATION_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Separation Date', 'Status', 'Remarks'];


// --- Helper: Get Sheet Headers ---
// Cache headers to avoid repeated API calls within a single function invocation
let headerCache = {}; // Use an object to cache headers for multiple sheets
let headerCacheTimestamp = {};
const CACHE_DURATION = 60000; // Cache headers for 60 seconds


async function getSheetHeaders(sheetName) {
  const now = Date.now();
  if (headerCache[sheetName] && (now - (headerCacheTimestamp[sheetName] || 0) < CACHE_DURATION)) {
    console.log(`Using cached headers for ${sheetName}.`);
    return headerCache[sheetName];
  }
  console.log(`Fetching fresh headers for ${sheetName}.`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!1:1`,
    });
    const headerRow = response.data.values ? response.data.values[0] : [];
    const normalizedHeaders = headerRow.map(h => (h || '').trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));
    console.log(`Normalized headers for ${sheetName}:`, normalizedHeaders);

    headerCache[sheetName] = normalizedHeaders;
    headerCacheTimestamp[sheetName] = now;

    return normalizedHeaders;
  } catch (error) {
    console.error(`Error getting headers for sheet ${sheetName}:`, error.stack || error.message);
    if (error.response) {
      console.error("Google API response error:", JSON.stringify(error.response.data));
    }
    delete headerCache[sheetName];
    delete headerCacheTimestamp[sheetName];
    if (error.code === 400 && error.message.includes('Unable to parse range')) {
      console.warn(`Sheet ${sheetName} might be empty. Returning empty headers.`);
      return [];
    }
    const details = error.errors && error.errors[0] ? error.errors[0].message : error.message;
    throw new Error(`Could not read headers from sheet: ${sheetName}. Details: ${details}. Make sure the sheet exists and is accessible.`);
  }
}



// --- Helper: Find Row by Employee ID ---
async function findEmployeeRow(employeeId) {
    // Determine the column letter for Employee ID based on headers
    const headers = await getSheetHeaders(EMPLOYEE_SHEET_NAME);
    if (!headers || headers.length === 0) {
        console.error(`Cannot find employee row: Headers for ${EMPLOYEE_SHEET_NAME} are missing or empty.`);
        throw new Error(`Headers missing or empty in the '${EMPLOYEE_SHEET_NAME}' sheet.`);
    }
    const idHeaderNormalized = HEADER_MAPPING.employeeId; // 'employeeid'
    const idColIndex = headers.indexOf(idHeaderNormalized);

    if (idColIndex === -1) {
        console.error(`'${idHeaderNormalized}' header not found in sheet headers:`, headers);
        throw new Error(`Could not find the '${idHeaderNormalized}' column header in the '${EMPLOYEE_SHEET_NAME}' sheet.`);
    }
    const idColLetter = String.fromCharCode('A'.charCodeAt(0) + idColIndex);
    console.log(`Employee ID column identified as: ${idColLetter}`);

    try {
        const range = `${EMPLOYEE_SHEET_NAME}!${idColLetter}2:${idColLetter}`; // Scan only the Employee ID column, starting from row 2
        console.log(`Scanning range for Employee ID ${employeeId}: ${range}`);
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });
        const rows = response.data.values || [];
        console.log(`Found ${rows.length} rows in Employee ID column.`);
        for (let i = 0; i < rows.length; i++) { // Loop through data rows
             // Trim both the sheet value and the lookup ID for comparison
            if (rows[i][0] && String(rows[i][0]).trim() === String(employeeId).trim()) {
                const rowIndex = i + 2; // Return 1-based row index (add 2 because we start scan from row 2)
                console.log(`Found Employee ID ${employeeId} at row index: ${rowIndex}`);
                return rowIndex;
            }
        }
        console.log(`Employee ID ${employeeId} not found in column ${idColLetter}.`);
        return -1; // Not found
    } catch (error) {
        // Handle cases where the sheet might be empty or range is invalid
        if (error.code === 400 && error.message.includes('Unable to parse range')) {
             console.warn(`Sheet '${EMPLOYEE_SHEET_NAME}' might be empty or Employee ID column '${idColLetter}' not found.`);
             return -1; // Treat as not found if range is invalid (e.g., empty sheet)
        }
        console.error(`Error finding employee row for ID ${employeeId}:`, error);
        throw error; // Re-throw other errors
    }
}

// --- Helper: Ensure Sheet Exists and Has Headers ---
async function ensureSheetAndHeaders(sheetName, expectedHeaders) {
    try {
        console.log(`Ensuring sheet '${sheetName}' exists.`);
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(title))' });
        const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === sheetName);

        if (!sheetExists) {
            console.log(`Sheet '${sheetName}' not found. Creating it.`);
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    requests: [{ addSheet: { properties: { title: sheetName } } }],
                },
            });
            console.log(`Created sheet '${sheetName}'. Now adding headers.`);
            // Add headers to the newly created sheet
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A1`, // Write headers to the first row
                valueInputOption: 'USER_ENTERED',
                resource: { values: [expectedHeaders] },
            });
             console.log(`Added headers to ${sheetName}: ${expectedHeaders.join(', ')}`);
             // Invalidate header cache for this sheet
             delete headerCache[sheetName];
             delete headerCacheTimestamp[sheetName];

        } else {
             console.log(`Sheet '${sheetName}' already exists.`);
             // Check if headers are present
             const currentHeaders = await getSheetHeaders(sheetName); // Fetch headers specifically for this sheet
             if (!currentHeaders || currentHeaders.length === 0) {
                  console.warn(`Sheet '${sheetName}' exists but has no headers. Adding headers.`);
                  await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [expectedHeaders] },
                  });
                   console.log(`Added headers to existing empty sheet ${sheetName}: ${expectedHeaders.join(', ')}`);
                   // Invalidate header cache for this sheet
                   delete headerCache[sheetName];
                   delete headerCacheTimestamp[sheetName];
             }
        }
    } catch (error) {
         console.error(`Error ensuring sheet '${sheetName}' exists or has headers:`, error.response ? error.response.data : error.message);
         const details = error.errors && error.errors[0] ? error.errors[0].message : error.message;
         throw new Error(`Failed to ensure sheet '${sheetName}' setup: ${details}`);
    }
}


// --- Helper: Log Event to a Sheet ---
async function logEvent(sheetName, eventDataArray) {
    const timestamp = new Date().toISOString();
    const rowToLog = [timestamp, ...eventDataArray];
    console.log(`Logging event to ${sheetName}:`, rowToLog);

    let headers;
    if (sheetName === HOLD_LOG_SHEET_NAME) {
        headers = HOLD_LOG_HEADERS;
    } else if (sheetName === SEPARATION_LOG_SHEET_NAME) {
        headers = SEPARATION_LOG_HEADERS;
    } else {
        console.error(`Unknown log sheet name: ${sheetName}`);
        throw new Error(`Invalid log sheet specified: ${sheetName}`);
    }

    try {
        // Ensure the sheet exists and has headers before appending
        await ensureSheetAndHeaders(sheetName, headers);

        // Append the log data
        const appendResult = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1`, // Append after the last row
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [rowToLog] },
        });
        console.log(`Successfully logged event to ${sheetName}. Append result:`, appendResult.data.updates.updatedRange);
    } catch (error) {
        console.error(`Error logging event to ${sheetName}:`, error.response ? error.response.data : error.message);
        // Don't throw here, allow main operation to continue, but log the failure
        // Depending on requirements, you might want to throw or handle this differently
    }
}

// --- Helper: Get Employee Salary ---
async function getEmployeeSalary(employeeId) {
    const rowIndex = await findEmployeeRow(employeeId);
    if (rowIndex === -1) return null; // Employee not found

    const headers = await getSheetHeaders(EMPLOYEE_SHEET_NAME);
    const salaryHeader = HEADER_MAPPING.salary;
    const salaryColIndex = headers.indexOf(salaryHeader);

    if (salaryColIndex === -1) {
        console.warn(`Could not find salary column ('${salaryHeader}') to log salary.`);
        return null; // Salary column not found
    }

    const salaryColLetter = String.fromCharCode('A'.charCodeAt(0) + salaryColIndex);
    const range = `${EMPLOYEE_SHEET_NAME}!${salaryColLetter}${rowIndex}`;

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });
        const salary = response.data.values ? response.data.values[0][0] : null;
        console.log(`Fetched salary for ${employeeId}: ${salary}`);
        return salary;
    } catch (error) {
        console.error(`Error fetching salary for employee ${employeeId}:`, error);
        return null; // Return null on error
    }
}


// --- Main Handler ---
exports.handler = async (event) => {
    // CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Parse request
    const { action, sheetId } = event.queryStringParameters || {};
    let requestBody = {};
    try {
        if (event.httpMethod === 'POST' && event.body) {
            requestBody = JSON.parse(event.body);
        }
    } catch (e) {
        console.error("Failed to parse request body:", event.body, e);
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    console.log(`Handler received action: ${action} with method: ${event.httpMethod}`);
    if (event.httpMethod === 'POST') console.log("Request Body:", requestBody);

    try {
        let result;
        // Action routing
        switch (action) {
            case 'getEmployees':
                if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                else result = await getEmployees();
                break;
            case 'saveEmployee':
                if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                else result = await saveEmployee(requestBody);
                break;
            case 'updateStatus':
                if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                else result = await updateStatus(requestBody);
                break;
            case 'saveSheet':
                if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                else result = await saveSalarySheet(requestBody);
                break;
            case 'getPastSheets':
                if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                else result = await getPastSheets();
                break;
            case 'getSheetData':
                if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                else if (!sheetId) throw new Error("sheetId parameter is required");
                else result = await getSheetData(sheetId);
                break;
            default:
                console.warn(`Invalid action received: ${action}`);
                result = { statusCode: 400, body: JSON.stringify({ error: 'Invalid action parameter' }) };
        }
        // Combine result headers with CORS headers
        result.headers = { ...headers, ...result.headers };
        console.log(`Action '${action}' completed with status: ${result.statusCode}`);
        return result;

    } catch (error) {
        console.error(`API Error during action '${action}':`, error);
        // Ensure error response also gets CORS headers
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'An internal server error occurred.', details: error.message }),
        };
    }
};

// --- API Action: Get Employees ---

async function getEmployees() {
  console.log("Executing getEmployees");

  try {
    const headers = await getSheetHeaders(EMPLOYEE_SHEET_NAME);
    console.log(`Headers fetched: ${JSON.stringify(headers)}`);

    if (headers.length === 0) {
      console.warn(`No headers found in ${EMPLOYEE_SHEET_NAME}. Returning empty list.`);
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    const lastColumnLetter = String.fromCharCode('A'.charCodeAt(0) + headers.length - 1);
    const range = `${EMPLOYEE_SHEET_NAME}!A2:${lastColumnLetter}`;
    console.log(`Fetching employee data from range: ${range}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const dataRows = response.data.values;
    console.log(`Data rows fetched: ${dataRows ? dataRows.length : 0}`);

    if (!dataRows || dataRows.length === 0) {
      console.log("No data rows found in Employees sheet.");
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    const headerRow = headers;
    const employees = dataRows.map((row, index) => {
      const emp = { id: index + 2 };
      headerRow.forEach((header, i) => {
        const key = Object.keys(HEADER_MAPPING).find(k => HEADER_MAPPING[k] === header);
        if (key) {
          const value = row[i] !== undefined && row[i] !== null ? row[i] : '';
          emp[key] = (key === 'salaryHeld') ? (String(value).toUpperCase() === 'TRUE') : value;
        }
      });
      emp.status = emp.status || 'Active';
      emp.salaryHeld = emp.salaryHeld || false;
      return emp;
    });

    console.log(`Processed ${employees.length} employees.`);
    return { statusCode: 200, body: JSON.stringify(employees) };
  } catch (error) {
    console.error("Error in getEmployees:", error.stack || error.message);
    if (error.response) {
      console.error("Google API response error:", JSON.stringify(error.response.data));
    }
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'An internal server error occurred.',
        details: error.message,
      }),
    };
  }
}


// --- API Action: Save Employee (Add or Update) ---
async function saveEmployee(employeeData) {
     console.log("Executing saveEmployee with data:", employeeData);
    const headerRow = await getSheetHeaders(EMPLOYEE_SHEET_NAME);
    if (headerRow.length === 0) throw new Error("Cannot save employee: No headers found in sheet.");

    const dataToSave = { ...employeeData };
    dataToSave.salaryHeld = (dataToSave.salaryHeld === true || String(dataToSave.salaryHeld).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
    dataToSave.status = dataToSave.status || 'Active';
    dataToSave.separationDate = dataToSave.separationDate || '';
    dataToSave.remarks = dataToSave.remarks || '';

    const newRow = headerRow.map(header => {
        const key = Object.keys(HEADER_MAPPING).find(k => HEADER_MAPPING[k] === header);
        const value = (key && dataToSave[key] !== undefined && dataToSave[key] !== null) ? String(dataToSave[key]) : '';
        return value;
    });
    console.log("Mapped row data for save/update:", newRow);

    const lookupId = employeeData.originalEmployeeId || employeeData.employeeId; // originalEmployeeId sent on edit
    if (!lookupId) {
         console.error("Missing employeeId for save operation.");
         throw new Error("Employee ID is missing for save operation.");
    }
    console.log(`Looking up row for Employee ID: ${lookupId}`);
    const rowIndex = await findEmployeeRow(lookupId);

    if (rowIndex !== -1) { // Update
        if (employeeData.originalEmployeeId && employeeData.employeeId !== employeeData.originalEmployeeId) {
            console.warn(`Attempted to change Employee ID from ${employeeData.originalEmployeeId} to ${employeeData.employeeId}. Reverting.`);
            const idColIndex = headerRow.indexOf(HEADER_MAPPING.employeeId);
            if (idColIndex !== -1) newRow[idColIndex] = employeeData.originalEmployeeId;
        }
        console.log(`Updating employee at row ${rowIndex} with ID: ${lookupId}`);
        const lastColumnLetter = String.fromCharCode('A'.charCodeAt(0) + headerRow.length - 1);
        const range = `${EMPLOYEE_SHEET_NAME}!A${rowIndex}:${lastColumnLetter}${rowIndex}`;
        console.log(`Update range: ${range}`);
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range, valueInputOption: 'USER_ENTERED', resource: { values: [newRow] }
            });
            console.log("Google Sheets API update successful.");
            return { statusCode: 200, body: JSON.stringify({ message: 'Employee updated successfully!' }) };
        } catch (updateError) {
             console.error(`Error updating row ${rowIndex} in Google Sheets:`, updateError.response ? updateError.response.data : updateError.message);
              const details = updateError.errors?.[0]?.message || updateError.message;
              throw new Error(`Failed to update employee in Google Sheet: ${details}`);
        }
    } else { // Append
        if (employeeData.originalEmployeeId) {
             console.error(`Employee with original ID ${employeeData.originalEmployeeId} not found for update.`);
             throw new Error(`Employee with original ID ${employeeData.originalEmployeeId} not found for update.`);
        }
        console.log(`Checking again for duplicate ID before appending: ${employeeData.employeeId}`);
        const checkAgainIndex = await findEmployeeRow(employeeData.employeeId);
        if (checkAgainIndex !== -1) {
             console.warn(`Employee ID ${employeeData.employeeId} already exists (row ${checkAgainIndex}).`);
             return { statusCode: 409, headers:{}, body: JSON.stringify({ error: `Employee ID ${employeeData.employeeId} already exists.` }) };
        }
        console.log(`Appending new employee with ID: ${employeeData.employeeId}`);
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID, range: `${EMPLOYEE_SHEET_NAME}!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: [newRow] }
            });
            console.log("Google Sheets API append successful.");
            return { statusCode: 200, body: JSON.stringify({ message: 'Employee added successfully!' }) };
        } catch (appendError) {
             console.error(`Error appending row in Google Sheets:`, appendError.response ? appendError.response.data : appendError.message);
             const details = appendError.errors?.[0]?.message || appendError.message;
             throw new Error(`Failed to add employee to Google Sheet: ${details}`);
        }
    }
}

// --- API Action: Update Status (Handles Resign, Terminate, Hold/Unhold) ---
async function updateStatus(statusData) {
    const { employeeId, ...updates } = statusData;
    console.log(`Executing updateStatus for Employee ID: ${employeeId} with updates:`, updates);

    if (!employeeId) {
        console.error("Missing employeeId in updateStatus request.");
        throw new Error("Employee ID is required for status update.");
    }

    const rowIndex = await findEmployeeRow(employeeId);
    if (rowIndex === -1) {
        console.error(`Employee ID ${employeeId} not found for status update.`);
        return { statusCode: 404, body: JSON.stringify({ error: `Employee with ID ${employeeId} not found` }) };
    }

    const headerRow = await getSheetHeaders(EMPLOYEE_SHEET_NAME);
    if (headerRow.length === 0) throw new Error("Cannot update status: No headers found in sheet.");

    const dataToUpdate = []; // Array for batchUpdate data objects
    let currentSalary = null; // To store salary for logging

    // --- Log Events First ---
    // Fetch salary for logging purposes
    currentSalary = await getEmployeeSalary(employeeId);

    // Log Hold/Unhold event
    if (updates.hasOwnProperty('salaryHeld')) {
        const isHolding = (updates.salaryHeld === true || String(updates.salaryHeld).toUpperCase() === 'TRUE');
        const actionText = isHolding ? 'Salary Hold' : 'Salary Unhold';
        await logEvent(HOLD_LOG_SHEET_NAME, [employeeId, currentSalary || 'N/A', actionText]);
    }

    // Log Resign/Terminate event
    if (updates.hasOwnProperty('status') && (updates.status === 'Resigned' || updates.status === 'Terminated')) {
        await logEvent(SEPARATION_LOG_SHEET_NAME, [
            employeeId,
            currentSalary || 'N/A',
            updates.separationDate || '', // Use separationDate from updates if present
            updates.status,
            updates.remarks || '' // Use remarks from updates if present
        ]);
    }

    // --- Prepare Updates for Employee Sheet ---
    for (const key in updates) {
        if (!updates.hasOwnProperty(key)) continue;

        console.log(`Preparing update for key: ${key}, value: ${updates[key]}`);
        const headerName = HEADER_MAPPING[key];
        if (!headerName) {
            console.warn(`No header mapping found for key: ${key}. Skipping.`);
            continue;
        }
        const colIndex = headerRow.indexOf(headerName);
        if (colIndex === -1) {
            console.warn(`Header '${headerName}' not found. Skipping.`);
            continue;
        }
        const colLetter = String.fromCharCode('A'.charCodeAt(0) + colIndex);
        let valueToSave = updates[key];
        if (key === 'salaryHeld') {
            valueToSave = (valueToSave === true || String(valueToSave).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
        }
        valueToSave = (valueToSave === null || valueToSave === undefined) ? '' : String(valueToSave);
        dataToUpdate.push({
            range: `${EMPLOYEE_SHEET_NAME}!${colLetter}${rowIndex}`,
            values: [[valueToSave]],
        });
        console.log(`Added update for ${key}: Range=${colLetter}${rowIndex}, Value=${valueToSave}`);
    }

    // --- Apply Implicit Business Logic ---
    // 1. If status is changing *away* from Active
    if (updates.hasOwnProperty('status') && updates.status !== 'Active') {
        console.log(`Status changing to ${updates.status}. Ensuring salaryHeld is FALSE.`);
        const heldHeader = HEADER_MAPPING.salaryHeld;
        const heldColIndex = headerRow.indexOf(heldHeader);
        if (heldColIndex !== -1) {
            const heldColLetter = String.fromCharCode('A'.charCodeAt(0) + heldColIndex);
            // Check if salaryHeld update already exists and overwrite if needed
            let existingUpdateIndex = dataToUpdate.findIndex(d => d.range.startsWith(`${EMPLOYEE_SHEET_NAME}!${heldColLetter}${rowIndex}`));
            if (existingUpdateIndex !== -1) {
                 console.log("Overwriting existing salaryHeld update to FALSE.");
                dataToUpdate[existingUpdateIndex].values = [['FALSE']];
            } else {
                dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${heldColLetter}${rowIndex}`, values: [['FALSE']] });
                console.log("Added implicit update: salaryHeld = FALSE.");
            }
        } else {
            console.warn("Could not find 'salaryHeld' column for implicit update.");
        }
    }
    // 2. If *only* salaryHeld is being updated
    else if (updates.hasOwnProperty('salaryHeld') && !updates.hasOwnProperty('status')) {
        console.log("Only salaryHeld updated. Ensuring status is 'Active'.");
        const statusHeader = HEADER_MAPPING.status;
        const statusColIndex = headerRow.indexOf(statusHeader);
        if (statusColIndex !== -1) {
            const statusColLetter = String.fromCharCode('A'.charCodeAt(0) + statusColIndex);
             // Check if status update already exists and overwrite if needed
             let existingUpdateIndex = dataToUpdate.findIndex(d => d.range.startsWith(`${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`));
             if (existingUpdateIndex !== -1) {
                  console.log("Overwriting existing status update to 'Active'.");
                 dataToUpdate[existingUpdateIndex].values = [['Active']];
             } else {
                 dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`, values: [['Active']] });
                 console.log("Added implicit update: status = Active.");
             }
        } else {
            console.warn("Could not find 'status' column for implicit update.");
        }
    }

    // --- Execute Batch Update ---
    if (dataToUpdate.length > 0) {
        console.log(`Attempting batch update for row ${rowIndex} with ${dataToUpdate.length} updates:`, JSON.stringify(dataToUpdate));
        try {
            const batchUpdateResult = await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: { valueInputOption: 'USER_ENTERED', data: dataToUpdate },
            });
            console.log("Google Sheets API batchUpdate result:", batchUpdateResult.data);
            // Invalidate header cache after successful update, as structure *might* change (unlikely here)
             headerCache = {};
             headerCacheTimestamp = {};
        } catch (batchUpdateError) {
            console.error(`Error during batchUpdate for row ${rowIndex}:`, batchUpdateError.response ? batchUpdateError.response.data : batchUpdateError.message);
            const details = batchUpdateError.errors?.[0]?.message || batchUpdateError.message;
            throw new Error(`Failed to update employee status in Google Sheet: ${details}`);
        }
    } else {
        console.warn(`No valid updates derived for employee ID ${employeeId}.`);
        return { statusCode: 400, body: JSON.stringify({ message: 'No valid fields found to update based on sheet headers.' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Employee status updated successfully!' }) };
}


// --- API Action: Save Salary Sheet ---
async function saveSalarySheet({ sheetId, sheetData }) {
     console.log(`Executing saveSalarySheet for sheetId: ${sheetId}`);
     if (!sheetId || !sheetData || !Array.isArray(sheetData)) {
          console.error("Invalid input for saveSalarySheet:", { sheetId, sheetData });
         throw new Error("Invalid input: sheetId and sheetData array are required.");
     }
    const sheetName = `${SALARY_SHEET_PREFIX}${sheetId}`;
    
    try {
        await ensureSheetAndHeaders(sheetName, ["Employee ID", "Name", "Gross Salary", "Days Present", "Deduction", "Net Salary", "Status"]); // Ensure sheet exists with headers

        const rows = sheetData.map(row => [
            row.employeeId || '', row.name || '', row.salary ?? '', row.daysPresent ?? '',
            row.deduction ?? '', row.netSalary ?? '', row.status || ''
        ]);
        console.log(`Prepared ${rows.length} data rows for sheet ${sheetName}.`);
        
        // Clear existing data *after* the header row
        const clearRange = `${sheetName}!A2:G`; // Start clearing from row 2
        console.log(`Clearing range: ${clearRange}`);
         await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: clearRange });
         console.log(`Cleared data in sheet range: ${clearRange}`);

        // Write new data *after* the header row
         const updateRange = `${sheetName}!A2`; // Start writing from row 2
         console.log(`Updating range: ${updateRange}`);
        if (rows.length > 0) { // Only update if there is data
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range: updateRange, valueInputOption: 'USER_ENTERED',
                resource: { values: rows },
            });
            console.log(`Updated data in sheet: ${sheetName}`);
        } else {
             console.log(`No data rows to write to ${sheetName}.`);
        }
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Salary sheet saved successfully!' }) };

    } catch (sheetError) {
         console.error(`Error saving salary sheet ${sheetName}:`, sheetError.response ? sheetError.response.data : sheetError.message);
         const detail = sheetError.errors?.[0]?.message || sheetError.message;
         throw new Error(`Failed to save salary sheet: ${detail}`);
    }
}


// --- API Action: Get Past Sheets ---
async function getPastSheets() {
     console.log("Executing getPastSheets");
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(title))' });
    const pastSheets = spreadsheet.data.sheets
        .map(s => s.properties.title)
        .filter(title => title && title.startsWith(SALARY_SHEET_PREFIX))
        .map(title => ({ sheetId: title.replace(SALARY_SHEET_PREFIX, '') }));
     console.log(`Found ${pastSheets.length} past salary sheets.`);
    return { statusCode: 200, body: JSON.stringify(pastSheets) };
}

// --- API Action: Get Sheet Data ---
async function getSheetData(sheetId) {
     console.log(`Executing getSheetData for sheetId: ${sheetId}`);
     if (!sheetId) {
         console.error("getSheetData called without sheetId.");
         throw new Error("sheetId parameter is required.");
     }
    const sheetName = `${SALARY_SHEET_PREFIX}${sheetId}`;
    
     console.log(`Checking if sheet exists: ${sheetName}`);
     const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(title))' });
     const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === sheetName);
     if (!sheetExists) {
          console.error(`Sheet ${sheetName} not found.`);
         return { statusCode: 404, body: JSON.stringify({ error: `Sheet '${sheetName}' not found.` }) };
     }

     console.log(`Fetching data from sheet: ${sheetName}`);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: sheetName });
    
    const rows = response.data.values;
    if (!rows || rows.length < 2) { // Need header + data
         console.warn(`Sheet ${sheetName} has no data rows.`);
        return { statusCode: 200, body: JSON.stringify({ sheetId, sheetData: [] }) };
    }
    
    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map(h => (h || '').toLowerCase().replace(/\s+/g, ''));
    console.log(`Headers found in ${sheetName}:`, headers);
    
    const expectedHeaders = { // For salary sheets
        employeeId: 'employeeid', name: 'name', salary: 'grosssalary', daysPresent: 'dayspresent',
        deduction: 'deduction', netSalary: 'netsalary', status: 'status'
    };
     const colIndices = {};
     for (const key in expectedHeaders) {
         colIndices[key] = headers.indexOf(expectedHeaders[key]);
         if (colIndices[key] === -1) console.warn(`Expected header '${expectedHeaders[key]}' not found in ${sheetName}`);
     }

    const sheetData = dataRows.map(row => {
        const rowData = {};
        for (const key in expectedHeaders) {
             const index = colIndices[key];
             let value = (index !== -1 && row[index] !== undefined && row[index] !== null) ? row[index] : '';
            if (['salary', 'deduction', 'netSalary'].includes(key)) rowData[key] = parseFloat(value) || 0;
            else if (key === 'daysPresent') rowData[key] = parseInt(value, 10) || 0;
            else rowData[key] = String(value);
        }
        return rowData;
    });
     console.log(`Processed ${sheetData.length} rows from sheet ${sheetName}`);
    return { statusCode: 200, body: JSON.stringify({ sheetId, sheetData }) };
}

