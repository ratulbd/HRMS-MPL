// netlify/functions/api.js

const { google } = require('googleapis');
const helpers = require('./lib/_helpers');
const employeeActions = require('./lib/_employeeActions');
const sheetActions = require('./lib/_sheetActions');
const authActions = require('./lib/_authActions');

// --- Authorization ---
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- Constants ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1NH4_rlOgOu68QrqQA1IsNw1CwvUecRSdW6PnfcatnZQ'; // Make sure this is your actual Sheet ID
const EMPLOYEE_SHEET_NAME = 'Employees';
const SALARY_SHEET_PREFIX = 'Salary_';
const USERS_SHEET_NAME = 'Users';
const TRANSFER_LOG_SHEET_NAME = 'Transfer_Log'; // Added based on _employeeActions

// *** MODIFICATION: Added identificationType and all salary fields ***
const HEADER_MAPPING = {
    // Basic Info
    employeeId: 'employeeid', name: 'employeename', employeeType: 'employeetype',
    designation: 'designation', joiningDate: 'joiningdate',
    workExperience: 'workexperienceyears', // Assuming header is "Work Experience (Years)"
    education: 'education',
    // Project Info
    project: 'project', projectOffice: 'projectoffice',
    reportProject: 'reportproject', subCenter: 'subcenter',
    // Personal Info
    fatherName: 'fathersname', motherName: 'mothersname',
    personalMobile: 'personalmobilenumber', dob: 'dateofbirth',
    bloodGroup: 'bloodgroup', address: 'address',
    identificationType: 'identificationtype', // <<< Corrected: Added
    identification: 'identification',
    // Contact & Nominee
    nomineeName: 'nomineesname', nomineeMobile: 'nomineesmobilenumber',
    officialMobile: 'officialmobilenumber', mobileLimit: 'mobilelimit',
    // Salary - Earnings
    previousSalary: 'previoussalary', // Assuming header exists
    basic: 'basic', // <<< Corrected: Added
    others: 'others', // <<< Corrected: Added
    salary: 'grosssalary', // This is Gross Salary
    motobikeCarMaintenance: 'motobikecarmaintenanceallowance', // <<< Corrected: Added (Adjust if header normalizes differently)
    laptopRent: 'laptoprent', // <<< Corrected: Added
    othersAllowance: 'othersallowance', // <<< Corrected: Added
    arrear: 'arrear', // <<< Corrected: Added
    foodAllowance: 'foodallowance', // <<< Corrected: Added
    stationAllowance: 'stationallowance', // <<< Corrected: Added
    hardshipAllowance: 'hardshipallowance', // <<< Corrected: Added
    // Salary - Calculated Earnings Total
    grandTotal: 'grandtotal', // <<< Corrected: Added
    // Salary - Deductions
    gratuity: 'gratuity', // <<< Corrected: Added
    subsidizedLunch: 'subsidizedlunch', // <<< Corrected: Added
    tds: 'tds', // <<< Corrected: Added
    motorbikeLoan: 'motorbikeloan', // <<< Corrected: Added
    welfareFund: 'welfarefund', // <<< Corrected: Added
    salaryOthersLoan: 'salaryothersloan', // <<< Corrected: Added (Adjust if header uses '/' and normalizes differently)
    subsidizedVehicle: 'subsidizedvehicle', // <<< Corrected: Added
    lwp: 'lwp', // <<< Corrected: Added
    cpf: 'cpf', // <<< Corrected: Added
    othersAdjustment: 'othersadjustment', // <<< Corrected: Added
    // Salary - Calculated Deductions Total
    totalDeduction: 'totaldeduction', // <<< Corrected: Added
    // Salary - Calculated Net Total
    netSalaryPayment: 'netsalarypayment', // <<< Corrected: Added
    // Bank
    bankAccount: 'bankaccountnumber',
    // Status & History
    status: 'status', salaryHeld: 'salaryheld', holdTimestamp: 'holdtimestamp',
    separationDate: 'separationdate', remarks: 'remarks',
    lastTransferDate: 'lasttransferdate', lastSubcenter: 'lastsubcenter',
    lastTransferReason: 'lasttransferreason'
};
// *** END MODIFICATION ***


// Log Headers (Optional, mostly used in modules)
const HOLD_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Action']; // Referenced in _employeeActions
const SEPARATION_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Gross Salary', 'Separation Date', 'Status', 'Remarks']; // Referenced in _employeeActions
const TRANSFER_LOG_HEADERS = ['Timestamp', 'Employee ID', 'Employee Name', 'Old Sub Center', 'New Sub Center', 'Reason', 'Transfer Date']; // Referenced in _employeeActions


// --- Main Handler ---
exports.handler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const { action, sheetId } = event.queryStringParameters || {};
    let requestBody = {};

    console.log(`Handler received event for action: ${action}, method: ${event.httpMethod}`);
    console.log("Raw event.body:", event.body ? event.body.substring(0, 500) + '...' : '<empty>');
    console.log("event.isBase64Encoded:", event.isBase64Encoded);

    try {
        if (event.httpMethod === 'POST' && event.body) {
             let bodyString = event.body;
             if (event.isBase64Encoded) {
                  console.log("Decoding Base64 body...");
                  bodyString = Buffer.from(bodyString, 'base64').toString('utf-8');
                  console.log("Decoded body string:", bodyString ? bodyString.substring(0, 500) + '...' : '<empty>');
             }
             try {
                  requestBody = JSON.parse(bodyString);
                  console.log("Successfully parsed JSON body.");
             } catch (parseError) {
                  console.error("Error parsing JSON body:", parseError);
                  console.error("Original body string that failed parsing:", bodyString ? bodyString.substring(0, 500) + '...' : '<empty>');
                  throw new Error("Invalid JSON body format received.");
             }
        } else if (event.httpMethod === 'POST') {
             console.warn("POST request received but event.body is empty or missing.");
        }
    } catch (e) {
        console.error("Critical error during body processing:", e);
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: e.message || 'Failed to process request body.' }) };
    }

    console.log("Using requestBody:", JSON.stringify(requestBody).substring(0, 200) + '...');

    try {
        let result;
        if (!['GET', 'POST'].includes(event.httpMethod)) {
             result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        } else {
            // Pass necessary constants and modules to the action functions
            const context = {
                sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers,
                SALARY_SHEET_PREFIX, USERS_SHEET_NAME, TRANSFER_LOG_SHEET_NAME,
                HOLD_LOG_SHEET_NAME, SEPARATION_LOG_SHEET_NAME // Pass log sheet names if needed by helpers via employeeActions
            };

            switch (action) {
                // --- Employee Actions ---
                case 'getEmployees':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.getEmployees(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers);
                    break;
                case 'saveEmployee':
                    if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.saveEmployee(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody);
                    break;
                case 'updateStatus':
                    if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.updateStatus(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody);
                    break;
                 case 'getSubCenters':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.getSubCenters(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers);
                    break;
                case 'getProjects':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.getProjects(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers);
                    break;
                case 'getProjectOffices':
                     if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                     else result = await employeeActions.getProjectOffices(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers);
                     break;
                case 'getReportProjects':
                     if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                     else result = await employeeActions.getReportProjects(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers);
                     break;
                case 'transferEmployee':
                     if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                     else result = await employeeActions.transferEmployee(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody);
                     break;

                // --- Sheet Actions ---
                case 'saveSheet':
                    if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await sheetActions.saveSalarySheet(context.sheets, context.SPREADSHEET_ID, context.SALARY_SHEET_PREFIX, context.helpers, requestBody);
                    break;
                case 'getPastSheets':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await sheetActions.getPastSheets(context.sheets, context.SPREADSHEET_ID, context.SALARY_SHEET_PREFIX);
                    break;
                case 'getSheetData':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else if (!sheetId) {
                         result = { statusCode: 400, body: JSON.stringify({ error: 'sheetId parameter is required' }) };
                    } else {
                         result = await sheetActions.getSheetData(context.sheets, context.SPREADSHEET_ID, context.SALARY_SHEET_PREFIX, sheetId);
                    }
                    break;

                // --- Auth Actions ---
                case 'loginUser':
                    if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await authActions.loginUser(context.sheets, context.SPREADSHEET_ID, context.USERS_SHEET_NAME, context.helpers, requestBody);
                    break;
                case 'changePassword':
                     if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                     else result = await authActions.changePassword(context.sheets, context.SPREADSHEET_ID, context.USERS_SHEET_NAME, context.helpers, requestBody);
                     break;

                // --- Default ---
                default:
                    console.warn(`Invalid action received: ${action}`);
                    result = { statusCode: 400, body: JSON.stringify({ error: 'Invalid action parameter' }) };
            }
        }
        if (typeof result !== 'object' || result === null) {
             console.error(`Action '${action}' returned non-object result:`, result);
             result = { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error: Invalid action result.' }) };
        }
        result.headers = { ...corsHeaders, ...result.headers };
        console.log(`Action '${action}' completed with status: ${result.statusCode}`);
        return result;

    } catch (error) {
        console.error(`API Error during action '${action}':`, error.stack || error.message);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'An internal server error occurred.', details: error.message }),
        };
    }
};