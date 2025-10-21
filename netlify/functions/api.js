const { google } = require('googleapis');

// --- Authorization ---
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
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
const NORMALIZED_HEADER_TO_KEY = Object.fromEntries(Object.entries(HEADER_MAPPING).map(([k, v]) => [v, k]));


function sheetDataToObjects(data) {
    if (!data || data.length < 2) return [];
    const headers = data[0].map(h => h.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));
    
    return data.slice(1).map((row, index) => {
        const obj = { id: index + 2 }; // Sheet row number as unique ID for the session
        headers.forEach((header, i) => {
            const key = NORMALIZED_HEADER_TO_KEY[header];
            if (key) {
                obj[key] = row[i] || '';
            }
        });
        return obj;
    });
}

exports.handler = async (event) => {
    try {
        const { action } = event.queryStringParameters;
        const body = event.body ? JSON.parse(event.body) : {};

        switch (action) {
            case 'getEmployees':
                return await getEmployees();
            case 'saveEmployee':
                return await saveEmployee(body);
            default:
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action specified.' }) };
        }
    } catch (error) {
        console.error('Function Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal server error occurred.', details: error.message }) };
    }
};

async function getEmployees() {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EMPLOYEE_SHEET_NAME}!A:Z`,
    });
    
    const data = sheetDataToObjects(response.data.values);
    
    return { statusCode: 200, body: JSON.stringify(data) };
}

async function saveEmployee(employee) {
    const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EMPLOYEE_SHEET_NAME}!1:1`,
    });

    if (!headerResponse.data.values) {
        throw new Error("Could not find the header row in the 'Employees' sheet.");
    }

    const headers = headerResponse.data.values[0];
    const normalizedHeaders = headers.map(h => h.trim().toLowerCase().replace(/\(.*\)/g, '').replace(/'/g, '').replace(/\s+/g, ''));
    
    // Ensure all required fields are present
    if (!employee.employeeId || !employee.name) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Employee ID and Name are required.' }) };
    }

    const allData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EMPLOYEE_SHEET_NAME}!A:A`,
    });

    const employeeIds = (allData.data.values || []).slice(1).map(row => row[0]);
    const rowIndex = employeeIds.indexOf(employee.employeeId);

    // Build the row in the correct order based on sheet headers
    const rowData = normalizedHeaders.map(header => {
        const key = NORMALIZED_HEADER_TO_KEY[header];
        return employee[key] === undefined ? '' : employee[key];
    });

    if (rowIndex === -1) {
        // Add New Employee
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: EMPLOYEE_SHEET_NAME,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] },
        });
        return { statusCode: 201, body: JSON.stringify({ message: 'Employee added successfully' }) };
    } else {
        // Update Existing Employee
        const range = `${EMPLOYEE_SHEET_NAME}!A${rowIndex + 2}:${String.fromCharCode(65 + headers.length - 1)}${rowIndex + 2}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] },
        });
        return { statusCode: 200, body: JSON.stringify({ message: 'Employee updated successfully' }) };
    }
}

