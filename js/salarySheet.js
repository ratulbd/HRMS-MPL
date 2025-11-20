/*
  salarySheet.js
  Version: 2025-11-20

  Key improvements:
  - BOM-safe + whitespace-normalized CSV headers
  - Robust Employee ID normalization & multi-variant attendance lookup
  - Safe numeric helpers (no .toFixed() on null/undefined)
  - Better validation & clearer errors
  - Keeps Excel values numeric, uses numFmt for accounting display
*/

import { $, customAlert, closeModal } from './utils.js';

/* ----------------------- Setup modal & events ----------------------- */
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

      const monthVal = $('salaryMonth')?.value; // YYYY-MM
      const attendanceFile = $('attendanceFile')?.files?.[0];
      const holderFile = $('accountabilityFile')?.files?.[0];

      if (!monthVal || !attendanceFile || !holderFile) {
        customAlert("Error", "Please select a month and upload both CSV files.");
        return;
      }

      try {
        // Ensure global libs exist (loaded via <script> tags)
        if (typeof Papa === 'undefined' || typeof ExcelJS === 'undefined' || typeof JSZip === 'undefined') {
          throw new Error("Initialization Error: Required libraries (PapaParse, ExcelJS, JSZip) are not loaded. Please check index.html script tags.");
        }

        const employees = getEmployeesFunc?.() || [];
        if (!Array.isArray(employees) || employees.length === 0) {
          throw new Error("No employee data found in the system.");
        }

        const attendanceData = await parseCSV(attendanceFile);
        const holderData = await parseCSV(holderFile);

        validateAttendanceHeaders(attendanceData);
        validateHolderHeaders(holderData);

        customAlert("Processing", "Generating report-project wise sheets...");
        const zipContent = await generateProjectWiseZip(employees, attendanceData, holderData, monthVal);

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipContent);
        link.download = `Salary_Reports_${monthVal}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);

        closeModal('attendanceModal');
        customAlert("Success", "Salary Reports generated successfully.");
      } catch (error) {
        console.error("GENERATION FAILED:", error);
        customAlert("Generation Error", error?.message || "An unknown error occurred during file generation.");
      }
    });
  }
}

/* ----------------------------- Helpers ----------------------------- */

// Safe numeric helpers (avoid .toFixed on null/undefined)
const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const fixed = (v, d = 2) => num(v, 0).toFixed(d); // use only for display strings, not Excel cells

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results || !Array.isArray(results.data)) return resolve([]);
        // Filter only object rows
        resolve(results.data.filter(row => row !== null && typeof row === 'object'));
      },
      error: (err) => reject(err),
    });
  });
}

// Strips BOM, lowers, normalizes inner whitespace, trims
const sanitizePropertyKey = (key) => {
  if (!key) return '';
  return String(key)
    .replace(/^\uFEFF/, '')       // strip BOM if present
    .toLowerCase()
    .replace(/\s+/g, ' ')         // collapse internal whitespace
    .trim();
};

// Normalizes ID formats: NBSP->space, tighten dashes, add missing dash
const sanitizeMapKey = (id) => {
  if (!id) return '';
  let s = String(id)
    .toUpperCase()
    .replace(/\u00A0/g, ' ')      // non-breaking spaces to normal
    .replace(/\s*-\s*/g, '-')     // tighten spaces around dashes
    .trim();
  // If no dash but pattern like "CL 5967" -> "CL-5967"
  s = s.replace(/^([A-Z]{1,4})\s+(\d+)$/, '$1-$2');
  // Also handle stray spaces: "CL - 5967" -> "CL-5967"
  s = s.replace(/^([A-Z]{1,4})\s*-\s*(\d+)$/, '$1-$2');
  return s;
};

function validateAttendanceHeaders(data) {
  if (!data || data.length === 0) throw new Error("Attendance file is empty.");
  const headers = Object.keys(data[0]).map(k => sanitizePropertyKey(k));

  const mustHave = ['employeeid', 'net present', 'total working days'];
  const missing = mustHave.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(`Attendance file missing required column(s): ${missing.join(', ')}`);
  }
}

function validateHolderHeaders(data) {
  if (!data || data.length === 0) throw new Error("Common Account Holder file is empty.");
  const headers = Object.keys(data[0]).map(k => sanitizePropertyKey(k));

  const mustHave = ['reportproject', 'subcenter', 'accountableemployeeid', 'accountableemployeename'];
  const missing = mustHave.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(`Account Holder file missing required column(s): ${missing.join(', ')}`);
  }
}

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
  return num(Math.floor(amount)) > 0 ? `${numToWords(Math.floor(amount))}Only` : 'Zero Only';
}

function getFormattedMonthYear(dateStr) {
  const date = new Date(dateStr + "-01");
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  return { month, year, full: `${month}-${year}`, quote: `${month}'${year}` };
}

/* ------------------------- Main generation ------------------------- */
async function generateProjectWiseZip(employees, attendanceData, holderData, monthVal) {
  const zip = new JSZip();
  const { month, year } = getFormattedMonthYear(monthVal);
  const accountingFmt = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';

  // Build sanitized maps
  const attMap = {};
  attendanceData.forEach((row) => {
    const cleanRow = {};
    for (const k in row) cleanRow[sanitizePropertyKey(k)] = row[k];
    const empId = sanitizeMapKey(cleanRow['employeeid']);
    if (empId) attMap[empId] = cleanRow;
  });

  const holderMap = {};
  holderData.forEach((row) => {
    const cleanRow = {};
    for (const k in row) cleanRow[sanitizePropertyKey(k)] = row[k];
    const key = `${sanitizePropertyKey(cleanRow['reportproject'])}${sanitizePropertyKey(cleanRow['subcenter'])}`;
    holderMap[key] = {
      name: cleanRow['accountableemployeename'],
      id: sanitizeMapKey(cleanRow['accountableemployeeid']),
    };
  });

  const allEmpMap = {};
  employees.forEach((e) => { allEmpMap[sanitizeMapKey(e.employeeId)] = e; });

  // Group by reportProject -> subCenter
  const projectGroups = {};
  employees.forEach((emp, index) => {
    try {
      if (!emp || !emp.employeeId) return;
      const empIdRaw = sanitizeMapKey(emp.employeeId);

      // Attendance lookup with variants
      const idVariants = [
        empIdRaw,
        empIdRaw.replace(/^([A-Z]{1,4})\s+(\d+)$/, '$1-$2'),  // add dash between letters/digits
        empIdRaw.replace(/\s+/g, ''),                         // remove all spaces
      ];
      const attRow = idVariants.map(v => attMap[v]).find(Boolean);
      if (!attRow) return; // skip if not in attendance file

      const project = emp.reportProject || 'Unknown';
      const subCenter = emp.subCenter || 'General';
      if (!projectGroups[project]) projectGroups[project] = {};
      if (!projectGroups[project][subCenter]) projectGroups[project][subCenter] = [];

      // Attendance values (prefer Net Present)
      const getVal = (val) => num(val, 0);
      const totalDays    = getVal(attRow['total working days']);
      const holidays     = getVal(attRow['holidays']);
      const leave        = getVal(attRow['availing leave']);
      const lwpDays      = getVal(attRow['lwp']);                   // often blank in your file
      const actualPresent= getVal(attRow['actual present']);        // often blank in your file
      const netPresent   = getVal(attRow['net present']);           // consistently present

      // Earnings/Deductions data from employee master
      const grossSalary = getVal(emp.salary);
      const earnings = {
        maint:     getVal(emp.motobikeCarMaintenance),
        laptop:    getVal(emp.laptopRent),
        others:    getVal(emp.othersAllowance),
        arrear:    getVal(emp.arrear),
        food:      getVal(emp.foodAllowance),
        station:   getVal(emp.stationAllowance),
        hardship:  getVal(emp.hardshipAllowance),
      };
      const grossPayable = grossSalary + Object.values(earnings).reduce((a, b) => a + b, 0);

      const deductions = {
        lunch:   getVal(emp.subsidizedLunch),
        tds:     getVal(emp.tds),
        bike:    getVal(emp.motorbikeLoan),
        welfare: getVal(emp.welfareFund),
        loan:    getVal(emp.salaryOthersLoan),
        vehicle: getVal(emp.subsidizedVehicle),
        lwpAmt:  getVal(emp.lwp),
        cpf:     getVal(emp.cpf),
        adj:     getVal(emp.othersAdjustment),
      };

      // Attendance-based deduction (using Net Present)
      let attDed = 0;
      if (totalDays > 0 && netPresent < totalDays) {
        attDed = (grossSalary / totalDays) * (totalDays - netPresent);
      }
      attDed = Math.round(attDed);

      const totalDeduction = Object.values(deductions).reduce((a, b) => a + b, 0) + attDed;
      const netPayment     = Math.round(grossPayable - totalDeduction);

      // Payment routing / holder info
      let finalAccountNo = emp.bankAccount || '';
      let remarksText = "";
      let paymentType = "Bank";
      const holderKey = `${sanitizePropertyKey(project)}${sanitizePropertyKey(subCenter)}`;
      const holderInfo = holderMap[holderKey];

      if (finalAccountNo.trim() === "") {
        paymentType = "Cash (Holder)";
        if (holderInfo && holderInfo.id) {
          const holderEmp = allEmpMap[holderInfo.id];
          if (holderEmp && holderEmp.bankAccount) {
            finalAccountNo = holderEmp.bankAccount;
            remarksText = `Pay to: ${holderInfo.name} (${holderInfo.id})`;
          } else {
            remarksText = `Holder: ${holderInfo.name} (No Acc Found)`;
          }
        }
      }

      projectGroups[project][subCenter].push({
        ...emp,
        finalAccountNo,
        remarksText,
        paymentType,
        holderId: holderInfo ? holderInfo.id : null,
        att: { totalDays, holidays, leave, lwpDays, actualPresent, netPresent },
        earn: { grossSalary, ...earnings, grossPayable },
        ded: { ...deductions, attDed, totalDeduction },
        netPayment,
      });
    } catch (e) {
      // Halt with context — helps triage quickly
      throw new Error(`CRASH: Processing Emp ID ${emp ? emp.employeeId : 'UNKNOWN'} at index ${index}. Details: ${e.message}`);
    }
  });

  const projectEntries = Object.entries(projectGroups || {});
  if (projectEntries.length === 0) {
    throw new Error("No employees processed. Check attendance file mapping (IDs/headers) or filters.");
  }

  // Create one workbook per project
  for (const [project, subCenters] of projectEntries) {
    if (typeof ExcelJS === 'undefined') {
      throw new Error("ExcelJS is not defined. Cannot proceed with workbook generation.");
    }
    const workbook = new ExcelJS.Workbook();

    /* ------------------------ Salary Sheet (main) ------------------------ */
    const sheet = workbook.addWorksheet('Salary Sheet');
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

    // Example widths (you may adjust to your layout)
    for (let i = 1; i <= 43; i++) {
      if (i >= 10 && i <= 38) sheet.getColumn(i).width = 11.18;
      if (i === 41) sheet.getColumn(i).width = 11.55;
    }

    // --- Header Rows (title, month/year, etc.) ---
    {
      const hdr1 = sheet.addRow([`Salary Sheet - ${project}`, `${month} ${year}`]);
      hdr1.font = { bold: true, size: 14 };
      hdr1.alignment = { vertical: 'middle', horizontal: 'center' };
    }
    // Add an empty row for spacing
    sheet.addRow([]);

    // --- Table Headers (adjust labels to match your Excel format) ---
    const headers = [
      'SL','ID','Name','Designation','Functional Role','Joining Date',
      'Project','Project Office','Report Project','Sub Center',
      'Total Days','Holidays','Leave','LWP(Days)','Actual Present','Net Present',
      'Previous Salary','Basic (60%)','Others (40%)','Gross',
      'Maint','Laptop','Others Allow','Arrear','Food','Station','Hardship','Gross Payable',
      'Gratuity',
      'Lunch','TDS','Bike Loan','Welfare','Salary/Others Loan','Vehicle','LWP(Amt)','CPF','Others Adj','Att Ded','Total Deduction',
      'Net Payment','Account No','Pay Type','Remarks'
    ];
    const hdrRow = sheet.addRow(headers);
    hdrRow.eachCell((c) => {
      c.font = { bold: true };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEEF3' } };
    });

    // --- Body ---
    let sl = 1;
    const sortedSubCenters = Object.keys(subCenters).sort();
    let projectGrandTotal = 0;

    for (const scName of sortedSubCenters) {
      const scEmployees = subCenters[scName];

      // Subcenter Header Row (band)
      const scRow = sheet.addRow([`Subcenter: ${scName}`]);
      for (let i = 1; i <= headers.length; i++) {
        const c = scRow.getCell(i);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } };
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        if (i === 1) c.font = { bold: true };
      }

      let scTotalNet = 0;

      scEmployees.forEach((d) => {
        scTotalNet += d.netPayment;
        projectGrandTotal += d.netPayment;

        // Keep numbers numeric; Excel will format them
        const rowValues = [
          sl++, d.employeeId, d.name, d.designation, d.functionalRole, d.joiningDate,
          d.project, d.projectOffice, d.reportProject, d.subCenter,
          d.att.totalDays, d.att.holidays, d.att.leave, d.att.lwpDays, d.att.actualPresent, d.att.netPresent,
          num(d.previousSalary, 0),                   // safe default
          d.earn.grossSalary * 0.6,
          d.earn.grossSalary * 0.4,
          d.earn.grossSalary,
          d.earn.maint, d.earn.laptop, d.earn.others, d.earn.arrear, d.earn.food, d.earn.station, d.earn.hardship, d.earn.grossPayable,
          0,                                          // Gratuity (if any, pipe here)
          d.ded.lunch, d.ded.tds, d.ded.bike, d.ded.welfare, d.ded.loan, d.ded.vehicle, d.ded.lwpAmt, d.ded.cpf, d.ded.adj, d.ded.attDed, d.ded.totalDeduction,
          d.netPayment,
          d.finalAccountNo, d.paymentType, d.remarksText,
        ];

        const r = sheet.addRow(rowValues);
        r.eachCell((c, colNum) => {
          c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
          c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          if (colNum >= 17 && colNum <= 40) {
            c.numFmt = accountingFmt;
          }
          if (colNum === 3 || colNum === headers.length) {
            c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          }
        });
      });

      // Subcenter totals row
      const totRow = sheet.addRow(new Array(headers.length).fill(''));
      totRow.getCell(3).value = `Total for ${scName}`;
      const netPayCell = totRow.getCell(41); // index matches 'Net Payment' column
      netPayCell.value = scTotalNet;
      netPayCell.numFmt = accountingFmt;
      totRow.eachCell((c) => {
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      });
    }

    // Project grand total row (optional)
    {
      const grandRow = sheet.addRow(new Array(headers.length).fill(''));
      grandRow.getCell(3).value = `Project Grand Total (${project})`;
      const netPayCell = grandRow.getCell(41);
      netPayCell.value = projectGrandTotal;
      netPayCell.numFmt = accountingFmt;
      grandRow.eachCell((c) => {
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEEDD' } };
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      });
    }

    // --- Advice sheet (optional): keep as before if you had one ---
    // const advice = workbook.addWorksheet('Advice');
    // ... (build your advice sheet here)

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = project.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    zip.file(`${safeName}_${monthVal}.xlsx`, buffer);
  }

  return zip.generateAsync({ type: "blob" });
}
