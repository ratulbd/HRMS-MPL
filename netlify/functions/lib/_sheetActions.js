// netlify/functions/lib/_sheetActions.js

// (Original saveSalarySheet, getPastSheets, getSheetData functions)
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
            row.deduction ?? '', row.netSalary ?? '', row.status ?? ''
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

// --- MODIFICATION: Add new functions for Salary Archive ---

/**
 * Saves a new salary archive (JSON data) to the archive sheet.
 */
async function saveSalaryArchive(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, helpers, { monthYear, jsonData }) {
    console.log(`Executing saveSalaryArchive for: ${monthYear}`);
    if (!monthYear || !jsonData) {
        throw new Error("Invalid input: monthYear and jsonData required.");
    }
    
    const headers = ["MonthYear", "JsonData"];
    const jsonString = JSON.stringify(jsonData);
    
    try {
        // Ensure the archive sheet exists
        await helpers.ensureSheetAndHeaders(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, headers, helpers.getSheetHeaders);

        // Append the new row
        const rowToLog = [monthYear, jsonString];
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SALARY_ARCHIVE_SHEET_NAME}!A1`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [rowToLog] }
        });
        
        console.log(`Successfully archived salary data for ${monthYear}.`);
        return { statusCode: 200, body: JSON.stringify({ message: 'Salary data archived successfully.' }) };
        
    } catch (error) {
        console.error(`Error in saveSalaryArchive:`, error.response?.data || error.message);
        throw new Error(`Failed to save salary archive: ${error.errors?.[0]?.message || error.message}`);
    }
}

/**
 * Retrieves all salary archives from the sheet.
 */
async function getSalaryArchive(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, helpers) {
    console.log("Executing getSalaryArchive");
    try {
        // Ensure the sheet exists (it will be created if it doesn't)
        const headers = ["MonthYear", "JsonData"];
        await helpers.ensureSheetAndHeaders(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, headers, helpers.getSheetHeaders);
        
        const range = `${SALARY_ARCHIVE_SHEET_NAME}!A2:B`; // Get all data starting from row 2
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const rows = response.data.values;
        
        if (!rows || rows.length === 0) {
            console.log(`No salary archives found in ${SALARY_ARCHIVE_SHEET_NAME}.`);
            return { statusCode: 200, body: JSON.stringify([]) }; // Return empty array
        }

        const archives = rows.map(row => {
            try {
                return {
                    monthYear: row[0],
                    jsonData: JSON.parse(row[1]) // Parse the JSON data
                };
            } catch (e) {
                console.warn(`Failed to parse JSON for archive: ${row[0]}`, e);
                return null; // Skip corrupted rows
            }
        }).filter(Boolean); // Filter out any nulls
        
        console.log(`Fetched ${archives.length} salary archives.`);
        return { statusCode: 200, body: JSON.stringify(archives) };

    } catch (error) {
        console.error(`Error in getSalaryArchive:`, error.response?.data || error.message);
        if (error.code === 400 && error.message.includes('Unable to parse range')) {
             console.warn(`Sheet '${SALARY_ARCHIVE_SHEET_NAME}' might be empty.`);
             return { statusCode: 200, body: JSON.stringify([]) };
        }
        throw new Error(`Failed to fetch salary archives: ${error.errors?.[0]?.message || error.message}`);
    }
}
// --- END MODIFICATION ---

module.exports = {
    saveSalarySheet,
    getPastSheets,
    getSheetData,
    // --- MODIFICATION: Export new functions ---
    saveSalaryArchive,
    getSalaryArchive
    // --- END MODIFICATION ---
};