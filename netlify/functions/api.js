const { google } = require('googleapis');

// --- Authorization ---
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1NH4_rlOgOu68QrqQA1IsNw1CwvUecRSdW6PnfcatnZQ';
const EMPLOYEE_SHEET_NAME = 'Employees';

// Maps frontend object keys to sheet header names (after normalization).
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
const NORMALIZED_HEADERS = Object.values(HEADER_MAPPING);

// --- Main Handler ---
exports.handler = async (event) => {
    const { action } = event.queryStringParameters;

    try {
        switch (action) {
            case 'getEmployees':
                return await getEmployees();
            case 'saveEmployee':
                return await saveEmployee(JSON.parse(event.body));
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

// --- Data Fetching ---
async function getEmployees() {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EMPLOYEE_SHEET_NAME}!A:AZ`, // Read a wide range to capture all possible columns
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
        return { statusCode: 200, body: JSON.stringify([]) }; // No data
    }

    const headerRow = rows[0].map(h => h.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));
    const dataRows = rows.slice(1);
    
    const employees = dataRows.map((row, index) => {
        const emp = { id: index + 2 }; // Use row number as a unique ID
        headerRow.forEach((header, i) => {
            const key = Object.keys(HEADER_MAPPING).find(k => HEADER_MAPPING[k] === header);
            if (key) {
                emp[key] = row[i] || ''; // Default to empty string
            }
        });
        return emp;
    });

    return { statusCode: 200, body: JSON.stringify(employees) };
}

// --- Data Saving ---
async function saveEmployee(employeeData) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EMPLOYEE_SHEET_NAME}!A:AZ`,
    });
    
    const rows = response.data.values || [];
    const headerRow = (rows[0] || []).map(h => h.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));

    // Map the employeeData object to a row array in the correct order
    const newRow = headerRow.map(header => {
        const key = Object.keys(HEADER_MAPPING).find(k => HEADER_MAPPING[k] === header);
        return key ? (employeeData[key] || '') : '';
    });
    
    // Find existing employee by ID to update, or add a new one
    const employeeIdIndex = headerRow.indexOf('employeeid');
    let rowIndex = -1;
    if (employeeIdIndex !== -1 && employeeData.employeeId) {
        for(let i = 1; i < rows.length; i++) {
            if (rows[i][employeeIdIndex] === employeeData.employeeId) {
                rowIndex = i + 1; // 1-based index
                break;
            }
        }
    }
    
    if (rowIndex !== -1) {
        // Update existing row
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${EMPLOYEE_SHEET_NAME}!A${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] },
        });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee updated successfully!' }) };
    } else {
        // Append new row
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${EMPLOYEE_SHEET_NAME}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] },
        });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee added successfully!' }) };
    }
}

