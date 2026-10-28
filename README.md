# 🏭 Sara Textile ERP System

A modern, high-performance Enterprise Resource Planning (ERP) and Manufacturing Execution System (MES) purpose-built for **Sara Textile Weaving Mills**.

Designed to handle real-world textile floor operations: daily multi-shift weaving metrics, quality & beam lifecycles, automated multi-tier payroll, mill financials, and disaster-recovery grade backups.

---

## 🌟 Core System Modules

### 1. 🧵 Floor & Weaving Production Execution (Looms 1–34)
Manages the complete physical shed across **34 high-speed looms**:
* **G6200 Shed (Looms 1–20)**: Rapier looms for heavy & medium suiting/fabrics.
* **PU Shed (Looms 21–26)**: Projectile looms for specialized widths and shirting.
* **G6300 Shed (Looms 27–34)**: Advanced rapier weaving machinery.

#### Key Production Capabilities:
* **Daily Multi-Shift Tracking**: Records Shift A, Shift B, Roller Hours, RPM, Pick, Actual Meters, Running Theoretical Meters, and 24h Plant Capacity.
* **📷 AI Register Scanner (OCR via Google Gemini Flash)**:
  * Photograph handwritten floor registers directly from mobile cameras.
  * Auto-extracts loom rows, shift meters, weights, and notes in **1–2 seconds**.
  * Side-by-side verification dialog before persisting to daily sheets.
* **🎙️ Voice-Assisted Fault Logging (Groq / Whisper)**:
  * Hands-free voice remarks in Urdu, Punjabi, or English converted into structured log records.
* **Monthly Output & Efficiency Matrix**:
  * Day × Loom heatmaps, Fortnightly & Monthly totals, and Running vs. 24h Capacity comparisons.
* **Beam & Quality Lifecycle**:
  * Track Warping, Sizing, Loom Mounting/Gaiting, and Beam-End transitions.
* **Historical Quality Archive**:
  * Permanent, tamper-proof repository of yearly Excel workbooks ("All Summer Quality" 2020 onwards).
  * Enforced with SHA-256 checksums and database-level read-only triggers.

---

### 2. 👥 Factory Payroll & 11-Sheet Wages Module
Full automated calculation engine replicating mill wage disbursement standards:
* **Sheet 1 — Master Employee Register**: Active factory workforce records.
* **Sheet 2 — Advances & Loan Recoveries**: Fortnightly deductions and running balances.
* **Sheet 3 — Permanent Staff Salaries**: Fixed monthly executive and operational pay.
* **Sheet 4 — Contract Staff Salaries**: 30-day base standard wages.
* **Sheet 5 — Contract Overtime**: Shift and holiday overtime computation.
* **Sheet 6 — Technical Incentives**: Efficiency-linked bonuses for supervisors and jobbers.
* **Sheet 7 — Net Settlement Ledger**: Consolidated wage payments and sign-off sheets.
* **Sheet 8 — Weavers Piece-Rate Register**: Meter-based piece-rate production earnings.
* **Sheet 9 — Helpers Register**: Fixed and shift-based assistant wages.
* **Sheet 10 — Contractors Billing**: Third-party labor accounts and payouts.
* **Sheet 11 — Disbursement Synopsis**: Bank transfer and cash breakdown summaries.

---

### 3. 💰 Accounts & Mill Financials
* **Double-Entry General Ledger**: Real-time accounts, trial balances, and journals.
* **Supplier & Trader Ledgers**: Yarn suppliers, sizing units, and accessories billing.
* **Daily Factory Expenses**: Petty cash, imprest vouchers, and categorized expense tracking.
* **Costing & Consumption**: Monthly yarn and energy cost statements per meter of fabric.
* **Month-End Lock**: Prevents accidental or unauthorized modifications to closed fiscal months.

---

### 4. 📋 Delivery Challans & Dispatch
* **Piece Builder**: Rapid roll-by-roll piece meter and weight entries.
* **Automated Tare & Net Weight Calculation**: Shrinkage and quality allowance checks.
* **Print-Ready Documents**: Instant A4/Legal print-outs with official mill watermarks.

---

## 🛡️ Data Safety, Backups & Disaster Recovery

Sara Textile ERP enforces a **3-Layer Redundant Backup Architecture**:

```mermaid
flowchart TD
    DB[(PostgreSQL Database)] -->|On Every App Start / Deploy| Snapshots[In-DB Snapshots\ndata_snapshots schema\nKeeps last 20 copies]
    DB -->|Daily 02:15 AM Cron| PgDump[pg_dump Compressed File\n/root/sara-backups/\n30 Days Kept]
    PgDump -->|rclone sync| GDrive[Google Drive Cloud Storage\nEncrypted Remote Vault]
```

1. **In-Database Snapshots (`data_snapshots`)**:
   Automatic table-level snapshots taken immediately upon deployment or administrative trigger.
2. **Nightly Disk Backup (`pg_dump`)**:
   Automated cron job runs at `02:15 AM` daily, creating gzip-compressed `.sql.gz` dumps.
3. **Offsite Cloud Sync (`rclone` + Google Drive)**:
   Mirrors backups to secure, offsite company Google Drive storage for full disaster recovery.
4. **Live System Health Monitor (`/admin/system`)**:
   Monitors disk usage, database size, backup freshness, and AI service status in real time.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Server Actions, Standalone Output) |
| **Frontend** | [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/), Bootstrap 5 Grid, Lucide Icons |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode) |
| **Database & ORM** | [PostgreSQL 16](https://www.postgresql.org/) with [Prisma 7](https://www.prisma.io/) (`@prisma/adapter-pg`) |
| **AI & Vision** | Google Gemini 1.5/2.0 Flash (OCR), Groq Whisper (Voice-to-Text) |
| **Document Generation** | jsPDF & jsPDF-AutoTable (Client-side & Server-side PDF generation) |
| **Cloud Backups** | Rclone + Google Drive API |
| **Containerization** | Docker & Docker Compose |

---

## 💻 Local Development Setup

### 1. Prerequisites
* **Node.js**: v20.x or v22.x LTS
* **Docker & Docker Compose** (for PostgreSQL database)
* **npm** or **pnpm**

### 2. Clone Repository & Install Dependencies
```bash
git clone https://github.com/your-username/sara-textile.git
cd sara-textile
npm install
```

### 3. Setup Environment Variables
Create your local environment configuration:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` is configured:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sara_textile?schema=public"
JWT_SECRET="your-development-jwt-secret-key"
GEMINI_API_KEY="your-google-ai-studio-key"   # Optional: For AI Register Scan
GROQ_API_KEY="your-groq-key"               # Optional: For Voice-to-Text
```

### 4. Start PostgreSQL (Docker)
```bash
docker compose up -d postgres
```

### 5. Generate Prisma Client & Run Migrations
```bash
npx prisma generate
npx prisma db push
```

### 6. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Testing & Code Quality

Run tests and verification checks:
```bash
# Run unit & integration tests
npm test

# Type-check TypeScript codebase
npm run typecheck

# Run linter
npm run lint
```

---

## 🔒 User Roles & Access Control (RBAC)

| Role | Access Scope |
| :--- | :--- |
| **Admin** | Unrestricted access across Floor, Payroll, Financial Accounts, User Permissions, and System Health. |
| **Accountant** | Full access to Payroll, Wages, Bills, Expenses, and Ledger; View-only production floor metrics. |
| **Quality Controller** | Full access to Weaving Daily Entry, Shift Tracking, Beam Mounting, and Challan Dispatch. |
| **Weaving Supervisor** | Floor Daily Entry and Loom Stoppage/Fault Reporting; Restricted from financial and salary data. |

---

## 📜 License
Proprietary software developed exclusively for **Sara Textile Weaving Mills**. All rights reserved.
