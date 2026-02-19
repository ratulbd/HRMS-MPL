import { apiCall } from './apiClient.js';
import { customAlert, showLoading, hideLoading } from './utils.js';

const leaveModalHtml = `
<div id="leaveModal" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop hidden p-4">
    <div class="bg-white rounded-lg shadow-2xl w-full max-w-md modal flex flex-col max-h-[90vh]">
        <div class="p-6 border-b flex-shrink-0">
            <h2 class="font-poppins text-2xl font-semibold text-gray-900">Apply for Leave</h2>
        </div>
        <div class="p-6 flex-grow overflow-y-auto">
            <form id="leaveForm">
                <div class="space-y-4">
                    <div>
                        <label for="leaveEmpId" class="block text-sm font-medium text-gray-700">Employee ID</label>
                        <input type="text" id="leaveEmpId" class="input" required>
                    </div>
                    <div>
                        <label for="leaveType" class="block text-sm font-medium text-gray-700">Leave Type</label>
                        <select id="leaveType" class="input-select" required>
                            <option value="Casual">Casual Leave</option>
                            <option value="Sick">Sick Leave</option>
                            <option value="Earned">Earned Leave</option>
                            <option value="LWP">Leave Without Pay (LWP)</option>
                        </select>
                    </div>
                    <div>
                        <label for="leaveStartDate" class="block text-sm font-medium text-gray-700">Start Date</label>
                        <input type="date" id="leaveStartDate" class="input" required>
                    </div>
                    <div>
                        <label for="leaveEndDate" class="block text-sm font-medium text-gray-700">End Date</label>
                        <input type="date" id="leaveEndDate" class="input" required>
                    </div>
                    <div>
                        <label for="leaveReason" class="block text-sm font-medium text-gray-700">Reason</label>
                        <textarea id="leaveReason" rows="3" class="input" required></textarea>
                    </div>
                </div>
            </form>
        </div>
        <div class="p-6 border-t flex justify-end gap-4 flex-shrink-0">
            <button type="button" id="cancelLeaveModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" form="leaveForm" class="btn btn-primary">Submit Application</button>
        </div>
    </div>
</div>
`;

export function initLeaveModal() {
    if (!document.getElementById('leaveModal')) {
        document.body.insertAdjacentHTML('beforeend', leaveModalHtml);
    }

    const modal = document.getElementById('leaveModal');
    const form = document.getElementById('leaveForm');
    const cancelBtn = document.getElementById('cancelLeaveModal');
    const empInput = document.getElementById('leaveEmpId');

    // Auto-fill from session if available
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    if (loggedInUser && loggedInUser.employeeId) {
        empInput.value = loggedInUser.employeeId;
        empInput.readOnly = true;
        empInput.classList.add('bg-gray-50');
    }

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            employeeId: empInput.value,
            type: document.getElementById('leaveType').value,
            startDate: document.getElementById('leaveStartDate').value,
            endDate: document.getElementById('leaveEndDate').value,
            reason: document.getElementById('leaveReason').value
        };

        // Set date constraints
        const today = new Date().toISOString().split('T')[0];
        if (payload.startDate < today) {
            alert("Start date cannot be in the past.");
            return;
        }

        // Calculate days
        const start = new Date(payload.startDate);
        const end = new Date(payload.endDate);
        if (end < start) {
            alert("End date cannot be before start date.");
            return;
        }

        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        payload.days = diffDays;

        showLoading();
        try {
            // Check pending constraint first
            const checkRes = await fetch(`${window.location.origin}/api/leave/check-pending/${payload.employeeId}`);
            const checkData = await checkRes.json();
            if (checkData.hasPending) {
                alert(`You already have a pending leave request. Please wait for it to be processed.`);
                hideLoading();
                return;
            }

            await apiCall('applyLeave', 'POST', payload);
            customAlert("Success", "Leave application submitted successfully.");
            modal.classList.add('hidden');
            form.reset();
            // Refill employeeId after reset
            if (loggedInUser && loggedInUser.employeeId) {
                empInput.value = loggedInUser.employeeId;
            }
        } catch (error) {
            customAlert("Error", error.message);
        } finally {
            hideLoading();
        }
    });
}

export function openLeaveModal(empId = '') {
    const modal = document.getElementById('leaveModal');
    if (modal) {
        modal.classList.remove('hidden');
        const empInput = document.getElementById('leaveEmpId');
        if (empId) {
            empInput.value = empId;
        } else {
            const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
            if (loggedInUser && loggedInUser.employeeId) {
                empInput.value = loggedInUser.employeeId;
            }
        }
    }
}
