// netlify/functions/lib/_sheetActions.js

const MAX_CELL_SIZE = 48000;

// (saveSalarySheet, getPastSheets, getSheetData, saveSalaryArchive functions remain UNCHANGED)
async function saveSalarySheet(sheets, SPREADSHEET_ID, SALARY_SHEET_PREFIX, helpers, { sheetId, sheetData }) {
     if (!sheetId || !sheetData || !Array.isArray(sheetData)) { throw new Error("Invalid input: sheetId and sheetData array required."); }
    const sheetName = `${SALARY_SHEET_PREFIX}${sheetId}`;
    const headers = ["Employee ID", "Name", "Gross Salary", "Days Present", "Deduction", "Net Salary", "Status"];
    try {
        await helpers.ensureSheetAndHeaders(sheets, SPREADSHEET_ID, sheetName, headers, helpers.getSheetHeaders);
        const rows = sheetData.map(row => [ row.employeeId ?? '', row.name ?? '', row.salary ?? '', row.daysPresent ?? '', row.deduction ?? '', row.netSalary ?? '', row.status ?? '' ]);
        const clearRange = `${sheetName}!A2:G`;
        await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: clearRange });
        if (rows.length > 0) {
             const updateRange = `${sheetName}!A2`;
            await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: updateRange, valueInputOption: 'USER_ENTERED', resource: { values: rows } });
        }
        return { statusCode: 200, body: JSON.stringify({ message: 'Salary sheet saved.' }) };
    } catch (sheetError) {
         throw new Error(`Failed to save salary sheet: ${sheetError.errors?.[0]?.message || sheetError.message}`);
    }
}

async function getPastSheets(sheets, SPREADSHEET_ID, SALARY_SHEET_PREFIX) {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(title))' });
    const pastSheets = spreadsheet.data.sheets.map(s => s.properties.title).filter(title => title?.startsWith(SALARY_SHEET_PREFIX)).map(title => ({ sheetId: title.replace(SALARY_SHEET_PREFIX, '') }));
    return { statusCode: 200, body: JSON.stringify(pastSheets) };
}

async function getSheetData(sheets, SPREADSHEET_ID, SALARY_SHEET_PREFIX, sheetId) {
     if (!sheetId) throw new Error("sheetId parameter required.");
    const sheetName = `${SALARY_SHEET_PREFIX}${sheetId}`;
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: sheetName });
    const rows = response.data.values;
    if (!rows || rows.length < 2) return { statusCode: 200, body: JSON.stringify({ sheetId, sheetData: [] }) };
    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map(h => (h || '').toLowerCase().replace(/\s+/g, ''));
    const expected = ['employeeid', 'name', 'grosssalary', 'dayspresent', 'deduction', 'netsalary', 'status'];
    const indices = expected.map(eh => headers.indexOf(eh));
    const sheetData = dataRows.map(row => ({
        employeeId: String(row[indices[0]] ?? ''), name: String(row[indices[1]] ?? ''), salary: parseFloat(row[indices[2]]) || 0,
        daysPresent: parseInt(row[indices[3]], 10) || 0, deduction: parseFloat(row[indices[4]]) || 0, netSalary: parseFloat(row[indices[5]]) || 0, status: String(row[indices[6]] ?? '')
    }));
    return { statusCode: 200, body: JSON.stringify({ sheetId, sheetData }) };
}

async function saveSalaryArchive(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, helpers, { monthYear, timestamp, jsonData }) {
    if (!monthYear || !jsonData || !timestamp) { throw new Error("Invalid input: monthYear, timestamp, and jsonData required."); }
    const fullJsonString = JSON.stringify(jsonData);
    const encodedString = helpers.compressAndEncode(fullJsonString);
    const totalLength = encodedString.length;
    const totalRows = Math.ceil(totalLength / MAX_CELL_SIZE);
    const headers = ["MonthYear", "Timestamp", "JsonData", "RowIndex", "TotalRows"];
    try {
        await helpers.ensureSheetAndHeaders(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, headers, helpers.getSheetHeaders);
        const rowsToLog = [];
        for (let i = 0; i < totalRows; i++) {
            const start = i * MAX_CELL_SIZE; const end = (i + 1) * MAX_CELL_SIZE;
            const chunk = encodedString.substring(start, end);
            rowsToLog.push([ monthYear, timestamp, chunk, i, totalRows ]);
        }
        if (rowsToLog.length > 0) {
            await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${SALARY_ARCHIVE_SHEET_NAME}!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: rowsToLog } });
        }
        return { statusCode: 200, body: JSON.stringify({ message: `Salary data archived successfully (${totalRows} rows).` }) };
    } catch (error) {
        throw new Error(`Failed to save salary archive: ${error.errors?.[0]?.message || error.message}`);
    }
}

// === UPDATED: getSalaryArchive with Pagination Support ===
async function getSalaryArchive(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, helpers, params = {}) {
    console.log("Executing getSalaryArchive", params);
    try {
        const headers = ["MonthYear", "Timestamp", "JsonData", "RowIndex", "TotalRows"];
        await helpers.ensureSheetAndHeaders(sheets, SPREADSHEET_ID, SALARY_ARCHIVE_SHEET_NAME, headers, helpers.getSheetHeaders);

        // If pagination params provided (limit/offset), we assume data is NOT compressed in chunks for now
        // OR we only support 'metaOnly' or 'monthYear' specific fetch.
        // Since the issue is single-cell size limits, retrieving ALL rows for a month at once is hard.

        // STRATEGY: Read all rows (metadata is small), filter by month, then reconstruct.
        // If 'chunked' is requested, we might need a different approach, but Google Sheets API reads ranges.
        // Reading A2:E5000 is fast. The Payload limit hits when we RETURN the big JSON to client.

        const range = `${SALARY_ARCHIVE_SHEET_NAME}!A2:E`;
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
        const rows = response.data.values;

        if (!rows || rows.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // 1. Group rows
        const groupedArchives = {};
        rows.forEach(row => {
            const monthYear = row[0];
            const timestamp = row[1] || null;
            const chunk = row[2];
            const rowIndex = parseInt(row[3], 10);
            const totalRows = parseInt(row[4], 10);
            const groupKey = `${monthYear}_${timestamp}`;

            if (params.monthYear && params.monthYear !== monthYear) return;

            if (monthYear && chunk && !isNaN(rowIndex) && !isNaN(totalRows)) {
                if (!groupedArchives[groupKey]) {
                    groupedArchives[groupKey] = {
                        monthYear,
                        timestamp,
                        totalRows,
                        chunks: new Array(totalRows).fill(null)
                    };
                }
                groupedArchives[groupKey].chunks[rowIndex] = chunk;
            }
        });

        const resultArchives = [];

        for (const groupKey in groupedArchives) {
            const archive = groupedArchives[groupKey];

            if (params.metaOnly === 'true') {
                resultArchives.push({ monthYear: archive.monthYear, timestamp: archive.timestamp });
                continue;
            }

            if (archive.chunks.every(chunk => chunk !== null)) {
                const fullEncodedString = archive.chunks.join('');
                try {
                    const fullJsonString = helpers.decodeAndDecompress(fullEncodedString);
                    let jsonData = JSON.parse(fullJsonString);

                    // === SERVER-SIDE PAGINATION LOGIC ===
                    if (params.limit && params.offset !== undefined) {
                        const start = parseInt(params.offset, 10);
                        const limit = parseInt(params.limit, 10);

                        // Check if jsonData is array
                        if (Array.isArray(jsonData)) {
                            const slicedData = jsonData.slice(start, start + limit);
                            resultArchives.push({
                                monthYear: archive.monthYear,
                                timestamp: archive.timestamp,
                                totalRecords: jsonData.length, // Inform client of total
                                jsonData: slicedData
                            });
                        } else {
                            // Fallback if object
                            resultArchives.push({ monthYear: archive.monthYear, jsonData });
                        }
                    } else {
                        // No pagination requested (Legacy behavior - risky for big data)
                        resultArchives.push({ monthYear: archive.monthYear, timestamp: archive.timestamp, jsonData });
                    }
                    // ====================================

                } catch (e) {
                    console.warn(`Failed to process archive ${archive.monthYear}`, e);
                }
            }
        }

        return { statusCode: 200, body: JSON.stringify(resultArchives) };

    } catch (error) {
        console.error(`Error in getSalaryArchive:`, error);
        return { statusCode: 200, body: JSON.stringify([]) };
    }
}

module.exports = {
    saveSalarySheet,
    getPastSheets,
    getSheetData,
    saveSalaryArchive,
    getSalaryArchive
};