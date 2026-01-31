// js/app.js - Modern HRMS with Powerful Dynamics

import { apiCall } from './apiClient.js';

class HRMSApp {
    constructor() {
        this.employees = [];
        this.filteredEmployees = [];
        this.currentPage = 1;
        this.itemsPerPage = 12;
        this.currentFilter = 'all';
        this.charts = {};
        this.init();
    }

    async init() {
        this.setupTheme();
        this.setupEventListeners();
        this.setupDate();
        this.animateEntry();
        await this.fetchDashboardStats();
        await this.loadEmployees();
    }

    // Theme Management
    setupTheme() {
        const darkMode = localStorage.getItem('darkMode') === 'true';
        if (darkMode) document.documentElement.classList.add('dark');

        document.getElementById('toggleDarkMode')?.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
        });
    }

    setupDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', options);
    }

    // GSAP Animations
    animateEntry() {
        gsap.from('aside', { x: -50, opacity: 0, duration: 0.8, ease: 'power3.out' });
        gsap.from('header', { y: -20, opacity: 0, duration: 0.6, delay: 0.2, ease: 'power3.out' });
        gsap.from('.filter-pill', {
            y: 20,
            opacity: 0,
            duration: 0.4,
            stagger: 0.05,
            delay: 0.4,
            ease: 'back.out(1.7)'
        });
    }

    // Toast Notifications
    showToast(title, message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast flex items-center gap-3 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 min-w-[300px] transform translate-x-full transition-transform duration-300 border-l-4 ${type === 'success' ? 'border-green-500' : type === 'error' ? 'border-red-500' : 'border-amber-500'}`;

        const iconColor = type === 'success' ? 'text-green-500' : type === 'error' ? 'text-red-500' : 'text-amber-500';
        const iconClass = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';

        toast.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center ${iconColor}">
                <i class="fas ${iconClass}"></i>
            </div>
            <div class="flex-1">
                <h4 class="font-semibold text-sm text-gray-900 dark:text-white">${title}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400">${message}</p>
            </div>
            <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <i class="fas fa-times"></i>
            </button>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });

        // Auto remove
        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => toast.remove(), 300);
        }, 5000);

        toast.querySelector('button').addEventListener('click', () => {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => toast.remove(), 300);
        });
    }

    // Event Listeners
    setupEventListeners() {
        // 3D Card Effect
        document.addEventListener('mousemove', (e) => {
            const cards = document.querySelectorAll('.card-3d');
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = (y - centerY) / 20;
                const rotateY = (centerX - x) / 20;

                card.style.setProperty('--rotate-x', `${rotateX}deg`);
                card.style.setProperty('--rotate-y', `${rotateY}deg`);
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
            });
        });

        // Search Debounce
        let searchTimeout;
        document.getElementById('globalSearch')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchEmployees(e.target.value);
            }, 300);
        });

        // Modal form calculations
        ['salary', 'cashPayment', 'basic', 'others', 'tds', 'subsidizedLunch', 'motorbikeLoan'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this.calculateSalary());
        });
    }

    calculateSalary() {
        const getVal = (id) => parseFloat(document.getElementById(id)?.value) || 0;

        const gross = getVal('salary') + getVal('cashPayment') + getVal('basic') + getVal('others');
        const deductions = getVal('tds') + getVal('subsidizedLunch') + getVal('motorbikeLoan');
        const net = gross - deductions;

        // Animate numbers
        this.animateValue('grandTotal', gross);
        this.animateValue('totalDeduction', deductions);
        this.animateValue('netSalaryPayment', net, true);
    }

    animateValue(elementId, value, isBold = false) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const prefix = '৳';
        const current = parseFloat(el.textContent.replace(/[৳,]/g, '')) || 0;
        const diff = value - current;

        gsap.to({ val: current }, {
            val: value,
            duration: 0.5,
            ease: 'power2.out',
            onUpdate: function() {
                el.textContent = prefix + Math.round(this.targets()[0].val).toLocaleString();
            }
        });
    }

    // API Integration
    async fetchDashboardStats() {
        try {
            const data = await apiCall('getEmployees', 'GET', null, { limit: 1000 });
            this.employees = data.employees || [];
            this.updateStats();
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    updateStats() {
        const stats = {
            total: this.employees.length,
            active: this.employees.filter(e => e.status === 'Active').length,
            held: this.employees.filter(e => e.status === 'Salary Held').length,
            separated: this.employees.filter(e => ['Resigned', 'Terminated', 'Closed'].includes(e.status)).length
        };

        // Animate counters
        Object.keys(stats).forEach(key => {
            const el = document.getElementById(`stat${key.charAt(0).toUpperCase() + key.slice(1)}`);
            if (el) {
                gsap.to({ val: 0 }, {
                    val: stats[key],
                    duration: 1.5,
                    ease: 'power2.out',
                    onUpdate: function() {
                        el.textContent = Math.round(this.targets()[0].val);
                    }
                });
            }
        });
    }

    async loadEmployees() {
        this.showSkeletonLoading();
        try {
            const data = await apiCall('getEmployees', 'GET', null, {
                page: this.currentPage,
                limit: this.itemsPerPage,
                status: this.currentFilter !== 'all' ? this.currentFilter : undefined
            });

            this.filteredEmployees = data.employees || [];
            this.renderEmployees();

            if (data.totalPages > this.currentPage) {
                document.getElementById('loadMoreContainer')?.classList.remove('hidden');
            }
        } catch (error) {
            this.showToast('Error', 'Failed to load employees', 'error');
        }
    }

    showSkeletonLoading() {
        const container = document.getElementById('employee-list');
        container.innerHTML = Array(6).fill(0).map((_, i) => `
            <div class="glass-card rounded-2xl p-6 h-80 skeleton" style="animation-delay: ${i * 0.1}s">
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-16 h-16 rounded-full skeleton"></div>
                    <div class="flex-1">
                        <div class="h-4 w-3/4 rounded skeleton mb-2"></div>
                        <div class="h-3 w-1/2 rounded skeleton"></div>
                    </div>
                </div>
                <div class="space-y-3">
                    <div class="h-3 w-full rounded skeleton"></div>
                    <div class="h-3 w-5/6 rounded skeleton"></div>
                    <div class="h-3 w-4/6 rounded skeleton"></div>
                </div>
            </div>
        `).join('');
    }

    renderEmployees() {
        const container = document.getElementById('employee-list');

        if (this.filteredEmployees.length === 0) {
            document.getElementById('emptyState')?.classList.remove('hidden');
            container.innerHTML = '';
            return;
        }

        document.getElementById('emptyState')?.classList.add('hidden');

        container.innerHTML = this.filteredEmployees.map((emp, index) => `
            <article class="glass-card card-3d rounded-2xl p-6 relative group cursor-pointer"
                     style="animation: fadeIn 0.5s ease-out ${index * 0.05}s both"
                     onclick="app.viewEmployee('${emp.id}')">

                <!-- Glow Effect -->
                <div class="card-content-glow rounded-2xl"></div>

                <!-- Header -->
                <div class="flex items-start justify-between mb-4 relative z-10">
                    <div class="flex items-center gap-4">
                        <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                            ${emp.name.charAt(0)}
                        </div>
                        <div>
                            <h3 class="font-display font-bold text-lg text-gray-900 dark:text-white group-hover:text-primary-600 transition-colors">${emp.name}</h3>
                            <p class="text-sm text-gray-500 dark:text-gray-400">${emp.designation}</p>
                        </div>
                    </div>
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${this.getStatusStyle(emp.status, emp.salaryHeld)}">
                        ${emp.salaryHeld === 'true' ? 'Salary Held' : emp.status}
                    </span>
                </div>

                <!-- Details Grid -->
                <div class="space-y-3 relative z-10">
                    <div class="flex items-center gap-3 text-sm">
                        <div class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                            <i class="fas fa-id-badge"></i>
                        </div>
                        <span class="text-gray-600 dark:text-gray-300 font-medium">${emp.employeeId}</span>
                    </div>

                    <div class="flex items-center gap-3 text-sm">
                        <div class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                            <i class="fas fa-project-diagram"></i>
                        </div>
                        <span class="text-gray-600 dark:text-gray-300">${emp.project || 'N/A'}</span>
                    </div>

                    <div class="flex items-center gap-3 text-sm">
                        <div class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                            <i class="fas fa-map-marker-alt"></i>
                        </div>
                        <span class="text-gray-600 dark:text-gray-300">${emp.subCenter || 'N/A'}</span>
                    </div>

                    <div class="flex items-center gap-3 text-sm">
                        <div class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                            <i class="fas fa-calendar"></i>
                        </div>
                        <span class="text-gray-600 dark:text-gray-300">${this.formatDate(emp.joiningDate)}</span>
                    </div>
                </div>

                <!-- Action Bar (Slides up on hover) -->
                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white dark:from-gray-900 to-transparent p-4 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 flex gap-2 justify-end rounded-b-2xl">
                    <button onclick="event.stopPropagation(); app.editEmployee('${emp.id}')" class="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 transition-colors tooltip" data-tooltip="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="event.stopPropagation(); app.transferEmployee('${emp.id}')" class="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 transition-colors tooltip" data-tooltip="Transfer">
                        <i class="fas fa-exchange-alt"></i>
                    </button>
                    <button onclick="event.stopPropagation(); app.holdSalary('${emp.id}')" class="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 transition-colors tooltip" data-tooltip="Hold Salary">
                        <i class="fas fa-pause"></i>
                    </button>
                </div>
            </article>
        `).join('');
    }

    getStatusStyle(status, salaryHeld) {
        if (salaryHeld === 'true') return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800';
        switch(status) {
            case 'Active': return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800';
            case 'Resigned': return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800';
            case 'Terminated': return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800';
            case 'Closed': return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-700';
            default: return 'bg-blue-100 text-blue-700';
        }
    }

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return dateStr;
        }
    }

    filterByStatus(status) {
        this.currentFilter = status;
        this.currentPage = 1;

        // Update active pill
        document.querySelectorAll('.filter-pill').forEach(pill => {
            pill.classList.remove('bg-primary-100', 'dark:bg-primary-900/40', 'text-primary-700');
            if (pill.textContent.toLowerCase().includes(status.toLowerCase()) || (status === 'all' && pill.textContent.includes('Dashboard'))) {
                pill.classList.add('bg-primary-100', 'dark:bg-primary-900/40', 'text-primary-700');
            }
        });

        this.loadEmployees();
    }

    searchEmployees(query) {
        if (!query) {
            this.loadEmployees();
            return;
        }

        const filtered = this.employees.filter(emp =>
            emp.name.toLowerCase().includes(query.toLowerCase()) ||
            emp.employeeId.toLowerCase().includes(query.toLowerCase()) ||
            emp.project?.toLowerCase().includes(query.toLowerCase())
        );

        this.filteredEmployees = filtered;
        this.renderEmployees();
    }

    // Modal Management
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('hidden');
        const content = modal.querySelector('.modal-content');

        gsap.fromTo(content,
            { scale: 0.9, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        const content = modal.querySelector('.modal-content');

        gsap.to(content, {
            scale: 0.9,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => modal.classList.add('hidden')
        });
    }

    // Actions
    viewEmployee(id) {
        const emp = this.employees.find(e => e.id === id);
        if (!emp) return;

        // Populate view modal (simplified for example)
        this.showToast('View Mode', `Viewing details for ${emp.name}`, 'info');
    }

    editEmployee(id) {
        const emp = this.employees.find(e => e.id === id);
        if (!emp) return;

        document.getElementById('modalTitle').textContent = 'Edit Employee';
        document.getElementById('employeeId').value = emp.employeeId;
        document.getElementById('name').value = emp.name;
        // Populate other fields...

        this.openModal('employeeModal');
    }

    async submitEmployee() {
        const formData = {
            employeeId: document.getElementById('employeeId').value,
            name: document.getElementById('name').value,
            // ... other fields
        };

        try {
            await apiCall('saveEmployee', 'POST', formData);
            this.showToast('Success', 'Employee saved successfully');
            this.closeModal('employeeModal');
            this.loadEmployees();
        } catch (error) {
            this.showToast('Error', 'Failed to save employee', 'error');
        }
    }
}

// Initialize App
const app = new HRMSApp();
export default app;