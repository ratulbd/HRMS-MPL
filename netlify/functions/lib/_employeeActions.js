// netlify/functions/lib/_employeeActions.js

async function getEmployees(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, queryParams) {
    console.log("Executing getEmployees...");
    try {
        const headers = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
        if (!headers || headers.length === 0) return { statusCode: 200, body: JSON.stringify({ employees: [], totalPages: 0, totalCount: 0, filters: {} }) };

        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${EMPLOYEE_SHEET_NAME}!A2:ZZ` });
        const rows = response.data.values || [];

        // Map headers to indices
        const indices = {};
        for (const [key, value] of Object.entries(HEADER_MAPPING)) {
            indices[key] = headers.indexOf(value);
        }

        // Helper to safely get value
        const getVal = (row, idx) => (idx !== -1 && row[idx] !== undefined) ? String(row[idx]).trim() : '';

        let employees = rows.map(row => {
            const emp = {};
            for (const key in indices) {
                emp[key] = getVal(row, indices[key]);
            }
            return emp;
        });

        // --- Filtering ---
        const { page = 1, limit = 20, name, status, designation, functionalRole, type, project, projectOffice, reportProject, subCenter } = queryParams;

        if (name) {
            const lowerName = name.toLowerCase();
            employees = employees.filter(e => e.name.toLowerCase().includes(lowerName) || e.employeeId.toLowerCase().includes(lowerName));
        }
        if (status) {
            const statuses = status.split(',').map(s => s.trim().toLowerCase());
            employees = employees.filter(e => statuses.includes(e.status.toLowerCase()));
        }
        if (designation) employees = employees.filter(e => e.designation === designation);
        if (functionalRole) employees = employees.filter(e => e.functionalRole === functionalRole);
        if (type) employees = employees.filter(e => e.employeeType === type);
        if (project) employees = employees.filter(e => e.project === project);
        if (projectOffice) employees = employees.filter(e => e.projectOffice === projectOffice);
        if (reportProject) employees = employees.filter(e => e.reportProject === reportProject);
        if (subCenter) employees = employees.filter(e => e.subCenter === subCenter);

        const totalCount = employees.length;
        const totalPages = Math.ceil(totalCount / limit);
        const startIndex = (page - 1) * limit;
        const paginatedEmployees = employees.slice(startIndex, startIndex + parseInt(limit));

        // Extract filter options for dropdowns (unique values)
        const getOptions = (key) => [...new Set(rows.map(r => getVal(r, indices[key])) )].filter(Boolean).sort();
        const filters = {
            designation: getOptions('designation'),
            functionalRole: getOptions('functionalRole'),
            type: getOptions('employeeType'),
            project: getOptions('project'),
            projectOffice: getOptions('projectOffice'),
            reportProject: getOptions('reportProject'),
            subCenter: getOptions('subCenter'),
        };

        console.log(`Returning ${paginatedEmployees.length} employees (Page ${page} of ${totalPages})`);
        return {
            statusCode: 200,
            body: JSON.stringify({
                employees: paginatedEmployees,
                totalPages,
                totalCount,
                filters
            })
        };

    } catch (error) {
        console.error("Error in getEmployees:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function saveEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, employeeData) {
    console.log("Executing saveEmployee...", employeeData.employeeId);
    try {
        const headers = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
        const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeData.employeeId);

        // Prepare row data
        const rowData = new Array(headers.length).fill('');

        // Fill existing data if update
        if (rowIndex !== -1) {
             const range = `${EMPLOYEE_SHEET_NAME}!A${rowIndex}:${helpers.getColumnLetter(headers.length - 1)}${rowIndex}`;
             const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
             if (existing.data.values && existing.data.values[0]) {
                 existing.data.values[0].forEach((val, idx) => { rowData[idx] = val; });
             }
        }

        // Map incoming data to columns
        for (const [key, value] of Object.entries(employeeData)) {
            const headerName = HEADER_MAPPING[key];
            if (headerName) {
                const colIndex = headers.indexOf(headerName);
                if (colIndex !== -1) {
                    // Format date if it looks like a date field
                    let cellValue = value;
                    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('dob')) {
                         cellValue = helpers.formatDateForInput(value); // Ensure normalized date format
                    }
                    rowData[colIndex] = cellValue;
                }
            }
        }

        if (rowIndex !== -1) {
            // Update
            console.log(`Updating employee at row ${rowIndex}`);
            const range = `${EMPLOYEE_SHEET_NAME}!A${rowIndex}`;
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });
        } else {
            // Append
            console.log("Appending new employee");
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${EMPLOYEE_SHEET_NAME}!A1`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [rowData] }
            });
        }

        return { statusCode: 200, body: JSON.stringify({ message: 'Employee saved successfully.' }) };

    } catch (error) {
        console.error("Error in saveEmployee:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function updateStatus(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, { employeeId, status, date, remarks }) {
    console.log(`Updating status for ${employeeId} to ${status}`);
    try {
        const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeId);
        if (rowIndex === -1) throw new Error("Employee not found.");

        const headers = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);

        // Identify columns
        const statusCol = headers.indexOf(HEADER_MAPPING.status);
        const remarksCol = headers.indexOf(HEADER_MAPPING.remarks);

        // Specialized columns based on status
        let dateCol = -1;
        let specificLogSheet = '';

        if (status === 'Salary Held') {
            dateCol = headers.indexOf(HEADER_MAPPING.holdTimestamp); // Using holdTimestamp for date
            specificLogSheet = 'Hold_Log';
        } else if (status === 'Resigned' || status === 'Terminated') {
            dateCol = headers.indexOf(HEADER_MAPPING.separationDate);
            specificLogSheet = 'Separation_Log';
        }

        const updates = [];

        // Update Status
        if (statusCol !== -1) {
             updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(statusCol)}${rowIndex}`, values: [[status]] });
        }

        // Update Remarks
        if (remarksCol !== -1 && remarks) {
             updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(remarksCol)}${rowIndex}`, values: [[remarks]] });
        }

        // Update Date (if applicable)
        if (dateCol !== -1 && date) {
             updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(dateCol)}${rowIndex}`, values: [[date]] });
        }

        // Special: If Salary Held, update 'salaryHeld' column to TRUE
        if (status === 'Salary Held') {
             const heldBoolCol = headers.indexOf(HEADER_MAPPING.salaryHeld);
             if (heldBoolCol !== -1) {
                  updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(heldBoolCol)}${rowIndex}`, values: [['TRUE']] });
             }
        } else if (status === 'Active') {
             // Clear salary held flag if active
             const heldBoolCol = headers.indexOf(HEADER_MAPPING.salaryHeld);
             if (heldBoolCol !== -1) {
                  updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(heldBoolCol)}${rowIndex}`, values: [['FALSE']] });
             }
             // Clear hold timestamp
             const holdTimeCol = headers.indexOf(HEADER_MAPPING.holdTimestamp);
             if (holdTimeCol !== -1) {
                  updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(holdTimeCol)}${rowIndex}`, values: [['']] });
             }
        }

        // Execute Updates on Employee Sheet
        if (updates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: { valueInputOption: 'USER_ENTERED', data: updates }
            });
        }

        // Log to specific log sheet
        if (specificLogSheet) {
             // Determine headers for the log sheet (simple approach)
             const logHeaders = ['Timestamp', 'Employee ID', 'Status', 'Date', 'Remarks'];
             const logData = [employeeId, status, date, remarks];
             await helpers.logEvent(sheets, SPREADSHEET_ID, specificLogSheet, logHeaders, logData, null, helpers.ensureSheetAndHeaders);
        }

        return { statusCode: 200, body: JSON.stringify({ message: 'Status updated successfully.' }) };

    } catch (error) {
        console.error("Error in updateStatus:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function transferEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, { employeeId, transferDate, newProject, newOffice, newReportProject, newSubCenter, reason }) {
    console.log(`Transferring employee ${employeeId}...`);
    try {
        const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeId);
        if (rowIndex === -1) throw new Error("Employee not found.");

        const headers = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);

        // Columns to update
        const cols = {
            project: headers.indexOf(HEADER_MAPPING.project),
            office: headers.indexOf(HEADER_MAPPING.projectOffice),
            report: headers.indexOf(HEADER_MAPPING.reportProject),
            sub: headers.indexOf(HEADER_MAPPING.subCenter),
            lastDate: headers.indexOf(HEADER_MAPPING.lastTransferDate),
            lastSub: headers.indexOf(HEADER_MAPPING.lastSubcenter),
            lastReason: headers.indexOf(HEADER_MAPPING.lastTransferReason)
        };

        // Get current subcenter before update (for logging 'Last Subcenter')
        const subColLetter = helpers.getColumnLetter(cols.sub);
        const currentSubRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${EMPLOYEE_SHEET_NAME}!${subColLetter}${rowIndex}` });
        const currentSub = currentSubRes.data.values?.[0]?.[0] || '';

        const updates = [];
        if (cols.project !== -1) updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(cols.project)}${rowIndex}`, values: [[newProject]] });
        if (cols.office !== -1) updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(cols.office)}${rowIndex}`, values: [[newOffice]] });
        if (cols.report !== -1) updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(cols.report)}${rowIndex}`, values: [[newReportProject]] });
        if (cols.sub !== -1) updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(cols.sub)}${rowIndex}`, values: [[newSubCenter]] });

        // History columns
        if (cols.lastDate !== -1) updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(cols.lastDate)}${rowIndex}`, values: [[transferDate]] });
        if (cols.lastSub !== -1) updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(cols.lastSub)}${rowIndex}`, values: [[currentSub]] });
        if (cols.lastReason !== -1) updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(cols.lastReason)}${rowIndex}`, values: [[reason]] });

        // Execute Batch
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { valueInputOption: 'USER_ENTERED', data: updates }
        });

        // Log Transfer
        const logHeaders = ['Timestamp', 'Employee ID', 'Transfer Date', 'From Subcenter', 'To Project', 'To Office', 'To Report Project', 'To Subcenter', 'Reason'];
        const logData = [employeeId, transferDate, currentSub, newProject, newOffice, newReportProject, newSubCenter, reason];
        await helpers.logEvent(sheets, SPREADSHEET_ID, 'Transfer_Log', logHeaders, logData, null, helpers.ensureSheetAndHeaders);

        return { statusCode: 200, body: JSON.stringify({ message: 'Transfer successful.' }) };

    } catch (error) {
        console.error("Error in transferEmployee:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function logRejoin(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, { employeeId, rejoinDate, previousStatus }) {
    console.log(`Logging rejoin for ${employeeId}`);
    try {
        // 1. Update Status to Active
        const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeId);
        if (rowIndex === -1) throw new Error("Employee not found.");

        const headers = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
        const statusCol = headers.indexOf(HEADER_MAPPING.status);

        if (statusCol !== -1) {
             await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(statusCol)}${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['Active']] }
            });
        }

        // 2. Log to Rejoin_Log
        const logHeaders = ['Timestamp', 'Employee ID', 'Rejoin Date', 'Previous Status'];
        const logData = [employeeId, rejoinDate, previousStatus];
        await helpers.logEvent(sheets, SPREADSHEET_ID, 'Rejoin_Log', logHeaders, logData, null, helpers.ensureSheetAndHeaders);

        return { statusCode: 200, body: JSON.stringify({ message: 'Rejoin logged and status set to Active.' }) };
    } catch (error) {
        console.error("Error in logRejoin:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function getSubCenters(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    return getUniqueColumnValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING.subCenter, helpers);
}
async function getProjects(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    return getUniqueColumnValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING.project, helpers);
}
async function getProjectOffices(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    return getUniqueColumnValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING.projectOffice, helpers);
}
async function getReportProjects(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    return getUniqueColumnValues(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING.reportProject, helpers);
}

// Helper for Dropdowns
async function getUniqueColumnValues(sheets, SPREADSHEET_ID, sheetName, headerName, helpers) {
    try {
        const headers = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, sheetName);
        const colIndex = headers.indexOf(headerName);
        if (colIndex === -1) return { statusCode: 200, body: JSON.stringify([]) };

        const letter = helpers.getColumnLetter(colIndex);
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${sheetName}!${letter}2:${letter}` });
        const values = response.data.values ? response.data.values.map(r => r[0]).filter(Boolean) : [];
        const unique = [...new Set(values)].sort();
        return { statusCode: 200, body: JSON.stringify(unique) };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
}

async function getLogData(sheets, SPREADSHEET_ID, LOG_SHEET_NAME, helpers) {
    try {
        await helpers.ensureSheetAndHeaders(sheets, SPREADSHEET_ID, LOG_SHEET_NAME, [], helpers.getSheetHeaders); // Ensure exists
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${LOG_SHEET_NAME}!A1:Z` });
        const rows = response.data.values;
        if (!rows || rows.length < 2) return { statusCode: 200, body: JSON.stringify([]) };

        const headers = rows[0].map(h => h.toLowerCase());
        const data = rows.slice(1).map(r => {
            const obj = {};
            headers.forEach((h, i) => obj[h] = r[i] || '');
            return obj;
        });
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
}

// --- ADDED: Close File Function ---
async function closeFile(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, { employeeId, date, remarks }) {
    console.log(`Closing file for employee: ${employeeId}`);
    if (!employeeId || !date || !remarks) throw new Error("Missing required fields: employeeId, date, remarks.");

    const getSheetHeadersFunc = helpers.getSheetHeaders;
    const findEmployeeRowFunc = helpers.findEmployeeRow;

    // 1. Find Row
    const rowIndex = await findEmployeeRowFunc(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, getSheetHeadersFunc, employeeId);
    if (rowIndex === -1) throw new Error(`Employee ID ${employeeId} not found.`);

    // 2. Get Headers
    const headers = await getSheetHeadersFunc(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);

    // 3. Find Columns
    const statusColIndex = headers.indexOf(HEADER_MAPPING.status);
    const closeDateColIndex = headers.indexOf(HEADER_MAPPING.fileClosingDate);
    const remarksColIndex = headers.indexOf(HEADER_MAPPING.fileClosingRemarks);

    if (statusColIndex === -1) throw new Error("Status column not found in sheet.");
    if (closeDateColIndex === -1) throw new Error(`File Closing Date column ('${HEADER_MAPPING.fileClosingDate}') not found.`);

    // 4. Prepare Updates
    const updates = [];

    // Update Status to 'File Closed'
    const statusColLetter = helpers.getColumnLetter(statusColIndex);
    updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`, values: [['File Closed']] });

    // Update File Closing Date
    const dateColLetter = helpers.getColumnLetter(closeDateColIndex);
    updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${dateColLetter}${rowIndex}`, values: [[date]] });

    // Update Remarks (using File Closing Remarks column if available, or generic remarks)
    if (remarksColIndex !== -1) {
        const remColLetter = helpers.getColumnLetter(remarksColIndex);
        updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${remColLetter}${rowIndex}`, values: [[remarks]] });
    }

    // 5. Execute Batch Update
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { valueInputOption: 'USER_ENTERED', data: updates }
    });

    // 6. Log to FileClosing_Log
    const logHeaders = ['Timestamp', 'Employee ID', 'Closing Date', 'Remarks'];
    const logData = [employeeId, date, remarks];
    await helpers.logEvent(sheets, SPREADSHEET_ID, 'FileClosing_Log', logHeaders, logData, null, helpers.ensureSheetAndHeaders);

    return { statusCode: 200, body: JSON.stringify({ message: 'File closed successfully.' }) };
}

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
    // --- Export the new function ---
    closeFile
};