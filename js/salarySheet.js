// js/salarySheet.js
import { $, openModal, closeModal, customAlert } from './utils.js';
import { apiCall } from './apiClient.js';

let getMainLocalEmployeesFunc = null;

function parseAttendanceCSV(data) {
    // ... (copy your parseAttendanceCSV logic) ...
     try {
         const lines = data.split(/[\r\n]+/).filter(line => line.trim() !== '');
         if (lines.length < 1) throw new Error("CSV empty");
         const header = lines.shift().toLowerCase().split(',').map(h => h.trim());
         const idIndex = header.indexOf('employeeid'); const daysIndex = header.indexOf('dayspresent');
         if (idIndex === -1 || daysIndex === -1) throw new Error("Missing 'employeeid' or 'dayspresent' column.");
         const attendanceMap = new Map();
         lines.forEach(line => {
             const values = line.split(','); // Simple split ok for this format
             if (values.length > Math.max(idIndex, daysIndex)) {
                 const empId = values[idIndex].trim();
                 const days = parseInt(values[daysIndex].trim(), 10);
                 if (empId && !isNaN(days)) attendanceMap.set(empId, days);
                 else console.warn(`Skipping invalid attendance line: ${line}`);
             } else console.warn(`Skipping short attendance line: ${line}`);
         });
         return attendanceMap;
     } catch (error) {
         customAlert("CSV Parse Error", `Could not read attendance file: ${error.message}`);
         console.error("Attendance CSV Error:", error);
         return null;
     }
}

export function displaySalarySheet(sheetData, monthYear) {
    const sheetModal = $('salarySheetModal');
    if (!sheetModal) return;

    const date = new Date(`${monthYear}-01T12:00:00Z`); // Use UTC to avoid timezone issues
    const monthName = date.toLocaleString('default', { month: 'long', timeZone: 'UTC' });
    const year = date.getUTCFullYear();
    $('sheetMonthYear').textContent = `For ${monthName}, ${year}`;

    const tableBody = $('salarySheetBody');
    if (!tableBody) return;
    tableBody.innerHTML = ''; // Clear previous

    sheetData.forEach(row => {
        const paymentStatusClass = row.status === 'Held' ? 'status-badge status-held' : 'text-gray-600';
        const tr = document.createElement('tr');
         // Add Tailwind classes for table cells
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${row.employeeId || ''}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${row.name || ''}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₹${Number(row.salary || 0).toLocaleString('en-IN')}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${row.daysPresent ?? 0}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₹${Number(row.deduction || 0).toLocaleString('en-IN')}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">₹${Number(row.netSalary || 0).toLocaleString('en-IN')}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm"><span class="${paymentStatusClass}">${row.status || ''}</span></td>
        `;
        tableBody.appendChild(tr);
    });
    openModal('salarySheetModal');
}


async function generateAndSaveSalarySheet(attendance, monthYear) {
    if (!getMainLocalEmployeesFunc) {
        customAlert("Error", "Initialization error in salary sheet generation.");
        return;
    }
    const currentEmployees = getMainLocalEmployeesFunc();
    const [year, month] = monthYear.split('-');
    const daysInMonth = new Date(year, month, 0).getDate(); // Days in the selected month

    if (isNaN(daysInMonth) || daysInMonth <= 0) {
        customAlert("Error", "Invalid month selected.");
        return;
    }

    const sheetData = [];
    // Include Active and Salary Held employees in the sheet calculation
    const relevantEmployees = currentEmployees.filter(e => e.status === 'Active' || e.status === 'Salary Held');

    relevantEmployees.forEach(emp => {
        const daysPresent = attendance.get(emp.employeeId) ?? 0; // Use ?? for nullish coalescing
        const grossSalary = parseFloat(emp.salary) || 0;
        let netSalary = 0, deduction = grossSalary, paymentStatus = "Paid";
        const isHeld = (emp.salaryHeld === true || String(emp.salaryHeld).toUpperCase() === 'TRUE');

        if (isHeld) {
            netSalary = 0;
            deduction = grossSalary; // Full deduction if held
            paymentStatus = "Held";
        } else if (daysPresent > 0 && daysInMonth > 0) {
            netSalary = Math.round((grossSalary / daysInMonth) * daysPresent);
            deduction = grossSalary - netSalary;
        } else {
             netSalary = 0; // No days present or invalid month
             deduction = grossSalary;
             paymentStatus = "Not Paid"; // Or some other status
        }

        sheetData.push({
            employeeId: emp.employeeId,
            name: emp.name,
            salary: grossSalary, // Gross Salary
            daysPresent: daysPresent,
            deduction: deduction < 0 ? 0 : deduction, // Ensure deduction isn't negative
            netSalary: netSalary < 0 ? 0 : netSalary, // Ensure net isn't negative
            status: paymentStatus // Paid, Held, Not Paid, etc.
        });
    });

    try {
        await apiCall('saveSheet', 'POST', { sheetId: monthYear, sheetData });
        closeModal('attendanceModal'); // Close the generation modal
        displaySalarySheet(sheetData, monthYear); // Display the generated sheet
        customAlert("Success", `Salary sheet for ${monthYear} generated and saved.`);
    } catch (error) {
        customAlert("Error", `Failed to save salary sheet: ${error.message}`);
    }
}

export function setupSalarySheetModal(getEmployeesFunc) {
    getMainLocalEmployeesFunc = getEmployeesFunc;

    const openBtn = $('uploadAttendanceBtn');
    const cancelBtn = $('cancelAttendanceModal');
    const form = $('attendanceForm');
    const closeSheetBtn = $('closeSheetModal');

    if (openBtn) openBtn.addEventListener('click', () => {
        form?.reset();
        // Set default month to previous month
        const today = new Date();
        today.setMonth(today.getMonth() - 1);
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const salaryMonthInput = $('salaryMonth');
        if (salaryMonthInput) salaryMonthInput.value = `${year}-${month}`;
        openModal('attendanceModal');
    });

    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('attendanceModal'));
    if (closeSheetBtn) closeSheetBtn.addEventListener('click', () => closeModal('salarySheetModal'));

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = $('attendanceFile');
            const file = fileInput?.files?.[0];
            const monthYearInput = $('salaryMonth');
            const monthYear = monthYearInput?.value;

            if (!file || !monthYear) {
                customAlert("Warning", "Please select both a month and an attendance file.");
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                const csvData = event.target.result;
                const attendance = parseAttendanceCSV(csvData);
                if (attendance !== null) { // Check for null from parser error
                    await generateAndSaveSalarySheet(attendance, monthYear);
                }
                 if(fileInput) fileInput.value = ''; // Reset file input
            };
            reader.onerror = () => {
                 customAlert("Error", "Failed to read the attendance file.");
                 if(fileInput) fileInput.value = '';
            };
            reader.readAsText(file);
        });
    }
}