import { $, customAlert, closeModal, formatDateForDisplay } from './utils.js';
import { apiCall } from './apiClient.js';

// --- Module Level Helpers ---
const getVal = (v) => (v !== undefined && v !== null && v !== '') ? parseFloat(v) : 0;
const getStr = (v) => (v !== undefined && v !== null) ? String(v) : '';

export function setupSalarySheetModal(getEmployeesFunc) {
  const modal = $('attendanceModal');
  const form = $('attendanceForm');
  const cancelBtn = $('cancelAttendanceModal');
  const triggerBtn = $('uploadAttendanceBtn');

  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      if (modal) {
        modal.classList.remove('hidden');
        form?.reset();
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (modal) modal.classList.add('hidden');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const monthVal = $('salaryMonth')?.value;
      const attendanceFile = $('attendanceFile')?.files?.[0];
      const holderFile = $('accountabilityFile')?.files?.[0];

      if (!monthVal || !attendanceFile || !holderFile) {
        customAlert("Error", "Please select a month and upload both CSV files.");
        return;
      }

      try {
        if (typeof Papa === 'undefined' || typeof ExcelJS === 'undefined' || typeof JSZip === 'undefined') {
          throw new Error("Required libs (PapaParse, ExcelJS, JSZip) are not loaded.");
        }

        const employees = getEmployeesFunc?.() || [];
        if (!Array.isArray(employees) || employees.length === 0) {
          throw new Error("No employee data found in the system.");
        }

        const attendanceData = await parseCSV(attendanceFile);
        const holderData = await parseCSV(holderFile);

        // [FIX 1] Fetch Hold Log data to get remarks
        const holdLogData = await apiCall('getHoldLog', 'GET');

        validateAttendanceHeaders(attendanceData);
        validateHolderHeaders(holderData);

        customAlert("Processing", "Generating project-wise sheets (Split Payroll)...");

        // [FIX 2] Pass holdLogData to the generator
        const zipContent = await generateProjectWiseZip(employees, attendanceData, holderData, monthVal, holdLogData);

        customAlert("Processing", "Archiving data for record keeping...");

        const currentUser = sessionStorage.getItem('loggedInUser') || 'Unknown User';

        // Add the mapped hold remarks to the employee object for archiving
        // This ensures the archive preserves the specific remarks used at generation time
        const archiveData = {
          monthYear: monthVal,
          timestamp: new Date().toISOString(),
          jsonData: employees,
          generatedBy: currentUser
        };

        await apiCall('saveSalaryArchive', 'POST', archiveData);

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipContent);
        link.download = `Salary_Reports_${monthVal}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);

        closeModal('attendanceModal');
        customAlert("Success", "Salary Reports generated and data archived successfully.");
      } catch (error) {
        console.error(error);
        customAlert("Error", error?.message || "Unknown error during generation.");
      }
    });
  }
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = Array.isArray(results?.data) ? results.data.filter(r => r && typeof r === 'object') : [];
        resolve(rows);
      },
      error: (err) => reject(err),
    });
  });
}

function validateAttendanceHeaders(data) {
  if (!data || data.length === 0) throw new Error("Attendance file is empty.");
  const headers = Object.keys(data[0]).map(k => k.toLowerCase().trim());
  const mustHave = ['employeeid', 'net present', 'total working days'];
  const missing = mustHave.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`Attendance file missing required column(s): ${missing.join(', ')}`);
}

function validateHolderHeaders(data) {
  if (!data || data.length === 0) throw new Error("Common Account Holder file is empty.");
  const headers = Object.keys(data[0]).map(k => k.toLowerCase().trim());
  const mustHave = ['reportproject', 'subcenter', 'accountableemployeeid', 'accountableemployeename'];
  const missing = mustHave.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`Account Holder file missing required column(s): ${missing.join(', ')}`);
}

function convertNumberToWords(amount) {
    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (amount === 0) return "Zero";

    const numToString = (n) => {
        let str = "";
        if (n > 99) { str += units[Math.floor(n / 100)] + " Hundred "; n %= 100; }
        if (n > 19) { str += tens[Math.floor(n / 10)] + " "; n %= 10; }
        if (n > 9) { str += teens[n - 10] + " "; n = 0; }
        if (n > 0) { str += units[n] + " "; }
        return str.trim();
    };

    const convert = (num) => {
        if (num === 0) return "";
        let words = "";
        const crore = Math.floor(num / 10000000); num %= 10000000;
        if (crore > 0) words += numToString(crore) + " Crore ";
        const lakh = Math.floor(num / 100000); num %= 100000;
        if (lakh > 0) words += numToString(lakh) + " Lakh ";
        const thousand = Math.floor(num / 1000); num %= 1000;
        if (thousand > 0) words += numToString(thousand) + " Thousand ";
        if (num > 0) words += numToString(num);
        return words.trim();
    };
    return convert(Math.floor(amount)) + " Only";
}

function getFormattedMonthYear(dateStr) {
  const date = new Date(dateStr + "-01");
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  return { month, year, full: `${month}-${year}`, quote: `${month}'${year}` };
}

function isSeparatedInMonth(dateStr, monthVal) {
    if (!dateStr) return false;
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}` === monthVal;
}

function excelDateToJSDate(serial) {
   if (typeof serial === 'number') {
       const utc_days  = Math.floor(serial - 25569);
       const utc_value = utc_days * 86400;
       return new Date(utc_value * 1000);
   } else if (typeof serial === 'string' && serial.match(/^\d{4}-\d{2}-\d{2}$/)) {
       return new Date(serial);
   }
   return new Date(serial);
}

// [FIX 3] Added holdLogData parameter
async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal, holdLogData = []) {
  const zip = new JSZip();
  const { full, quote } = getFormattedMonthYear(monthVal);
  const accountingFmt0 = '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)';

  // [FIX 4] Defined dateFormat here to prevent ReferenceError
  const dateFormat = '[$-en-US]d-mmm-yy;@';

  // [FIX 5] Create a map for Hold Remarks
  const holdMap = {};
  if (Array.isArray(holdLogData)) {
      // Sort to get the latest remark (newest first)
      holdLogData.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      holdLogData.forEach(log => {
          const id = String(log.employeeId).trim();
          // Only store the first (latest) remark found for this ID
          if (!holdMap[id]) holdMap[id] = log.remarks;
      });
  }

  const attMap = {};
  attendanceData.forEach((row) => {
    const cleanRow = {};
    for (const k in row) cleanRow[k.toLowerCase().trim()] = row[k];
    const id = String(cleanRow['employeeid']).trim();
    if (id) attMap[id] = cleanRow;
  });

  const holderMap = {};
  holderData.forEach((row) => {
    const cleanRow = {};
    for (const k in row) cleanRow[k.toLowerCase().trim()] = row[k];
    const key = `${String(cleanRow['reportproject']).trim().toLowerCase()}${String(cleanRow['subcenter']).trim().toLowerCase()}`;
    holderMap[key] = { name: cleanRow['accountableemployeename'], id: cleanRow['accountableemployeeid'] };
  });

  const allEmpMap = {};
  employees.forEach((e) => { allEmpMap[String(e.employeeId).trim()] = e; });

  const projectGroups = {};

  employees.forEach((emp) => {
    const attRow = attMap[String(emp.employeeId)];
    const project   = emp.reportProject || 'Unknown';
    const subCenter = emp.subCenter    || 'General';

    if (!projectGroups[project]) projectGroups[project] = {};
    if (!projectGroups[project][subCenter]) {
        projectGroups[project][subCenter] = { active: [], hold: [], separated: [] };
    }

    let listCategory = null;
    const isHeld = (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE');

    if (isHeld) {
        listCategory = 'hold';
        // [FIX 6] Inject the hold remarks from the log into the employee object
        const hRem = holdMap[String(emp.employeeId).trim()];
        if (hRem) {
            emp.holdRemarks = hRem;
        }
    } else if (isSeparatedInMonth(emp.separationDate, monthVal)) {
        listCategory = 'separated';
    } else if (emp.status === 'Active') {
        listCategory = 'active';
    } else {
        return;
    }

    const totalDays     = attRow ? getVal(attRow['total working days']) : 0;
    const holidays      = attRow ? getVal(attRow['holidays']) : 0;
    const leave         = attRow ? getVal(attRow['availing leave']) : 0;
    const lwpDays       = attRow ? getVal(attRow['lwp']) : 0;
    const actualPresent = attRow ? getVal(attRow['actual present']) : 0;
    const netPresent    = attRow ? getVal(attRow['net present']) : 0;
    const otHours       = attRow ? getVal(attRow['ot hours'] || attRow['othours']) : 0;
    const otAmount      = attRow ? getVal(attRow['ot amount'] || attRow['otamount']) : 0;

    const grossSalary  = getVal(emp.salary);
    const basicSalary  = getVal(emp.basic);
    const othersSalary = getVal(emp.others);
    const cashPaymentConfig = getVal(emp.cashPayment);

    const earnings = {
      basic:    basicSalary,
      others:   othersSalary,
      maint:    getVal(emp.motobikeCarMaintenance),
      laptop:   getVal(emp.laptopRent),
      othersAll: getVal(emp.othersAllowance),
      arrear:   getVal(emp.arrear),
      food:     getVal(emp.foodAllowance),
      station:  getVal(emp.stationAllowance),
      hardship: getVal(emp.hardshipAllowance),
      otAmount: otAmount,
      cashPayment: cashPaymentConfig
    };

    const additionalAllowances = earnings.maint + earnings.laptop + earnings.othersAll + earnings.arrear + earnings.food + earnings.station + earnings.hardship + earnings.otAmount;
    const grossPayableBank = grossSalary + additionalAllowances;

    const deductions = {
      lunch:   getVal(emp.subsidizedLunch),
      tds:     getVal(emp.tds),
      bike:    getVal(emp.motorbikeLoan),
      welfare: getVal(emp.welfareFund),
      loan:    getVal(emp.salaryOthersLoan),
      vehicle: getVal(emp.subsidizedVehicle),
      cpf:     getVal(emp.cpf),
      adj:     getVal(emp.othersAdjustment),
    };

    let attDed = 0;
    if (totalDays > 0 && netPresent < totalDays) {
      attDed = (grossSalary / totalDays) * (totalDays - netPresent);
    }
    attDed = Math.round(attDed * 100) / 100;

    const totalDeduction = Object.values(deductions).reduce((a, b) => a + b, 0) + attDed;
    const netBankPayment = Math.round((grossPayableBank - totalDeduction) * 100) / 100;
    const netPayment = netBankPayment + cashPaymentConfig;

    let finalAccountNo = emp.bankAccount;
    let remarksText = "";
    let paymentType = "Bank";
    let holderId = null;

    const holderKey  = `${String(project).toLowerCase().trim()}${String(subCenter).toLowerCase().trim()}`;
    const holderInfo = holderMap[holderKey];

    if (!finalAccountNo || finalAccountNo.trim() === '') {
      paymentType = "Cash (Holder)";
      if (holderInfo?.id) {
        holderId = String(holderInfo.id).trim();
        const holderEmp = allEmpMap[holderId];
        remarksText = holderEmp
          ? `Pay to: ${holderInfo.name} (${holderInfo.id})`
          : `Holder: ${holderInfo.name} (Not Found)`;
      }
    }

    let joiningDateObj = emp.joiningDate ? excelDateToJSDate(emp.joiningDate) : null;

    Object.assign(emp, {
      finalAccountNo,
      remarksText,
      paymentType,
      holderId,
      joiningDateObj: joiningDateObj,
      att:  { totalDays, holidays, leave, lwpDays, actualPresent, netPresent, otHours },
      earn: { grossSalary, ...earnings, grossPayable: grossPayableBank, totalBenefits: additionalAllowances },
      ded:  { ...deductions, attDed, totalDeduction },
      netPayment,
      netBankPayment,
      cashPayment: cashPaymentConfig
    });

    projectGroups[project][subCenter][listCategory].push(emp);
  });

  // --- Helper: Render a Salary Sheet Tab ---
  function addSalarySheetTab(workbook, sheetName, projectName, dataBySubCenter, categoryKey, isPrintVersion = false) {
      const sheet = workbook.addWorksheet(sheetName, {
          views: [{ state: 'frozen', ySplit: isPrintVersion ? 1 : 4, xSplit: 4 }],
          pageSetup: isPrintVersion
            ? { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' }
            : {}
      });

      let headers = [];
      let startRow = 1;

      if (!isPrintVersion) {
          // Standard Sheet Header
          sheet.mergeCells('A1:AV1');
          const r1 = sheet.getCell('A1');
          r1.value = "Metal Plus Limited";
          r1.font = { bold: true, size: 16, name: 'Calibri' };
          r1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          sheet.mergeCells('A2:AV2');
          const r2 = sheet.getCell('A2');
          r2.value = `Salary Sheet (${projectName}) - For the Month of ${full}`;
          r2.font = { bold: true, size: 12, name: 'Calibri' };
          r2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          [
            { r: 'A3:J3',  t: 'Employee Information' },
            { r: 'K3:Q3',  t: 'Attendance' },
            { r: 'R3:U3',  t: 'Salary Structure' },
            { r: 'V3:AE3', t: 'Earnings & Benefits' },
            { r: 'AF3:AP3',t: 'Deductions' },
            { r: 'AQ3:AV3',t: 'Payment Information' },
          ].forEach(m => {
            sheet.mergeCells(m.r);
            const cell = sheet.getCell(m.r.split(':')[0]);
            cell.value = m.t;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
          });

          headers = [
            "SL","ID","Name","Designation","Functional Role","Joining Date","Project","Project Office","Report Project","Sub Center",
            "Total Working Days","Holidays","Availing Leave","LWP","Actual Present","Net Present","OT Hours",
            "Previous Salary","Basic","Others","Gross Salary",
            "Total Benefits",
            "Motobike / Car Maintenance Allowance","Laptop Rent","Others Allowance","Arrear","Food Allowance","Station Allowance","Hardship Allowance","OT Amount","Gross Payable Salary",
            "Gratuity","Subsidized Lunch","TDS","Motorbike Loan","Welfare Fund","Salary/ Others Loan","Subsidized Vehicle","CPF","Others Adjustment","Attendance Deduction","Total Deduction",
            "Cash Payment", "Account Payment", "Net Salary Payment", "Bank Account Number","Payment Type","Remarks"
          ];
          startRow = 4;
      } else {
          // Print Version Header
          sheet.mergeCells('A1:Z1');
          const r1 = sheet.getCell('A1');
          r1.value = "Metal Plus Limited";
          r1.font = { bold: true, size: 16, name: 'Calibri' };
          r1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          sheet.mergeCells('A2:Z2');
          const r2 = sheet.getCell('A2');
          r2.value = `Salary Sheet (${projectName}) - For the Month of ${full}`;
          r2.font = { bold: true, size: 12, name: 'Calibri' };
          r2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          [
            { s: 'A3', e: 'E3', t: 'Employee Information' },
            { s: 'F3', e: 'G3', t: 'Attendance' },
            { s: 'H3', e: 'J3', t: 'Salary Structure' },
            { s: 'K3', e: 'L3', t: 'Earnings & Benefits' },
            { s: 'M3', e: 'U3', t: 'Deductions' },
            { s: 'V3', e: 'Z3', t: 'Payment Information' },
          ].forEach(m => {
            sheet.mergeCells(`${m.s}:${m.e}`);
            const cell = sheet.getCell(m.s);
            cell.value = m.t;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
          });

          headers = [
              "SL", "ID", "Name", "Designation", "Joining Date", "Net Present", "OT Hours",
              "Basic", "Others", "Gross Salary", "Total Benefits", "Gross Payable Salary",
              "Gratuity", "Subsidized Lunch", "TDS", "Motorbike Loan", "Welfare Fund",
              "Salary/ Others Loan", "Subsidized Vehicle", "CPF", "Total Deduction",
              "Cash Payment", "Account Payment", "Net Salary Payment", "Payment Type", "Remarks"
          ];
          startRow = 4;
      }

      const headerRow = sheet.addRow(headers);
      headerRow.height = isPrintVersion ? 40 : 60;
      headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };

        if (!isPrintVersion) {
             const noRotate = [1,2,3,4,5,6,7,8,9,10, 43,44,45,46,47,48];
             cell.alignment = (!noRotate.includes(colNumber))
              ? { textRotation: 90, horizontal: 'center', vertical: 'middle', wrapText: true }
              : { horizontal: 'center', vertical: 'middle', wrapText: true };
        } else {
             cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
      });

      if (!isPrintVersion) {
          sheet.getColumn(3).width = 25;
          sheet.getColumn(4).width = 16;
          sheet.getColumn(5).width = 13;
          sheet.getColumn(6).width = 12;
          sheet.getColumn(7).width = 13;
          sheet.getColumn(8).width = 13;
          sheet.getColumn(9).width = 13;
          sheet.getColumn(10).width = 13;

          for (let c = 11; c <= 45; c++) {
              if(![46,48].includes(c)) sheet.getColumn(c).width = 11.18;
          }
          sheet.getColumn(46).width = 21.5;
          sheet.getColumn(48).width = 21.5;
      } else {
          sheet.columns.forEach(c => c.width = 10);
          sheet.getColumn(3).width = 20;
          sheet.getColumn(4).width = 16;
          sheet.getColumn(5).width = 12;
          sheet.getColumn(26).width = 20;
      }

      let sl = 1;
      const sortedSubCenters = Object.keys(dataBySubCenter).sort();
      let hasData = false;

      for (const scName of sortedSubCenters) {
        const scEmployees = dataBySubCenter[scName][categoryKey];
        if (!scEmployees || scEmployees.length === 0) continue;

        hasData = true;
        const scRow = sheet.addRow([`Subcenter: ${scName}`]);
        scRow.height = 27;

        const totalCols = headers.length;
        for (let i = 1; i <= totalCols; i++) {
          const c = scRow.getCell(i);
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } };
          c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
          if (i === 1) c.font = { bold: true };
        }
        scRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };

        let scTotalNet = 0;
        scEmployees.forEach(d => {
          scTotalNet += d.netPayment;

          let rowData = [];
          if (!isPrintVersion) {
              rowData = [
                sl++, getStr(d.employeeId), getStr(d.name), getStr(d.designation), getStr(d.functionalRole), d.joiningDateObj,
                getStr(d.project), getStr(d.projectOffice), getStr(d.reportProject), getStr(d.subCenter),
                getVal(d.att.totalDays), getVal(d.att.holidays), getVal(d.att.leave), getVal(d.att.lwpDays), getVal(d.att.actualPresent), getVal(d.att.netPresent), getVal(d.att.otHours),
                getVal(d.previousSalary || 0), getVal(d.earn.basic), getVal(d.earn.others), getVal(d.earn.grossSalary),
                getVal(d.earn.totalBenefits),
                getVal(d.earn.maint), getVal(d.earn.laptop), getVal(d.earn.othersAll), getVal(d.earn.arrear), getVal(d.earn.food), getVal(d.earn.station), getVal(d.earn.hardship), getVal(d.earn.otAmount), getVal(d.earn.grossPayable),
                0,
                getVal(d.ded.lunch), getVal(d.ded.tds), getVal(d.ded.bike), getVal(d.ded.welfare), getVal(d.ded.loan), getVal(d.ded.vehicle), getVal(d.ded.cpf), getVal(d.ded.adj), getVal(d.ded.attDed), getVal(d.ded.totalDeduction),
                getVal(d.cashPayment), getVal(d.netBankPayment), getVal(d.netPayment),
                getStr(d.finalAccountNo || d.bankAccount), getStr(d.paymentType), getStr(d.remarksText)
              ];
          } else {
              rowData = [
                  sl++, getStr(d.employeeId), getStr(d.name), getStr(d.designation), d.joiningDateObj,
                  getVal(d.att.netPresent), getVal(d.att.otHours),
                  getVal(d.earn.basic), getVal(d.earn.others), getVal(d.earn.grossSalary), getVal(d.earn.totalBenefits), getVal(d.earn.grossPayable),
                  0, getVal(d.ded.lunch), getVal(d.ded.tds), getVal(d.ded.bike), getVal(d.ded.welfare), getVal(d.ded.loan), getVal(d.ded.vehicle), getVal(d.ded.cpf), getVal(d.ded.totalDeduction),
                  getVal(d.cashPayment), getVal(d.netBankPayment), getVal(d.netPayment), getStr(d.paymentType), getStr(d.remarksText)
              ];
          }

          const r = sheet.addRow(rowData);
          r.height = 27;

          r.getCell(1).alignment = { wrapText: false, vertical: 'middle', horizontal: 'center' };
          r.eachCell((c, colNumber) => {
            c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };

            const nameIdx = 3;
            const remIdx = isPrintVersion ? 26 : 48;

            if (colNumber === nameIdx || colNumber === remIdx) {
                 c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            } else if (colNumber !== 1) {
                 c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            }

            if (!isPrintVersion) {
                if (colNumber === 6) c.numFmt = dateFormat;
                if ((colNumber >= 18 && colNumber <= 31) || (colNumber >= 33 && colNumber <= 45)) c.numFmt = accountingFmt0;
            } else {
                if (colNumber === 5) c.numFmt = dateFormat;
                if (colNumber >= 8 && colNumber <= 24) c.numFmt = accountingFmt0;
            }
          });
        });

        const totRow = sheet.addRow(new Array(totalCols).fill(''));
        totRow.height = 27;

        totRow.getCell(3).value = `Total for ${scName}`;

        const netColIdx = isPrintVersion ? 24 : 45;
        const netPayCell = totRow.getCell(netColIdx);
        netPayCell.value = scTotalNet;
        netPayCell.numFmt = accountingFmt0;

        totRow.eachCell((c) => {
          c.font = { bold: true };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
          c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
          c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
      }

      if(!hasData) {
          sheet.addRow(["No Data Available for this category."]);
      }
  }

  function addLogSheet(workbook, sheetName, employees, type) {
        const sheet = workbook.addWorksheet(sheetName);

        const headers = type === 'hold'
            ? ["Employee ID", "Name", "Designation", "Project", "Sub Center", "Hold Date", "Remarks"]
            : ["Employee ID", "Name", "Designation", "Project", "Sub Center", "Separation Date", "Status", "Remarks"];

        const headerRow = sheet.addRow(headers);
        headerRow.height = 27;
        headerRow.eachCell((c) => {
            c.font = { bold: true };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
            c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
            c.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        sheet.columns.forEach(col => col.width = 20);

        if (employees.length === 0) {
            sheet.addRow(["No records found."]);
            return;
        }

        employees.forEach(emp => {
            let rowData = [];
            if (type === 'hold') {
                rowData = [
                    getStr(emp.employeeId), getStr(emp.name), getStr(emp.designation), getStr(emp.project), getStr(emp.subCenter),
                    formatDateForDisplay(emp.holdTimestamp) || '-',
                    // [FIX 7] Use the injected 'holdRemarks', fallback to generic remarks
                    getStr(emp.holdRemarks || emp.remarks)
                ];
            } else {
                rowData = [
                    getStr(emp.employeeId), getStr(emp.name), getStr(emp.designation), getStr(emp.project), getStr(emp.subCenter),
                    formatDateForDisplay(emp.separationDate) || '-',
                    getStr(emp.status),
                    getStr(emp.remarks)
                ];
            }
            const r = sheet.addRow(rowData);
            r.height = 27;
            r.eachCell(c => {
                c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
                c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
            });
        });
    }

  for (const [project, subCenters] of Object.entries(projectGroups)) {
    const workbook = new ExcelJS.Workbook();

    addSalarySheetTab(workbook, 'Salary Sheet', project, subCenters, 'active', false);
    addSalarySheetTab(workbook, 'Print Version', project, subCenters, 'active', true);

    const adviceSheet = workbook.addWorksheet('Advice', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    adviceSheet.pageSetup.printTitlesRow = '32:32';

    const consolidationMap = new Map();
    const allActiveEmployees = Object.values(subCenters).flatMap(sc => sc.active);

    allActiveEmployees.forEach(emp => {
        if (emp.finalAccountNo && emp.finalAccountNo.trim() !== '') {
            const key = String(emp.employeeId);
            const netBank = (emp.netBankPayment !== undefined) ? getVal(emp.netBankPayment) : (getVal(emp.netPayment) - getVal(emp.cashPayment));

            if (!consolidationMap.has(key)) {
                consolidationMap.set(key, {
                    id: emp.employeeId, name: emp.name, designation: emp.designation,
                    account: emp.finalAccountNo, amount: 0,
                });
            }
            consolidationMap.get(key).amount += netBank;
        }
    });

    allActiveEmployees.forEach(emp => {
         if ((!emp.finalAccountNo || emp.finalAccountNo.trim() === '') && emp.holderId) {
             if (consolidationMap.has(emp.holderId)) {
                 consolidationMap.get(emp.holderId).amount += emp.netBankPayment;
             }
         }
    });

    const writeTextRow = (rIdx, text, bold=false, size=14, merge=true) => {
      const cell = adviceSheet.getRow(rIdx).getCell(1);
      cell.value = text;
      cell.font = { name: 'Calibri', size, bold };
      cell.alignment = { vertical: 'top', wrapText: true };
      if (merge) adviceSheet.mergeCells(rIdx, 1, rIdx, 6);
    };

    const totalLetterAmount = Array.from(consolidationMap.values()).reduce((sum, item) => sum + item.amount, 0);
    const totalAmountWords  = convertNumberToWords(totalLetterAmount);
    const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '.');

    writeTextRow(1,  `Ref: MPL/TELECOM/Salary/${full}`, true);
    writeTextRow(2,  `Date: ${today}`, true);
    writeTextRow(4,  "To");
    writeTextRow(5,  "The Manager");
    writeTextRow(6,  "Dutch Bangla Bank Ltd.");
    writeTextRow(7,  "Banani Branch");
    writeTextRow(9,  `Subject: Salary expenses disbursement for the Month of ${quote}.`, true);
    writeTextRow(11, "Dear sir,");

    adviceSheet.mergeCells(13, 1, 19, 6);
    const paraCell = adviceSheet.getCell('A13');
    paraCell.value = `Please Transfer Tk.${totalLetterAmount.toLocaleString('en-IN')}/-Taka (in word: ${totalAmountWords}) to our following employee's bank account by debiting our CD Account No. 103.110.17302 in the name of Metal Plus Ltd. maintained with you. For better clarification we have provided you the soft copy of data through e-mail from id number saidul.islam@metalbd.biz , sender name Mr. Md. Saidul Islam and affirm you that soft copy of data is true and exact with hard copy of data submitted to you. For any deviation with soft copy and hard copy we will be held responsible. For any query please contact with Mr. Md. Saidul Islam; Mobile: 01766667498`;

    paraCell.font = { name: 'Calibri', size: 14 };
    paraCell.alignment = { wrapText: true, vertical: 'top' };

    for(let r=13; r<=19; r++) adviceSheet.getRow(r).height = 35;

    writeTextRow(21, "Thanking You,", false);

    adviceSheet.mergeCells(26, 1, 26, 3);
    adviceSheet.mergeCells(27, 1, 27, 3);
    adviceSheet.mergeCells(26, 4, 26, 6);
    adviceSheet.mergeCells(27, 4, 27, 6);

    const sigRowName = adviceSheet.getRow(26);
    const sigRowTitle = adviceSheet.getRow(27);
    sigRowName.height = 30;
    sigRowTitle.height = 30;

    const setSigStyle = (cell, bold) => {
        cell.font = { name: 'Calibri', size: 14, bold: bold };
        cell.alignment = { horizontal: 'left', vertical: 'top' };
    };

    sigRowName.getCell(1).value = "Engr. Sadid Jamil";
    setSigStyle(sigRowName.getCell(1), true);
    sigRowTitle.getCell(1).value = "Managing Director";
    setSigStyle(sigRowTitle.getCell(1), false);

    sigRowName.getCell(4).value = "Engr. Aminul Islam";
    setSigStyle(sigRowName.getCell(4), true);
    sigRowTitle.getCell(4).value = "Chairman";
    setSigStyle(sigRowTitle.getCell(4), false);

    adviceSheet.getRow(30).addPageBreak();

    const adviceHeader = adviceSheet.getRow(32);
    adviceHeader.values = ["SL", "ID", "Name", "Designation", "Account No", "Amount"];
    adviceHeader.height = 27;
    adviceHeader.eachCell((c) => {
      c.font = { bold: true, size: 14 };
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    });

    adviceSheet.getColumn(1).width = 6;
    adviceSheet.getColumn(2).width = 12;
    adviceSheet.getColumn(3).width = 28;
    adviceSheet.getColumn(4).width = 18;
    adviceSheet.getColumn(5).width = 20;
    adviceSheet.getColumn(6).width = 15;

    let advSl = 1;
    const finalAdviceList = Array.from(consolidationMap.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)));

    finalAdviceList.forEach(item => {
      const r = adviceSheet.addRow([advSl++, item.id, item.name, item.designation, item.account, item.amount]);
      r.height = 27;
      r.eachCell((c, colNumber) => {
        c.font = { size: 14 };
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        c.alignment = { vertical: 'middle', horizontal: (colNumber === 3 ? 'left' : 'center'), wrapText: true };
        if (colNumber === 6) c.numFmt = accountingFmt0;
      });
    });

    const advTotRow = adviceSheet.addRow(['', '', 'Total', '', '', totalLetterAmount]);
    advTotRow.height = 27;
    advTotRow.getCell(6).numFmt = accountingFmt0;
    advTotRow.eachCell((c) => {
      c.font = { bold: true, size: 14 };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
    });

    addLogSheet(workbook, 'Salary Hold', Object.values(subCenters).flatMap(sc => sc.hold), 'hold');
    addLogSheet(workbook, 'Terminated-Resigned', Object.values(subCenters).flatMap(sc => sc.separated), 'separated');

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);

    // [FIX 8] Fixed ReferenceError: use 'monthVal' instead of 'sheetMeta'
    zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
  }

  return zip.generateAsync({ type: "blob" });
}