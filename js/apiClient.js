// js/apiClient.js
import { showLoading, hideLoading } from './utils.js';

// Detect API Base
const getApiBase = () => {
    // Check for Developer Override (Dynamic IP Workaround)
    const customBase = localStorage.getItem('custom_api_base');
    if (customBase) return customBase;

    // If running in Capacitor (native app) — use the LAN IP for WiFi access
    if (window.Capacitor || window.location.protocol.startsWith('http') === false) {
        return 'http://192.168.12.175:5000/api';
    }

    // If accessed from the LAN IP directly (e.g. from another device on WiFi)
    if (window.location.hostname === '192.168.12.175') {
        return 'http://192.168.12.175:5000/api';
    }

    // localhost / 127.0.0.1 → use local server directly
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000/api';
    }

    return '/api';
};

const API_BASE_URL = getApiBase();

export async function apiCall(action, method = 'GET', body = null, params = null, useSpinner = true) {
    if (useSpinner) showLoading();

    try {
        let url = '';
        let fetchMethod = method;
        let fetchBody = body;

        // === ROUTING LOGIC: Map Legacy Actions to REST Endpoints ===
        switch (action) {
            case 'getEmployees':
                url = `${API_BASE_URL}/employees`;
                break;

            case 'saveEmployee':
                if (body && body.originalEmployeeId) {
                    // Update existing
                    url = `${API_BASE_URL}/employees/${body.originalEmployeeId}`;
                    fetchMethod = 'PUT';
                    // We keep body as is, the server should handle extra fields or we clean them.
                    // Ideally, remove originalEmployeeId from body?
                    // const { originalEmployeeId, ...rest } = body;
                    // fetchBody = rest;
                } else {
                    // Create new
                    url = `${API_BASE_URL}/employees`;
                    fetchMethod = 'POST';
                }
                break;

            case 'getSalaryArchive':
                url = `${API_BASE_URL}/payroll/archive`;
                break;

            case 'saveSalaryArchive':
                url = `${API_BASE_URL}/payroll/archive`;
                fetchMethod = 'POST';
                break;

            case 'logRejoin':
                url = `${API_BASE_URL}/employees/log-rejoin`; // Placeholder
                // Mock
                if (useSpinner) hideLoading();
                return { success: true };

            case 'getHoldLog':
                url = `${API_BASE_URL}/employees/logs/hold`;
                break;
            case 'getSeparationLog':
                url = `${API_BASE_URL}/employees/logs/separation`;
                break;
            case 'getTransferLog':
                url = `${API_BASE_URL}/employees/logs/transfer`;
                break;
            case 'getAttendanceReport':
                url = `${API_BASE_URL}/attendance/report`;
                break;
            case 'applyLeave':
                url = `${API_BASE_URL}/leave/apply`;
                break;
            case 'getLeaveHistory':
                url = `${API_BASE_URL}/leave/history/${payload}`; // payload is empId
                break;
            case 'getPendingLeaves':
                url = `${API_BASE_URL}/leave/pending/${payload}`; // payload is approverId
                break;
            case 'approveLeave':
                url = `${API_BASE_URL}/leave/approve`;
                break;
            case 'getFileCloseLog':
                url = `${API_BASE_URL}/employees/logs/file-close`;
                break;

            case 'getStats':
                url = `${API_BASE_URL}/employees/stats`;
                break;

            case 'updateStatus':
                if (body && body.employeeId) {
                    if (body.status === 'Resigned' || body.status === 'Terminated') {
                        url = `${API_BASE_URL}/employees/${body.employeeId}/separation`;
                        fetchMethod = 'POST';
                    } else {
                        // Salary Held / Unhold
                        url = `${API_BASE_URL}/employees/${body.employeeId}`;
                        fetchMethod = 'PUT';
                        fetchBody = {
                            salaryHeld: body.salaryHeld,
                            holdRemarks: body.holdRemarks
                        };
                    }
                }
                break;

            case 'transferEmployee':
                if (body && body.employeeId) {
                    url = `${API_BASE_URL}/employees/${body.employeeId}/transfer`;
                    fetchMethod = 'POST';
                    fetchBody = {
                        project: body.newProject,
                        projectOffice: body.newProjectOffice,
                        subCenter: body.newSubCenter,
                        reportProject: body.newReportProject,
                        reason: body.reason,
                        date: body.transferDate
                    };
                }
                break;

            case 'closeFile':
                if (body && body.employeeId) {
                    url = `${API_BASE_URL}/employees/${body.employeeId}/close-file`;
                    fetchMethod = 'POST';
                    fetchBody = {
                        date: body.fileClosingDate,
                        remarks: body.fileClosingRemarks
                    };
                }
                break;

            default:
                console.warn(`Unknown API action: ${action}`);
                url = `${API_BASE_URL}/${action}`; // Fallback trial
                break;
        }

        const options = {
            method: fetchMethod,
            headers: { 'Content-Type': 'application/json' },
        };

        if (fetchMethod === 'GET' && params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }

        if (fetchMethod !== 'GET' && fetchBody) {
            options.body = JSON.stringify(fetchBody);
        }

        console.log(`API Call (${action}): ${fetchMethod} ${url}`);

        const response = await fetch(url, options);

        // Try to parse JSON regardless of status code
        const contentType = response.headers.get("content-type");
        const isJson = contentType && contentType.includes("application/json");

        if (!response.ok) {
            if (isJson) {
                const errData = await response.json();
                throw new Error(errData.error || errData.message || `HTTP ${response.status}`);
            }
            // Non-JSON error (network proxy, HTML error page, etc)
            throw new Error(`Server error ${response.status}: ${await response.text().catch(() => 'No response body')}`);
        }

        if (!isJson) return { success: true };

        const data = await response.json();
        return data;

    } catch (error) {
        console.error(`API Call Error (${action}):`, error);
        throw new Error(error.message || 'An unknown API error occurred.');
    } finally {
        if (useSpinner) hideLoading();
    }
}