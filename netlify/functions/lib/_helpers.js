// netlify/functions/lib/_helpers.js

const pako = require('pako'); // Ensure pako is imported in your Netlify environment

// --- Cache ---
let headerCache = {};
let headerCacheTimestamp = {};
const CACHE_DURATION = 60000;

// === NEW HELPERS: Compression & Encoding ===

/**
 * Compresses a string using Pako (Gzip) and encodes the result in Base64.
 * @param {string} dataString - The JSON string to compress.
 * @returns {string} The compressed and Base64 encoded string.
 */
function compressAndEncode(dataString) {
    const dataUint8 = new TextEncoder().encode(dataString);
    const compressed = pako.deflate(dataUint8);
    // Convert Uint8Array to a Base64 string
    return Buffer.from(compressed).toString('base64');
}

/**
 * Decodes a Base64 string and decompresses it using Pako (Gunzip).
 * @param {string} encodedString - The Base64 encoded string.
 * @returns {string} The original decompressed string.
 */
function decodeAndDecompress(encodedString) {
    const compressed = Buffer.from(encodedString, 'base64');
    const decompressed = pako.inflate(compressed);
    // Convert Uint8Array back to a UTF-8 string
    return new TextDecoder().decode(decompressed);
}

// === END NEW HELPERS ===


// --- Helper: Get Sheet Headers ---
async function getSheetHeaders(sheets, SPREADSHEET_ID, sheetName) {
// ... (rest of function is unchanged)
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

// --- Helper: Column Letter ---
function getColumnLetter(colIndex) { // 0-based index
     let col = ''; let num = colIndex; do { col = String.fromCharCode(65 + (num % 26)) + col; num = Math.floor(num / 26) - 1; } while (num >= 0); return col;
}

// --- Helper: Find Row by Employee ID ---
async function findEmployeeRow(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, getSheetHeadersFunc, employeeId) {
// ... (rest of function is unchanged)
    const headers = await getSheetHeadersFunc(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME);
    if (!headers || headers.length === 0) throw new Error(`Headers missing or empty in '${EMPLOYEE_SHEET_NAME}'.`);

    const idHeaderNormalized = HEADER_MAPPING.employeeId;
    const idColIndex = headers.indexOf(idHeaderNormalized);
    if (idColIndex === -1) throw new Error(`Could not find '${idHeaderNormalized}' column in '${EMPLOYEE_SHEET_NAME}'.`);

    const idColLetter = getColumnLetter(idColIndex); // Uses getColumnLetter from this file
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

// --- Helper: Find Row by Username ---
async function findUserRow(sheets, SPREADSHEET_ID, USERS_SHEET_NAME, username) {
// ... (rest of function is unchanged)
    console.log(`Searching for username: ${username} in sheet: ${USERS_SHEET_NAME}`);
    try {
        const range = `${USERS_SHEET_NAME}!A2:A`; // Assume Username is always Column A, start scan from row 2
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const rows = response.data.values || [];
        console.log(`Found ${rows.length} rows in Username column.`);
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] && String(rows[i][0]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
                const rowIndex = i + 2; // 1-based index
                console.log(`Found username ${username} at row index: ${rowIndex}`);
                return rowIndex;
            }
        }
        console.log(`Username ${username} not found.`);
        return -1;
    } catch (error) {
        if (error.code === 400 && error.message.includes('Unable to parse range')) {
             console.warn(`Sheet '${USERS_SHEET_NAME}' might be empty or Username column 'A' not found.`);
             return -1;
        }
        console.error(`Error finding user row for ${username}:`, error);
        throw error;
    }
}


// --- Helper: Ensure Sheet Exists and Has Headers ---
async function ensureSheetAndHeaders(sheets, SPREADSHEET_ID, sheetName, expectedHeaders, getSheetHeadersFunc) {
// ... (rest of function is unchanged)
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
            delete headerCache[sheetName]; delete headerCacheTimestamp[sheetName];
        } else {
             console.log(`Sheet '${sheetName}' already exists.`);
             const currentHeaders = await getSheetHeadersFunc(sheets, SPREADSHEET_ID, sheetName);
             if (!currentHeaders || currentHeaders.length === 0) {
                  console.warn(`Sheet '${sheetName}' exists but has no headers. Adding headers.`);
                  await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', resource: { values: [expectedHeaders] } });
                  console.log(`Added headers to existing empty sheet ${sheetName}.`);
                  delete headerCache[sheetName]; delete headerCacheTimestamp[sheetName];
             }
        }
    } catch (error) {
         console.error(`Error ensuring sheet '${sheetName}':`, error.response?.data || error.message);
         throw new Error(`Failed to ensure sheet '${sheetName}' setup: ${error.errors?.[0]?.message || error.message}`);
    }
}

// --- Helper: Format Date for Sheet ---
function formatDateForSheet(date) {
// ... (rest of function is unchanged)
    const options = {
        timeZone: 'Asia/Dhaka', // Use appropriate timezone
        day: '2-digit', month: 'short', year: '2-digit',
        hour: 'numeric', minute: '2-digit', hour12: true
    };
    let formatted = new Intl.DateTimeFormat('en-GB', options).format(date);
    formatted = formatted.replace(',', '').replace(' ', '-').replace(' ', '-').toUpperCase().replace('PM', ' PM').replace('AM', ' AM');
    formatted = formatted.replace('--', '-').replace('-PM', ' PM').replace('-AM', ' AM'); // Cleanup potential double dashes
    return formatted;
}

// --- Helper: Log Event to a Sheet ---
async function logEvent(sheets, SPREADSHEET_ID, logSheetName, logHeaders, eventDataArray, preformattedTimestamp = null, ensureSheetFunc) {
// ... (rest of function is unchanged)
    const timestamp = preformattedTimestamp || formatDateForSheet(new Date());
    const rowToLog = [timestamp, ...eventDataArray];
    console.log(`Logging event to ${logSheetName}:`, rowToLog);
    try {
        // Pass getSheetHeaders directly as the getter function needed by ensureSheetFunc
        await ensureSheetFunc(sheets, SPREADSHEET_ID, logSheetName, logHeaders, getSheetHeaders);
        await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${logSheetName}!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: [rowToLog] } });
        console.log(`Successfully logged event to ${logSheetName}.`);
    } catch (error) {
        console.error(`Error logging event to ${logSheetName}:`, error.response?.data || error.message);
    }
}

// --- Helper: Get Employee Salary ---
async function getEmployeeSalary(sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, findEmployeeRowFunc, getSheetHeadersFunc, employeeId) {
// ... (rest of function is unchanged)
    // Pass getSheetHeadersFunc to findEmployeeRowFunc
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
        const salary = response.data.values?.[0]?.[0];
        console.log(`Fetched salary for ${employeeId}: ${salary}`);
        return salary;
    } catch (error) {
        console.error(`Error fetching salary for employee ${employeeId}:`, error);
        return null;
    }
}

// --- Exports --- Combine all exports into ONE block at the END ---
module.exports = {
    getSheetHeaders,
    findEmployeeRow,
    findUserRow,
    ensureSheetAndHeaders,
    logEvent,
    getEmployeeSalary,
    getColumnLetter,
    formatDateForSheet,
    // === NEW EXPORTS ===
    compressAndEncode,
    decodeAndDecompress
};