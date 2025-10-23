// netlify/functions/lib/_helpers.js

const { google } = require('googleapis'); // May not be needed if `sheets` is always passed

// --- Cache (Keep state here if managed by helpers) ---
let headerCache = {};
let headerCacheTimestamp = {};
const CACHE_DURATION = 60000;

// --- Helper: Get Sheet Headers ---
async function getSheetHeaders(sheets, SPREADSHEET_ID, sheetName) {
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
        delete headerCache[sheetName]; delete headerCacheTimestamp[sheetName];
        if (error.code === 400 && error.message.includes('Unable to parse range')) return [];
        const details = error.errors?.[0]?.message || error.message;
        throw new Error(`Could not read headers from sheet: ${sheetName}. Details: ${details}.`);
    }
}

// --- Helper: Find Row by Employee ID ---
// Takes a *function* `getSheetHeadersFunc` to avoid circular dependency if called from other helpers
async function findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, getSheetHeadersFunc, employeeId) {
    const headers = await getSheetHeadersFunc(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
    if (!headers || headers.length === 0) throw new Error(`Headers missing or empty in '${EMPLOYEE_SHEET_NAME}'.`);

    const idHeaderNormalized = HEADER_MAPPING.employeeId;
    const idColIndex = headers.indexOf(idHeaderNormalized);
    if (idColIndex === -1) throw new Error(`Could not find '${idHeaderNormalized}' column in '${EMPLOYEE_SHEET_NAME}'.`);

    const idColLetter = getColumnLetter(idColIndex); // Uses getColumnLetter from below
    console.log(`Employee ID column: ${idColLetter}`);
    try {
        const range = `${EMPLOYEE_SHEET_NAME}!${idColLetter}2:${idColLetter}`;
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const rows = response.data.values || [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] && String(rows[i][0]).trim() === String(employeeId).trim()) {
                return i + 2; // 1-based index
            }
        }
        return -1; // Not found
    } catch (error) {
        if (error.code === 400 && error.message.includes('Unable to parse range')) return -1;
        console.error(`Error finding employee row for ID ${employeeId}:`, error);
        throw error;
    }
}

// --- Helper: Ensure Sheet Exists and Has Headers ---
async function ensureSheetAndHeaders(sheets, SPREADSHEET_ID, sheetName, expectedHeaders, getSheetHeadersFunc) {
     try {
        console.log(`Ensuring sheet '${sheetName}' exists.`);
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(title))' });
        const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === sheetName);

        if (!sheetExists) {
            console.log(`Sheet '${sheetName}' not found. Creating it.`);
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource: { requests: [{ addSheet: { properties: { title: sheetName } } }] } });
            console.log(`Created sheet '${sheetName}'. Adding headers.`);
            await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [expectedHeaders] } });
            console.log(`Added headers to ${sheetName}.`);
            delete headerCache[sheetName]; delete headerCacheTimestamp[sheetName]; // Invalidate cache
        } else {
             console.log(`Sheet '${sheetName}' already exists.`);
             const currentHeaders = await getSheetHeadersFunc(sheets, SPREADSHEET_ID, sheetName); // Use passed getter
             if (!currentHeaders || currentHeaders.length === 0) {
                  console.warn(`Sheet '${sheetName}' exists but has no headers. Adding headers.`);
                  await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [expectedHeaders] } });
                  console.log(`Added headers to existing empty sheet ${sheetName}.`);
                  delete headerCache[sheetName]; delete headerCacheTimestamp[sheetName]; // Invalidate cache
             }
        }
    } catch (error) {
         console.error(`Error ensuring sheet '${sheetName}':`, error.response?.data || error.message);
         throw new Error(`Failed to ensure sheet '${sheetName}' setup: ${error.errors?.[0]?.message || error.message}`);
    }
}

// --- Helper: Format Date for Sheet ---
function formatDateForSheet(date) {
    // ... (copy function from previous response) ...
    const options = { /*...*/ }; let formatted = new Intl.DateTimeFormat('en-GB', options).format(date);
    formatted = formatted.replace(',', '').replace(' ', '-').replace(' ', '-').toUpperCase().replace('PM', ' PM').replace('AM', ' AM');
    return formatted;
}

// --- Helper: Log Event to a Sheet ---
async function logEvent(sheets, SPREADSHEET_ID, logSheetName, logHeaders, eventDataArray, preformattedTimestamp = null, ensureSheetFunc) {
    const timestamp = preformattedTimestamp || formatDateForSheet(new Date());
    const rowToLog = [timestamp, ...eventDataArray];
    console.log(`Logging event to ${logSheetName}:`, rowToLog);
    try {
        await ensureSheetFunc(sheets, SPREADSHEET_ID, logSheetName, logHeaders, getSheetHeaders); // Pass ensureSheet, which needs getSheetHeaders
        await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${logSheetName}!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: [rowToLog] } });
        console.log(`Successfully logged event to ${logSheetName}.`);
    } catch (error) {
        console.error(`Error logging event to ${logSheetName}:`, error.response?.data || error.message);
    }
}

// --- Helper: Get Employee Salary ---
async function getEmployeeSalary(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, findEmployeeRowFunc, getSheetHeadersFunc, employeeId) {
    const rowIndex = await findEmployeeRowFunc(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, getSheetHeadersFunc, employeeId);
    if (rowIndex === -1) return null;

    const headers = await getSheetHeadersFunc(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
    const salaryHeader = HEADER_MAPPING.salary;
    const salaryColIndex = headers.indexOf(salaryHeader);
    if (salaryColIndex === -1) { console.warn(`Could not find salary column ('${salaryHeader}')`); return null; }

    const salaryColLetter = getColumnLetter(salaryColIndex);
    const range = `${EMPLOYEE_SHEET_NAME}!${salaryColLetter}${rowIndex}`;
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const salary = response.data.values ? response.data.values[0][0] : null;
        console.log(`Fetched salary for ${employeeId}: ${salary}`);
        return salary;
    } catch (error) {
        console.error(`Error fetching salary for employee ${employeeId}:`, error);
        return null;
    }
}

// --- Helper: Column Letter ---
function getColumnLetter(colIndex) {
    // ... (copy function from previous response) ...
     let col = ''; let num = colIndex; do { col = String.fromCharCode(65 + (num % 26)) + col; num = Math.floor(num / 26) - 1; } while (num >= 0); return col;
}


// --- Exports ---
module.exports = {
    getSheetHeaders,
    findEmployeeRow,
    ensureSheetAndHeaders,
    logEvent,
    getEmployeeSalary,
    getColumnLetter,
    formatDateForSheet
};