# HR Management System (HRMS)

A full-stack Human Resource Management System built with Node.js, Express, MongoDB, and vanilla JavaScript. Includes a mobile-ready interface via Capacitor for Android deployment.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Database Models](#database-models)
- [Approval Workflow](#approval-workflow)
- [Compliance Engine](#compliance-engine)
- [Shift Resolution](#shift-resolution)
- [Mobile App](#mobile-app)

---

## Tech Stack

| Layer      | Technology                                      |
|------------|------------------------------------------------|
| Backend    | Node.js, Express 5, Mongoose 9                |
| Database   | MongoDB (via Mongoose ODM)                     |
| Frontend   | Vanilla HTML/CSS/JavaScript (SPA-style)        |
| Mobile     | Capacitor (Android)                            |
| File I/O   | Multer (uploads), xlsx (Excel import/export)   |
| Other      | dotenv, cors, axios                            |

---

## Project Structure

```
hr-management-system/
├── server/                     # Backend (Express API)
│   ├── config/
│   │   └── db.js               # MongoDB connection
│   ├── models/
│   │   ├── Attendance.js       # Attendance records with approval tracking
│   │   ├── DutyRoster.js       # Per-employee daily shift assignments
│   │   ├── Employee.js         # Core employee profile & salary data
│   │   ├── GlobalSchedule.js   # Org-wide schedule overrides (e.g. Ramadan)
│   │   ├── Leave.js            # Leave requests with multi-level approval
│   │   ├── LeavePolicy.js      # Leave policy definitions
│   │   ├── Payroll.js          # Archived monthly salary sheets
│   │   ├── SalaryPolicy.js     # Salary slab rules & basic % calculation
│   │   ├── Shift.js            # Shift definitions (start/end/grace)
│   │   ├── SubCenterSetting.js # Per-subcenter hierarchy & compliance config
│   │   └── User.js             # Auth users (Admin/Manager/Employee)
│   ├── routes/
│   │   ├── attendanceRoutes.js # Check-in/out, approval, reports
│   │   ├── authRoutes.js       # Login, password change
│   │   ├── employeeRoutes.js   # CRUD, transfer, separation, file closing
│   │   ├── globalScheduleRoutes.js
│   │   ├── leaveRoutes.js      # Apply, approve, history
│   │   ├── payrollRoutes.js    # Archive & retrieve salary sheets
│   │   ├── policyRoutes.js     # Leave & salary policy CRUD + lookup
│   │   ├── rosterRoutes.js     # Excel template download/upload
│   │   ├── shiftRoutes.js      # Shift CRUD
│   │   └── subCenterRoutes.js  # Sub-center settings upsert
│   ├── utils/
│   │   ├── complianceUtils.js  # Consecutive days, weekly hours, annual avg
│   │   └── hierarchyUtils.js   # Shift & approval hierarchy resolution
│   ├── uploads/                # Uploaded selfies & roster files
│   ├── server.js               # Express app entry point
│   ├── .env                    # Environment variables (not committed)
│   └── package.json
├── js/                         # Frontend JavaScript modules
│   ├── apiClient.js            # API communication layer
│   ├── main.js                 # Main dashboard logic
│   ├── employeeForm.js         # Employee add/edit form
│   ├── employeeList.js         # Employee list with filters
│   ├── salarySheet.js          # Salary sheet generation
│   ├── pastSheets.js           # Archived payroll viewer
│   ├── payslipGenerator.js     # Individual payslip generation
│   ├── bulkUpload.js           # Bulk employee import
│   ├── leaveModal.js           # Leave application UI
│   ├── statusChange.js         # Employee status changes
│   ├── transferModal.js        # Transfer recording
│   ├── fileClosingModal.js     # File closing workflow
│   ├── viewDetails.js          # Employee detail view
│   ├── admin_approvals.js      # Admin approval dashboard
│   ├── analytics.js            # HR analytics
│   ├── mobile_app.js           # Mobile-specific logic
│   └── utils.js                # Shared utilities
├── admin/                      # Admin panel pages
│   ├── index.html              # Admin dashboard
│   ├── shifts.html             # Shift management
│   ├── hierarchies.html        # Approval hierarchy config
│   ├── global_schedules.html   # Global schedule management
│   ├── roster_management.html  # Duty roster upload/download
│   └── admin_style.css
├── index.html                  # Main dashboard (desktop)
├── login.html                  # Login page
├── mobile_login.html           # Mobile login page
├── mobile_dashboard.html       # Mobile dashboard
├── policies.html               # Leave & salary policy management
├── analytics.html              # Analytics page
├── admin_approvals.html        # Approval queue page
├── style.css                   # Global styles
├── assets/
│   └── logo.png
├── android/                    # Capacitor Android project
├── capacitor.config.json       # Capacitor configuration
└── package.json                # Root package (Capacitor deps)
```

---

## Features

### Employee Management
- Full employee CRUD with detailed profiles (personal, salary, project info)
- Employee types: Regular, Casual, Contractual, Temporary
- Status lifecycle: Active -> Salary Held / Resigned / Terminated -> Closed
- Employee transfer recording with history
- Separation (resignation/termination) and file closing workflows
- Bulk employee upload via Excel
- Paginated employee list with multi-field filtering

### Attendance System
- GPS-based check-in/check-out with selfie capture
- Geo-fencing validation (configurable radius from office coordinates)
- Late arrival detection based on shift schedule + grace time
- Early departure detection
- Over-duty detection (>9 hours) with justification requirement
- Justification prompts for violations with multi-level approval
- Monthly attendance reports exportable to Excel

### Leave Management
- Leave types: Sick (14 days), Casual (10 days), Earned, LWP (Leave Without Pay)
- Automatic leave balance tracking and deduction
- Multi-level approval workflow
- Leave history per employee
- Pending leave checker

### Payroll
- Monthly salary sheet generation and archival
- Salary components: Basic, allowances (food, station, hardship, etc.), deductions (gratuity, CPF, TDS, loans, etc.)
- Net salary calculation
- Payslip generation
- Historical payroll archive browser

### Shift Management
- Named shifts with start/end times and grace periods (e.g., General 09:00-18:00)
- Per-employee shift assignment
- Duty roster via Excel upload (codes: G=General, M=Morning, E=Evening, N=Night, O=Off)
- Downloadable roster templates pre-filled with employee data
- Global schedule overrides (e.g., Ramadan hours) that apply to specific or all shifts

### Policy Management
- **Leave Policies**: configurable days allowed, carry forward, gender restrictions, employee type applicability
- **Salary Policies**: slab-based basic percentage calculation, joining date cutoff logic, festival/incentive bonus percentages

### Approval Workflows
- Three-tier hierarchy resolution: Employee-level -> Sub-Center-level -> Reporting Manager chain
- Separate hierarchies for: leave approval, attendance check-in, attendance check-out
- Multi-level sequential approval with audit logs
- Approver dashboard for pending requests

### Compliance Engine
- **Consecutive working days**: Warning at 7 days (justification required), block at 10 days
- **Weekly hours**: 48-hour standard week, 12-hour max overtime, 60-hour hard cap
- **Annual average**: 56 hours/week limit
- Per-employee and per-subcenter compliance relaxation override
- Real-time compliance status per employee

### Admin Panel
- Shift configuration
- Approval hierarchy management
- Global schedule management
- Duty roster management (template download + Excel upload)
- Sub-center settings

---

## Prerequisites

- **Node.js** >= 18.x
- **MongoDB** (local instance or MongoDB Atlas)
- **npm** or **yarn**

---

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hr-management-system
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install root dependencies** (only needed for Capacitor/mobile)
   ```bash
   cd ..
   npm install
   ```

---

## Environment Variables

Create a `.env` file inside the `server/` directory:

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
PORT=5000
```

| Variable    | Description                        | Default |
|-------------|------------------------------------|---------|
| `MONGO_URI` | MongoDB connection string          | -       |
| `PORT`      | Server port                        | `5000`  |

---

## Running the Application

### Development

```bash
cd server
npm run dev
```

The server starts on `http://localhost:5000` and serves both the API and the frontend static files.

### Production

```bash
cd server
npm start
```

### Access Points

| URL                                  | Description               |
|--------------------------------------|---------------------------|
| `http://localhost:5000`              | Main dashboard            |
| `http://localhost:5000/login.html`   | Desktop login             |
| `http://localhost:5000/admin/`       | Admin panel               |
| `http://localhost:5000/policies.html`| Policy management         |
| `http://localhost:5000/mobile_login.html` | Mobile login         |
| `http://localhost:5000/mobile_dashboard.html` | Mobile dashboard |

---

## API Reference

Base URL: `http://localhost:5000/api`

### Authentication (`/api/auth`)

| Method | Endpoint             | Description          | Body                                  |
|--------|----------------------|----------------------|---------------------------------------|
| POST   | `/login`             | User login           | `{ username, password }`              |
| POST   | `/change-password`   | Change password      | `{ username, newPassword }`           |

### Employees (`/api/employees`)

| Method | Endpoint                    | Description                      | Query/Body                            |
|--------|-----------------------------|----------------------------------|---------------------------------------|
| GET    | `/`                         | List employees (paginated)       | `?page=&limit=&name=&status=&designation=&type=&project=&subCenter=` |
| GET    | `/:id`                      | Get employee by employee ID      | -                                     |
| POST   | `/`                         | Create employee                  | Employee JSON body                    |
| PUT    | `/:id`                      | Update employee                  | Partial employee JSON                 |
| POST   | `/:id/transfer`             | Record transfer                  | `{ project, projectOffice, subCenter, reason }` |
| POST   | `/:id/separation`           | Record resignation/termination   | `{ type, date, remarks }`             |
| POST   | `/:id/close-file`           | Close employee file              | `{ date, remarks }`                   |
| GET    | `/stats`                    | Dashboard statistics             | -                                     |
| GET    | `/logs/hold`                | Salary hold log                  | -                                     |
| GET    | `/logs/separation`          | Separation log                   | -                                     |
| GET    | `/logs/transfer`            | Transfer log                     | -                                     |
| GET    | `/logs/file-close`          | File closing log                 | -                                     |

### Attendance (`/api/attendance`)

| Method | Endpoint                    | Description                      | Body/Query                            |
|--------|-----------------------------|----------------------------------|---------------------------------------|
| POST   | `/check-in`                 | Check in (multipart: selfie)     | `{ employeeId, lat, lng, address, justification? }` + selfie file |
| POST   | `/check-out`                | Check out (multipart: selfie)    | `{ employeeId, lat, lng, address, justification?, overDutyJustification? }` + selfie file |
| GET    | `/today/:employeeId`        | Today's record                   | -                                     |
| GET    | `/history/:employeeId`      | Last 30 days history             | -                                     |
| GET    | `/report`                   | Monthly report for export        | `?month=&year=`                       |
| GET    | `/compliance/:employeeId`   | Compliance status                | -                                     |
| GET    | `/pending/:approverId`      | Pending approvals for approver   | -                                     |
| POST   | `/approve`                  | Approve/reject attendance        | `{ attendanceId, approverId, action, comments }` |

### Leave (`/api/leave`)

| Method | Endpoint                        | Description                  | Body/Query                         |
|--------|---------------------------------|------------------------------|------------------------------------|
| POST   | `/apply`                        | Apply for leave              | `{ employeeId, type, startDate, endDate, days, reason }` |
| GET    | `/history/:employeeId`          | Leave history                | -                                  |
| GET    | `/pending/:approverId`          | Pending for approver         | -                                  |
| POST   | `/approve`                      | Approve/reject leave         | `{ leaveId, approverId, action, comments }` |
| GET    | `/check-pending/:employeeId`    | Check if employee has pending| -                                  |
| GET    | `/approver-history/:approverId` | Approver's action history    | `?status=Approved|Rejected`        |

### Payroll (`/api/payroll`)

| Method | Endpoint         | Description              | Body                               |
|--------|------------------|--------------------------|-------------------------------------|
| POST   | `/archive`       | Save salary sheet        | `{ monthYear, jsonData, generatedBy }` |
| GET    | `/archive`       | List all archives        | -                                   |
| GET    | `/archive/:id`   | Get specific archive     | -                                   |

### Shifts (`/api/shifts`)

| Method | Endpoint  | Description    | Body                                  |
|--------|-----------|----------------|---------------------------------------|
| GET    | `/`       | List all shifts| -                                     |
| POST   | `/`       | Create shift   | `{ name, startTime, endTime, graceTime }` |
| PUT    | `/:id`    | Update shift   | Partial shift JSON                    |
| DELETE | `/:id`    | Delete shift   | -                                     |

### Global Schedules (`/api/global-schedules`)

| Method | Endpoint  | Description        | Body                                    |
|--------|-----------|--------------------|-----------------------------------------|
| GET    | `/`       | List schedules     | -                                       |
| POST   | `/`       | Create schedule    | `{ name, startDate, endDate, startTime, endTime, appliedShifts[] }` |
| DELETE | `/:id`    | Delete schedule    | -                                       |

### Duty Roster (`/api/roster`)

| Method | Endpoint                  | Description              | Query/Body                       |
|--------|---------------------------|--------------------------|----------------------------------|
| GET    | `/template`               | Download Excel template  | `?subCenter=&month=&year=`       |
| POST   | `/upload`                 | Upload filled roster     | Multipart file (roster)          |
| GET    | `/my-roster/:employeeId`  | Get employee's roster    | `?start=&end=`                   |

### Sub-Center Settings (`/api/subcenters`)

| Method | Endpoint | Description          | Body                                        |
|--------|----------|----------------------|---------------------------------------------|
| GET    | `/`      | List all settings    | -                                           |
| POST   | `/`      | Upsert setting       | `{ subCenterName, leaveHierarchy[], attendanceInHierarchy[], attendanceOutHierarchy[], isComplianceRelaxed }` |

### Policies (`/api/policies`)

| Method | Endpoint             | Description                    | Body                           |
|--------|----------------------|--------------------------------|--------------------------------|
| GET    | `/leave`             | List leave policies            | -                              |
| GET    | `/leave/:id`         | Get leave policy               | -                              |
| POST   | `/leave`             | Create leave policy            | LeavePolicy JSON               |
| PUT    | `/leave/:id`         | Update leave policy            | Partial LeavePolicy JSON       |
| DELETE | `/leave/:id`         | Delete leave policy            | -                              |
| GET    | `/salary`            | List salary policies           | -                              |
| GET    | `/salary/:id`        | Get salary policy              | -                              |
| POST   | `/salary`            | Create salary policy           | SalaryPolicy JSON              |
| PUT    | `/salary/:id`        | Update salary policy           | Partial SalaryPolicy JSON      |
| DELETE | `/salary/:id`        | Delete salary policy           | -                              |
| POST   | `/salary/lookup`     | Get basic % for employee       | `{ grossSalary, joiningDate }` |

---

## Database Models

### Employee
Core entity with fields for: basic info (ID, name, type, designation), project assignment (project, office, sub-center), personal details (DOB, address, identification), salary structure (earnings + deductions), leave balances (sick: 14, casual: 10, earned: 0), status lifecycle, transfer history, and individual approval hierarchy overrides.

### Attendance
Daily record per employee with: check-in/out timestamps, GPS coordinates, selfie URLs, shift snapshot, late/out-of-range/early-out flags, work hours, and full approval tracking (hierarchy, current approver, logs).

### Leave
Leave request with: type (Sick/Casual/Earned/LWP), date range, day count, reason, approval hierarchy snapshot, and sequential approval logs.

### Shift
Named shift definition: start time, end time, grace period (minutes), active flag.

### DutyRoster
Per-employee per-day shift override: shift code (A/B/C/G), times, off-day flag. Uploaded via Excel.

### GlobalSchedule
Organization-wide time override (e.g., Ramadan hours): date range, time override, optional shift filter.

### Payroll
Monthly salary sheet archive: month-year identifier, full JSON data array, generation metadata.

### SalaryPolicy
Slab-based salary rules: gross salary ranges mapped to basic percentages (pre/post joining date cutoff), festival/incentive bonus percentages.

### LeavePolicy
Leave type definitions: days allowed, employee type applicability, gender restrictions, carry-forward rules.

### SubCenterSetting
Per-subcenter configuration: leave/attendance approval hierarchies, compliance relaxation flag.

### User
Authentication: name, email, hashed password, role (Admin/Manager/Employee), linked employee ID.

---

## Approval Workflow

The system supports multi-level sequential approval for attendance and leave requests.

**Hierarchy Resolution Order** (highest priority first):
1. **Employee-level** - Individual hierarchy overrides set on the employee record
2. **Sub-Center-level** - Hierarchies defined in SubCenterSetting for the employee's sub-center
3. **Reporting Manager chain** - Auto-built 2-level chain from the reporting manager field

**Separate hierarchies exist for:**
- Leave approval (`leaveHierarchy`)
- Attendance check-in approval (`attendanceInHierarchy`)
- Attendance check-out approval (`attendanceOutHierarchy`)

**Flow:** Request -> First Approver -> (Approve) -> Next Approver -> ... -> Final Approval. Rejection at any level stops the chain.

---

## Compliance Engine

Enforced at check-in and check-out time:

| Rule                        | Threshold        | Action                              |
|-----------------------------|------------------|-------------------------------------|
| Consecutive working days    | 7 days           | Justification required              |
| Consecutive working days    | 10 days          | Check-in blocked                    |
| Weekly total hours          | 48 hours         | Warning                             |
| Weekly overtime             | 12 hours OT      | Check-in blocked                    |
| Weekly total hours          | 60 hours         | Check-in blocked                    |
| Annual average weekly hours | 56 hours/week    | Flagged                             |
| Over-duty (single day)      | >9 hours         | Check-out justification required    |

Compliance can be relaxed per-employee (`isComplianceRelaxed`) or per-subcenter via SubCenterSetting.

---

## Shift Resolution

When determining which shift applies for an employee on a given date:

1. **Duty Roster** (highest priority) - Manual per-employee assignment via Excel upload
2. **Global Schedule** - Organization-wide overrides (only if the employee's shift is in the `appliedShifts` list, or if no shift filter is set)
3. **Employee's assigned shift** - The shift linked to the employee record
4. **Default** - 09:00 to 18:00 with 15-minute grace

---

## Mobile App

The project includes a Capacitor-based Android wrapper.

- **App ID**: `com.metal.hrms`
- **Web Dir**: `www/`
- Mobile-specific pages: `mobile_login.html`, `mobile_dashboard.html`
- Mobile JS: `js/mobile_app.js`

### Building for Android

```bash
npx cap sync android
npx cap open android    # Opens in Android Studio
```

---

## Creating an Admin User

Use the provided script:

```bash
cd server
node create_admin.js
```

---

## License

ISC
