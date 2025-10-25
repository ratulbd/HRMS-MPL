// netlify/functions/lib/_employeeActions.js

// Constants needed for logEvent
const HOLD_LOG_SHEET_NAME = 'Hold_Log';
const SEPARATION_LOG_SHEET_NAME = 'Separation_Log';
const HOLD_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Action'];
const SEPARATION_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Separation Date', 'Status', 'Remarks'];
const TRANSFER_LOG_SHEET_NAME = 'Transfer_Log';
const TRANSFER_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Employee Name', 'Old Sub Center', 'New Sub Center', 'Reason', 'Transfer Date'];

async function getEmployees(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    // ... (This function remains the same) ...
}

async function saveEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, employeeData) {
     // ... (This function remains the same) ...
}

async function updateStatus(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, statusData) {
    // ... (This function remains the same) ...
}

async function getSubCenters(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers) {
    // ... (This function remains the same) ...
}

async function transferEmployee(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers, { employeeId, newSubCenter, reason, transferDate }) {
    console.log(`Executing transferEmployee for ${employeeId} to ${newSubCenter}`);
    if (!employeeId || !newSubCenter || !reason || !transferDate) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields: employeeId, newSubCenter, reason, transferDate.' }) };
    }

    try {
        const rowIndex = await helpers.findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers.getSheetHeaders, employeeId);
        if (rowIndex === -1) return { statusCode: 404, body: JSON.stringify({ error: `Employee ${employeeId} not found` }) };

        const headerRow = await helpers.getSheetHeaders(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
        if (headerRow.length === 0) throw new Error("Cannot transfer: Employee sheet headers not found.");

        // Find column indices
        const subCenterColIndex = headerRow.indexOf(HEADER_MAPPING.subCenter);
        const nameColIndex = headerRow.indexOf(HEADER_MAPPING.name);
        const lastDateColIndex = headerRow.indexOf(HEADER_MAPPING.lastTransferDate);
        const lastSubCenterColIndex = headerRow.indexOf(HEADER_MAPPING.lastSubcenter); // <-- UPDATED KEY
        const lastReasonColIndex = headerRow.indexOf(HEADER_MAPPING.lastTransferReason);

        // Check if all necessary columns were found
        if (subCenterColIndex === -1 || nameColIndex === -1 || lastDateColIndex === -1 || lastSubCenterColIndex === -1 || lastReasonColIndex === -1) {
            console.error("Missing columns in Employees sheet for transfer:", { subCenterColIndex, nameColIndex, lastDateColIndex, lastSubCenterColIndex, lastReasonColIndex });
            // <-- UPDATED ERROR MESSAGE -->
            throw new Error("Required columns ('Sub Center', 'Employee Name', 'Last Transfer Date', 'Last Subcenter', 'Last Transfer Reason') not found in Employee sheet.");
        }

        // Fetch current name and subcenter using batchGet
        const nameColLetter = helpers.getColumnLetter(nameColIndex);
        const subCenterColLetter = helpers.getColumnLetter(subCenterColIndex);
        const rangesToRead = [
            `${EMPLOYEE_SHEET_NAME}!${nameColLetter}${rowIndex}`,
            `${EMPLOYEE_SHEET_NAME}!${subCenterColLetter}${rowIndex}`
        ];
        console.log("Fetching current name and subcenter from ranges:", rangesToRead);
        const readResponse = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: rangesToRead });
        const employeeName = readResponse.data.valueRanges?.[0]?.values?.[0]?.[0] || 'N/A';
        const oldSubCenter = readResponse.data.valueRanges?.[1]?.values?.[0]?.[0] || 'N/A';
        console.log(`Fetched current values - Name: ${employeeName}, Old Sub Center: ${oldSubCenter}`);

        // Prepare batch update data for Employees sheet
        const dataToUpdate = [
            { // Update Sub Center
                range: `${EMPLOYEE_SHEET_NAME}!${subCenterColLetter}${rowIndex}`,
                values: [[newSubCenter]]
            },
            { // Update Last Transfer Date
                range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(lastDateColIndex)}${rowIndex}`,
                values: [[transferDate]]
            },
             // --- UPDATED THIS BLOCK ---
            { // Update Last Subcenter
                range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(lastSubCenterColIndex)}${rowIndex}`,
                values: [[newSubCenter]]
            },
             // --- END UPDATE ---
            { // Update Last Transfer Reason
                range: `${EMPLOYEE_SHEET_NAME}!${helpers.getColumnLetter(lastReasonColIndex)}${rowIndex}`,
                values: [[reason]]
            }
        ];

        // Execute batch update
        console.log(`Attempting batch update for transfer (row ${rowIndex})`);
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { valueInputOption: 'USER_ENTERED', data: dataToUpdate }
        });
        console.log("Batch update successful for transfer.");

        // Log the transfer event
        const formattedTimestamp = helpers.formatDateForSheet(new Date());
        await helpers.logEvent(
            sheets, SPREADSHEET_ID,
            TRANSFER_LOG_SHEET_NAME, TRANSFER_LOG_HEADERS,
            [employeeId, employeeName, oldSubCenter, newSubCenter, reason, transferDate],
            formattedTimestamp,
            helpers.ensureSheetAndHeaders
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
    transferEmployee
};