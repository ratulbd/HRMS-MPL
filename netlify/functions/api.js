// netlify/functions/api.js

const { google } = require('googleapis');
const helpers = require('./lib/_helpers');
const employeeActions = require('./lib/_employeeActions');
const sheetActions = require('./lib/_sheetActions');
const authActions = require('./lib/_authActions');

// === HELPER FIX: Date Formatting ===
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
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const EMPLOYEE_SHEET_NAME = 'Employees';
const SALARY_SHEET_PREFIX = 'Salary_';
const USERS_SHEET_NAME = 'Users';
const TRANSFER_LOG_SHEET_NAME = 'Transfer_Log';
const HOLD_LOG_SHEET_NAME = 'Hold_Log';
const SEPARATION_LOG_SHEET_NAME = 'Separation_Log';
const SALARY_ARCHIVE_SHEET_NAME = 'SalaryArchive';
const REJOIN_LOG_SHEET_NAME = 'Rejoin_Log';
const FILE_CLOSING_LOG_SHEET_NAME = 'FileClosing_Log';

const HEADER_MAPPING = {
    // Basic Info
    employeeId: 'employeeid', name: 'employeename', employeeType: 'employeetype',
    designation: 'designation', functionalRole: 'functionalrole', joiningDate: 'joiningdate',
    workExperience: 'workexperienceyears', education: 'education',
    // Project Info
    project: 'project', projectOffice: 'projectoffice',
    reportProject: 'reportproject', subCenter: 'subcenter',
    // Personal Info
    fatherName: 'fathersname', motherName: 'mothersname',
    personalMobile: 'personalmobilenumber', dob: 'dateofbirth',
    bloodGroup: 'bloodgroup', address: 'address',
    identificationType: 'identificationtype', identification: 'identification',
    // Contact & Nominee
    nomineeName: 'nomineesname', nomineeMobile: 'nomineesmobilenumber',
    officialMobile: 'officialmobilenumber', mobileLimit: 'mobilelimit',
    // Salary
    previousSalary: 'previoussalary', basic: 'basic', others: 'others',
    salary: 'grosssalary',
    // === NEW FIELD ===
    cashPayment: 'cashpayment',
    // ================
    motobikeCarMaintenance: 'motobikecarmaintenanceallowance',
    laptopRent: 'laptoprent', othersAllowance: 'othersallowance',
    arrear: 'arrear', foodAllowance: 'foodallowance',
    stationAllowance: 'stationallowance', hardshipAllowance: 'hardshipallowance',
    grandTotal: 'grandtotal', gratuity: 'gratuity',
    subsidizedLunch: 'subsidizedlunch', tds: 'tds',
    motorbikeLoan: 'motorbikeloan', welfareFund: 'welfarefund',
    salaryOthersLoan: 'salaryothersloan', subsidizedVehicle: 'subsidizedvehicle',
    lwp: 'lwp', cpf: 'cpf', othersAdjustment: 'othersadjustment',
    totalDeduction: 'totaldeduction', netSalaryPayment: 'netsalarypayment',
    bankAccount: 'bankaccountnumber',
    // Status
    status: 'status', salaryHeld: 'salaryheld', holdTimestamp: 'holdtimestamp',
    separationDate: 'separationdate', remarks: 'remarks',
    lastTransferDate: 'lasttransferdate', lastSubcenter: 'lastsubcenter',
    lastTransferReason: 'lasttransferreason',
    fileClosingDate: 'fileclosingdate', fileClosingRemarks: 'fileclosingremarks'
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

    try {
        if (event.httpMethod === 'POST' && event.body) {
             let bodyString = event.body;
             if (event.isBase64Encoded) {
                  bodyString = Buffer.from(bodyString, 'base64').toString('utf-8');
             }
             requestBody = JSON.parse(bodyString);
        }
    } catch (e) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
    }

    try {
        let result;
        const context = {
            sheets, SPREADSHEET_ID, EMPLOYEE_SHEET_NAME, HEADER_MAPPING, helpers,
            SALARY_SHEET_PREFIX, USERS_SHEET_NAME, TRANSFER_LOG_SHEET_NAME,
            HOLD_LOG_SHEET_NAME, SEPARATION_LOG_SHEET_NAME,
            SALARY_ARCHIVE_SHEET_NAME, REJOIN_LOG_SHEET_NAME, FILE_CLOSING_LOG_SHEET_NAME
        };

        switch (action) {
            case 'getEmployees': result = await employeeActions.getEmployees(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, queryParams); break;
            case 'saveEmployee': result = await employeeActions.saveEmployee(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody); break;
            case 'updateStatus': result = await employeeActions.updateStatus(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody); break;
            case 'getSubCenters': result = await employeeActions.getSubCenters(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers); break;
            case 'getProjects': result = await employeeActions.getProjects(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers); break;
            case 'getProjectOffices': result = await employeeActions.getProjectOffices(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers); break;
            case 'getReportProjects': result = await employeeActions.getReportProjects(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers); break;
            case 'transferEmployee': result = await employeeActions.transferEmployee(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody); break;
            case 'logRejoin': result = await employeeActions.logRejoin(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody); break;
            case 'closeFile': result = await employeeActions.closeFile(context.sheets, context.SPREADSHEET_ID, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING, context.helpers, requestBody); break;

            // Logs
            case 'getHoldLog': result = await employeeActions.getLogData(context.sheets, context.SPREADSHEET_ID, context.HOLD_LOG_SHEET_NAME, context.helpers, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING); break;
            case 'getSeparationLog': result = await employeeActions.getLogData(context.sheets, context.SPREADSHEET_ID, context.SEPARATION_LOG_SHEET_NAME, context.helpers, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING); break;
            case 'getTransferLog': result = await employeeActions.getLogData(context.sheets, context.SPREADSHEET_ID, context.TRANSFER_LOG_SHEET_NAME, context.helpers, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING); break;
            case 'getFileCloseLog': result = await employeeActions.getLogData(context.sheets, context.SPREADSHEET_ID, context.FILE_CLOSING_LOG_SHEET_NAME, context.helpers, context.EMPLOYEE_SHEET_NAME, context.HEADER_MAPPING); break;

            // Sheets
            case 'saveSheet': result = await sheetActions.saveSalarySheet(context.sheets, context.SPREADSHEET_ID, context.SALARY_SHEET_PREFIX, context.helpers, requestBody); break;
            case 'getPastSheets': result = await sheetActions.getPastSheets(context.sheets, context.SPREADSHEET_ID, context.SALARY_SHEET_PREFIX); break;
            case 'getSheetData': result = await sheetActions.getSheetData(context.sheets, context.SPREADSHEET_ID, context.SALARY_SHEET_PREFIX, sheetId); break;
            case 'saveSalaryArchive': result = await sheetActions.saveSalaryArchive(context.sheets, context.SPREADSHEET_ID, context.SALARY_ARCHIVE_SHEET_NAME, context.helpers, requestBody); break;
            case 'getSalaryArchive': result = await sheetActions.getSalaryArchive(context.sheets, context.SPREADSHEET_ID, context.SALARY_ARCHIVE_SHEET_NAME, context.helpers, queryParams); break;

            // Auth
            case 'loginUser': result = await authActions.loginUser(context.sheets, context.SPREADSHEET_ID, context.USERS_SHEET_NAME, context.helpers, requestBody); break;
            case 'changePassword': result = await authActions.changePassword(context.sheets, context.SPREADSHEET_ID, context.USERS_SHEET_NAME, context.helpers, requestBody); break;

            default:
                result = { statusCode: 400, body: JSON.stringify({ error: 'Invalid action parameter' }) };
        }
        result.headers = { ...corsHeaders, ...result.headers };
        return result;

    } catch (error) {
        console.error(`API Error:`, error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};