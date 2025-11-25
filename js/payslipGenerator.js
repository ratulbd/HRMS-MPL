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

    // Iterate through salary data
    for (const record of salaryData) {
        if (!record.employeeId) continue;

        // Use the record itself as it contains the archived snapshot of details
        // Fallback to employeeDB if needed, but archive is safer for historical accuracy
        const project = record.project || 'Unknown Project';
        const subCenter = record.subCenter || 'Unknown SubCenter';
        const name = record.name || 'Unknown Name';
        const id = record.employeeId;

        // Generate PDF Blob
        const pdfBlob = await createPayslipPDF(record, monthYear, subCenter, logoData);

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
    return (str || '').replace(/[^a-z0-9]/gi, '_').trim();
}

/**
 * Creates a single Payslip PDF matching Form-38 layout.
 */
async function createPayslipPDF(salaryRecord, monthYear, subCenter, logoData) {
    const doc = new jspdf.jsPDF();

    // --- Header ---
    if (logoData) {
        doc.addImage(logoData, 'PNG', 14, 5, 25, 12);
    }

    // Company Name
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Metal Plus Limited", 105, 10, { align: "center" });

    // Address
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("House-07, Road-10, Baridhara J Block, Dhaka -1212", 105, 16, { align: "center" });

    // Form Name
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text("Bangladesh Labor Law, Form-38", 105, 21, { align: "center" });

    // Separator Line 1
    doc.setLineWidth(0.2);
    doc.line(10, 24, 200, 24);

    // --- Title Row ---
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");

    // Circle (Project Office)
    const circle = salaryRecord.projectOffice || "N/A";

    doc.text(`Pay Slip- ${monthYear}`, 14, 29);
    doc.text(`Circle: ${circle}`, 90, 29);
    doc.text(`Sub Center: ${subCenter}`, 150, 29);

    // Separator Line 2
    doc.line(10, 32, 200, 32);

    // --- Data Extraction Helpers ---
    // Ensure we are reading from the nested objects if they exist, or flat props
    const earn = salaryRecord.earn || {};
    const ded = salaryRecord.ded || {};
    const att = salaryRecord.att || {};

    const formatMoney = (val) => {
        if (val === undefined || val === null || val === 0 || val === "0") return "";
        return Number(val).toFixed(0) + "/-";
    };

    // Specific helper for fields where 0 should show as "0/-" (like LWP, WF)
    const formatMoneyZero = (val) => {
        const num = Number(val || 0);
        return num.toFixed(0) + "/-";
    };

    // --- Values ---
    const idNo = salaryRecord.employeeId || "";
    const nameStr = salaryRecord.name || "";
    const designation = salaryRecord.designation || "";
    const doj = formatDateForDisplay(salaryRecord.joiningDate) || "";

    const totalDays = att.totalDays || "30/31";
    const holidays = att.holidays || "0";
    // Net present usually equals Days Worked for pay calculation
    const netPresent = att.netPresent || salaryRecord.daysPresent || "0";
    const actualPresent = att.actualPresent || salaryRecord.daysPresent || "0";
    const lwpVal = att.lwpDays || 0;

    // Earnings
    // Note: 'salary' in record is usually Gross. Basic is calculated or stored.
    // If Basic isn't explicitly in 'earn', assume 60% of Gross (standard structure in your sheet logic)
    const grossVal = earn.grossSalary || salaryRecord.salary || 0;
    const basicVal = grossVal * 0.6;

    const basicSalary = formatMoney(basicVal);
    const others = formatMoney(grossVal * 0.4); // 40% is others

    // Deductions & Loans
    const subVehicle = formatMoney(ded.vehicle);
    const bikeLoan = formatMoney(ded.bike);
    const subLunch = formatMoney(ded.lunch);
    const othersLoan = formatMoney(ded.loan);
    const wf = formatMoneyZero(ded.welfare); // WF usually shows even if small
    const cpf = formatMoney(ded.cpf);
    const tds = formatMoney(ded.tds);

    const totalDeduct = formatMoneyZero(ded.totalDeduction || salaryRecord.deduction);
    const grossSalaryStr = formatMoneyZero(grossVal);
    const netDisbursable = formatMoneyZero(salaryRecord.netPayment || salaryRecord.netSalary);

    // --- Table Rendering ---
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
    // LWP shows "0/-" if 0
    drawRow("Total Working days :", totalDays, "LWP :", formatMoneyZero(lwpVal), currentY);
    currentY += lineHeight;

    // Row 6
    drawRow("Leave", "", "Subsidize Vehicle", subVehicle, currentY);
    currentY += lineHeight;

    // Row 7
    drawRow("Holidays :", holidays, "Motor Bike Loan", bikeLoan, currentY);
    currentY += lineHeight;

    // Row 8
    drawRow("Basic Salary :", basicSalary, "Ttl Absent days :", "", currentY);
    currentY += lineHeight;

    // Row 9
    drawRow("House Rent :", "", "Days worked :", netPresent, currentY);
    currentY += lineHeight;

    // Row 10
    drawRow("Medical :", "", "Sub Lunch", subLunch, currentY);
    currentY += lineHeight;

    // Row 11
    drawRow("Convenes :", "", "Others Loan", othersLoan, currentY);
    currentY += lineHeight;

    // Row 12
    drawRow("Food & Station Allowance :", "", "Advance :", "", currentY);
    currentY += lineHeight;

    // Row 13
    drawRow("Others :", others, "WF :", wf, currentY);
    currentY += lineHeight;

    // Row 14
    drawRow("Arrear", "", "CPF", cpf, currentY);
    currentY += lineHeight;

    // Row 15
    drawRow("Other Allowances", "", "Station Allowance", "", currentY);
    currentY += lineHeight;

    // Row 16
    drawRow("Attendance Bonus :", "", "TDS", tds, currentY);
    currentY += lineHeight;

    // Row 17
    drawRow("OT Allowanced :", "", "Total Deduct :", totalDeduct, currentY);
    currentY += lineHeight;

    // Row 18 (Totals)
    currentY += 2;
    doc.setFont("helvetica", "bold");

    // Draw lines for emphasis on totals
    doc.line(col1X, currentY - 4, 90, currentY - 4);
    doc.line(col2X, currentY - 4, 190, currentY - 4);

    drawRow("Gross Salary :", grossSalaryStr, "Net Disbursable :", netDisbursable, currentY);
    doc.setFont("helvetica", "normal");

    // Bottom Line
    currentY += 4;
    doc.line(10, currentY, 200, currentY);

    return doc.output('blob');
}