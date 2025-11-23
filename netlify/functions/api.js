// netlify/functions/api.js

const { google } = require('googleapis');
const helpers = require('./lib/_helpers');
const employeeActions = require('./lib/_employeeActions');
const sheetActions = require('./lib/_sheetActions');
const authActions = require('./lib/_authActions');

console.log("Loaded sheetActions, keys:", Object.keys(sheetActions));

// === Date Helper ===
helpers.formatDateForInput = (dateString) => {
     if (!dateString || (typeof dateString !== 'string' && typeof dateString !== 'number')) return '';
     try {
         let dateObj = null;
         let dateValueStr = String(dateString);

         if (dateValueStr.includes('/')) {
             const parts = dateValueStr.split('/');
             if (parts.length === 3) dateObj = new Date(Date.UTC(parts[2], parts[0] - 1, parts[1]));
         } else if (!isNaN(dateString) && Number(dateString) > 10000 && Number(dateString) < 60000) {
             const excelEpoch = new Date(1899, 11, 30);
             dateObj = new Date(excelEpoch.getTime() + Number(dateString) * 24 * 60 * 60 * 1000);
         } else if (dateValueStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
             dateObj = new Date(dateValueStr + 'T00:00:00Z');
         } else {
             dateObj = new Date(dateValueStr);
         }

         if (dateObj && !isNaN(dateObj.getTime())) {
             const year = dateObj.getUTCFullYear();
             const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
             const day = String(dateObj.getUTCDate()).padStart(2, '0');
             return `${year}-${month}-${day}`;
         }
         return '';
     } catch (e) {
         console.warn(`Error converting date for input: ${dateString}`, e);
         return '';
     }
}

// --- Authorization ---
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- Constants ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1NH4_rlOgOu68QrqQA1IsNw1CwvUecRSdW6PnfcatnZQ';
const EMPLOYEE_SHEET_NAME = 'Employees';
const SALARY_SHEET_PREFIX = 'Salary_';
const USERS_SHEET_NAME = 'Users';
const TRANSFER_LOG_SHEET_NAME = 'Transfer_Log';
const HOLD_LOG_SHEET_NAME = 'Hold_Log';
const SEPARATION_LOG_SHEET_NAME = 'Separation_Log';
const SALARY_ARCHIVE_SHEET_NAME = 'SalaryArchive';
const REJOIN_LOG_SHEET_NAME = 'Rejoin_Log';
const FILE_CLOSING_LOG_SHEET_NAME = 'FileClosing_Log';

// === CRITICAL FIX: HEADER MAPPING ALIGNED TO SHEET HEADERS ===
const HEADER_MAPPING = {
    // Basic Info
    employeeId: 'employeeid',
    name: 'employeename',
    employeeType: 'employeetype',
    designation: 'designation',
    functionalRole: 'functionalrole',
    joiningDate: 'joiningdate',

    // FIX 1: "Work Experience (Years)" -> removes parens -> "workexperience"
    workExperience: 'workexperience',

    education: 'education',

    // Personal Info (Apostrophes removed by normalizer)
    fatherName: 'fathersname',
    motherName: 'mothersname',
    personalMobile: 'personalmobilenumber',
    officialMobile: 'officialmobilenumber',
    mobileLimit: 'mobilelimit',
    dob: 'dateofbirth',
    bloodGroup: 'bloodgroup',
    address: 'address',
    identificationType: 'identificationtype',
    identification: 'identification',

    // Contact & Nominee
    nomineeName: 'nomineesname',
    nomineeMobile: 'nomineesmobilenumber',

    // Project Info
    project: 'project',
    projectOffice: 'projectoffice',
    reportProject: 'reportproject',
    subCenter: 'subcenter',

    // Salary - Earnings
    previousSalary: 'previoussalary',
    basic: 'basic',
    others: 'others',
    salary: 'grosssalary', // Sheet header: "Gross Salary"

    // FIX 2: "Motobike / Car..." -> slash is KEPT by normalizer -> "motobike/carmaintenanceallowance"
    motobikeCarMaintenance: 'motobike/carmaintenanceallowance',

    laptopRent: 'laptoprent',
    othersAllowance: 'othersallowance',
    arrear: 'arrear',
    foodAllowance: 'foodallowance',
    stationAllowance: 'stationallowance',
    hardshipAllowance: 'hardshipallowance',
    grandTotal: 'grandtotal',

    // Salary - Deductions
    gratuity: 'gratuity',
    subsidizedLunch: 'subsidizedlunch',
    tds: 'tds',
    motorbikeLoan: 'motorbikeloan',
    welfareFund: 'welfarefund',

    // FIX 3: "Salary/ Others Loan" -> slash is KEPT -> "salary/othersloan"
    salaryOthersLoan: 'salary/othersloan',

    subsidizedVehicle: 'subsidizedvehicle',
    lwp: 'lwp',
    cpf: 'cpf',

    // Note: "Others Adjustment" was missing from your text list, but usually maps to this.
    // If the column is missing in the sheet, this key will just be ignored.
    othersAdjustment: 'othersadjustment',

    // Totals
    totalDeduction: 'totaldeduction',
    netSalaryPayment: 'netsalarypayment',

    // Bank & Status
    bankAccount: 'bankaccountnumber',
    status: 'status',
    salaryHeld: 'salaryheld',
    holdTimestamp: 'holdtimestamp',
    separationDate: 'separationdate',
    remarks: 'remarks',

    // Logs
    lastTransferDate: 'lasttransferdate',
    lastSubcenter: 'lastsubcenter',
    lastTransferReason: 'lasttransferreason',
    fileClosingDate: 'fileclosingdate',
    fileClosingRemarks: 'fileclosingremarks'
};


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

    const queryParams = event.queryStringParameters || {};
    const { action, sheetId } = queryParams;

    let requestBody = {};

    console.log(`Handler received event for action: ${action}, method: ${event.httpMethod}`);

    try {
        if (event.httpMethod === 'POST' && event.body) {
             let bodyString = event.body;
             if (event.isBase64Encoded) {
                  bodyString = Buffer.from(bodyString, 'base64').toString('utf-8');
             }
             try {
                  requestBody = JSON.parse(bodyString);
             } catch (parseError) {
                  console.error("Error parsing JSON body:", parseError);
                  throw new Error("Invalid JSON body format received.");
             }
        }
    } catch (e) {
        console.error("Critical error during body processing:", e);
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: e.message || 'Failed to process request body.' }) };
    }

    try {
        let result;
        if (!['GET', 'POST'].includes(event.httpMethod)) {
             result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        } else {
            const context = {
                sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers,
                SALARY_SHEET_PREFIX, USERS_SHEET_NAME, TRANSFER_LOG_SHEET_NAME,
                HOLD_LOG_SHEET_NAME, SEPARATION_LOG_SHEET_NAME,
                SALARY_ARCHIVE_SHEET_NAME,
                REJOIN_LOG_SHEET_NAME,
                FILE_CLOSING_LOG_SHEET_NAME
            };

            switch (action) {
                // --- Employee Actions ---
                case 'getEmployees':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.getEmployees(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, queryParams);
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
                case 'logRejoin':
                     if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                     else result = await employeeActions.logRejoin(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody);
                     break;
                case 'closeFile':
                     if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                     else result = await employeeActions.closeFile(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody);
                     break;

                // --- Logs ---
                case 'getHoldLog':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.getLogData(context.sheets, context.SPREADSHEET_ID, context.HOLD_LOG_SHEET_NAME, context.helpers, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING);
                    break;
                case 'getSeparationLog':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.getLogData(context.sheets, context.SPREADSHEET_ID, context.SEPARATION_LOG_SHEET_NAME, context.helpers, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING);
                    break;
                case 'getTransferLog':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.getLogData(context.sheets, context.SPREADSHEET_ID, context.TRANSFER_LOG_SHEET_NAME, context.helpers, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING);
                    break;
                case 'getFileCloseLog':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await employeeActions.getLogData(context.sheets, context.SPREADSHEET_ID, context.FILE_CLOSING_LOG_SHEET_NAME, context.helpers, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING);
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
                case 'saveSalaryArchive':
                    if (event.httpMethod !== 'POST') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await sheetActions.saveSalaryArchive(context.sheets, context.SPREADSHEET_ID, context.SALARY_ARCHIVE_SHEET_NAME, context.helpers, requestBody);
                    break;
                case 'getSalaryArchive':
                    if (event.httpMethod !== 'GET') result = { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
                    else result = await sheetActions.getSalaryArchive(context.sheets, context.SPREADSHEET_ID, context.SALARY_ARCHIVE_SHEET_NAME, context.helpers);
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