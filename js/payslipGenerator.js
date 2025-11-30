// js/payslipGenerator.js
import { formatDateForDisplay } from './utils.js';

// Helper: Load AND Resize logo - Improved quality settings
async function loadLogo() {
    try {
        const response = await fetch('/assets/logo.png');
        if (!response.ok) throw new Error("Logo missing");
        const blob = await response.blob();

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const targetWidth = 350;
                const scale = targetWidth / img.width;
                const targetHeight = img.height * scale;

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                resolve({
                    data: canvas.toDataURL('image/png', 1.0),
                    ratio: targetWidth / targetHeight
                });
            };
            img.onerror = () => resolve(null);
            img.src = URL.createObjectURL(blob);
        });
    } catch (e) {
        console.warn("Could not load logo for payslip:", e);
        return null;
    }
}

// Helper: Convert Decimal Hours to HH:MM format
function formatDecimalToTime(val) {
    const num = parseFloat(val);
    if (isNaN(num) || num === 0) return "00:00";

    const hours = Math.floor(num);
    const minutes = Math.round((num - hours) * 60);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function sanitize(str) {
    return (str || '').replace(/[^a-z0-9]/gi, '_').trim();
}

export async function generatePayslipsZip(salaryData, employeeDB, monthYear) {
    const zip = new JSZip();
    let count = 0;
    const logoObj = await loadLogo();

    for (const record of salaryData) {
        if (!record.employeeId) continue;

        if (count % 20 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const project = record.project || 'Unknown Project';
        const subCenter = record.subCenter || 'Unknown SubCenter';
        const name = record.name || 'Unknown Name';
        const id = record.employeeId;

        const pdfBlob = await createStandardPayslip(record, monthYear, subCenter, logoObj);

        const folderName = `${sanitize(project)}/${sanitize(subCenter)}`;
        const fileName = `${id}_${sanitize(name)}.pdf`;

        zip.folder(folderName).file(fileName, pdfBlob);
        count++;
    }

    if (count === 0) throw new Error("No valid salary records found.");

    return await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
    });
}

/**
 * Creates a Standard Professional Payslip PDF
 */
async function createStandardPayslip(data, monthYear, subCenter, logoObj) {
    const doc = new jspdf.jsPDF({ compress: true });

    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- 1. HEADER SECTION ---
    if (logoObj) {
        const logoH = 15;
        const logoW = logoH * logoObj.ratio;
        doc.addImage(logoObj.data, 'PNG', 15, 10, logoW, logoH);
    } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.setTextColor(22, 101, 49);
        doc.text("Metal Plus Limited", 15, 20);
    }

    // Title Box
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(140, 10, 55, 18, 1, 1, 'FD');

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text("PAY SLIP", 167.5, 17, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(monthYear, 167.5, 24, { align: "center" });

    doc.setDrawColor(200, 200, 200);
    doc.line(15, 32, 195, 32);

    // --- 2. EMPLOYEE INFO GRID ---
    const startY = 38;
    const col1 = 15;
    const col2 = 115;

    doc.setFontSize(9);

    const drawLabelVal = (lbl, val, x, y) => {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(lbl, x, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 50, 50);
        doc.text(String(val), x + 30, y);
    };

    const att = data.att || {};
    const earn = data.earn || {};

    // Row 1
    drawLabelVal("Employee ID:", data.employeeId, col1, startY);
    drawLabelVal("Designation:", data.designation || "N/A", col2, startY);

    // Row 2
    drawLabelVal("Name:", data.name, col1, startY + 6);
    drawLabelVal("Joining Date:", formatDateForDisplay(data.joiningDate), col2, startY + 6);

    // Row 3
    drawLabelVal("Sub Center:", subCenter, col1, startY + 12);

    // --- 3. ATTENDANCE STRIP ---
    const attY = startY + 20;
    doc.setFillColor(245, 248, 245);
    doc.setDrawColor(22, 101, 49);
    doc.rect(15, attY, 180, 14, 'FD');

    const attData = [
        { l: "Total Days", v: att.totalDays ?? "0" },
        { l: "Holidays", v: att.holidays ?? "0" },
        { l: "Worked", v: att.netPresent ?? "0" },
        { l: "OT Hours", v: formatDecimalToTime(att.otHours) },
        { l: "Leave", v: att.leave ?? "0" },
        { l: "LWP", v: att.lwpDays ?? "0" }
    ];

    let attX = 20;
    const spacing = 30;

    attData.forEach(item => {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 101, 49);
        doc.setFontSize(8);
        doc.text(item.l, attX, attY + 5);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.text(String(item.v), attX, attY + 10);

        attX += spacing;
    });

    // --- 4. EARNINGS & DEDUCTIONS TABLES ---
    const tblY = attY + 20;
    const colWidth = 88;
    const centerLine = 105;

    doc.setFillColor(22, 101, 49);
    doc.setTextColor(255, 255, 255);
    doc.rect(15, tblY, colWidth, 7, 'F');
    doc.rect(centerLine + 2, tblY, colWidth, 7, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("EARNINGS", 15 + (colWidth/2), tblY + 5, { align: "center" });
    doc.text("DEDUCTIONS", centerLine + 2 + (colWidth/2), tblY + 5, { align: "center" });

    const ded = data.ded || {};
    const fMoney = (val) => (val !== undefined && val !== null) ? Number(val).toLocaleString('en-IN') : "0";

    const earnRows = [
        { l: "Basic", v: earn.basic },
        { l: "Others", v: earn.others },
        { l: "Motobike / Car Maintenance Allowance", v: earn.maint },
        { l: "Laptop Rent", v: earn.laptop },
        { l: "Others Allowance", v: earn.othersAll || earn.othersAllowance },
        { l: "Arrear", v: earn.arrear },
        { l: "Food Allowance", v: earn.food },
        { l: "Station Allowance", v: earn.station },
        { l: "Hardship Allowance", v: earn.hardship },
        { l: "OT Amount", v: earn.otAmount },
        // NEW ROW for Cash Payment
        { l: "Cash Payment", v: earn.cashPayment }
    ];

    const dedRows = [
        { l: "Subsidized Lunch", v: ded.lunch },
        { l: "TDS", v: ded.tds },
        { l: "Motorbike Loan", v: ded.bike },
        { l: "Welfare Fund", v: ded.welfare },
        { l: "Salary/ Others Loan", v: ded.loan },
        { l: "Subsidized Vehicle", v: ded.vehicle },
        { l: "CPF", v: ded.cpf },
        { l: "Others Adjustment", v: ded.adj },
        { l: "Attendance Deduction", v: ded.attDed }
    ];

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

        doc.setDrawColor(220, 220, 220);
        doc.setLineDash([1, 1], 0);
        doc.line(15, currentY + 2, 15 + colWidth, currentY + 2);
        doc.line(centerLine + 2, currentY + 2, centerLine + 2 + colWidth, currentY + 2);
        doc.setLineDash([]);

        currentY += 7;
    }

    // --- 5. TOTALS SECTION ---
    currentY += 5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(15, currentY, 195, currentY);
    currentY += 7;

    const totalEarnCalc = earnRows.reduce((s, r) => s + (Number(r.v) || 0), 0);
    const totalDedCalc = dedRows.reduce((s, r) => s + (Number(r.v) || 0), 0);

    // Use data.netPayment if available (it has been calculated as Bank+Cash in salarySheet.js),
    // otherwise fallback to earn-ded calculation
    const netPay = data.netPayment || (totalEarnCalc - totalDedCalc);

    doc.setFont("helvetica", "bold");
    doc.text("Total Earnings:", 60, currentY, { align: "right" });
    doc.text(fMoney(totalEarnCalc), 15 + colWidth - 2, currentY, { align: "right" });

    doc.text("Total Deductions:", 155, currentY, { align: "right" });
    doc.text(fMoney(totalDedCalc), centerLine + 2 + colWidth - 2, currentY, { align: "right" });

    currentY += 10;
    doc.setFillColor(240, 255, 240);
    doc.setDrawColor(22, 101, 49);
    doc.setLineWidth(0.4);
    doc.roundedRect(15, currentY, 180, 14, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("NET SALARY PAYABLE", 25, currentY + 9);

    doc.setFontSize(14);
    doc.setTextColor(22, 101, 49);
    doc.text(`BDT ${fMoney(netPay)}`, 190, currentY + 9, { align: "right" });

    // --- 6. FOOTER ---
    const footerBarHeight = 15;
    const footerBarY = pageHeight - footerBarHeight;
    const addressBlockY = footerBarY - 18;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Metal Plus Limited", 15, addressBlockY);

    doc.setFontSize(9);
    doc.text("Corporate Office:", 15, addressBlockY + 5);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text("PBL Tower (12th & 14th floor), 17 North C/A. Gulshan Circle-2, Dhaka-1212, Bangladesh. Phone: +880-2-9884549.", 15, addressBlockY + 10);
    doc.text("www.metalplusltdbd.com", 15, addressBlockY + 14);

    doc.setFillColor(75, 107, 62);
    doc.rect(0, footerBarY, pageWidth, footerBarHeight, 'F');

    return doc.output('blob');
}