const { google } = require('googleapis');

// --- Authorization ---
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1NH4_rlOgOu68QrqQA1IsNw1CwvUecRSdW6PnfcatnZQ'; // Updated Sheet ID
const EMPLOYEE_SHEET_NAME = 'Employees';
const SALARY_SHEET_PREFIX = 'Salary_'; // Prefix for salary sheets

// Maps frontend object keys to sheet header names (after normalization).
// ADDED status, salaryHeld, remarks, separationDate
const HEADER_MAPPING = {
    employeeId: 'employeeid', name: 'employeename', employeeType: 'employeetype',
    designation: 'designation', joiningDate: 'joiningdate', project: 'project',
    projectOffice: 'projectoffice', reportProject: 'reportproject', subCenter: 'subcenter',
    workExperience: 'workexperience', education: 'education', fatherName: 'fathersname',
    motherName: 'mothersname', personalMobile: 'personalmobilenumber', dob: 'dateofbirth',
    bloodGroup: 'bloodgroup', address: 'address', identification: 'identification',
    nomineeName: 'nomineesname', nomineeMobile: 'nomineesmobilenumber', salary: 'grosssalary',
    officialMobile: 'officialmobilenumber', mobileLimit: 'mobilelimit', bankAccount: 'bankaccountnumber',
    status: 'status', salaryHeld: 'salaryheld', remarks: 'remarks', separationDate: 'separationdate'
};

// --- Helper: Get Sheet Headers ---
async function getSheetHeaders(sheetName) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!1:1`, // Get only the first row
    });
    const headerRow = response.data.values ? response.data.values[0] : [];
    // Normalize headers: lowercase, remove content in parentheses, remove apostrophes, remove spaces
    return headerRow.map(h => h.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));
}


// --- Helper: Find Row by Employee ID ---
async function findEmployeeRow(employeeId) {
    // Determine the column letter for Employee ID based on headers
    const headers = await getSheetHeaders(EMPLOYEE_SHEET_NAME);
    const idColIndex = headers.indexOf(HEADER_MAPPING.employeeId);
    if (idColIndex === -1) {
        throw new Error("Could not find 'Employee ID' column in the sheet.");
    }
    const idColLetter = String.fromCharCode('A'.charCodeAt(0) + idColIndex);

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EMPLOYEE_SHEET_NAME}!${idColLetter}:${idColLetter}`, // Scan only the Employee ID column
    });
    const rows = response.data.values || [];
    for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header
        if (rows[i][0] === employeeId) {
            return i + 1; // Return 1-based row index
        }
    }
    return -1; // Not found
}

// --- Main Handler ---
exports.handler = async (event) => {
    // Note: Netlify rewrites the URL, action is in the original query
    const { action, sheetId } = event.queryStringParameters;

    try {
        switch (action) {
            case 'getEmployees':
                return await getEmployees();
            case 'saveEmployee':
                return await saveEmployee(JSON.parse(event.body));
            case 'updateStatus':
                return await updateStatus(JSON.parse(event.body));
            case 'saveSheet':
                return await saveSalarySheet(JSON.parse(event.body));
            case 'getPastSheets':
                return await getPastSheets();
            case 'getSheetData':
                if (!sheetId) throw new Error("sheetId is required");
                return await getSheetData(sheetId);
            default:
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
        }
    } catch (error) {
        console.error('API Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'An internal server error occurred.', details: error.message }),
        };
    }
};

// --- API Action: Get Employees ---
async function getEmployees() {
    const headers = await getSheetHeaders(EMPLOYEE_SHEET_NAME);
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EMPLOYEE_SHEET_NAME}!A:AZ`, // Read a wide range to get all columns
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
        return { statusCode: 200, body: JSON.stringify([]) }; // No data
    }

    const headerRow = headers; // Use the normalized headers we already fetched
    const dataRows = rows.slice(1);

    const employees = dataRows.map((row, index) => {
        const emp = { id: index + 2 }; // Use row number as a unique ID (relative to sheet)
        headerRow.forEach((header, i) => {
            const key = Object.keys(HEADER_MAPPING).find(k => HEADER_MAPPING[k] === header);
            if (key) {
                // Convert salaryHeld to boolean if it's the correct column
                if (key === 'salaryHeld') {
                    emp[key] = (row[i] || '').toUpperCase() === 'TRUE';
                } else {
                    emp[key] = row[i] || ''; // Default to empty string
                }
            }
        });
        // Ensure essential fields have defaults if missing after mapping
        emp.status = emp.status || 'Active';
        emp.salaryHeld = emp.salaryHeld || false; // Ensure boolean
        return emp;
    });

    return { statusCode: 200, body: JSON.stringify(employees) };
}

// --- API Action: Save Employee (Add or Update) ---
async function saveEmployee(employeeData) {
    const headerRow = await getSheetHeaders(EMPLOYEE_SHEET_NAME);
    
    // Ensure status and salaryHeld are correctly formatted (string for sheet)
    const dataToSave = { ...employeeData };
    dataToSave.salaryHeld = (dataToSave.salaryHeld === true || String(dataToSave.salaryHeld).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
    dataToSave.status = dataToSave.status || 'Active'; // Default to Active if not provided

    // Map the employeeData object to a row array in the correct order based on sheet headers
    const newRow = headerRow.map(header => {
        const key = Object.keys(HEADER_MAPPING).find(k => HEADER_MAPPING[k] === header);
        // Use the value from dataToSave if it exists, otherwise default to empty string
        return (key && dataToSave[key] !== undefined && dataToSave[key] !== null) ? dataToSave[key] : '';
    });
    
    const rowIndex = await findEmployeeRow(employeeData.employeeId);
    
    if (rowIndex !== -1) {
        // Update existing row
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${EMPLOYEE_SHEET_NAME}!A${rowIndex}`, // Update the entire row starting from column A
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] },
        });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee updated successfully!' }) };
    } else {
        // Append new row
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${EMPLOYEE_SHEET_NAME}!A1`, // Append after the last row in the sheet
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS', // Important for appending
            resource: { values: [newRow] },
        });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee added successfully!' }) };
    }
}


// --- API Action: Update Status (Handles Resign, Terminate, Hold/Unhold) ---
async function updateStatus(statusData) {
    const { employeeId, ...updates } = statusData;
    
    const rowIndex = await findEmployeeRow(employeeId);
    if (rowIndex === -1) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Employee not found' }) };
    }
    
    const headerRow = await getSheetHeaders(EMPLOYEE_SHEET_NAME);
    
    // Create an update request for each field to change
    const data = Object.keys(updates).map(key => {
        const headerName = HEADER_MAPPING[key];
        const colIndex = headerRow.indexOf(headerName);
        if (colIndex === -1) return null; // Field not in sheet
        
        // Convert column index to A1 notation (e.g., 0 -> A, 1 -> B)
        const colLetter = String.fromCharCode('A'.charCodeAt(0) + colIndex);
        
        // Ensure boolean is saved as TRUE/FALSE string for salaryHeld
        let valueToSave = updates[key];
        if (key === 'salaryHeld') {
            valueToSave = (valueToSave === true || String(valueToSave).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
        }

        // If status changes away from Active, potentially clear salaryHeld
        if (key === 'status' && valueToSave !== 'Active') {
            const heldColIndex = headerRow.indexOf(HEADER_MAPPING.salaryHeld);
             if (heldColIndex !== -1) {
                 const heldColLetter = String.fromCharCode('A'.charCodeAt(0) + heldColIndex);
                  // Return two update objects: one for status, one for clearing held
                 return [
                     {
                         range: `${EMPLOYEE_SHEET_NAME}!${colLetter}${rowIndex}`,
                         values: [[valueToSave]],
                     },
                     {
                         range: `${EMPLOYEE_SHEET_NAME}!${heldColLetter}${rowIndex}`,
                         values: [['FALSE']], // Clear held status
                     }
                 ];
             }
        }


        // If only updating salaryHeld, make sure status remains Active
        if (key === 'salaryHeld' && updates.status === undefined) {
             const statusColIndex = headerRow.indexOf(HEADER_MAPPING.status);
             if (statusColIndex !== -1) {
                 const statusColLetter = String.fromCharCode('A'.charCodeAt(0) + statusColIndex);
                  // Return two update objects: one for held, one for ensuring active
                 return [
                     {
                         range: `${EMPLOYEE_SHEET_NAME}!${colLetter}${rowIndex}`,
                         values: [[valueToSave]],
                     },
                     {
                         range: `${EMPLOYEE_SHEET_NAME}!${statusColLetter}${rowIndex}`,
                         values: [['Active']], // Ensure status is Active when toggling hold
                     }
                 ];
             }
        }


        // Default single update
        return {
            range: `${EMPLOYEE_SHEET_NAME}!${colLetter}${rowIndex}`,
            values: [[valueToSave]],
        };
    }).flat().filter(Boolean); // Flatten array in case status change added multiple updates, Remove any nulls


    if (data.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: data,
            },
        });
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Employee status updated successfully!' }) };
}

// --- API Action: Save Salary Sheet ---
async function saveSalarySheet({ sheetId, sheetData }) {
    const sheetName = `${SALARY_SHEET_PREFIX}${sheetId}`; // e.g., Salary_2025-10
    
    try {
        // 1. Check if sheet exists, create if not
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === sheetName);
        
        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    requests: [{ addSheet: { properties: { title: sheetName } } }],
                },
            });
             console.log(`Created new sheet: ${sheetName}`);
        } else {
             console.log(`Sheet exists: ${sheetName}`);
        }
        
        // 2. Prepare data for the sheet
        const headers = ["Employee ID", "Name", "Gross Salary", "Days Present", "Deduction", "Net Salary", "Status"];
        const rows = sheetData.map(row => [
            row.employeeId, row.name, row.salary, row.daysPresent, row.deduction, row.netSalary, row.status
        ]);
        
        // 3. Clear existing data (optional, but good practice)
         await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1:G`, // Clear only relevant columns
         });
         console.log(`Cleared data in sheet: ${sheetName}`);

        // 4. Write new data to the sheet
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1`, // Start writing from A1
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [headers, ...rows],
            },
        });
        console.log(`Updated data in sheet: ${sheetName}`);
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Salary sheet saved successfully!' }) };

    } catch (sheetError) {
         console.error(`Error saving salary sheet ${sheetName}:`, sheetError);
         // Try to provide a more specific error message if possible
         const detail = sheetError.errors && sheetError.errors[0] ? sheetError.errors[0].message : sheetError.message;
         throw new Error(`Failed to save salary sheet: ${detail}`);
    }
}


// --- API Action: Get Past Sheets ---
async function getPastSheets() {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const pastSheets = spreadsheet.data.sheets
        .map(s => s.properties.title)
        .filter(title => title.startsWith(SALARY_SHEET_PREFIX))
        .map(title => ({ sheetId: title.replace(SALARY_SHEET_PREFIX, '') }));
        
    return { statusCode: 200, body: JSON.stringify(pastSheets) };
}

// --- API Action: Get Sheet Data ---
async function getSheetData(sheetId) {
    const sheetName = `${SALARY_SHEET_PREFIX}${sheetId}`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: sheetName, // Read the whole sheet
    });
    
    const rows = response.data.values;
    if (!rows || rows.length < 2) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Sheet data not found or is empty.' }) };
    }
    
    const [headerRow, ...dataRows] = rows;
    // Normalize headers from the actual sheet data
    const headers = headerRow.map(h => h.toLowerCase().replace(/\s+/g, ''));
    
    // Define expected columns for mapping
    const expectedHeaders = {
        employeeId: 'employeeid', name: 'name', salary: 'grosssalary', 
        daysPresent: 'dayspresent', deduction: 'deduction', netSalary: 'netsalary', 
        status: 'status'
    };

    const sheetData = dataRows.map(row => {
        const rowData = {};
        for (const key in expectedHeaders) {
            const headerName = expectedHeaders[key];
            const colIndex = headers.indexOf(headerName);
            if (colIndex !== -1) {
                 // Apply specific type conversions if needed
                if (['salary', 'deduction', 'netSalary'].includes(key)) {
                    rowData[key] = parseFloat(row[colIndex] || 0);
                } else if (key === 'daysPresent') {
                    rowData[key] = parseInt(row[colIndex] || 0);
                } else {
                    rowData[key] = row[colIndex] || '';
                }
            } else {
                 rowData[key] = key === 'salary' || key === 'daysPresent' || key === 'deduction' || key === 'netSalary' ? 0 : ''; // Default value if column missing
            }
        }
        return rowData;
    });
    
    return { statusCode: 200, body: JSON.stringify({ sheetId, sheetData }) };
}

