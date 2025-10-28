// netlify/functions/lib/_employeeActions.js

// Constants needed for logEvent
const HOLD_LOG_SHEET_NAME = 'Hold_Log';
const SEPARATION_LOG_SHEET_NAME = 'Separation_Log';
const TRANSFER_LOG_SHEET_NAME = 'Transfer_Log';
const HOLD_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Action'];
const SEPARATION_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Separation Date', 'Status', 'Remarks'];
const TRANSFER_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Employee Name', 'Old Sub Center', 'New Sub Center', 'Reason', 'Transfer Date']; // Log remains the same for simplicity

// --- Helper to get unique values for a specific field ---
async function getUniqueFieldValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, fieldKey) {
    console.log(`Executing getUniqueFieldValues for: ${fieldKey}`);
    try {
        const headers = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
        const headerName = HEADER_MAPPING[fieldKey]; // e.g., 'project', 'projectoffice'

        if (!headerName) {
            console.error(`Header mapping not found for field key: ${fieldKey}`);
            return { statusCode: 500, body: JSON.stringify({ error: `Configuration error: Field key '${fieldKey}' not mapped.` }) };
        }

        const colIndex = headers.indexOf(headerName);
        if (colIndex === -1) {
            console.warn(`Could not find '${headerName}' column header in ${EMPLOYEE_SHEET_NAME}.`);
            return { statusCode: 200, body: JSON.stringify([]) }; // Return empty if header not found
        }

        const colLetter = helpers.getColumnLetter(colIndex);
        const range = `${EMPLOYEE_SHEET_NAME}!${colLetter}2:${colLetter}`; // Scan only the specific column from row 2

        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const rows = response.data.values || [];

        const uniqueValues = [...new Set(rows.map(row => row[0]).filter(val => val && String(val).trim() !== ''))];
        uniqueValues.sort();

        console.log(`Unique values found and sorted for ${fieldKey}:`, JSON.stringify(uniqueValues));
        return { statusCode: 200, body: JSON.stringify(uniqueValues) };

    } catch (error) {
        console.error(`Error in getUniqueFieldValues for ${fieldKey}:`, error.stack || error.message);
        if (error.code === 400 && error.message.includes('Unable to parse range')) {
             console.warn(`Sheet '${EMPLOYEE_SHEET_NAME}' might be empty or column for ${fieldKey} not found.`);
             return { statusCode: 200, body: JSON.stringify([]) };
        }
        return { statusCode: 500, body: JSON.stringify({ error: `Internal server error fetching ${fieldKey} values.`, details: error.message }) };
    }
}

// --- Specific actions using the helper ---
async function getProjects(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    return getUniqueFieldValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, 'project');
}
async function getProjectOffices(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    return getUniqueFieldValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, 'projectOffice');
}
async function getReportProjects(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    return getUniqueFieldValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, 'reportProject');
}
// --- End new unique value actions ---


async function getEmployees(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    console.log("Executing getEmployees");
    try {
        // Fetch Actual Headers
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

        // Fetch Data for all columns
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
                        // Attempt number conversion, default to 0 if invalid/empty
                        const numValue = parseFloat(value);
                        emp[key] = isNaN(numValue) ? 0 : numValue;
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
        return { statusCode: 200, body: JSON.stringify(employees) }; // Return only employees

    } catch (error) {
        console.error("Error inside getEmployees action:", error.stack || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error fetching employees.', details: error.message })};
    }
}

async function saveEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, employeeData) {
     console.log("Executing saveEmployee with dynamic data:", JSON.stringify(employeeData).substring(0, 500));
    // Get Current Headers from Sheet
    const actualHeaders = (await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${EMPLOYEE_SHEET_NAME}!1:1` })).data.values?.[0] || [];
    if (actualHeaders.length === 0) throw new Error("Cannot save: No headers found in sheet.");
    const normalizedHeaders = actualHeaders.map(h => (h || '').trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));

    // Ensure defaults for specific fields before mapping
     const dataToSave = { ...employeeData }; // Work with a copy
     dataToSave.status = dataToSave.status || 'Active';
     dataToSave.salaryHeld = (dataToSave.salaryHeld === true || String(dataToSave.salaryHeld).toUpperCase() === 'TRUE'); // Convert input boolean/string
     dataToSave.separationDate = dataToSave.separationDate || '';
     dataToSave.remarks = dataToSave.remarks || '';
     dataToSave.holdTimestamp = dataToSave.holdTimestamp || '';
     dataToSave.lastTransferDate = dataToSave.lastTransferDate || '';
     dataToSave.lastSubcenter = dataToSave.lastSubcenter || '';
     dataToSave.lastTransferReason = dataToSave.lastTransferReason || '';

    // Prepare data based on ACTUAL headers
    const newRow = actualHeaders.map((header, index) => {
         const normalizedHeader = normalizedHeaders[index];
         // Find the corresponding JS key
         let key = null;
         for (const jsKey in HEADER_MAPPING) { if (HEADER_MAPPING[jsKey] === normalizedHeader) { key = jsKey; break; } }
         if (!key) { key = headerToKey(header); } // Fallback to generated key

         let value = dataToSave[key] ?? ''; // Get value using the determined key from the prepared data

         // Format specific known fields back for sheet
         if (key === 'salaryHeld') {
              value = (value === true || String(value).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
         }
         // Ensure other values are strings
         value = (value == null) ? '' : String(value);

         return value;
    });
    console.log("Mapped dynamic row data for save/update:", newRow);


    const lookupId = dataToSave.originalEmployeeId || dataToSave.employeeId;
    if (!lookupId) throw new Error("Employee ID missing for save.");

    const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, lookupId);

    if (rowIndex !== -1) { // Update
        if (dataToSave.originalEmployeeId && dataToSave.employeeId !== dataToSave.originalEmployeeId) {
             console.warn(`Attempted ID change. Reverting.`);
             const idColIndex = normalizedHeaders.indexOf(HEADER_MAPPING.employeeId);
             if (idColIndex !== -1) newRow[idColIndex] = dataToSave.originalEmployeeId;
        }
        console.log(`Updating employee at row ${rowIndex}`);
        const lastColumnLetter = helpers.getColumnLetter(actualHeaders.length - 1);
        const range = `${EMPLOYEE_SHEET_NAME}!A${rowIndex}:${lastColumnLetter}${rowIndex}`;
        await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range, valueInputOption: 'USER_ENTERED', resource: { values: [newRow] } });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee updated.' }) };
    } else { // Append
        if (dataToSave.originalEmployeeId) throw new Error(`Original ID ${dataToSave.originalEmployeeId} not found for update.`);
        const checkAgainIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, dataToSave.employeeId);
        if (checkAgainIndex !== -1) return { statusCode: 409, body: JSON.stringify({ error: `Employee ID ${dataToSave.employeeId} already exists.` }) };
        console.log(`Appending new employee: ${dataToSave.employeeId}`);
        await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${EMPLOYEE_SHEET_NAME}!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: [newRow] } });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee added.' }) };
    }
}

async function updateStatus(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, statusData) {
    const { employeeId, ...updates } = statusData;
    console.log(`Executing updateStatus for ${employeeId}:`, updates);
    if (!employeeId) throw new Error("Employee ID required.");
    const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeId);
    if (rowIndex === -1) return { statusCode: 404, body: JSON.stringify({ error: `Employee ${employeeId} not found` }) };
    const headerRow = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
    if (headerRow.length === 0) throw new Error("Cannot update: No headers found.");
    const dataToUpdate = [];
    const formattedTimestamp = helpers.formatDateForSheet(new Date());
    const currentSalary = await helpers.getEmployeeSalary(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.findEmployeeRow, helpers.getSheetHeaders, employeeId);
    if (updates.hasOwnProperty('salaryHeld')) {
        const isHolding = (updates.salaryHeld === true || String(updates.salaryHeld).toUpperCase() === 'TRUE');
        const actionText = isHolding ? 'Salary Hold' : 'Salary Unhold';
        await helpers.logEvent(sheets, SPREADSHEET_ID, HOLD_LOG_SHEET_NAME, HOLD_LOG_HEADERS, [employeeId, currentSalary || 'N/A', actionText], formattedTimestamp, helpers.ensureSheetAndHeaders);
        const tsHeaderName = HEADER_MAPPING.holdTimestamp; const tsColIndex = headerRow.indexOf(tsHeaderName);
        if (tsColIndex !== -1) {
            dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(tsColIndex)}${rowIndex}`, values: [[isHolding ? formattedTimestamp : '']] });
        } else { console.warn(`Column 'holdtimestamp' not found.`); }
    }
     if (updates.hasOwnProperty('status') && (updates.status === 'Resigned' || updates.status === 'Terminated')) {
         await helpers.logEvent(sheets, SPREADSHEET_ID, SEPARATION_LOG_SHEET_NAME, SEPARATION_LOG_HEADERS, [employeeId, currentSalary || 'N/A', updates.separationDate || '', updates.status, updates.remarks || ''], formattedTimestamp, helpers.ensureSheetAndHeaders);
     }
    for (const key in updates) {
        if (!updates.hasOwnProperty(key)) continue;
        const headerName = HEADER_MAPPING[key];
        if (!headerName) { console.warn(`No header mapping for ${key}. Skipping.`); continue; }
        const colIndex = headerRow.indexOf(headerName);
        if (colIndex === -1) { console.warn(`Header '${headerName}' not found. Skipping.`); continue; }
        const colLetter = helpers.getColumnLetter(colIndex);
        let valueToSave = updates[key];
        if (key === 'salaryHeld') valueToSave = (valueToSave === true || String(valueToSave).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
        valueToSave = (valueToSave == null) ? '' : String(valueToSave);
        dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${colLetter}${rowIndex}`, values: [[valueToSave]] });
    }
    if (updates.hasOwnProperty('status') && updates.status !== 'Active') {
        const heldHeader = HEADER_MAPPING.salaryHeld; const heldColIndex = headerRow.indexOf(heldHeader);
        if (heldColIndex !== -1) {
            const heldColLetter = helpers.getColumnLetter(heldColIndex);
            let existing = dataToUpdate.find(d => d.range.startsWith(`${EMPLOYEE_SHEET_NAME}!${heldColLetter}${rowIndex}`));
            if (existing) existing.values = [['FALSE']]; else dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${heldColLetter}${rowIndex}`, values: [['FALSE']] });
             const tsHeaderName = HEADER_MAPPING.holdTimestamp; const tsColIndex = headerRow.indexOf(tsHeaderName);
             if (tsColIndex !== -1) {
                 const tsColLetter = helpers.getColumnLetter(tsColIndex);
                 let tsExisting = dataToUpdate.find(d => d.range.startsWith(`${EMPLOYEE_SHEET_NAME}!${tsColLetter}${rowIndex}`));
                 if (tsExisting) tsExisting.values = [['']]; else dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${tsColLetter}${rowIndex}`, values: [['']] });
             }
        }
    } else if (updates.hasOwnProperty('salaryHeld') && !updates.hasOwnProperty('status')) {
        const statusHeader = HEADER_MAPPING.status; const statusColIndex = headerRow.indexOf(statusHeader);
        if (statusColIndex !== -1) {
            const statusColLetter = helpers.getColumnLetter(statusColIndex);
             let existing = dataToUpdate.find(d => d.range.startsWith(`${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`));
            if (existing) existing.values = [['Active']]; else dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`, values: [['Active']] });
        }
    }
    if (dataToUpdate.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource: { valueInputOption: 'USER_ENTERED', data: dataToUpdate } });
    } else {
        return { statusCode: 400, body: JSON.stringify({ message: 'No valid fields to update.' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ message: 'Status updated successfully.' }) };
}

async function getSubCenters(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    return getUniqueFieldValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, 'subCenter');
}

async function transferEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers,
    { employeeId, newProject, newProjectOffice, newSubCenter, newReportProject, reason, transferDate } // Added new fields
) {
    console.log(`Executing transferEmployee for ${employeeId} to Project:${newProject}, Office:${newProjectOffice}, SubCenter:${newSubCenter}, Report:${newReportProject}`);
    if (!employeeId || !newProject || !newProjectOffice || !newSubCenter || !newReportProject || !reason || !transferDate) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields for transfer.' }) };
    }

    try {
        const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeId);
        if (rowIndex === -1) return { statusCode: 404, body: JSON.stringify({ error: `Employee ${employeeId} not found` }) };

        const headerRow = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
        if (headerRow.length === 0) throw new Error("Cannot transfer: Employee sheet headers not found.");

        const projectColIndex = headerRow.indexOf(HEADER_MAPPING.project);
        const projectOfficeColIndex = headerRow.indexOf(HEADER_MAPPING.projectOffice);
        const subCenterColIndex = headerRow.indexOf(HEADER_MAPPING.subCenter);
        const reportProjectColIndex = headerRow.indexOf(HEADER_MAPPING.reportProject);
        const nameColIndex = headerRow.indexOf(HEADER_MAPPING.name);
        const lastDateColIndex = headerRow.indexOf(HEADER_MAPPING.lastTransferDate);
        const lastSubCenterColIndex = headerRow.indexOf(HEADER_MAPPING.lastSubcenter);
        const lastReasonColIndex = headerRow.indexOf(HEADER_MAPPING.lastTransferReason);

        if (projectColIndex === -1 || projectOfficeColIndex === -1 || subCenterColIndex === -1 || reportProjectColIndex === -1 ||
            nameColIndex === -1 || lastDateColIndex === -1 || lastSubCenterColIndex === -1 || lastReasonColIndex === -1) {
            console.error("Missing columns in Employees sheet for transfer:", { projectColIndex, projectOfficeColIndex, subCenterColIndex, reportProjectColIndex, nameColIndex, lastDateColIndex, lastSubCenterColIndex, lastReasonColIndex });
            throw new Error("Required columns for transfer not found in Employee sheet.");
        }

        const nameColLetter = helpers.getColumnLetter(nameColIndex);
        const subCenterColLetter = helpers.getColumnLetter(subCenterColIndex);
        const rangesToRead = [
            `${EMPLOYEE_SHEET_NAME}!${nameColLetter}${rowIndex}`,
            `${EMPLOYEE_SHEET_NAME}!${subCenterColLetter}${rowIndex}`
        ];
        const readResponse = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: rangesToRead });
        const employeeName = readResponse.data.valueRanges?.[0]?.values?.[0]?.[0] || 'N/A';
        const oldSubCenter = readResponse.data.valueRanges?.[1]?.values?.[0]?.[0] || 'N/A';
        console.log(`Fetched current values - Name: ${employeeName}, Old Sub Center: ${oldSubCenter}`);

        const dataToUpdate = [
            { range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(projectColIndex)}${rowIndex}`, values: [[newProject]] },
            { range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(projectOfficeColIndex)}${rowIndex}`, values: [[newProjectOffice]] },
            { range: `${EMPLOYEE_SHEET_NAME}!${subCenterColLetter}${rowIndex}`, values: [[newSubCenter]] }, // Current Sub Center
            { range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(reportProjectColIndex)}${rowIndex}`, values: [[newReportProject]] },
            { range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(lastDateColIndex)}${rowIndex}`, values: [[transferDate]] },
            { range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(lastSubCenterColIndex)}${rowIndex}`, values: [[oldSubCenter]] }, // Last Subcenter (FROM)
            { range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(lastReasonColIndex)}${rowIndex}`, values: [[reason]] }
        ];

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { valueInputOption: 'USER_ENTERED', data: dataToUpdate }
        });
        console.log("Batch update successful for transfer.");

        const formattedTimestamp = helpers.formatDateForSheet(new Date());
        await helpers.logEvent(
            sheets, SPREADSHEET_ID, TRANSFER_LOG_SHEET_NAME, TRANSFER_LOG_HEADERS,
            [employeeId, employeeName, oldSubCenter, newSubCenter, reason, transferDate],
            formattedTimestamp, helpers.ensureSheetAndHeaders
        );

        return { statusCode: 200, body: JSON.stringify({ message: 'Employee transferred successfully.' }) };

    } catch (error) {
        console.error(`Error transferring employee ${employeeId}:`, error.stack || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal server error occurred during transfer.', details: error.message }) };
    }
}

module.exports = {
    getEmployees,
    saveEmployee,
    updateStatus,
    getSubCenters,
    getProjects,
    getProjectOffices,
    getReportProjects,
    transferEmployee
};

// --- Helper functions used internally ---
function headerToKey(header) {
    if (!header) return '';
    return header.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}
function createReverseHeaderMapping(mapping) {
    const reverseMap = {};
    for (const key in mapping) { reverseMap[mapping[key]] = key; }
    return reverseMap;
}