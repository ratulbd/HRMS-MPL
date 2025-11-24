// netlify/functions/lib/_employeeActions.js

// ... [Existing functions: getEmployees, saveEmployee, updateStatus, etc. remain unchanged]

async function closeFile(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, { employeeId, date, remarks }) {
    if (!employeeId || !date || !remarks) throw new Error("Missing required fields: employeeId, date, remarks.");

    const getSheetHeadersFunc = helpers.getSheetHeaders;
    const findEmployeeRowFunc = helpers.findEmployeeRow;

    // 1. Find Row
    const rowIndex = await findEmployeeRowFunc(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, getSheetHeadersFunc, employeeId);
    if (rowIndex === -1) throw new Error(`Employee ID ${employeeId} not found.`);

    // 2. Get Headers to find column indices
    const headers = await getSheetHeadersFunc(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);

    const statusColIndex = headers.indexOf(HEADER_MAPPING.status);
    const closeDateColIndex = headers.indexOf(HEADER_MAPPING.fileClosingDate);
    const remarksColIndex = headers.indexOf(HEADER_MAPPING.fileClosingRemarks); // Using specific FileClosingRemarks column if exists, or mapped to remarks

    if (statusColIndex === -1) throw new Error("Status column not found.");
    // If specific closing columns don't exist, ensure you have them in your sheet or map them to generic ones
    if (closeDateColIndex === -1) throw new Error("File Closing Date column not found in header mapping.");

    // 3. Update Employee Sheet
    const updates = [];

    // Update Status to "File Closed"
    const statusColLetter = helpers.getColumnLetter(statusColIndex);
    updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`, values: [['File Closed']] });

    // Update Closing Date
    const dateColLetter = helpers.getColumnLetter(closeDateColIndex);
    updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${dateColLetter}${rowIndex}`, values: [[date]] });

    // Update Remarks (if mapped)
    if (remarksColIndex !== -1) {
        const remColLetter = helpers.getColumnLetter(remarksColIndex);
        updates.push({ range: `${EMPLOYEE_SHEET_NAME}!${remColLetter}${rowIndex}`, values: [[remarks]] });
    }

    // Execute Batch Update
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { valueInputOption: 'USER_ENTERED', data: updates }
    });

    // 4. Log to FileClosing_Log
    // Headers: Timestamp, EmployeeID, ClosingDate, Remarks
    const logHeaders = ['Timestamp', 'Employee ID', 'Closing Date', 'Remarks'];
    const logData = [employeeId, date, remarks];

    await helpers.logEvent(sheets, SPREADSHEET_ID, 'FileClosing_Log', logHeaders, logData, null, helpers.ensureSheetAndHeaders);

    return { statusCode: 200, body: JSON.stringify({ message: 'File closed successfully.' }) };
}

// Ensure closeFile is exported
module.exports = {
    // ... other exports
    closeFile,
    getEmployees: require('./_employeeActions').getEmployees, // Assuming this file structure
    saveEmployee: require('./_employeeActions').saveEmployee,
    updateStatus: require('./_employeeActions').updateStatus,
    getSubCenters: require('./_employeeActions').getSubCenters,
    getProjects: require('./_employeeActions').getProjects,
    getProjectOffices: require('./_employeeActions').getProjectOffices,
    getReportProjects: require('./_employeeActions').getReportProjects,
    transferEmployee: require('./_employeeActions').transferEmployee,
    logRejoin: require('./_employeeActions').logRejoin,
    getLogData: require('./_employeeActions').getLogData
};