// js/analytics.js
import { apiCall } from './apiClient.js';
import { showLoading, hideLoading } from './utils.js';

async function initAnalytics() {
    showLoading();
    try {
        const stats = await apiCall('getStats');

        // Populate Overview Stats
        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-active').textContent = stats.active;
        document.getElementById('stat-held').textContent = stats.held;
        document.getElementById('stat-separated').textContent = (stats.resigned || 0) + (stats.terminated || 0) + (stats.closed || 0);

        // Project Chart
        new Chart(document.getElementById('projectChart'), {
            type: 'pie',
            data: {
                labels: stats.byProject.map(p => p._id || 'Unknown'),
                datasets: [{
                    data: stats.byProject.map(p => p.count),
                    backgroundColor: ['#15803d', '#166531', '#22c55e', '#4ade80', '#86efac', '#bbf7d0']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // Type Chart
        new Chart(document.getElementById('typeChart'), {
            type: 'doughnut',
            data: {
                labels: stats.byType.map(t => t._id || 'N/A'),
                datasets: [{
                    data: stats.byType.map(t => t.count),
                    backgroundColor: ['#1d4ed8', '#1e40af', '#3b82f6', '#60a5fa']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // Designation Chart
        new Chart(document.getElementById('designationChart'), {
            type: 'bar',
            data: {
                labels: stats.byDesignation.map(d => d._id || 'Unknown'),
                datasets: [{
                    label: 'Number of Employees',
                    data: stats.byDesignation.map(d => d.count),
                    backgroundColor: '#15803d'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });

    } catch (error) {
        console.error("Analytics Error:", error);
    } finally {
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', initAnalytics);
