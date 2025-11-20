// js/salarySheet.js
import { $, customAlert, closeModal } from './utils.js';

export function setupSalarySheetModal(getEmployeesFunc) {
  const modal = $('attendanceModal');
  const form = $('attendanceForm');
  const cancelBtn = $('cancelAttendanceModal');
  const triggerBtn = $('uploadAttendanceBtn');

  if (triggerBtn) triggerBtn.addEventListener('click', () => {
    if (modal) {
      modal.classList.remove('hidden');
      form.reset();
    }
  });
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    if (modal) modal.classList.add('hidden');
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const monthVal = $('salaryMonth').value; // YYYY-MM
      const attendanceFile = $('attendanceFile').files[0];
      const holderFile = $('accountabilityFile').files[0];
      if (!monthVal || !attendanceFile || !holderFile) {
        customAlert("Error", "Please select a month and upload both CSV files.");
        return;
      }

      try {
        const employees = getEmployeesFunc();
        if (!employees || employees.length === 0) {
          throw new Error("No employee data found in the system.");
        }

        const attendanceData = await parseCSV(attendanceFile);
        const holderData = await parseCSV(holderFile);
        validateAttendanceHeaders(attendanceData);
        validateHolderHeaders(holderData);

        customAlert("Processing", "Generating report project wise sheets...");
        const zipContent = await generateProjectWiseZip(employees, attendanceData, holderData, monthVal);

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipContent);
        link.download = `Salary_Reports_${monthVal}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);

        closeModal('attendanceModal');
      } catch (error) {
        console.error(error);
        customAlert("Error", error.message);
      }
    });
  }
}

// --- Helpers ---
function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, { header: true, skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err)
    });
  });
}
function validateAttendanceHeaders(data) {
  if (!data || data.length === 0) throw new Error("Attendance file is empty.");
  const headers = Object.keys(data[0]).map(k => k.toLowerCase());
  if (!headers.some(h => h.includes('employeeid'))) throw new Error("Attendance file missing 'employeeId' column.");
}
function validateHolderHeaders(data) {
  if (!data || data.length === 0) throw new Error("Common Account Holder file is empty.");
  const headers = Object.keys(data[0]).map(k => k.toLowerCase());
  if (!headers.some(h => h.includes('accountableemployeeid'))) throw new Error("Account Holder file missing required columns.");
}

// --- Number to Words (Indian system) ---
function convertNumberToWords(amount) {
  const a = ['','One ','Two ','Three ','Four ','Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
  const b = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const numToWords = (n) => {
    if ((n = n.toString()).length > 9) return 'overflow';
    let n_array = ('000000000' + n).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n_array) return '';
    let str = '';
    str += (n_array[1] != 0) ? (a[Number(n_array[1])] + b[n_array[1][0]] + ' ' + a[n_array[1][1]]) + 'Crore ' : '';
    str += (n_array[2] != 0) ? (a[Number(n_array[2])] + b[n_array[2][0]] + ' ' + a[n_array[2][1]]) + 'Lakh ' : '';
    str += (n_array[3] != 0) ? (a[Number(n_array[3])] + b[n_array[3][0]] + ' ' + a[n_array[3][1]]) + 'Thousand ' : '';
    str += (n_array[4] != 0) ? (a[Number(n_array[4])] + b[n_array[4][0]] + ' ' + a[n_array[4][1]]) + 'Hundred ' : '';
    str += (n_array[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n_array[5])] + b[n_array[5][0]] + ' ' + a[n_array[5][1]]) + '' : '';
    return str;
  };
  return numToWords(Math.floor(amount)) + "Only";
}

function getFormattedMonthYear(dateStr) {
  const date = new Date(dateStr + "-01"); // YYYY-MM
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  return { month, year, full: `${month}-${year}`, quote: `${month}'${year}` };
}

// --- MAIN GENERATION LOGIC ---
async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal) {
  const zip = new JSZip();
  const { month, year, full, quote } = getFormattedMonthYear(monthVal);
  const accountingFmt0 = '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)'; // Accounting format, 0 decimals

  // 1. Maps
  const attMap = {};
  attendanceData.forEach(row => {
    const cleanRow = {};
    for (let k in row) cleanRow[k.toLowerCase().trim()] = row[k];
    attMap[String(cleanRow['employeeid']).trim()] = cleanRow;
  });
  const holderMap = {};
  holderData.forEach(row => {
    const cleanRow = {};
    for (let k in row) cleanRow[k.toLowerCase().trim()] = row[k];
    const key = `${String(cleanRow['reportproject']).trim().toLowerCase()}${String(cleanRow['subcenter']).trim().toLowerCase()}`;
    holderMap[key] = { name: cleanRow['accountableemployeename'], id: cleanRow['accountableemployeeid'] };
  });
  const allEmpMap = {};
  employees.forEach(e => { allEmpMap[String(e.employeeId).trim()] = e; });

  // 2. Grouping
  const projectGroups = {};
  employees.forEach(emp => {
    const attRow = attMap[String(emp.employeeId)];
    if (!attRow) return;

    const project = emp.reportProject || 'Unknown';
    const subCenter = emp.subCenter || 'General';
    if (!projectGroups[project]) projectGroups[project] = {};
    if (!projectGroups[project][subCenter]) projectGroups[project][subCenter] = [];

    const getVal = (val) => parseFloat(val) || 0;
    const totalDays = getVal(attRow['total working days']);
    const holidays = getVal(attRow['holidays']);
    const leave = getVal(attRow['availing leave']);
    const lwpDays = getVal(attRow['lwp']);
    const actualPresent = getVal(attRow['actual present']);
    const netPresent = getVal(attRow['net present']);

    const grossSalary = getVal(emp.salary);
    const earnings = {
      maint: getVal(emp.motobikeCarMaintenance),
      laptop: getVal(emp.laptopRent),
      others: getVal(emp.othersAllowance),
      arrear: getVal(emp.arrear),
      food: getVal(emp.foodAllowance),
      station: getVal(emp.stationAllowance),
      hardship: getVal(emp.hardshipAllowance)
    };
    const grossPayable = grossSalary + Object.values(earnings).reduce((a, b) => a + b, 0);

    const deductions = {
      lunch: getVal(emp.subsidizedLunch),
      tds: getVal(emp.tds),
      bike: getVal(emp.motorbikeLoan),
      welfare: getVal(emp.welfareFund),
      loan: getVal(emp.salaryOthersLoan),
      vehicle: getVal(emp.subsidizedVehicle),
      cpf: getVal(emp.cpf),
      adj: getVal(emp.othersAdjustment)
    };

    let attDed = 0;
    if (totalDays > 0 && netPresent < totalDays) {
      attDed = (grossSalary / totalDays) * (totalDays - netPresent);
    }
    attDed = Math.round(attDed * 100) / 100;

    const totalDeduction = Object.values(deductions).reduce((a, b) => a + b, 0) + attDed;
    const netPayment = Math.round((grossPayable - totalDeduction) * 100) / 100;

    // Holder Logic
    let finalAccountNo = emp.bankAccount;
    let remarksText = "";
    let paymentType = "Bank";
    const holderKey = `${String(project).toLowerCase().trim()}${String(subCenter).toLowerCase().trim()}`;
    const holderInfo = holderMap[holderKey];
    let holderId = null;

    if (!finalAccountNo || finalAccountNo.trim() === '') {
      paymentType = "Cash (Holder)";
      if (holderInfo && holderInfo.id) {
        holderId = String(holderInfo.id).trim();
        const holderEmp = allEmpMap[holderId];
        if (holderEmp) {
          remarksText = `Pay to: ${holderInfo.name} (${holderInfo.id})`;
        } else {
          remarksText = `Holder: ${holderInfo.name} (Not Found)`;
        }
      }
    }

    projectGroups[project][subCenter].push({
      ...emp,
      finalAccountNo,
      remarksText,
      paymentType,
      holderId,
      att: { totalDays, holidays, leave, lwpDays, actualPresent, netPresent },
      earn: { grossSalary, ...earnings, grossPayable },
      ded: { ...deductions, attDed, totalDeduction },
      netPayment
    });
  });

  // 3. Generate Excel per Project
  for (const [project, subCenters] of Object.entries(projectGroups)) {
    const workbook = new ExcelJS.Workbook();

    // ==================================================
    // 1. SALARY SHEET
    // ==================================================
    const sheet = workbook.addWorksheet('Salary Sheet', { views: [{ state: 'frozen', ySplit: 4 }] }); // Freeze up to row 4

    // --- HEADERS ---
    sheet.mergeCells('A1:AQ1');
    const r1 = sheet.getCell('A1');
    r1.value = "Metal Plus Limited";
    r1.font = { bold: true, size: 16, name: 'Calibri' };
    r1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    sheet.mergeCells('A2:AQ2');
    const r2 = sheet.getCell('A2');
    r2.value = `Salary Sheet-${project} for the Month of ${full}`;
    r2.font = { bold: true, size: 12, name: 'Calibri' };
    r2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    const mergeRanges = [
      { r: 'A3:J3', t: 'Employee Information' },
      { r: 'K3:P3', t: 'Attendance' },
      { r: 'Q3:T3', t: 'Salary Structure' },
      { r: 'U3:AB3', t: 'Earnings & Benefits' },
      { r: 'AC3:AM3', t: 'Deductions' },
      { r: 'AN3:AQ3', t: 'Payment Information' }
    ];
    mergeRanges.forEach(m => {
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
      "Total Working Days","Holidays","Availing Leave","LWP","Actual Present","Net Present",
      "Previous Salary","Basic","Others","Gross Salary",
      "Motobike / Car Maintenance Allowance","Laptop Rent","Others Allowance","Arrear","Food Allowance","Station Allowance","Hardship Allowance","Gross Payable Salary",
      "Gratuity","Subsidized Lunch","TDS","Motorbike Loan","Welfare Fund","Salary/ Others Loan","Subsidized Vehicle","CPF","Others Adjustment","Attendance Deduction","Total Deduction",
      "Net Salary Payment","Bank Account Number","Payment Type","Remarks"
    ];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 65; // Row 4 height = 65
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
      cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      // Rotate & wrap for K–AM
      if (colNumber >= 11 && colNumber <= 39) {
        cell.alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle', wrapText: true };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
    });

    // Column widths per your spec: K(11)→AM(39) = 11.18, AP(42) = 11.55
    for (let c = 11; c <= 39; c++) sheet.getColumn(c).width = 11.18;
    sheet.getColumn(42).width = 11.55;

    // --- BODY ---
    let sl = 1;
    const sortedSubCenters = Object.keys(subCenters).sort();
    let projectGrandTotal = 0;

    for (const scName of sortedSubCenters) {
      const scEmployees = subCenters[scName];

      // Subcenter band row
      const scRow = sheet.addRow([`Subcenter: ${scName}`]);
      for (let i = 1; i <= 43; i++) {
        const c = scRow.getCell(i);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } };
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        c.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center', wrapText: true };
        if (i === 1) c.font = { bold: true };
      }

      let scTotalNet = 0;
      scEmployees.forEach(d => {
        scTotalNet += d.netPayment;
        projectGrandTotal += d.netPayment;

        const r = sheet.addRow([
          sl++, d.employeeId, d.name, d.designation, d.functionalRole, d.joiningDate,
          d.project, d.projectOffice, d.reportProject, d.subCenter,
          d.att.totalDays, d.att.holidays, d.att.leave, d.att.lwpDays, d.att.actualPresent, d.att.netPresent,
          d.previousSalary || 0, (d.earn.grossSalary || 0) * 0.6, (d.earn.grossSalary || 0) * 0.4, d.earn.grossSalary,
          d.earn.maint, d.earn.laptop, d.earn.others, d.earn.arrear, d.earn.food, d.earn.station, d.earn.hardship, d.earn.grossPayable,
          0, // Gratuity
          d.ded.lunch, d.ded.tds, d.ded.bike, d.ded.welfare, d.ded.loan, d.ded.vehicle, d.ded.cpf, d.ded.adj, d.ded.attDed, d.ded.totalDeduction,
          d.netPayment,
          d.finalAccountNo, d.paymentType, d.remarksText
        ]);

        r.eachCell((c, colNumber) => {
          c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
          // Left align Name (3) and Remarks (43); others centered
          if (colNumber === 3 || colNumber === 43) {
            c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          } else {
            c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          }
          // Apply Accounting(0) to all money columns (17..40)
          if (colNumber >= 17 && colNumber <= 40) {
            c.numFmt = accountingFmt0;
          }
        });
      });

      // Subcenter Total row
      const totRow = sheet.addRow(new Array(43).fill(''));
      totRow.getCell(3).value = `Total for ${scName}`;
      const netPayCell = totRow.getCell(40); // Net Salary Payment col
      netPayCell.value = scTotalNet;
      netPayCell.numFmt = accountingFmt0;
      totRow.eachCell(c => {
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
    }

    // ==================================================
    // 2. ADVICE SHEET (with your letter & signature)
    // ==================================================
    const adviceSheet = workbook.addWorksheet('Advice', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    // --- Consolidate payouts (holder logic) ---
    const consolidationMap = new Map(); // key: employeeId (or holderId), value: {id,name,designation,account,amount}
    const allProjectEmployees = Object.values(subCenters).flat();

    // Initialize entries for those who have their own account
    allProjectEmployees.forEach(emp => {
      if (emp.finalAccountNo && emp.finalAccountNo.trim() !== '') {
        const key = String(emp.employeeId);
        if (!consolidationMap.has(key)) {
          consolidationMap.set(key, {
            sl: 0,
            id: emp.employeeId,
            name: emp.name,
            designation: emp.designation,
            account: emp.finalAccountNo,
            amount: 0
          });
        }
        consolidationMap.get(key).amount += emp.netPayment;
      }
    });

    // Add cash/holder employees’ amounts under their holder (if holder has account)
    allProjectEmployees.forEach(emp => {
      if (!emp.finalAccountNo || emp.finalAccountNo.trim() === '') {
        if (emp.holderId && consolidationMap.has(emp.holderId)) {
          const holderEntry = consolidationMap.get(emp.holderId);
          holderEntry.amount += emp.netPayment;
        }
      }
    });

    // --- Advice letter (based on Advice Sample.xlsx) ---
    // Ref + Date + Address + Subject + Body + Signatures
    // (This mirrors your sample, with dynamic month and today’s date)
    const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '.'); // DD.MM.YYYY
    const totalLetterAmount = allProjectEmployees.reduce((sum, e) => sum + (e.netPayment || 0), 0);
    const totalAmountWords = convertNumberToWords(totalLetterAmount);

    const writeTextRow = (rIdx, text, bold=false, size=11) => {
      const row = adviceSheet.getRow(rIdx);
      const cell = row.getCell(1);
      cell.value = text;
      cell.font = { name: 'Calibri', size, bold };
      cell.alignment = { vertical: 'top', wrapText: true };
      adviceSheet.mergeCells(rIdx, 1, rIdx, 6);
    };

    writeTextRow(1, `Ref: MPL/TELECOM/Salary/${full}`, true, 11);
    writeTextRow(2, `Date: ${today}`, true, 11);

    writeTextRow(4, "To");
    writeTextRow(5, "The Manager");
    writeTextRow(6, "Dutch Bangla Bank Ltd.");            // From sample [1](https://5y6ybn-my.sharepoint.com/personal/ratulbd_5y6ybn_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BE08A1EEF-54C2-42BB-9946-333029D12295%7D&file=advice%20Sample.xlsx&action=default&mobileredirect=true)
    writeTextRow(7, "Banani Branch");                      // From sample [1](https://5y6ybn-my.sharepoint.com/personal/ratulbd_5y6ybn_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BE08A1EEF-54C2-42BB-9946-333029D12295%7D&file=advice%20Sample.xlsx&action=default&mobileredirect=true)

    writeTextRow(9, `Subject: Salary expenses disbursement for the Month of ${quote}.`, true, 11);

    writeTextRow(11, "Dear sir,");
    // Paragraph (sample text, adapted with dynamic amount & words)
    const para =
      `Please Transfer Tk.${totalLetterAmount.toLocaleString('en-IN')}/-Taka (in word: ${totalAmountWords}) ` +
      `to our following employee’s bank account by debiting our CD Account No. 103.110.17302 ` +
      `in the name of Metal Plus Ltd. maintained with you. For better clarification we have ` +
      `provided you the soft copy of data through e-mail and affirm you that soft copy of data ` +
      `is true and exact with hard copy of data submitted to you. For any deviation with soft copy ` +
      `and hard copy we will be held responsible.`; // Adapted from sample letter content [1](https://5y6ybn-my.sharepoint.com/personal/ratulbd_5y6ybn_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BE08A1EEF-54C2-42BB-9946-333029D12295%7D&file=advice%20Sample.xlsx&action=default&mobileredirect=true)

    // Merge a block for para lines (rows 13–17)
    for (let r = 13; r <= 17; r++) { adviceSheet.mergeCells(r, 1, r, 6); }
    writeTextRow(13, para, false, 11);

    writeTextRow(19, "Thanking You,");
    // Authorized signatures from sample:
    writeTextRow(21, "Engr. Sadid Jamil", true, 11);       // From sample [1](https://5y6ybn-my.sharepoint.com/personal/ratulbd_5y6ybn_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BE08A1EEF-54C2-42BB-9946-333029D12295%7D&file=advice%20Sample.xlsx&action=default&mobileredirect=true)
    writeTextRow(22, "Managing Director", false, 11);      // From sample [1](https://5y6ybn-my.sharepoint.com/personal/ratulbd_5y6ybn_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BE08A1EEF-54C2-42BB-9946-333029D12295%7D&file=advice%20Sample.xlsx&action=default&mobileredirect=true)
    writeTextRow(24, "Engr. Aminul Islam", true, 11);      // From sample [1](https://5y6ybn-my.sharepoint.com/personal/ratulbd_5y6ybn_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BE08A1EEF-54C2-42BB-9946-333029D12295%7D&file=advice%20Sample.xlsx&action=default&mobileredirect=true)
    writeTextRow(25, "Chairman", false, 11);               // From sample [1](https://5y6ybn-my.sharepoint.com/personal/ratulbd_5y6ybn_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BE08A1EEF-54C2-42BB-9946-333029D12295%7D&file=advice%20Sample.xlsx&action=default&mobileredirect=true)

    // --- Table (headers at row 40, data start row 41) ---
    const tableHeaderRowIdx = 40;
    const adviceHeaders = ["SL", "ID", "Name", "Designation", "Account No", "Amount"]; // “Remarks” removed, “Designation” added
    const headerRowAdvice = adviceSheet.getRow(tableHeaderRowIdx);
    headerRowAdvice.values = adviceHeaders;
    headerRowAdvice.height = 24;
    headerRowAdvice.eachCell((c) => {
      c.font = { bold: true };
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    });

    // Column widths tuned to fit one page width
    adviceSheet.getColumn(1).width = 6;   // SL
    adviceSheet.getColumn(2).width = 12;  // ID
    adviceSheet.getColumn(3).width = 28;  // Name
    adviceSheet.getColumn(4).width = 18;  // Designation
    adviceSheet.getColumn(5).width = 20;  // Account No
    adviceSheet.getColumn(6).width = 15;  // Amount

    let advSl = 1;
    const finalAdviceList = Array.from(consolidationMap.values()).sort((a,b) => String(a.id).localeCompare(String(b.id)));
    finalAdviceList.forEach(item => {
      const r = adviceSheet.addRow([advSl++, item.id, item.name, item.designation, item.account, item.amount]);
      r.eachCell((c, colNumber) => {
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        c.alignment = { vertical: 'middle', horizontal: colNumber === 3 ? 'left' : 'center', wrapText: true };
        if (colNumber === 6) c.numFmt = accountingFmt0; // Amount column accounting(0)
      });
    });

    // Advice total
    const advTotRow = adviceSheet.addRow(['', '', 'Total', '', totalLetterAmount]);
    advTotRow.getCell(5).numFmt = accountingFmt0;
    advTotRow.eachCell(c => {
      c.font = { bold: true };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    // Finalize Zip
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
  }

  return zip.generateAsync({ type: "blob" });
}
