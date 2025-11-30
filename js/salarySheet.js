// js/salarySheet.js
import { $, customAlert, closeModal } from './utils.js';
import { apiCall } from './apiClient.js';

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

        validateAttendanceHeaders(attendanceData);
        validateHolderHeaders(holderData);

        customAlert("Processing", "Generating project-wise sheets (Split Payroll)...");

        const zipContent = await generateProjectWiseZip(employees, attendanceData, holderData, monthVal);

        customAlert("Processing", "Archiving data for record keeping...");

        // === MODIFICATION: Capture Logged In User ===
        const currentUser = sessionStorage.getItem('loggedInUser') || 'Unknown User';

        const archiveData = {
          monthYear: monthVal,
          timestamp: new Date().toISOString(),
          jsonData: employees,
          generatedBy: currentUser // Send to backend
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

async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal) {
  const zip = new JSZip();
  const { full, quote } = getFormattedMonthYear(monthVal);
  const accountingFmt0 = '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)';

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
  const getVal = (v) => parseFloat(v) || 0;

  employees.forEach((emp) => {
    const attRow = attMap[String(emp.employeeId)];
    if (!attRow) return;

    const project   = emp.reportProject || 'Unknown';
    const subCenter = emp.subCenter    || 'General';
    (projectGroups[project] ||= {})[subCenter] ||= [];

    const totalDays     = getVal(attRow['total working days']);
    const holidays      = getVal(attRow['holidays']);
    const leave         = getVal(attRow['availing leave']);
    const lwpDays       = getVal(attRow['lwp']);
    const actualPresent = getVal(attRow['actual present']);
    const netPresent    = getVal(attRow['net present']);
    const otHours       = getVal(attRow['ot hours'] || attRow['othours']);
    const otAmount      = getVal(attRow['ot amount'] || attRow['otamount']);

    const grossSalary  = getVal(emp.salary);
    const basicSalary  = getVal(emp.basic);
    const othersSalary = getVal(emp.others);

    // Cash Payment
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

    // Bank Gross
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

    // Bank Net
    const netBankPayment = Math.round((grossPayableBank - totalDeduction) * 100) / 100;

    // Total Net (Bank + Cash)
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

    Object.assign(emp, {
      finalAccountNo,
      remarksText,
      paymentType,
      holderId,
      att:  { totalDays, holidays, leave, lwpDays, actualPresent, netPresent, otHours },
      earn: { grossSalary, ...earnings, grossPayable: grossPayableBank },
      ded:  { ...deductions, attDed, totalDeduction },
      netPayment,      // Total
      netBankPayment,  // Bank Only
      cashPayment: cashPaymentConfig
    });

    projectGroups[project][subCenter].push(emp);
  });

  for (const [project, subCenters] of Object.entries(projectGroups)) {
    const workbook = new ExcelJS.Workbook();

    /* ---------------- SALARY SHEET ---------------- */
    const sheet = workbook.addWorksheet('Salary Sheet', {
      views: [{ state: 'frozen', ySplit: 4 }]
    });

    sheet.mergeCells('A1:AT1');
    const r1 = sheet.getCell('A1');
    r1.value = "Metal Plus Limited";
    r1.font = { bold: true, size: 16, name: 'Calibri' };
    r1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    sheet.mergeCells('A2:AT2');
    const r2 = sheet.getCell('A2');
    r2.value = `Salary Sheet-${project} for the Month of ${full}`;
    r2.font = { bold: true, size: 12, name: 'Calibri' };
    r2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    [
      { r: 'A3:J3',  t: 'Employee Information' },
      { r: 'K3:Q3',  t: 'Attendance' },
      { r: 'R3:U3',  t: 'Salary Structure' },
      { r: 'V3:AD3', t: 'Earnings & Benefits' },
      { r: 'AE3:AO3',t: 'Deductions' },
      { r: 'AP3:AT3',t: 'Payment Information' },
    ].forEach(m => {
      sheet.mergeCells(m.r);
      const cell = sheet.getCell(m.r.split(':')[0]);
      cell.value = m.t;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
    });

    const headers = [
      "SL","ID","Name","Designation","Functional Role","Joining Date","Project","Project Office","Report Project","Sub Center",
      "Total Working Days","Holidays","Availing Leave","LWP","Actual Present","Net Present","OT Hours",
      "Previous Salary","Basic","Others","Gross Salary",
      "Motobike / Car Maintenance Allowance","Laptop Rent","Others Allowance","Arrear","Food Allowance","Station Allowance","Hardship Allowance","OT Amount","Gross Payable Salary",
      "Gratuity","Subsidized Lunch","TDS","Motorbike Loan","Welfare Fund","Salary/ Others Loan","Subsidized Vehicle","CPF","Others Adjustment","Attendance Deduction","Total Deduction",
      "Cash Payment", "Net Salary Payment","Bank Account Number","Payment Type","Remarks"
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.height = 65;
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
      cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      cell.alignment = (colNumber >= 11 && colNumber <= 42)
        ? { textRotation: 90, horizontal: 'center', vertical: 'middle', wrapText: true }
        : { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    sheet.getColumn(3).width = 25;
    sheet.getColumn(4).width = 14.5;
    sheet.getColumn(5).width = 14.5;
    sheet.getColumn(6).width = 13.09;
    sheet.getColumn(7).width = 11;
    sheet.getColumn(8).width = 11;
    sheet.getColumn(9).width = 11;
    sheet.getColumn(10).width = 11;
    sheet.getColumn(44).width = 21.5;
    sheet.getColumn(46).width = 21.5;

    for (let c = 11; c <= 42; c++) {
        if(![3,4,5,6,7,8,9,10,44,46].includes(c)) sheet.getColumn(c).width = 11.18;
    }
    sheet.getColumn(45).width = 11.55;

    let sl = 1;
    const sortedSubCenters = Object.keys(subCenters).sort();

    for (const scName of sortedSubCenters) {
      const scEmployees = subCenters[scName];

      const scRow = sheet.addRow([`Subcenter: ${scName}`]);
      for (let i = 1; i <= 46; i++) {
        const c = scRow.getCell(i);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } };
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        c.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center', wrapText: true };
        if (i === 1) c.font = { bold: true };
      }

      let scTotalNet = 0;
      scEmployees.forEach(d => {
        scTotalNet += d.netPayment;

        const r = sheet.addRow([
          sl++, d.employeeId, d.name, d.designation, d.functionalRole, d.joiningDate,
          d.project, d.projectOffice, d.reportProject, d.subCenter,
          d.att.totalDays, d.att.holidays, d.att.leave, d.att.lwpDays, d.att.actualPresent, d.att.netPresent, d.att.otHours,
          d.previousSalary || 0, d.earn.basic, d.earn.others, d.earn.grossSalary,
          d.earn.maint, d.earn.laptop, d.earn.othersAll, d.earn.arrear, d.earn.food, d.earn.station, d.earn.hardship, d.earn.otAmount, d.earn.grossPayable,
          0,
          d.ded.lunch, d.ded.tds, d.ded.bike, d.ded.welfare, d.ded.loan, d.ded.vehicle, d.ded.cpf, d.ded.adj, d.ded.attDed, d.ded.totalDeduction,
          d.cashPayment,
          d.netPayment,
          d.finalAccountNo, d.paymentType, d.remarksText
        ]);

        r.getCell(1).alignment = { wrapText: false, vertical: 'middle', horizontal: 'center' };
        r.eachCell((c, colNumber) => {
          c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
          if (colNumber !== 1) {
             c.alignment = (colNumber === 3 || colNumber === 46)
                ? { vertical: 'middle', horizontal: 'left', wrapText: true }
                : { vertical: 'middle', horizontal: 'center', wrapText: true };
          }
          if (colNumber >= 18 && colNumber <= 43) c.numFmt = accountingFmt0;
        });
      });

      const totRow = sheet.addRow(new Array(46).fill(''));
      totRow.getCell(3).value = `Total for ${scName}`;
      const netPayCell = totRow.getCell(43);
      netPayCell.value = scTotalNet;
      netPayCell.numFmt = accountingFmt0;
      totRow.eachCell((c) => {
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
    }

    /* ---------------- ADVICE SHEET ---------------- */
    const adviceSheet = workbook.addWorksheet('Advice', {
      pageSetup: {
          paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitles: { rows: '40:40' }
      }
    });

    const consolidationMap = new Map();
    const allProjectEmployees = Object.values(subCenters).flat();

    // 1. BANK ACCOUNTS
    allProjectEmployees.forEach(emp => {
      if (emp.finalAccountNo && emp.finalAccountNo.trim() !== '') {
        const key = String(emp.employeeId);
        if (!consolidationMap.has(key)) {
          consolidationMap.set(key, {
            id: emp.employeeId,
            name: emp.name,
            designation: emp.designation,
            account: emp.finalAccountNo,
            amount: 0,
          });
        }
        consolidationMap.get(key).amount += emp.netBankPayment;
      }
    });

    // 2. CASH HOLDERS
    allProjectEmployees.forEach(emp => {
      if (!emp.finalAccountNo || emp.finalAccountNo.trim() === '') {
        if (emp.holderId && consolidationMap.has(emp.holderId)) {
          consolidationMap.get(emp.holderId).amount += emp.netBankPayment;
        }
      }
    });

    const writeTextRow = (rIdx, text, bold=false, size=11, merge=true) => {
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

    adviceSheet.mergeCells(13, 1, 17, 6);
    const paraCell = adviceSheet.getCell('A13');
    paraCell.value = `Please Transfer Tk.${totalLetterAmount.toLocaleString('en-IN')}/-Taka (in word: ${totalAmountWords}) to our following employee’s bank account by debiting our CD Account No. 103.110.17302 in the name of Metal Plus Ltd. maintained with you. For better clarification we have provided you the soft copy of data through e-mail and affirm you that soft copy of data is true and exact with hard copy of data submitted to you. For any deviation with soft copy and hard copy we will be held responsible.`;
    paraCell.font = { name: 'Calibri', size: 11 };
    paraCell.alignment = { wrapText: true, vertical: 'top' };

    writeTextRow(19, "Thanking You,", false);

    adviceSheet.mergeCells(24, 1, 24, 2);
    adviceSheet.mergeCells(25, 1, 25, 2);
    adviceSheet.mergeCells(24, 5, 24, 6);
    adviceSheet.mergeCells(25, 5, 25, 6);

    const sigRowName = adviceSheet.getRow(24);
    const sigRowTitle = adviceSheet.getRow(25);

    const setSigStyle = (cell, bold) => {
        cell.font = { name: 'Calibri', size: 11, bold: bold };
        cell.alignment = { horizontal: 'left', vertical: 'top' };
    };

    sigRowName.getCell(1).value = "Engr. Sadid Jamil";
    setSigStyle(sigRowName.getCell(1), true);
    sigRowTitle.getCell(1).value = "Managing Director";
    setSigStyle(sigRowTitle.getCell(1), false);
    sigRowName.getCell(5).value = "Engr. Aminul Islam";
    setSigStyle(sigRowName.getCell(5), true);
    sigRowTitle.getCell(5).value = "Chairman";
    setSigStyle(sigRowTitle.getCell(5), false);

    const adviceHeader = adviceSheet.getRow(40);
    adviceHeader.values = ["SL", "ID", "Name", "Designation", "Account No", "Amount"];
    adviceHeader.height = 24;
    adviceHeader.eachCell((c) => {
      c.font = { bold: true };
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
      r.eachCell((c, colNumber) => {
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        c.alignment = { vertical: 'middle', horizontal: (colNumber === 3 ? 'left' : 'center'), wrapText: true };
        if (colNumber === 6) c.numFmt = accountingFmt0;
      });
    });

    const advTotRow = adviceSheet.addRow(['', '', 'Total', '', '', totalLetterAmount]);
    advTotRow.getCell(6).numFmt = accountingFmt0;
    advTotRow.eachCell((c) => {
      c.font = { bold: true };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
  }

  return zip.generateAsync({ type: "blob" });
}