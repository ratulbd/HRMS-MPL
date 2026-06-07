// js/apiClient.js
import { showLoading, hideLoading } from './utils.js';

// Configuration
const CONFIG = {
    DEFAULT_PORT: 5000,
    FALLBACK_IP: '192.168.0.107' // Updated with your current Wi-Fi IP
};

// Detect API Base
const getApiBase = () => {
    const customBase = localStorage.getItem('custom_api_base');
    if (customBase) return customBase;

    const { hostname, protocol } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const isLAN = hostname.startsWith('192.168.') || hostname.startsWith('10.');
    const isNative = window.Capacitor || protocol.startsWith('http') === false;

    if (isNative) {
        return `http://${CONFIG.FALLBACK_IP}:${CONFIG.DEFAULT_PORT}/api`;
    }

    if (isLocal) {
        return `http://localhost:${CONFIG.DEFAULT_PORT}/api`;
    }

    if (isLAN) {
        return `http://${hostname}:${CONFIG.DEFAULT_PORT}/api`;
    }

    return '/api';
};

const API_BASE_URL = getApiBase();

/**
 * Enhanced API Call utility with Token support and standardized routing
 */
export async function apiCall(action, method = 'GET', body = null, params = null, useSpinner = true) {
    if (useSpinner) showLoading();

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');

    try {
        let url = '';
        let fetchMethod = method;
        let fetchBody = body;

        // Routing Logic
        switch (action) {
            case 'login': url = `${API_BASE_URL}/auth/login`; fetchMethod = 'POST'; break;
            case 'getMe': url = `${API_BASE_URL}/auth/me`; break;
            case 'getEmployees': url = `${API_BASE_URL}/employees`; break;
            case 'saveEmployee':
                if (body && body.originalEmployeeId) {
                    url = `${API_BASE_URL}/employees/${body.originalEmployeeId}`;
                    fetchMethod = 'PUT';
                } else {
                    url = `${API_BASE_URL}/employees`;
                    fetchMethod = 'POST';
                }
                break;
            case 'getSalaryArchive': url = `${API_BASE_URL}/payroll/archive`; break;
            case 'saveSalaryArchive': url = `${API_BASE_URL}/payroll/archive`; fetchMethod = 'POST'; break;
            case 'getAttendanceReport': url = `${API_BASE_URL}/attendance/report`; break;
            case 'applyLeave': url = `${API_BASE_URL}/leave/apply`; fetchMethod = 'POST'; break;
            case 'getLeaveHistory': url = `${API_BASE_URL}/leave/history/${body?.employeeId || ''}`; break;
            case 'getPendingLeaves': url = `${API_BASE_URL}/leave/pending/${body?.approverId || ''}`; break;
            case 'approveLeave': url = `${API_BASE_URL}/leave/approve`; fetchMethod = 'POST'; break;
            case 'getStats': url = `${API_BASE_URL}/employees/stats`; break;
            case 'updateStatus':
                if (body?.employeeId) {
                    if (['Resigned', 'Terminated'].includes(body.status)) {
                        url = `${API_BASE_URL}/employees/${body.employeeId}/separation`;
                        fetchMethod = 'POST';
                    } else {
                        url = `${API_BASE_URL}/employees/${body.employeeId}`;
                        fetchMethod = 'PUT';
                        fetchBody = { salaryHeld: body.salaryHeld, holdRemarks: body.holdRemarks };
                    }
                }
                break;
            case 'transferEmployee':
                if (body?.employeeId) {
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
                if (body?.employeeId) {
                    url = `${API_BASE_URL}/employees/${body.employeeId}/close-file`;
                    fetchMethod = 'POST';
                    fetchBody = { date: body.fileClosingDate, remarks: body.fileClosingRemarks };
                }
                break;
            default:
                url = `${API_BASE_URL}/${action}`;
                break;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const options = { method: fetchMethod, headers };

        if (fetchMethod === 'GET' && params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }

        if (fetchMethod !== 'GET' && fetchBody) {
            options.body = JSON.stringify(fetchBody);
        }

        const response = await fetch(url, options);
        const contentType = response.headers.get("content-type");
        const isJson = contentType && contentType.includes("application/json");

        if (!response.ok) {
            if (isJson) {
                const errData = await response.json();
                throw new Error(errData.error || errData.message || `HTTP ${response.status}`);
            }
            throw new Error(`Server error ${response.status}`);
        }

        return isJson ? await response.json() : { success: true };

    } catch (error) {
        console.error(`API Error [${action}]:`, error);
        throw error;
    } finally {
        if (useSpinner) hideLoading();
    }
}
