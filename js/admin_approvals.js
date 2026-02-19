const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api' : '/api';

// Simple "Login" - usually from session or URL params for demo
let approverId = new URLSearchParams(window.location.search).get('id') || sessionStorage.getItem('approverId');

if (!approverId) {
    const promptId = prompt("Enter your Employee ID to access Approval Dashboard:");
    if (promptId) {
        approverId = promptId;
        sessionStorage.setItem('approverId', approverId);
    } else {
        document.body.innerHTML = "<div class='p-10 text-center'>Access Denied. Approver ID required.</div>";
    }
}

document.getElementById('approverInfo').textContent = `Logged in as: ${approverId}`;

const dom = {
    list: document.getElementById('approvalList'),
    count: document.getElementById('countPending'),
    modal: document.getElementById('actionModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSub: document.getElementById('modalSub'),
    comments: document.getElementById('modalComments'),
    confirmBtn: document.getElementById('confirmActionBtn')
};

let currentRequest = null;
let currentAction = null;
let currentTab = 'Pending';

async function fetchPending() {
    try {
        if (currentTab === 'Pending') {
            const [attRes, leaveRes] = await Promise.all([
                fetch(`${API_BASE}/attendance/pending/${approverId}`),
                fetch(`${API_BASE}/leave/pending/${approverId}`)
            ]);

            const attendanceData = await attRes.json();
            const leaveData = await leaveRes.json();

            attendanceData.forEach(r => r._type = 'attendance');
            leaveData.forEach(r => r._type = 'leave');

            const combined = [...attendanceData, ...leaveData];
            dom.count.textContent = combined.length;
            renderList(combined);
        } else {
            // Fetch History (Combined or separate? Let's start with Leave for history if that's what's requested)
            const res = await fetch(`${API_BASE}/leave/approver-history/${approverId}?status=${currentTab}`);
            const data = await res.json();
            data.forEach(r => r._type = 'leave');
            renderList(data);
        }
    } catch (err) {
        console.error(err);
        dom.list.innerHTML = `<div class='text-red-500 p-10 text-center'>Error loading requests: ${err.message}</div>`;
    }
}

window.switchTab = function (tab) {
    currentTab = tab;
    // Update UI
    ['Pending', 'Approved', 'Rejected'].forEach(t => {
        const el = document.getElementById(`tab${t}`);
        if (t === tab) {
            el.classList.add('border-2', 'border-green-500');
            el.classList.remove('opacity-60', 'border-gray-100');
        } else {
            el.classList.remove('border-2', 'border-green-500');
            el.classList.add('opacity-60', 'border-gray-100');
        }
    });
    fetchPending();
};

function renderList(requests) {
    const isHistory = currentTab !== 'Pending';
    if (requests.length === 0) {
        dom.list.innerHTML = `<div class='bg-white p-20 rounded-3xl shadow-sm text-center text-gray-400'>
            <i class="fas fa-check-circle text-4xl mb-4 text-green-100"></i>
            <p>No ${currentTab.toLowerCase()} requests!</p>
        </div>`;
        return;
    }

    dom.list.innerHTML = requests.map(req => {
        const isLeave = req._type === 'leave';
        const date = isLeave
            ? `${new Date(req.startDate).toLocaleDateString()} to ${new Date(req.endDate).toLocaleDateString()}`
            : new Date(req.date).toLocaleDateString();

        const badge = isLeave
            ? `<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Leave (${req.type})</span>`
            : `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Attendance</span>`;

        const details = isLeave
            ? `Days: ${req.days}`
            : `${new Date(req.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${req.isLate ? '<span class="text-amber-600">LATE</span>' : ''}`;

        return `
            <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center space-x-4">
                    <div class="h-14 w-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 text-xl font-bold">
                        ${req.employeeId?.name ? req.employeeId.name.charAt(0) : '?'}
                    </div>
                    <div>
                        <div class="flex items-center space-x-2 mb-1">
                            <h3 class="font-bold text-gray-800">${req.employeeId?.name || 'Unknown'}</h3>
                            ${badge}
                        </div>
                        <p class="text-xs text-gray-500 uppercase tracking-widest font-semibold">${req.employeeId?.designation || 'Staff'}</p>
                    </div>
                </div>
                
                <div class="bg-gray-50 px-6 py-4 rounded-2xl flex-1 max-w-md">
                    <div class="flex justify-between text-xs mb-2">
                        <span class="text-gray-400 font-medium">${date}</span>
                        <div class="space-x-2 text-gray-600 font-bold">${details}</div>
                    </div>
                    <p class="text-sm text-gray-700 italic border-l-2 ${isLeave ? 'border-blue-500' : 'border-green-500'} pl-3">
                        "${isLeave ? (req.reason || 'No reason') : (req.justification || 'No justification')}"
                    </p>
                </div>

                <div class="${isHistory ? 'hidden' : 'flex'} space-x-3">
                    <button onclick="openActionModal('${req._id}', 'Rejected', '${req.employeeId?.name}', '${req._type}')" class="p-4 text-red-500 hover:bg-red-50 rounded-2xl transition-colors">
                        <i class="fas fa-times-circle text-2xl"></i>
                    </button>
                    <button onclick="openActionModal('${req._id}', 'Approved', '${req.employeeId?.name}', '${req._type}')" class="p-4 text-green-500 hover:bg-green-50 rounded-2xl transition-colors">
                        <i class="fas fa-check-circle text-2xl"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

let currentType = null; // Re-declare since I accidentally removed it or replaced it
window.openActionModal = function (id, action, name, type) {
    currentRequest = id;
    currentAction = action;
    currentType = type;
    dom.modalTitle.textContent = `${action} ${type === 'leave' ? 'Leave' : 'Attendance'}`;
    dom.modalSub.textContent = `Process request for ${name}`;
    dom.confirmBtn.className = `flex-1 px-6 py-3 font-semibold rounded-2xl shadow-lg transition-all text-white ${action === 'Approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`;
    dom.modal.classList.remove('hidden');
    dom.comments.value = '';
    dom.comments.focus();
};

window.closeModal = function () {
    dom.modal.classList.add('hidden');
};

dom.confirmBtn.addEventListener('click', async () => {
    const comments = dom.comments.value.trim();
    if (currentAction === 'Rejected' && !comments) {
        alert("Please provide a reason for rejection.");
        return;
    }

    dom.confirmBtn.disabled = true;
    dom.confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        const endpoint = currentType === 'attendance' ? 'attendance/approve' : 'leave/approve';
        const body = currentType === 'attendance'
            ? { attendanceId: currentRequest, approverId, action: currentAction, comments }
            : { leaveId: currentRequest, approverId, action: currentAction, comments };

        const res = await fetch(`${API_BASE}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error("Approval failed");

        closeModal();
        fetchPending();
    } catch (err) {
        alert(err.message);
    } finally {
        dom.confirmBtn.disabled = false;
        dom.confirmBtn.textContent = 'Confirm';
    }
});

fetchPending();
setInterval(fetchPending, 15000);
