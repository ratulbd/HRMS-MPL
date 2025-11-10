// netlify/functions/lib/_employeeActions.js

// Constants needed for logEvent
const HOLD_LOG_SHEET_NAME = 'Hold_Log';
const SEPARATION_LOG_SHEET_NAME = 'Separation_Log';
const TRANSFER_LOG_SHEET_NAME = 'Transfer_Log';
const REJOIN_LOG_SHEET_NAME = 'Rejoin_Log';
// --- MODIFICATION: Add File Closing Log constants ---
const FILE_CLOSING_LOG_SHEET_NAME = 'FileClosing_Log';
const FILE_CLOSING_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Previous Status', 'File Closing Date', 'File Closing Remarks'];
// --- END MODIFICATION ---

const REJOIN_LOG_HEADERS = ['Timestamp', 'Previous Employee ID', 'Previous Subcenter', 'Separation Date', 'Separation Reason', 'New Employee ID', 'New Subcenter', 'New Joining Date'];
// --- MODIFICATION: Add Remarks to Hold Log ---
const HOLD_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Action', 'Remarks'];
// --- END MODIFICATION ---
const SEPARATION_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Separation Date', 'Status', 'Remarks'];
const TRANSFER_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Employee Name', 'Old Sub Center', 'New Sub Center', 'Reason', 'Transfer Date'];

// --- Helper to create JS-friendly keys from headers ---
function headerToKey(header) {
    if (!header) return '';
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

// --- Helper to get unique values for a specific field ---
async function getUniqueFieldValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, fieldKey) {
    console.log(`Executing getUniqueFieldValues for: ${fieldKey}`);
    try {
        const headers = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
        const headerName = HEADER_MAPPING[fieldKey];

        if (!headerName) {
            console.error(`Header mapping not found for field key: ${fieldKey}`);
            return { statusCode: 500, body: JSON.stringify({ error: `Configuration error: Field key '${fieldKey}' not mapped.` }) };
        }

        const colIndex = headers.indexOf(headerName);
        if (colIndex === -1) {
            console.warn(`Could not find '${headerName}' column header in ${EMPLOYEE_SHEET_NAME}.`);
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        const colLetter = helpers.getColumnLetter(colIndex);
        const range = `${EMPLOYEE_SHEET_NAME}!${colLetter}2:${colLetter}`;

        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const rows = response.data.values || [];

        const uniqueValues = [...new Set(rows.map(row => row[0])
                                          .filter(val => val && String(val).trim() !== '')
                                          .map(val => String(val).trim())
                                     )];
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
async function getSubCenters(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    return getUniqueFieldValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, 'subCenter');
}

async function getEmployees(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    console.log("Executing getEmployees");
    try {
        const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${EMPLOYEE_SHEET_NAME}!1:1`,
        });
        const actualHeaders = headerResponse.data.values ? headerResponse.data.values[0] : [];
        if (actualHeaders.length === 0) {
             console.warn(`No headers found in ${EMPLOYEE_SHEET_NAME}. Returning empty list.`);
             return { statusCode: 200, body: JSON.stringify([]) };
        }
        const normalizedHeaders = actualHeaders.map(h => (h || '').trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));
        const reverseMapping = createReverseHeaderMapping(HEADER_MAPPING);

        const lastColumnLetter = helpers.getColumnLetter(actualHeaders.length - 1);
        const range = `${EMPLOYEE_SHEET_NAME}!A2:${lastColumnLetter}`;
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
                const key = reverseMapping[normalizedHeader] || headerToKey(header);
                if (key) {
                    const value = row[i] ?? '';
                    if (key === 'salaryHeld') {
                        emp[key] = (String(value).toUpperCase() === 'TRUE');
                    } else if (key === 'salary' || key === 'mobileLimit' || key === 'workExperience') {
                        const numValue = parseFloat(value);
                        emp[key] = isNaN(numValue) ? 0 : numValue;
                    }
                    else { emp[key] = value; }
                }
            });
            emp.status = emp.status || 'Active';
            emp.salaryHeld = (emp.salaryHeld === true);
            return emp;
        });

        console.log(`Processed ${employees.length} employees dynamically.`);
        return { statusCode: 200, body: JSON.stringify(employees) };

    } catch (error) {
        console.error("Error inside getEmployees action:", error.stack || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error fetching employees.', details: error.message })};
    }
}

async function saveEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, employeeData) {
     console.log("Executing saveEmployee...");
    const actualHeaders = (await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${EMPLOYEE_SHEET_NAME}!1:1` })).data.values?.[0] || [];
    if (actualHeaders.length === 0) throw new Error("Cannot save: No headers found in sheet.");
    const normalizedHeaders = actualHeaders.map(h => (h || '').trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));

     const dataToSave = { ...employeeData };
     if (!dataToSave.originalEmployeeId) { // Set defaults only for new employees
         dataToSave.status = dataToSave.status || 'Active';
         dataToSave.salaryHeld = (dataToSave.salaryHeld === true || String(dataToSave.salaryHeld).toUpperCase() === 'TRUE');
         dataToSave.separationDate = dataToSave.separationDate || '';
         dataToSave.remarks = dataToSave.remarks || '';
         dataToSave.holdTimestamp = dataToSave.holdTimestamp || '';
         dataToSave.lastTransferDate = dataToSave.lastTransferDate || '';
         dataToSave.lastSubcenter = dataToSave.lastSubcenter || '';
         dataToSave.lastTransferReason = dataToSave.lastTransferReason || '';
         // --- MODIFICATION: Add defaults for new file closing columns ---
         dataToSave.fileClosingDate = dataToSave.fileClosingDate || '';
         dataToSave.fileClosingRemarks = dataToSave.fileClosingRemarks || '';
         // --- END MODIFICATION ---
     }

    // --- MODIFICATION: Remove re-join helper data before saving to sheet ---
    delete dataToSave.isRejoin;
    delete dataToSave.rejoinLogData;
    // --- END MODIFICATION ---

    const newRow = actualHeaders.map((header, index) => {
         const normalizedHeader = normalizedHeaders[index];
         let key = null;
         for (const jsKey in HEADER_MAPPING) { if (HEADER_MAPPING[jsKey] === normalizedHeader) { key = jsKey; break; } }
         if (!key) { key = headerToKey(header); }
         let value = dataToSave[key] ?? '';
         if (key === 'salaryHeld') {
              value = (value === true || String(value).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
         }
         value = (value == null) ? '' : String(value);
         return value;
    });

    const lookupId = dataToSave.originalEmployeeId || dataToSave.employeeId;
    if (!lookupId) throw new Error("Employee ID missing for save.");

    const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, lookupId);

    if (rowIndex !== -1) { // Update
        if (dataToSave.originalEmployeeId && dataToSave.employeeId !== dataToSave.originalEmployeeId) {
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
        // --- MODIFICATION: Pass remarks to logEvent ---
        await helpers.logEvent(
            sheets, SPREADSHEET_ID, HOLD_LOG_SHEET_NAME, HOLD_LOG_HEADERS, 
            [employeeId, currentSalary || 'N/A', actionText, updates.remarks || ''], 
            formattedTimestamp, helpers.ensureSheetAndHeaders
        );
        // --- END MODIFICATION ---
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

async function transferEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers,
    { employeeId, newProject, newProjectOffice, newSubCenter, newReportProject, reason, transferDate }
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
        const subCenterColLetter = helpers.getColumnLetter(subCenterColIndex); // Current subcenter
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

// --- MODIFICATION: Add logRejoin function ---
async function logRejoin(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, logData) {
    console.log("Executing logRejoin for:", logData?.newEmployeeId);
    try {
        const {
            previousEmployeeId,
            previousSubcenter,
            separationDate,
            separationReason,
            newEmployeeId,
            newSubcenter,
            newJoiningDate
        } = logData;

        if (!newEmployeeId || !previousEmployeeId) {
            throw new Error("Missing new or previous Employee ID for re-join log.");
        }

        const formattedTimestamp = helpers.formatDateForSheet(new Date());

        const logRow = [
            previousEmployeeId,
            previousSubcenter || 'N/A',
            separationDate || 'N/A',
            separationReason || 'N/A',
            newEmployeeId,
            newSubcenter || 'N/A',
            newJoiningDate || 'N/A'
        ];

        await helpers.logEvent(
            sheets,
            SPREADSHEET_ID,
            REJOIN_LOG_SHEET_NAME,
            REJOIN_LOG_HEADERS,
            logRow,
            formattedTimestamp,
            helpers.ensureSheetAndHeaders
        );

        return { statusCode: 200, body: JSON.stringify({ message: 'Re-join event logged successfully.' }) };

    } catch (error) {
        console.error("Error in logRejoin action:", error.stack || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to log re-join event.', details: error.message }) };
    }
}
// --- END MODIFICATION ---

// --- MODIFICATION: Add new generic function to get log data ---
/**
 * Fetches all data from a specified log sheet and returns it as JSON.
 */
async function getLogData(sheets, SPREADSHEET_ID, sheetName, helpers) {
    console.log(`Executing getLogData for sheet: ${sheetName}`);
    try {
        // 1. Get actual headers (non-normalized)
        const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!1:1`,
        });
        const actualHeaders = headerResponse.data.values ? headerResponse.data.values[0] : [];

        if (!actualHeaders || actualHeaders.length === 0) {
             console.warn(`No headers found in ${sheetName}. Returning empty list.`);
             return { statusCode: 200, body: JSON.stringify([]) };
        }
        
        // 2. Get all data rows
        const lastColumnLetter = helpers.getColumnLetter(actualHeaders.length - 1);
        const range = `${sheetName}!A2:${lastColumnLetter}`; // Read from row 2 to end
        console.log(`Fetching log data from range: ${range}`);
        
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const dataRows = response.data.values;

        if (!dataRows || dataRows.length === 0) {
             console.log(`No data rows found in ${sheetName}.`);
             return { statusCode: 200, body: JSON.stringify([]) };
        }
        console.log(`Fetched ${dataRows.length} data rows from ${sheetName}.`);

        // 3. Map rows to objects using the actual headers as keys
        const logData = dataRows.map((row) => {
            const entry = {};
            actualHeaders.forEach((header, i) => {
                entry[header] = row[i] ?? ''; // Use actual header as key
            });
            return entry;
        });

        console.log(`Processed ${logData.length} log entries.`);
        return { statusCode: 200, body: JSON.stringify(logData) };

    } catch (error) {
        console.error(`Error in getLogData for ${sheetName}:`, error.stack || error.message);
        if (error.code === 400 && error.message.includes('Unable to parse range')) {
             console.warn(`Sheet '${sheetName}' might be empty.`);
             return { statusCode: 200, body: JSON.stringify([]) };
        }
        return { statusCode: 500, body: JSON.stringify({ error: `Internal server error fetching ${sheetName} log.`, details: error.message }) };
    }
}
// --- END MODIFICATION ---

// --- MODIFICATION: Add closeFile function ---
async function closeFile(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers,
    { employeeId, fileClosingDate, fileClosingRemarks }
) {
    console.log(`Executing closeFile for ${employeeId}`);
    if (!employeeId || !fileClosingDate || !fileClosingRemarks) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields for file closing.' }) };
    }

    try {
        const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeId);
        if (rowIndex === -1) return { statusCode: 404, body: JSON.stringify({ error: `Employee ${employeeId} not found` }) };

        const headerRow = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
        if (headerRow.length === 0) throw new Error("Cannot close file: Employee sheet headers not found.");

        // Find required columns
        const statusColIndex = headerRow.indexOf(HEADER_MAPPING.status);
        const closingDateColIndex = headerRow.indexOf(HEADER_MAPPING.fileClosingDate);
        const closingRemarksColIndex = headerRow.indexOf(HEADER_MAPPING.fileClosingRemarks);

        if (statusColIndex === -1 || closingDateColIndex === -1 || closingRemarksColIndex === -1) {
            console.error("Missing columns for file closing:", { statusColIndex, closingDateColIndex, closingRemarksColIndex });
            throw new Error("Required columns (Status, FileClosingDate, FileClosingRemarks) not found in Employee sheet.");
        }

        // Get current status
        const statusColLetter = helpers.getColumnLetter(statusColIndex);
        const readResponse = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}` });
        const previousStatus = readResponse.data.values?.[0]?.[0] || 'N/A';

        // Log the event
        const formattedTimestamp = helpers.formatDateForSheet(new Date());
        await helpers.logEvent(
            sheets, SPREADSHEET_ID, FILE_CLOSING_LOG_SHEET_NAME, FILE_CLOSING_LOG_HEADERS,
            [employeeId, previousStatus, fileClosingDate, fileClosingRemarks],
            formattedTimestamp, helpers.ensureSheetAndHeaders
        );

        // Prepare batch update
        const dataToUpdate = [
            // 1. Update Status to "Closed"
            { range: `${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`, values: [['Closed']] },
            // 2. Update File Closing Date
            { range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(closingDateColIndex)}${rowIndex}`, values: [[fileClosingDate]] },
            // 3. Update File Closing Remarks
            { range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(closingRemarksColIndex)}${rowIndex}`, values: [[fileClosingRemarks]] }
        ];

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { valueInputOption: 'USER_ENTERED', data: dataToUpdate }
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Employee file closed successfully.' }) };

    } catch (error) {
        console.error(`Error closing file for employee ${employeeId}:`, error.stack || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal server error occurred during file closing.', details: error.message }) };
    }
}
// --- END MODIFICATION ---


module.exports = {
    getEmployees,
    saveEmployee,
    updateStatus,
    getSubCenters,
    getProjects,
    getProjectOffices,
    getReportProjects,
    transferEmployee,
    logRejoin,
    getLogData,
    // --- MODIFICATION: Export closeFile ---
    closeFile
    // --- END MODIFICATION ---
};