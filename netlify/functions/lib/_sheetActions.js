// netlify/functions/lib/_sheetActions.js

// Using a conservative limit slightly below Google Sheets' 50,000 character limit
// The MAX_CELL_SIZE refers to the length of the Base64 encoded string.
const MAX_CELL_SIZE = 48000;

// (Original saveSalarySheet, getPastSheets, getSheetData functions - unchanged)
async function saveSalarySheet(sheets, SPREADSHEET_ID, SALARY_SHEET_PREFIX, helpers, { sheetId, sheetData }) {
     console.log(`Executing saveSalarySheet for sheetId: ${sheetId}`);
     if (!sheetId || !sheetData || !Array.isArray(sheetData)) {
         throw new Error("Invalid input: sheetId and sheetData array required.");
     }
    const sheetName = `${SALARY_SHEET_PREFIX}${sheetId}`;
    const headers = ["Employee ID", "Name", "Gross Salary", "Days Present", "Deduction", "Net Salary", "Status"];

    try {
        await helpers.ensureSheetAndHeaders(sheets, SPREADSHEET_ID, sheetName, headers, helpers.getSheetHeaders);
        const rows = sheetData.map(row => [
            row.employeeId ?? '', row.name ?? '', row.salary ?? '', row.daysPresent ?? '',
            row.deduction ?? '', row.netSalary ?? '', row.status ?? '',
            // NOTE: Assuming your employee objects now have calculated fields like 'netPayment'
            // which are NOT being mapped here, but are present in jsonData sent to archive.
        ]);
        console.log(`Prepared ${rows.length} rows for ${sheetName}.`);
        const clearRange = `${sheetName}!A2:G`;
        console.log(`Clearing range: ${clearRange}`);
        await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: clearRange });
        if (rows.length > 0) {
             const updateRange = `${sheetName}!A2`;
             console.log(`Updating range: ${updateRange}`);
            await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: updateRange, valueInputOption: 'USER_ENTERED', resource: { values: rows } });
            console.log(`Updated data in ${sheetName}`);
        } else {
             console.log(`No data rows to write to ${sheetName}.`);
        }
        return { statusCode: 200, body: JSON.stringify({ message: 'Salary sheet saved.' }) };
    } catch (sheetError) {
         console.error(`Error saving salary sheet ${sheetName}:`, sheetError.response?.data || sheetError.message);
         throw new Error(`Failed to save salary sheet: ${sheetError.errors?.[0]?.message || sheetError.message}`);
    }
}

async function getPastSheets(sheets, SPREADSHEET_ID, SALARY_SHEET_PREFIX) {
     console.log("Executing getPastSheets");
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(title))' });
    const pastSheets = spreadsheet.data.sheets
        .map(s => s.properties.title)
        .filter(title => title?.startsWith(SALARY_SHEET_PREFIX))
        .map(title => ({ sheetId: title.replace(SALARY_SHEET_PREFIX, '') }));
     console.log(`Found ${pastSheets.length} past sheets.`);
    return { statusCode: 200, body: JSON.stringify(pastSheets) };
}

async function getSheetData(sheets, SPREADSHEET_ID, SALARY_SHEET_PREFIX, sheetId) {
     console.log(`Executing getSheetData for sheetId: ${sheetId}`);
     if (!sheetId) throw new Error("sheetId parameter required.");
    const sheetName = `${SALARY_SHEET_PREFIX}${sheetId}`;
    console.log(`Checking if sheet exists: ${sheetName}`);
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(title))' });
    const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === sheetName);
    if (!sheetExists) return { statusCode: 404, body: JSON.stringify({ error: `Sheet '${sheetName}' not found.` }) };
    console.log(`Fetching data from sheet: ${sheetName}`);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: sheetName });
    const rows = response.data.values;
    if (!rows || rows.length < 2) return { statusCode: 200, body: JSON.stringify({ sheetId, sheetData: [] }) };
    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map(h => (h || '').toLowerCase().replace(/\s+/g, ''));
    const expected = ['employeeid', 'name', 'grosssalary', 'dayspresent', 'deduction', 'netsalary', 'status'];
    const indices = expected.map(eh => headers.indexOf(eh));
    const sheetData = dataRows.map(row => ({
        employeeId: String(row[indices[0]] ?? ''),
        name: String(row[indices[1]] ?? ''),
        salary: parseFloat(row[indices[2]]) || 0,
        daysPresent: parseInt(row[indices[3]], 10) || 0,
        deduction: parseFloat(row[indices[4]]) || 0,
        netSalary: parseFloat(row[indices[5]]) || 0,
        status: String(row[indices[6]] ?? '')
    }));
     console.log(`Processed ${sheetData.length} rows from ${sheetName}`);
    return { statusCode: 200, body: JSON.stringify({ sheetId, sheetData }) };
}
// ...

// --- MODIFICATION: Updated functions for Salary Archive to handle splitting ---

/**
 * Saves a new salary archive (JSON data) to the archive sheet, splitting across rows if needed.
 */
async function saveSalaryArchive(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, helpers, { monthYear, timestamp, jsonData }) {
    console.log(`Executing saveSalaryArchive for: ${monthYear}`);
    if (!monthYear || !jsonData || !timestamp) {
        throw new Error("Invalid input: monthYear, timestamp, and jsonData required.");
    }

    // --- STEP 1: Compress and Encode ---
    const fullJsonString = JSON.stringify(jsonData);
    const encodedString = helpers.compressAndEncode(fullJsonString); // Use pako compression + Base64
    // ------------------------------------

    const totalLength = encodedString.length;
    const totalRows = Math.ceil(totalLength / MAX_CELL_SIZE);

    // Headers now include fields for merging
    const headers = ["MonthYear", "Timestamp", "JsonData", "RowIndex", "TotalRows"];

    try {
        await helpers.ensureSheetAndHeaders(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, headers, helpers.getSheetHeaders);

        const rowsToLog = [];

        for (let i = 0; i < totalRows; i++) {
            const start = i * MAX_CELL_SIZE;
            const end = (i + 1) * MAX_CELL_SIZE;
            const chunk = encodedString.substring(start, end);

            // Log format: [MonthYear, Timestamp, DataChunk, RowIndex (0-based), TotalRows]
            const row = [
                monthYear,
                timestamp,
                chunk,
                i,
                totalRows
            ];
            rowsToLog.push(row);
        }

        if (rowsToLog.length > 0) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SALARY_ARCHIVE_SHEET_NAME}!A1`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: rowsToLog }
            });
        }

        console.log(`Successfully archived salary data for ${monthYear} across ${totalRows} rows. Original size: ${totalLength}.`);
        return { statusCode: 200, body: JSON.stringify({ message: `Salary data archived successfully (${totalRows} rows).` }) };

    } catch (error) {
        console.error(`Error in saveSalaryArchive:`, error.response?.data || error.message);
        throw new Error(`Failed to save salary archive: ${error.errors?.[0]?.message || error.message}`);
    }
}

/**
 * Retrieves all salary archives from the sheet, merging split rows.
 */
async function getSalaryArchive(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, helpers) {
    console.log("Executing getSalaryArchive");
    try {
        const headers = ["MonthYear", "Timestamp", "JsonData", "RowIndex", "TotalRows"];
        await helpers.ensureSheetAndHeaders(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, headers, helpers.getSheetHeaders);

        // Fetch all columns (A:E) to get splitting metadata
        const range = `${SALARY_ARCHIVE_SHEET_NAME}!A2:E`;
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const rows = response.data.values;

        if (!rows || rows.length === 0) {
            console.log(`No salary archives found in ${SALARY_ARCHIVE_SHEET_NAME}.`);
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // Group rows by monthYear and TotalRows to merge chunks
        const groupedArchives = {};
        rows.forEach(row => {
            const monthYear = row[0];
            const timestamp = row[1] || null;
            const chunk = row[2];
            const rowIndex = parseInt(row[3], 10);
            const totalRows = parseInt(row[4], 10);

            // Use a unique key combining monthYear and timestamp (or TotalRows) for robust grouping
            const groupKey = `${monthYear}_${timestamp}`;

            if (monthYear && chunk && !isNaN(rowIndex) && !isNaN(totalRows)) {
                if (!groupedArchives[groupKey]) {
                    groupedArchives[groupKey] = {
                        monthYear,
                        timestamp,
                        totalRows,
                        chunks: new Array(totalRows).fill(null)
                    };
                }
                // Store chunk at its calculated index
                groupedArchives[groupKey].chunks[rowIndex] = chunk;
            }
        });

        const mergedArchives = [];

        for (const groupKey in groupedArchives) {
            const archive = groupedArchives[groupKey];

            // Check if all chunks were successfully read before merging
            if (archive.chunks.every(chunk => chunk !== null)) {
                const fullEncodedString = archive.chunks.join(''); // Re-merge the chunks

                try {
                    // --- STEP 2: Decode and Decompress ---
                    const fullJsonString = helpers.decodeAndDecompress(fullEncodedString); // Use pako decompression + Base64 decoding
                    const jsonData = JSON.parse(fullJsonString);
                    // --------------------------------------

                    mergedArchives.push({
                        monthYear: archive.monthYear,
                        timestamp: archive.timestamp,
                        jsonData // Full, parsed JSON object
                    });

                } catch (e) {
                    console.warn(`Failed to process merged JSON for ${archive.monthYear}. Data may be corrupted or unparsable after decompression.`, e);
                }
            } else {
                 console.warn(`Skipping incomplete archive for ${archive.monthYear}. Missing ${archive.chunks.filter(c => c === null).length} chunks out of ${archive.totalRows}.`);
            }
        }

        console.log(`Fetched and merged ${mergedArchives.length} salary archives.`);
        return { statusCode: 200, body: JSON.stringify(mergedArchives) };

    } catch (error) {
        console.error(`Error in getSalaryArchive:`, error.response?.data || error.message);
        if (error.code === 400 && error.message.includes('Unable to parse range')) {
             console.warn(`Sheet '${SALARY_ARCHIVE_SHEET_NAME}' might be empty.`);
             return { statusCode: 200, body: JSON.stringify([]) };
        }
        throw new Error(`Failed to fetch salary archives: ${error.errors?.[0]?.message || error.message}`);
    }
}

module.exports = {
    saveSalarySheet,
    getPastSheets,
    getSheetData,
    saveSalaryArchive,
    getSalaryArchive
};