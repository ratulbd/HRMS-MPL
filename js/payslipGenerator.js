// js/payslipGenerator.js
import { formatDateForDisplay } from './utils.js';

// Helper: Load AND Resize logo to reduce file size significantly
async function loadLogo() {
    try {
        const response = await fetch('/assets/logo.png');
        if (!response.ok) throw new Error("Logo missing");
        const blob = await response.blob();

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Resize image to small dimension (e.g., width 150px) to save MBs
                const canvas = document.createElement('canvas');
                const scale = 150 / img.width;
                canvas.width = 150;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/png', 0.8)); // 0.8 quality
            };
            img.onerror = () => resolve(null);
            img.src = URL.createObjectURL(blob);
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

        // Yield to UI thread every 20 records to keep spinner moving
        if (count % 20 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const project = record.project || 'Unknown Project';
        const subCenter = record.subCenter || 'Unknown SubCenter';
        const name = record.name || 'Unknown Name';
        const id = record.employeeId;

        // Generate PDF Blob
        const pdfBlob = await createStandardPayslip(record, monthYear, subCenter, logoData);

        // Folder: Project -> SubCenter -> ID_Name.pdf
        const folderName = `${sanitize(project)}/${sanitize(subCenter)}`;
        const fileName = `${id}_${sanitize(name)}.pdf`;

        zip.folder(folderName).file(fileName, pdfBlob);
        count++;
    }

    if (count === 0) throw new Error("No valid salary records found.");

    // Generate ZIP with Compression
    return await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 } // Balanced compression
    });
}

function sanitize(str) {
    return (str || '').replace(/[^a-z0-9]/gi, '_').trim();
}

/**
 * Creates a Standard Professional Payslip PDF
 */
async function createStandardPayslip(data, monthYear, subCenter, logoData) {
    // Enable PDF compression to reduce file size
    const doc = new jspdf.jsPDF({ compress: true });

    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- 1. HEADER SECTION ---
    if (logoData) {
        doc.addImage(logoData, 'PNG', 15, 10, 30, 15); // Logo
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(22, 101, 49); // Dark Green
    doc.text("Metal Plus Limited", 50, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    // Shortened address line to fit better if needed, or matched exactly
    doc.text("House-07, Road-10, Baridhara J Block, Dhaka -1212", 50, 24);

    // Title Box (Right Side)
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(140, 10, 55, 18, 1, 1, 'FD');
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

    doc.setFontSize(9);

    const drawLabelVal = (lbl, val, x, y) => {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(lbl, x, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 50, 50);
        doc.text(String(val), x + 30, y);
    };

    // Row 1
    drawLabelVal("Employee ID:", data.employeeId, col1, startY);
    drawLabelVal("Designation:", data.designation || "N/A", col2, startY);

    // Row 2
    drawLabelVal("Name:", data.name, col1, startY + 6);
    drawLabelVal("Joining Date:", formatDateForDisplay(data.joiningDate), col2, startY + 6);

    // Row 3
    drawLabelVal("Sub Center:", subCenter, col1, startY + 12);
    // Optional: Bank Account
    // drawLabelVal("Bank Acc:", data.finalAccountNo || "N/A", col2, startY + 12);

    // --- 3. ATTENDANCE STRIP ---
    const attY = startY + 20;
    doc.setFillColor(245, 248, 245); // Very light green
    doc.setDrawColor(22, 101, 49); // Dark Green Border
    doc.rect(15, attY, 180, 14, 'FD');

    const att = data.att || {};
    const attData = [
        { l: "Total Days", v: att.totalDays || "0" },
        { l: "Holidays", v: att.holidays || "0" },
        { l: "Worked", v: att.netPresent || "0" },
        { l: "Leave", v: att.leave || "0" },
        { l: "LWP", v: att.lwpDays || "0" }
    ];

    let attX = 22;
    attData.forEach(item => {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 101, 49);
        doc.setFontSize(8);
        doc.text(item.l, attX, attY + 5);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.text(String(item.v), attX, attY + 10);
        attX += 35;
    });

    // --- 4. EARNINGS & DEDUCTIONS TABLES ---
    const tblY = attY + 20;
    const colWidth = 88;
    const centerLine = 105;

    // Headers
    doc.setFillColor(22, 101, 49); // Brand Green
    doc.setTextColor(255, 255, 255);
    doc.rect(15, tblY, colWidth, 7, 'F'); // Earn Header
    doc.rect(centerLine + 2, tblY, colWidth, 7, 'F'); // Ded Header

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("EARNINGS", 15 + (colWidth/2), tblY + 5, { align: "center" });
    doc.text("DEDUCTIONS", centerLine + 2 + (colWidth/2), tblY + 5, { align: "center" });

    // Extract Data
    const earn = data.earn || {};
    const ded = data.ded || {};
    const fMoney = (val) => val ? Number(val).toLocaleString('en-IN') : "0";

    const earnRows = [
        { l: "Basic Salary", v: (earn.grossSalary || data.salary || 0) * 0.6 },
        { l: "House Rent & Others", v: (earn.grossSalary || data.salary || 0) * 0.4 },
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
    doc.setFontSize(9);

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

        // Dotted Line
        doc.setDrawColor(220, 220, 220);
        doc.setLineDash([1, 1], 0);
        doc.line(15, currentY + 2, 15 + colWidth, currentY + 2);
        doc.line(centerLine + 2, currentY + 2, centerLine + 2 + colWidth, currentY + 2);
        doc.setLineDash([]); // Reset

        currentY += 7;
    }

    // --- 5. TOTALS SECTION ---
    currentY += 5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(15, currentY, 195, currentY); // Solid Line
    currentY += 7;

    const grossTotal = earn.grossPayable || ((earn.grossSalary || 0) + (earn.maint||0) + (earn.others||0));
    const dedTotal = ded.totalDeduction || 0;
    const netPay = data.netPayment || data.netSalary || (grossTotal - dedTotal);

    doc.setFont("helvetica", "bold");
    doc.text("Total Earnings:", 60, currentY, { align: "right" });
    doc.text(fMoney(grossTotal), 15 + colWidth - 2, currentY, { align: "right" });

    doc.text("Total Deductions:", 155, currentY, { align: "right" });
    doc.text(fMoney(dedTotal), centerLine + 2 + colWidth - 2, currentY, { align: "right" });

    // Net Pay Highlight Box
    currentY += 10;
    doc.setFillColor(240, 255, 240); // Light Mint
    doc.setDrawColor(22, 101, 49);
    doc.setLineWidth(0.4);
    doc.roundedRect(15, currentY, 180, 14, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("NET SALARY PAYABLE", 25, currentY + 9);

    doc.setFontSize(14);
    doc.setTextColor(22, 101, 49);
    doc.text(`BDT ${fMoney(netPay)}`, 190, currentY + 9, { align: "right" });

    // --- 6. FOOTER (Minimal Margin / Overlap Fix) ---
    // According to image_76bfd2.png:
    // "Corporate Office:" and Address are in WHITE space ABOVE the green bar.
    // The Green Bar contains Phone/Web in WHITE text.

    // Bottom of A4 is ~297mm.
    const footerH = 12; // Height of green bar
    const footerY = pageHeight - footerH; // Start of green bar (approx 285)

    // 1. Corporate Office Text (Black/Grey) - Sitting above the green bar
    const addressY = footerY - 14;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Corporate Office:", 15, addressY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text("PBL Tower (12th & 14th Floor), 17 North C/A. Gulshan Circle-2, Dhaka-1212, Bangladesh.", 15, addressY + 4);

    // 2. Green Bar (Full Width)
    doc.setFillColor(75, 107, 62); // The Olive/Green from image
    doc.rect(0, footerY, pageWidth, footerH, 'F');

    // 3. Text Inside Green Bar (White)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("Phone: +880-2-9884549. www.metalplusltdbd.com", 15, footerY + 8);

    return doc.output('blob');
}