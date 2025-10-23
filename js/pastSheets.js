// js/pastSheets.js
import { $, openModal, closeModal, customAlert } from './utils.js';
import { apiCall } from './apiClient.js';
import { displaySalarySheet } from './salarySheet.js'; // To display the sheet

async function fetchAndDisplayPastSheets() {
    const listEl = $('pastSheetsList');
    if (!listEl) return;
    listEl.innerHTML = '<p class="text-gray-500 text-center">Loading...</p>'; // Loading indicator

    try {
        const sheets = await apiCall('getPastSheets');
        sheets.sort((a, b) => b.sheetId.localeCompare(a.sheetId)); // Sort descending by ID (YYYY-MM)

        listEl.innerHTML = ''; // Clear loading/previous
        if (!sheets || sheets.length === 0) {
            listEl.innerHTML = '<p class="text-gray-500 text-center">No past salary sheets found.</p>';
            return;
        }

        sheets.forEach(sheet => {
            try {
                 const date = new Date(`${sheet.sheetId}-01T12:00:00Z`); // Use UTC
                 const monthName = date.toLocaleString('default', { month: 'long', timeZone: 'UTC' });
                 const year = date.getUTCFullYear();
                 const displayDate = `${monthName}, ${year}`;

                 const item = document.createElement('div');
                 item.className = "p-4 border border-gray-200 rounded-lg flex justify-between items-center";
                 item.innerHTML = `
                     <div>
                         <p class="font-semibold text-gray-800">${displayDate}</p>
                         <p class="text-sm text-gray-500">ID: ${sheet.sheetId}</p>
                     </div>
                     <button data-sheetid="${sheet.sheetId}" class="view-past-sheet-btn btn btn-secondary text-sm">View</button>
                 `;
                 listEl.appendChild(item);
             } catch (e) {
                  console.warn(`Could not parse sheet ID as date: ${sheet.sheetId}`);
                   // Optionally display item with just ID if date parsing fails
             }
        });
    } catch (error) {
        customAlert("Error", `Failed to load past sheets: ${error.message}`);
        listEl.innerHTML = '<p class="text-red-500 text-center">Could not load past sheets.</p>';
    }
}

async function viewPastSheet(sheetId) {
    if (!sheetId) return;
    try {
        const result = await apiCall(`getSheetData&sheetId=${sheetId}`); // Pass sheetId in query
        if (result && result.sheetData) {
            closeModal('viewSheetsModal'); // Close the list modal
            displaySalarySheet(result.sheetData, result.sheetId); // Display the specific sheet
        } else {
            customAlert("Error", `No data found for sheet ${sheetId}. It might be empty or improperly formatted.`);
        }
    } catch (error) {
        customAlert("Error", `Failed to load sheet data for ${sheetId}: ${error.message}`);
    }
}


export function setupPastSheetsModal() {
    const openBtn = $('viewSheetsBtn');
    const closeBtn = $('closePastSheetsModal');
    const listContainer = $('pastSheetsList');

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            openModal('viewSheetsModal');
            fetchAndDisplayPastSheets(); // Fetch list when modal opens
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => closeModal('viewSheetsModal'));

    if (listContainer) {
        listContainer.addEventListener('click', async (e) => {
            if (e.target && e.target.classList.contains('view-past-sheet-btn')) {
                const sheetId = e.target.dataset.sheetid;
                await viewPastSheet(sheetId);
            }
        });
    }
}