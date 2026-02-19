const getMobileApiBase = () => {
    const custom = localStorage.getItem('custom_api_base');
    if (custom) return custom;
    return (window.Capacitor || window.location.protocol.startsWith('http') === false)
        ? 'http://192.168.12.175:5000/api'
        : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '192.168.12.175' ? 'http://192.168.12.175:5000/api' : '/api');
};

const API_BASE_URL = getMobileApiBase();

let videoStream = null;
let currentPosition = null;
let capturedImageBlob = null;
let pendingAttendanceType = null; // 'check-in' or 'check-out'

// --- DOM Elements ---
const dom = {
    // Nav
    tabs: ['attendanceTab', 'historyTab', 'leavesTab', 'profileTab'],

    // Status
    statusBanner: document.getElementById('statusBanner'),
    todayStatusText: document.getElementById('todayStatusText'),
    locationStatus: document.getElementById('locationStatus'),

    // Modals
    cameraModal: document.getElementById('cameraModal'),
    previewModal: document.getElementById('previewModal'),
    justificationModal: document.getElementById('justificationModal'),
    leaveModal: document.getElementById('leaveModal'),

    // Camera
    video: document.getElementById('cameraFeed'),
    captureBtn: document.getElementById('captureBtn'),
    closeCameraBtn: document.getElementById('closeCameraBtn'),

    // Preview
    capturedImage: document.getElementById('capturedImage'),
    retakeBtn: document.getElementById('retakeBtn'),
    confirmAttendanceBtn: document.getElementById('confirmAttendanceBtn'),

    // Buttons
    checkInBtn: document.getElementById('checkInBtn'),
    checkOutBtn: document.getElementById('checkOutBtn'),

    // History
    historyList: document.getElementById('attendanceHistoryList'),

    toast: document.createElement('div')
};

// --- Init Toast ---
dom.toast.className = "fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-2xl text-xs font-bold bg-opacity-95 hidden transition-all duration-300 z-[200] shadow-2xl border border-white/10";
document.body.appendChild(dom.toast);

function showToast(msg, type = 'info') {
    dom.toast.textContent = msg;
    dom.toast.classList.remove('hidden', 'translate-y-10', 'opacity-0');
    dom.toast.classList.add('flex', 'items-center');

    if (type === 'error') dom.toast.classList.add('text-rose-400');
    else dom.toast.classList.remove('text-rose-400');

    setTimeout(() => {
        dom.toast.classList.add('opacity-0', 'translate-y-10');
        setTimeout(() => dom.toast.classList.add('hidden'), 300);
    }, 3000);
}

// --- 1. Geolocation ---
function initGeolocation() {
    return new Promise((resolve) => {
        if ("geolocation" in navigator) {
            dom.locationStatus.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Locating...';
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    currentPosition = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    dom.locationStatus.innerHTML = `<i class="fas fa-location-dot text-emerald-500 mr-2"></i> GPS: ${currentPosition.lat.toFixed(4)}, ${currentPosition.lng.toFixed(4)}`;
                    resolve(true);
                },
                (error) => {
                    console.error("Geo Error:", error);
                    dom.locationStatus.innerHTML = '<i class="fas fa-triangle-exclamation text-amber-500 mr-2"></i> GPS: Offline';
                    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                        currentPosition = { lat: 23.8103, lng: 90.4125 };
                        dom.locationStatus.innerHTML = `<i class="fas fa-location-dot text-emerald-500 mr-2"></i> GPS: MOCK (DHAKA)`;
                    }
                    resolve(false);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            dom.locationStatus.textContent = "GPS Not Supported";
            resolve(false);
        }
    });
}

// --- 2. Camera Flow ---
async function openCamera(type) {
    pendingAttendanceType = type;
    try {
        dom.cameraModal.classList.remove('hidden');
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false
        });
        dom.video.srcObject = videoStream;
        dom.video.play();
    } catch (err) {
        console.error("Camera Error:", err);
        showToast("Camera access required", "error");
        dom.cameraModal.classList.add('hidden');
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    dom.cameraModal.classList.add('hidden');
}

dom.closeCameraBtn.addEventListener('click', stopCamera);

dom.captureBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = dom.video.videoWidth;
    canvas.height = dom.video.videoHeight;
    canvas.getContext('2d').drawImage(dom.video, 0, 0);

    // Show Preview
    dom.capturedImage.src = canvas.toDataURL('image/jpeg');
    dom.cameraModal.classList.add('hidden');
    dom.previewModal.classList.remove('hidden');

    canvas.toBlob(blob => {
        capturedImageBlob = blob;
    }, 'image/jpeg', 0.8);

    stopCamera();
});

dom.retakeBtn.addEventListener('click', () => {
    dom.previewModal.classList.add('hidden');
    openCamera(pendingAttendanceType);
});

dom.confirmAttendanceBtn.addEventListener('click', () => {
    submitAttendance();
});

// --- 3. Attendance Submission ---
async function submitAttendance(justification = null) {
    const user = JSON.parse(localStorage.getItem('mobile_user'));
    if (!user) { window.location.href = 'mobile_login.html'; return; }

    if (!currentPosition) {
        showToast("Waiting for GPS...", "error");
        await initGeolocation();
    }

    const type = pendingAttendanceType;
    const formData = new FormData();
    formData.append('employeeId', user.employeeId);
    formData.append('action', type);
    formData.append('lat', currentPosition.lat);
    formData.append('lng', currentPosition.lng);
    formData.append('address', "Mobile App Entry");

    if (justification) formData.append('justification', justification);
    if (capturedImageBlob) formData.append('selfie', capturedImageBlob, `selfie_${Date.now()}.jpg`);

    // UI state
    dom.confirmAttendanceBtn.disabled = true;
    dom.confirmAttendanceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    try {
        const endpoint = type === 'check-in' ? '/attendance/check-in' : '/attendance/check-out';
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (!res.ok) {
            if (data.code === 'JUSTIFICATION_REQUIRED') {
                dom.previewModal.classList.add('hidden');
                showJustificationModal(type, data.details);
                return;
            }
            throw new Error(data.error || "Submission failed");
        }

        showToast(`${type === 'check-in' ? 'Checked In' : 'Checked Out'} Successful! ✨`);

        // Reset and close
        dom.previewModal.classList.add('hidden');
        capturedImageBlob = null;
        loadHomeData();
        if (window.switchTab) switchTab('attendanceTab');

    } catch (err) {
        console.error(err);
        showToast(err.message, "error");
    } finally {
        dom.confirmAttendanceBtn.disabled = false;
        dom.confirmAttendanceBtn.innerHTML = 'Confirm & Submit <i class="fas fa-paper-plane ml-3"></i>';
    }
}

// --- Justification Modal ---
const jModal = {
    el: document.getElementById('justificationModal'),
    details: document.getElementById('validationDetails'),
    input: document.getElementById('justificationInput'),
    submit: document.getElementById('submitJustification'),
    cancel: document.getElementById('cancelJustification')
};

function showJustificationModal(type, details) {
    jModal.el.classList.remove('hidden');
    let msg = '';
    if (details.isLate) msg += `<div class="flex items-center text-rose-500 mb-1"><i class="fas fa-clock mr-2"></i> LATE ATTENDANCE (After 9:15 AM)</div>`;
    if (details.isOutOfRange) msg += `<div class="flex items-center text-amber-500"><i class="fas fa-map-pin mr-2"></i> OUT OF RANGE (${details.distance}m from office)</div>`;
    jModal.details.innerHTML = msg;
}

jModal.cancel.addEventListener('click', () => jModal.el.classList.add('hidden'));
jModal.submit.addEventListener('click', () => {
    const reason = jModal.input.value.trim();
    if (!reason) { showToast("Reason required", "error"); return; }
    jModal.el.classList.add('hidden');
    submitAttendance(reason);
});

// --- Tab Logic ---
window.switchTab = function (tabId) {
    dom.tabs.forEach(id => {
        const content = document.getElementById(id);
        const navBtn = document.getElementById(`nav-${id}`);
        if (id === tabId) {
            content.classList.add('active');
            content.style.display = 'block';
            navBtn.classList.add('active');
        } else {
            content.classList.remove('active');
            content.style.display = 'none';
            navBtn.classList.remove('active');
        }
    });

    if (tabId === 'historyTab') fetchAttendanceHistory();
    if (tabId === 'leavesTab') fetchLeaveHistory();
    if (tabId === 'profileTab') loadProfile();
};

async function fetchAttendanceHistory() {
    const user = JSON.parse(localStorage.getItem('mobile_user'));
    dom.historyList.innerHTML = '<div class="animate-pulse space-y-3"><div class="h-20 bg-slate-100 rounded-2xl"></div><div class="h-20 bg-slate-100 rounded-2xl"></div></div>';

    try {
        const res = await fetch(`${API_BASE_URL}/attendance/history/${user.employeeId}`);
        const data = await res.json();

        if (data.length === 0) {
            dom.historyList.innerHTML = '<p class="text-center py-10 text-slate-400 text-sm font-medium">No records found for this month.</p>';
            return;
        }

        dom.historyList.innerHTML = data.map(rec => {
            const date = new Date(rec.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
            const checkIn = rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
            const checkOut = rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

            let statusClass = 'status-present';
            if (rec.approvalStatus === 'Pending') statusClass = 'status-pending';
            if (rec.status === 'Absent' || rec.approvalStatus === 'Rejected') statusClass = 'status-absent';

            return `
                <div class="glass-card border-none rounded-2xl p-4 flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="h-12 w-12 bg-slate-50 rounded-xl flex flex-col items-center justify-center border border-slate-100">
                            <span class="text-[10px] uppercase font-bold text-slate-400 leading-none">${date.split(' ')[1]}</span>
                            <span class="text-lg font-bold text-slate-700 leading-none">${date.split(' ')[0]}</span>
                        </div>
                        <div>
                            <div class="flex items-center space-x-2 mb-1">
                                <span class="attendance-status-badge ${statusClass}">${rec.approvalStatus}</span>
                                ${rec.isLate ? '<i class="fas fa-clock text-rose-400 text-[10px]" title="Late"></i>' : ''}
                            </div>
                            <div class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                <i class="fas fa-arrow-right-to-bracket mr-1"></i> ${checkIn} 
                                <span class="mx-2">•</span>
                                <i class="fas fa-arrow-right-from-bracket mr-1"></i> ${checkOut}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        dom.historyList.innerHTML = '<p class="text-rose-500 text-xs text-center">Failed to load history</p>';
    }
}

// --- Home Data Loader ---
async function loadHomeData() {
    const user = JSON.parse(localStorage.getItem('mobile_user'));
    if (!user) { window.location.href = 'mobile_login.html'; return; }

    // Load Balance
    try {
        const res = await fetch(`${API_BASE_URL}/employees/${user.employeeId}`);
        const emp = await res.json();
        const total = (emp.leaveBalance?.sick || 0) + (emp.leaveBalance?.casual || 0) + (emp.leaveBalance?.earned || 0);
        document.getElementById('leavesBalanceText').textContent = total;
    } catch (e) { }

    // Load Today
    try {
        const res = await fetch(`${API_BASE_URL}/attendance/today/${user.employeeId}`);
        const data = await res.json();

        if (data && data.checkInTime) {
            dom.statusBanner.classList.remove('hidden');
            const time = new Date(data.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            let msg = `Checked-in at ${time}`;
            if (data.approvalStatus === 'Pending') msg = `In Review (${time})`;
            else if (data.approvalStatus === 'Rejected') msg = `Attendance Rejected`;
            dom.todayStatusText.textContent = msg;
        }
    } catch (e) { }
}

async function fetchLeaveHistory() {
    const user = JSON.parse(localStorage.getItem('mobile_user'));
    const list = document.getElementById('leaveHistoryList');
    list.innerHTML = '<div class="animate-pulse space-y-3"><div class="h-20 bg-slate-100 rounded-2xl"></div></div>';

    try {
        const res = await fetch(`${API_BASE_URL}/leave/history/${user.employeeId}`);
        const data = await res.json();

        if (data.length === 0) {
            list.innerHTML = '<p class="text-center text-slate-400 py-10 text-sm">No leave history.</p>';
            return;
        }

        list.innerHTML = data.map(l => {
            const statusColor = l.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : (l.status === 'Rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700');
            return `
                <div class="glass-card rounded-2xl p-4 border-slate-50">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="font-bold text-slate-800">${l.type} Leave</p>
                            <p class="text-[10px] text-slate-400 font-bold">${new Date(l.startDate).toLocaleDateString()} - ${new Date(l.endDate).toLocaleDateString()}</p>
                        </div>
                        <span class="px-2 py-1 rounded text-[9px] font-black uppercase ${statusColor}">${l.status}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = '<p class="text-rose-500 text-xs">Error loading leaves</p>';
    }
}

async function loadProfile() {
    const user = JSON.parse(localStorage.getItem('mobile_user'));
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profileDesignation').textContent = user.designation;
    document.getElementById('profileId').textContent = user.employeeId;
    document.getElementById('profileDept').textContent = user.project || 'N/A';
}

// --- Init ---
dom.checkInBtn.addEventListener('click', () => openCamera('check-in'));
dom.checkOutBtn.addEventListener('click', () => openCamera('check-out'));

window.addEventListener('load', async () => {
    await initGeolocation();
    loadHomeData();
});

window.logout = function () {
    localStorage.removeItem('mobile_user');
    window.location.href = 'mobile_login.html';
};
