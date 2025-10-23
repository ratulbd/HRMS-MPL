// netlify/functions/lib/_employeeActions.js

// Constants needed for logEvent within updateStatus
const HOLD_LOG_SHEET_NAME = 'Hold_Log';
const SEPARATION_LOG_SHEET_NAME = 'Separation_Log';
const HOLD_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Action'];
const SEPARATION_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Separation Date', 'Status', 'Remarks'];

async function getEmployees(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    console.log("Executing getEmployees");
    try {
        const headers = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
        if (headers.length === 0) return { statusCode: 200, body: JSON.stringify([]) };

        const lastColumnLetter = helpers.getColumnLetter(headers.length - 1);
        const range = `${EMPLOYEE_SHEET_NAME}!A2:${lastColumnLetter}`;
        console.log(`Fetching employee data from range: ${range}`);
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const dataRows = response.data.values;
        if (!dataRows || dataRows.length === 0) return { statusCode: 200, body: JSON.stringify([]) };

        const employees = dataRows.map((row, index) => {
            const emp = { id: index + 2 };
            headers.forEach((header, i) => {
                const key = Object.keys(HEADER_MAPPING).find(k => HEADER_MAPPING[k] === header);
                if (key) {
                    const value = row[i] ?? '';
                    emp[key] = (key === 'salaryHeld') ? (String(value).toUpperCase() === 'TRUE') : value;
                }
            });
            emp.status = emp.status || 'Active';
            emp.salaryHeld = emp.salaryHeld || false; // Ensure default boolean false if undefined/empty
            return emp;
        });
        console.log(`Processed ${employees.length} employees.`);
        return { statusCode: 200, body: JSON.stringify(employees) };
    } catch (error) {
        console.error("Error in getEmployees:", error.stack || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error.', details: error.message }) };
    }
}

async function saveEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, employeeData) {
     console.log("Executing saveEmployee with data:", employeeData);
    const headerRow = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
    if (headerRow.length === 0) throw new Error("Cannot save: No headers found.");

    const dataToSave = { ...employeeData };
    dataToSave.salaryHeld = (dataToSave.salaryHeld === true || String(dataToSave.salaryHeld).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
    dataToSave.status = dataToSave.status || 'Active';
    dataToSave.separationDate = dataToSave.separationDate || '';
    dataToSave.remarks = dataToSave.remarks || '';
    dataToSave.holdTimestamp = dataToSave.holdTimestamp || '';

    const newRow = headerRow.map(header => {
        const key = Object.keys(HEADER_MAPPING).find(k => HEADER_MAPPING[k] === header);
        return (key && dataToSave[key] != null) ? String(dataToSave[key]) : '';
    });

    const lookupId = employeeData.originalEmployeeId || employeeData.employeeId;
    if (!lookupId) throw new Error("Employee ID missing for save.");
    console.log(`Looking up row for Employee ID: ${lookupId}`);
    // Pass getSheetHeaders itself to findEmployeeRow
    const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, lookupId);

    if (rowIndex !== -1) { // Update
        if (employeeData.originalEmployeeId && employeeData.employeeId !== employeeData.originalEmployeeId) {
             console.warn(`Attempted ID change. Reverting.`);
             const idColIndex = headerRow.indexOf(HEADER_MAPPING.employeeId);
             if (idColIndex !== -1) newRow[idColIndex] = employeeData.originalEmployeeId;
        }
        console.log(`Updating employee at row ${rowIndex}`);
        const lastColumnLetter = helpers.getColumnLetter(headerRow.length - 1);
        const range = `${EMPLOYEE_SHEET_NAME}!A${rowIndex}:${lastColumnLetter}${rowIndex}`;
        await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range, valueInputOption: 'USER_ENTERED', resource: { values: [newRow] } });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee updated.' }) };
    } else { // Append
        if (employeeData.originalEmployeeId) throw new Error(`Original ID ${employeeData.originalEmployeeId} not found.`);
        // Re-check for duplicate ID before append
        const checkAgainIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeData.employeeId);
        if (checkAgainIndex !== -1) return { statusCode: 409, body: JSON.stringify({ error: `Employee ID ${employeeData.employeeId} already exists.` }) };

        console.log(`Appending new employee: ${employeeData.employeeId}`);
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
    const formattedTimestamp = helpers.formatDateForSheet(new Date()); // Format timestamp once

     // --- Log Events First ---
     // Need getEmployeeSalary helper passed in
    const currentSalary = await helpers.getEmployeeSalary(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.findEmployeeRow, helpers.getSheetHeaders, employeeId);

    // Log Hold/Unhold
    if (updates.hasOwnProperty('salaryHeld')) {
        const isHolding = (updates.salaryHeld === true || String(updates.salaryHeld).toUpperCase() === 'TRUE');
        const actionText = isHolding ? 'Salary Hold' : 'Salary Unhold';
        // Pass ensureSheetAndHeaders helper to logEvent
        await helpers.logEvent(sheets, SPREADSHEET_ID, HOLD_LOG_SHEET_NAME, HOLD_LOG_HEADERS, [employeeId, currentSalary || 'N/A', actionText], formattedTimestamp, helpers.ensureSheetAndHeaders);

        // Prepare Hold Timestamp update for Employees sheet
        const tsHeaderName = HEADER_MAPPING.holdTimestamp;
        const tsColIndex = headerRow.indexOf(tsHeaderName);
        if (tsColIndex !== -1) {
            const tsColLetter = helpers.getColumnLetter(tsColIndex);
            dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${tsColLetter}${rowIndex}`, values: [[isHolding ? formattedTimestamp : '']] });
            console.log(`Added update for holdTimestamp`);
        } else { console.warn(`Column 'holdtimestamp' not found.`); }
    }
    // Log Separation
     if (updates.hasOwnProperty('status') && (updates.status === 'Resigned' || updates.status === 'Terminated')) {
         await helpers.logEvent(sheets, SPREADSHEET_ID, SEPARATION_LOG_SHEET_NAME, SEPARATION_LOG_HEADERS, [employeeId, currentSalary || 'N/A', updates.separationDate || '', updates.status, updates.remarks || ''], formattedTimestamp, helpers.ensureSheetAndHeaders);
     }

    // --- Prepare Updates for Employee Sheet ---
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

    // --- Apply Implicit Business Logic ---
    if (updates.hasOwnProperty('status') && updates.status !== 'Active') {
        console.log(`Status -> ${updates.status}. Setting salaryHeld=FALSE.`);
        const heldHeader = HEADER_MAPPING.salaryHeld; const heldColIndex = headerRow.indexOf(heldHeader);
        if (heldColIndex !== -1) {
            const heldColLetter = helpers.getColumnLetter(heldColIndex);
            let existing = dataToUpdate.find(d => d.range.startsWith(`${EMPLOYEE_SHEET_NAME}!${heldColLetter}${rowIndex}`));
            if (existing) existing.values = [['FALSE']]; else dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${heldColLetter}${rowIndex}`, values: [['FALSE']] });
            // Also clear holdTimestamp
             const tsHeaderName = HEADER_MAPPING.holdTimestamp; const tsColIndex = headerRow.indexOf(tsHeaderName);
             if (tsColIndex !== -1) {
                 const tsColLetter = helpers.getColumnLetter(tsColIndex);
                 let tsExisting = dataToUpdate.find(d => d.range.startsWith(`${EMPLOYEE_SHEET_NAME}!${tsColLetter}${rowIndex}`));
                 if (tsExisting) tsExisting.values = [['']]; else dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${tsColLetter}${rowIndex}`, values: [['']] });
             }
        }
    } else if (updates.hasOwnProperty('salaryHeld') && !updates.hasOwnProperty('status')) {
        console.log("Only salaryHeld updated. Setting status=Active.");
        const statusHeader = HEADER_MAPPING.status; const statusColIndex = headerRow.indexOf(statusHeader);
        if (statusColIndex !== -1) {
            const statusColLetter = helpers.getColumnLetter(statusColIndex);
             let existing = dataToUpdate.find(d => d.range.startsWith(`${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`));
            if (existing) existing.values = [['Active']]; else dataToUpdate.push({ range: `${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`, values: [['Active']] });
        }
    }

    // --- Execute Batch Update ---
    if (dataToUpdate.length > 0) {
        console.log(`Attempting batch update for row ${rowIndex}:`, dataToUpdate.length);
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource: { valueInputOption: 'USER_ENTERED', data: dataToUpdate } });
        console.log("Batch update successful.");
        // Consider invalidating header cache here too, although unlikely needed for value updates
        // helpers.clearHeaderCache(); // Need a way to access/clear cache in helpers
    } else {
        console.warn(`No valid updates derived for employee ID ${employeeId}.`);
        return { statusCode: 400, body: JSON.stringify({ message: 'No valid fields to update.' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ message: 'Status updated successfully.' }) };
}


module.exports = {
    getEmployees,
    saveEmployee,
    updateStatus
};