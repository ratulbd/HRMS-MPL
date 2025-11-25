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
    const logoData = await loadLogo();

    for (const record of salaryData) {
        if (!record.employeeId) continue;

        const project = record.project || 'Unknown Project';
        const subCenter = record.subCenter || 'Unknown SubCenter';
        const name = record.name || 'Unknown Name';
        const id = record.employeeId;

        // Generate PDF Blob
        const pdfBlob = await createStandardPayslip(record, monthYear, subCenter, logoData);

        // Folder Structure: Project -> SubCenter -> ID_Name.pdf
        const folderName = `${sanitize(project)}/${sanitize(subCenter)}`;
        const fileName = `${id}_${sanitize(name)}.pdf`;

        zip.folder(folderName).file(fileName, pdfBlob);
        count++;
    }

    if (count === 0) throw new Error("No valid salary records found.");
    return await zip.generateAsync({ type: "blob" });
}

function sanitize(str) {
    return (str || '').replace(/[^a-z0-9]/gi, '_').trim();
}

/**
 * Creates a Standard Professional Payslip PDF
 */
async function createStandardPayslip(data, monthYear, subCenter, logoData) {
    const doc = new jspdf.jsPDF();
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    // --- 1. HEADER SECTION ---
    if (logoData) {
        doc.addImage(logoData, 'PNG', 15, 10, 30, 15); // Logo
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(22, 101, 49); // Dark Green Brand Color
    doc.text("Metal Plus Limited", 50, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text("House-07, Road-10, Baridhara J Block, Dhaka -1212", 50, 24);

    // Title Box (Right Side)
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(140, 10, 55, 18, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("PAY SLIP", 167.5, 17, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(monthYear, 167.5, 24, { align: "center" });

    doc.setDrawColor(200, 200, 200);
    doc.line(15, 32, 195, 32);

    // --- 2. EMPLOYEE INFO GRID ---
    const startY = 38;
    const col1 = 15;
    const col2 = 80;
    const col3 = 130;

    doc.setFontSize(9);

    // Row 1
    doc.setFont("helvetica", "bold"); doc.text("Employee ID:", col1, startY);
    doc.setFont("helvetica", "normal"); doc.text(String(data.employeeId), col1 + 25, startY);

    doc.setFont("helvetica", "bold"); doc.text("Designation:", col2, startY);
    doc.setFont("helvetica", "normal"); doc.text(String(data.designation || "N/A"), col2 + 25, startY);

    // Row 2
    doc.setFont("helvetica", "bold"); doc.text("Name:", col1, startY + 6);
    doc.setFont("helvetica", "normal"); doc.text(String(data.name), col1 + 25, startY + 6);

    doc.setFont("helvetica", "bold"); doc.text("Date of Joining:", col2, startY + 6);
    doc.setFont("helvetica", "normal"); doc.text(formatDateForDisplay(data.joiningDate), col2 + 25, startY + 6);

    // Row 3
    doc.setFont("helvetica", "bold"); doc.text("Sub Center:", col1, startY + 12);
    doc.setFont("helvetica", "normal"); doc.text(String(subCenter), col1 + 25, startY + 12);

    doc.setFont("helvetica", "bold"); doc.text("Bank Account:", col2, startY + 12);
    doc.setFont("helvetica", "normal"); doc.text(String(data.finalAccountNo || data.bankAccount || "N/A"), col2 + 25, startY + 12);

    // --- 3. ATTENDANCE STRIP ---
    const attY = startY + 20;
    doc.setFillColor(245, 248, 245); // Very light green
    doc.rect(15, attY, 180, 12, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(15, attY, 180, 12, 'S');

    const att = data.att || {};
    const attData = [
        { l: "Total Days", v: att.totalDays || "0" },
        { l: "Holidays", v: att.holidays || "0" },
        { l: "Worked", v: att.netPresent || "0" },
        { l: "Leave", v: att.leave || "0" },
        { l: "LWP", v: att.lwpDays || "0" }
    ];

    let attX = 20;
    attData.forEach(item => {
        doc.setFont("helvetica", "bold"); doc.text(item.l, attX, attY + 5);
        doc.setFont("helvetica", "normal"); doc.text(String(item.v), attX, attY + 9);
        attX += 35;
    });

    // --- 4. EARNINGS & DEDUCTIONS TABLES ---
    const tblY = attY + 18;
    const colWidth = 88;
    const centerLine = 105;

    // Headers
    doc.setFillColor(22, 101, 49); // Brand Green
    doc.setTextColor(255, 255, 255);
    doc.rect(15, tblY, colWidth, 7, 'F'); // Earn Header
    doc.rect(centerLine + 2, tblY, colWidth, 7, 'F'); // Ded Header

    doc.setFont("helvetica", "bold");
    doc.text("EARNINGS", 15 + (colWidth/2), tblY + 5, { align: "center" });
    doc.text("DEDUCTIONS", centerLine + 2 + (colWidth/2), tblY + 5, { align: "center" });

    // Extract Data
    const earn = data.earn || {};
    const ded = data.ded || {};
    const fMoney = (val) => val ? Number(val).toLocaleString('en-IN') : "0";

    const earnRows = [
        { l: "Basic Salary", v: (earn.grossSalary || data.salary || 0) * 0.6 }, // 60% Basic logic
        { l: "House Rent & Others", v: (earn.grossSalary || data.salary || 0) * 0.4 }, // 40% Others
        { l: "Maintenance Allow.", v: earn.maint },
        { l: "Laptop Rent", v: earn.laptop },
        { l: "Other Allowance", v: earn.others },
        { l: "Food Allowance", v: earn.food },
        { l: "Station Allowance", v: earn.station },
        { l: "Hardship Allowance", v: earn.hardship },
        { l: "Arrears", v: earn.arrear }
    ].filter(r => r.v > 0);

    const dedRows = [
        { l: "TDS / Tax", v: ded.tds },
        { l: "Provident Fund (CPF)", v: ded.cpf },
        { l: "Welfare Fund", v: ded.welfare },
        { l: "Subsidized Lunch", v: ded.lunch },
        { l: "Vehicle/Bike Loan", v: (ded.vehicle || 0) + (ded.bike || 0) },
        { l: "Salary/Other Loan", v: ded.loan },
        { l: "Adjustments", v: ded.adj },
        { l: "Absent Deduction", v: ded.attDed }
    ].filter(r => r.v > 0);

    // Draw Rows
    let currentY = tblY + 12;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");

    const maxRows = Math.max(earnRows.length, dedRows.length);

    for (let i = 0; i < maxRows; i++) {
        // Earnings Side
        if (earnRows[i]) {
            doc.text(earnRows[i].l, 17, currentY);
            doc.text(fMoney(earnRows[i].v), 15 + colWidth - 2, currentY, { align: "right" });
        }
        // Deductions Side
        if (dedRows[i]) {
            doc.text(dedRows[i].l, centerLine + 4, currentY);
            doc.text(fMoney(dedRows[i].v), centerLine + 2 + colWidth - 2, currentY, { align: "right" });
        }
        // Light line
        doc.setDrawColor(240, 240, 240);
        doc.line(15, currentY + 2, 15 + colWidth, currentY + 2);
        doc.line(centerLine + 2, currentY + 2, centerLine + 2 + colWidth, currentY + 2);

        currentY += 7;
    }

    // --- 5. TOTALS SECTION ---
    currentY += 5;
    doc.setDrawColor(100, 100, 100);
    doc.line(15, currentY, 195, currentY); // Top Line
    currentY += 7;

    const grossTotal = earn.grossPayable || ((earn.grossSalary || 0) + (earn.maint||0) + (earn.others||0));
    const dedTotal = ded.totalDeduction || 0;
    const netPay = data.netPayment || data.netSalary || (grossTotal - dedTotal);

    doc.setFont("helvetica", "bold");
    doc.text("Total Earnings:", 60, currentY, { align: "right" });
    doc.text(fMoney(grossTotal), 15 + colWidth - 2, currentY, { align: "right" });

    doc.text("Total Deductions:", 155, currentY, { align: "right" });
    doc.text(fMoney(dedTotal), centerLine + 2 + colWidth - 2, currentY, { align: "right" });

    // Net Pay Highlight
    currentY += 10;
    doc.setFillColor(240, 255, 240); // Light Mint
    doc.setDrawColor(22, 101, 49);
    doc.roundedRect(15, currentY, 180, 15, 2, 2, 'FD');

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("NET SALARY PAYABLE", 25, currentY + 10);

    doc.setFontSize(14);
    doc.setTextColor(22, 101, 49);
    doc.text(`BDT ${fMoney(netPay)}`, 190, currentY + 10, { align: "right" });

    // Amount in words (simplified)
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    // Note: Actual number-to-words is complex in JS without a library,
    // placeholder used or rely on backend passed value if available.
    doc.text("* Computer generated document.", 15, currentY + 22);


    // --- 6. FOOTER (Green Bar + Corporate Office) ---
    // Mimicking the attached image footer
    const footerY = 275;

    // Green Bar
    doc.setFillColor(75, 107, 62); // Corporate Olive/Green
    doc.rect(0, footerY, 210, 22, 'F'); // Full width bar

    // Corporate Office Text
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0); // Black text above the bar like the image
    doc.text("Metal Plus Limited", 15, footerY - 8);

    doc.setFontSize(8);
    doc.text("Corporate Office:", 15, footerY - 4);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("PBL Tower (12th & 14th Floor), 17 North C/A. Gulshan Circle-2, Dhaka-1212, Bangladesh.", 15, footerY);
    doc.text("Phone: +880-2-9884549. www.metalplusltdbd.com", 15, footerY + 4);

    return doc.output('blob');
}