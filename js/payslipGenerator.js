// js/payslipGenerator.js
import { formatDateForDisplay } from './utils.js';

// Helper to load image as Base64 for PDF embedding
async function loadLogo() {
    try {
        const response = await fetch('/assets/logo.png');
        if (!response.ok) throw new Error("Logo missing");
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Could not load logo for payslip:", e);
        return null;
    }
}

/**
 * Generates payslips for all employees based on the salary sheet data.
 * Segregates by Project and SubCenter into a ZIP file.
 */
export async function generatePayslipsZip(salaryData, employeeDB, monthYear) {
    const zip = new JSZip();
    let count = 0;

    // Load logo once to reuse
    const logoData = await loadLogo();

    // Helper to find employee details
    const getEmpDetails = (id) => employeeDB.find(e => String(e.employeeId) === String(id));

    // Iterate through salary data
    for (const record of salaryData) {
        if (!record.employeeId) continue;

        const empDetails = getEmpDetails(record.employeeId);

        const project = empDetails?.project || 'Unknown Project';
        const subCenter = empDetails?.subCenter || 'Unknown SubCenter';
        const name = record.name || empDetails?.name || 'Unknown Name';
        const id = record.employeeId;

        // Generate PDF Blob
        const pdfBlob = await createPayslipPDF(record, empDetails, monthYear, subCenter, logoData);

        // Add to ZIP: Project/SubCenter/ID_Name.pdf
        const folderName = `${sanitize(project)}/${sanitize(subCenter)}`;
        const fileName = `${id}_${sanitize(name)}.pdf`;

        zip.folder(folderName).file(fileName, pdfBlob);
        count++;
    }

    if (count === 0) {
        throw new Error("No valid salary records found to generate payslips.");
    }

    return await zip.generateAsync({ type: "blob" });
}

function sanitize(str) {
    return str.replace(/[^a-z0-9]/gi, '_').trim();
}

/**
 * Creates a single Payslip PDF matching Form-38 layout.
 */
async function createPayslipPDF(salaryRecord, empDetails, monthYear, subCenter, logoData) {
    // Landscape or Portrait? Form 38 is usually Portrait, but the data is wide.
    // Sticking to Portrait A4 as per typical payslips, but adjusting fonts/positions.
    const doc = new jspdf.jsPDF();

    // --- Header ---

    // 1. Logo (Top Left)
    if (logoData) {
        // x, y, width, height
        doc.addImage(logoData, 'PNG', 14, 5, 25, 12);
    }

    // 2. Company Info (Centered)
    doc.setFontSize(14); // Slightly larger for Company Name
    doc.setFont("helvetica", "bold");
    doc.text("Metal Plus Limited", 105, 10, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("House-07, Road-10, Baridhara J Block, Dhaka -1212", 105, 16, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text("Bangladesh Labor Law, Form-38", 105, 21, { align: "center" });

    // Separator Line 1
    doc.setLineWidth(0.2);
    doc.line(10, 24, 200, 24);

    // --- Title Row (Month, Circle, Subcenter) ---
    // Increased Y position to avoid overlap with header
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");

    const circle = empDetails?.projectOffice || "N/A";

    // Y=29 for this row
    doc.text(`Pay Slip- ${monthYear}`, 14, 29);
    doc.text(`Circle: ${circle}`, 90, 29);
    doc.text(`Sub Center: ${subCenter}`, 150, 29);

    // Separator Line 2
    doc.line(10, 32, 200, 32);

    // --- Data Preparation ---
    const basic = parseFloat(empDetails?.basic || 0);
    const gross = parseFloat(salaryRecord.salary || empDetails?.salary || 0);

    const idNo = salaryRecord.employeeId || "";
    const nameStr = salaryRecord.name || "";
    const designation = empDetails?.designation || "";
    const doj = formatDateForDisplay(empDetails?.joiningDate) || "";

    // Attendance logic
    const totalDays = salaryRecord.att?.totalDays || "30/31";
    const holidays = salaryRecord.att?.holidays || "0";
    const netPresent = salaryRecord.att?.netPresent || salaryRecord.daysPresent || "0";
    const actualPresent = salaryRecord.att?.actualPresent || salaryRecord.daysPresent || "0";
    const lwp = salaryRecord.att?.lwpDays || "0";
    const daysWorked = netPresent; // Usually mapped to net present for pay calculation

    // Money logic
    const basicSalary = basic.toFixed(0) + "/-";
    const others = parseFloat(empDetails?.others || 0).toFixed(0) + "/-";
    const grossSalaryStr = gross.toFixed(0) + "/-";

    const wfAmount = Math.round(basic * 0.01);
    const wf = wfAmount + "/-";

    const totalDeduct = (salaryRecord.deduction || 0);
    const netDisbursable = (salaryRecord.netSalary || 0).toFixed(0) + "/-";

    // --- Table Structure ---
    // Moved startY down to 40 to completely clear the header area (Fixing Overlap)
    const startY = 40;
    const col1X = 14;
    const col2X = 110;
    const lineHeight = 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    // Helper to draw row
    const drawRow = (label1, val1, label2, val2, y) => {
        // Col 1
        doc.text(label1, col1X, y);
        doc.text(String(val1), col1X + 40, y);

        // Col 2
        doc.text(label2, col2X, y);
        doc.text(String(val2), col2X + 40, y);
    };

    let currentY = startY;

    // Row 1
    drawRow("ID No. :", idNo, "OT Hours :", "", currentY);
    currentY += lineHeight;

    // Row 2
    drawRow("Name :", nameStr, "OT Rate :", "", currentY);
    currentY += lineHeight;

    // Row 3
    drawRow("Designation :", designation, "Net Present :", netPresent, currentY);
    currentY += lineHeight;

    // Row 4
    drawRow("DOJ :", doj, "Actual Present :", actualPresent, currentY);
    currentY += lineHeight;

    // Row 5
    drawRow("Total Working days :", totalDays, "LWP :", `${lwp}/-`, currentY);
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
    currentY += 2; // Extra gap before totals
    doc.setFont("helvetica", "bold");
    // Draw lines above totals for emphasis
    doc.line(col1X, currentY - 4, 90, currentY - 4);
    doc.line(col2X, currentY - 4, 190, currentY - 4);

    drawRow("Gross Salary :", grossSalaryStr, "Net Disbursable :", netDisbursable, currentY);
    doc.setFont("helvetica", "normal");

    // Bottom Line
    currentY += 4;
    doc.line(10, currentY, 200, currentY);

    // REMOVED: Signature section as requested.

    return doc.output('blob');
}