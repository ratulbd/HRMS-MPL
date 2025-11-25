// js/payslipGenerator.js
import { formatDateForDisplay } from './utils.js';

/**
 * Generates payslips for all employees based on the salary sheet data.
 * Segregates by Project and SubCenter into a ZIP file.
 *
 * @param {Array} salaryData - Data from the salary sheet (Net, Gross, Status, ID, etc.)
 * @param {Array} employeeDB - Full employee database (Designation, DOJ, Basic, etc.)
 * @param {string} monthYear - The month string (e.g., "October'25")
 */
export async function generatePayslipsZip(salaryData, employeeDB, monthYear) {
    const zip = new JSZip();
    let count = 0;

    // Helper to find employee details
    const getEmpDetails = (id) => employeeDB.find(e => String(e.employeeId) === String(id));

    // Grouping structure: Project -> SubCenter -> Employees
    // Iterate through salary data
    for (const record of salaryData) {
        // Skip if record is empty or invalid
        if (!record.employeeId) continue;

        const empDetails = getEmpDetails(record.employeeId);

        // Use details from DB if available, otherwise fallback or N/A
        const project = empDetails?.project || 'Unknown Project';
        const subCenter = empDetails?.subCenter || 'Unknown SubCenter';
        const name = record.name || empDetails?.name || 'Unknown Name';
        const id = record.employeeId;

        // Generate PDF Blob
        const pdfBlob = await createPayslipPDF(record, empDetails, monthYear, subCenter);

        // Add to ZIP: Project/SubCenter/ID_Name.pdf
        const folderName = `${sanitize(project)}/${sanitize(subCenter)}`;
        const fileName = `${id}_${sanitize(name)}.pdf`;

        zip.folder(folderName).file(fileName, pdfBlob);
        count++;
    }

    if (count === 0) {
        throw new Error("No valid salary records found to generate payslips.");
    }

    // Generate the final zip file
    return await zip.generateAsync({ type: "blob" });
}

function sanitize(str) {
    return str.replace(/[^a-z0-9]/gi, '_').trim();
}

/**
 * Creates a single Payslip PDF matching Form-38 layout.
 */
async function createPayslipPDF(salaryRecord, empDetails, monthYear, subCenter) {
    const doc = new jspdf.jsPDF();

    // --- Header ---
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Metal Plus Limited", 105, 10, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("House-07, Road-10, Baridhara J Block, Dhaka -1212", 105, 15, { align: "center" });

    doc.setFontSize(7);
    doc.text("Bangladesh Labor Law, Form-38", 105, 20, { align: "center" });

    doc.setLineWidth(0.1);
    doc.line(10, 22, 200, 22);

    // --- Title Row ---
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    // "Pay Slip- October'25" | "Circle: Rajshahi" | "Sub Center: Bogra Core"
    // Note: Circle is usually static or from Project Office, using Project Office as Circle proxy or 'Rajshahi' if generic.
    const circle = empDetails?.projectOffice || "N/A";

    doc.text(`Pay Slip- ${monthYear}`, 14, 28);
    doc.text(`Circle: ${circle}`, 90, 28);
    doc.text(`Sub Center: ${subCenter}`, 150, 28);

    doc.line(10, 30, 200, 30);

    // --- Data Preparation ---
    const basic = parseFloat(empDetails?.basic || 0);
    const gross = parseFloat(salaryRecord.salary || empDetails?.salary || 0); // salaryRecord.salary is usually Gross from sheet

    // Calculate/Retrieve fields based on Form-38 structure
    // Left Column Data
    const idNo = salaryRecord.employeeId;
    const name = salaryRecord.name;
    const designation = empDetails?.designation || "";
    const doj = formatDateForDisplay(empDetails?.joiningDate) || "";
    const totalWorkingDays = "31"; // Standard from example, or calculate based on month
    const holidays = "7"; // Standard from example
    const basicSalary = basic.toFixed(0) + "/-";
    const others = parseFloat(empDetails?.others || 0).toFixed(0) + "/-";
    const grossSalary = gross.toFixed(0) + "/-";

    // Right Column Data
    // "Net Present" and "Actual Present" come from Sheet if available, else placeholders
    // The Salary Sheet `daysPresent` usually maps to Net Present in this logic.
    const netPresent = salaryRecord.daysPresent || "0";
    const actualPresent = salaryRecord.daysPresent || "0"; // Usually same unless leave logic
    const lwp = salaryRecord.deduction > 0 ? "0/-" : "0/-"; // Simplified logic as sheet just has 'deduction'
    const daysWorked = netPresent;

    // Welfare Fund (WF) seems to be ~1% of Basic in the examples (14813 -> 148)
    const wfAmount = Math.round(basic * 0.01);
    const wf = wfAmount + "/-";

    // Total Deduct from sheet
    const totalDeduct = (salaryRecord.deduction || 0);

    // Net Disbursable from sheet
    const netDisbursable = (salaryRecord.netSalary || 0).toFixed(0) + "/-";

    // --- Table Structure ---
    const startY = 32;
    const col1X = 14;
    const col2X = 110;
    const lineHeight = 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    // Helper to draw row
    const drawRow = (label1, val1, label2, val2, y) => {
        doc.text(label1, col1X, y);
        doc.text(String(val1), col1X + 40, y);

        doc.text(label2, col2X, y);
        doc.text(String(val2), col2X + 40, y);
    };

    let currentY = startY;

    // Row 1
    drawRow("ID No. :", idNo, "OT Hours :", "", currentY);
    currentY += lineHeight;

    // Row 2
    drawRow("Name :", name, "OT Rate :", "", currentY);
    currentY += lineHeight;

    // Row 3
    drawRow("Designation :", designation, "Net Present :", netPresent, currentY);
    currentY += lineHeight;

    // Row 4
    drawRow("DOJ :", doj, "Actual Present :", actualPresent, currentY);
    currentY += lineHeight;

    // Row 5
    drawRow("Total Working days :", totalWorkingDays, "LWP :", "0/-", currentY);
    currentY += lineHeight;

    // Row 6
    drawRow("Leave", "", "Subsidize Vehicle", "", currentY);
    currentY += lineHeight;

    // Row 7
    drawRow("Holidays :", holidays, "Motor Bike Loan", "", currentY);
    currentY += lineHeight;

    // Row 8
    drawRow("Basic Salary :", basicSalary, "Ttl Absent days :", "", currentY);
    currentY += lineHeight;

    // Row 9
    drawRow("House Rent :", "", "Days worked :", daysWorked, currentY);
    currentY += lineHeight;

    // Row 10
    drawRow("Medical :", "", "Sub Lunch", "", currentY);
    currentY += lineHeight;

    // Row 11
    drawRow("Convenes :", "", "Others Loan", "", currentY);
    currentY += lineHeight;

    // Row 12
    drawRow("Food & Station Allowance :", "", "Advance :", "", currentY);
    currentY += lineHeight;

    // Row 13
    drawRow("Others :", others, "WF :", wf, currentY);
    currentY += lineHeight;

    // Row 14
    drawRow("Arrear", "", "CPF", "", currentY);
    currentY += lineHeight;

    // Row 15
    drawRow("Other Allowances", "", "Station Allowance", "", currentY);
    currentY += lineHeight;

    // Row 16
    drawRow("Attendance Bonus :", "", "TDS", "", currentY);
    currentY += lineHeight;

    // Row 17
    drawRow("OT Allowanced :", "", "Total Deduct :", totalDeduct.toFixed(0) + "/-", currentY);
    currentY += lineHeight;

    // Row 18 (Totals)
    doc.setFont("helvetica", "bold");
    drawRow("Gross Salary :", grossSalary, "Net Disbursable :", netDisbursable, currentY);
    doc.setFont("helvetica", "normal");

    // Bottom Line
    currentY += 4;
    doc.line(10, currentY, 200, currentY);

    // Signatures (Optional, just to look authentic)
    currentY += 20;
    doc.text("Signature of Employee", 14, currentY);
    doc.text("Authorized Signature", 150, currentY);

    return doc.output('blob');
}