# 🏭 Sara Textile ERP System

A modern, full-stack Enterprise Resource Planning (ERP) platform purpose-built for **Sara Textile Weaving Mills**.

---

## 🚀 Key Modules

1. **💰 Accounts & Financials**
   - Monthly Cost Statement & Consumption Analysis
   - Daily Factory Expenses with Category Breakdown
   - Inventory Inward & Material Stock Register
   - Petty Cash & Imprest Management
   - Traders / Suppliers Ledger & Billing

2. **👥 Payroll & Wages Module**
   - Sheet 1: Master Employee Register (46 Core Factory Staff)
   - Sheet 2: Staff Advances & Fortnightly Recoveries
   - Sheet 3: Permanent Staff Salaries
   - Sheet 4: Contract Staff Salaries (Excel 30-Day Base Standard)
   - Sheet 5: Contract Overtime Disbursements
   - Sheet 6: Technical Staff Efficiency & Incentives
   - Sheet 7: Net Payment Full Settlement
   - Sheet 8: Weavers Wages & Overtime Register
   - Sheet 9: Helpers Wages Register
   - Sheet 10: Contractors Billing Register
   - Sheet 11: Disbursement Synopsis

3. **🧵 Floor & Production Tracking**
   - Live Weaving Floor Matrix (Looms 1–28)
   - Daily Production, Shift Efficiencies & RPM Monitoring
   - Beam & Weft Stock Reconciliation
   - Active Qualities & Cloth Specifications

4. **📋 Delivery Challan Management**
   - Fast Piece Builder & Weight Computation
   - Professional A4/Legal Print Layouts with Mill Watermarks

---

## 🛠 Tech Stack

- **Framework**: Next.js 15+ (App Router, Standalone Output)
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS v4, Lucide Icons
- **Database / ORM**: PostgreSQL, Prisma ORM
- **Authentication**: JWT Cookie-Based Sessions with Role-Based Access Control (RBAC)
- **Containerization**: Docker & Docker Compose

---

## 💻 Local Development Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/sara-textile.git
cd sara-textile
npm install
```

### 2. Configure Environment
Create a `.env` or `.env.local` file based on `.env.example`:
```bash
cp .env.example .env
```

### 3. Run Database (Docker)
```bash
docker-compose up -d postgres
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 Production Deployment (Docker / VPS)

```bash
docker compose -f docker-compose.yml --profile prod up -d --build
```

---

## 🔒 User Roles & Permissions

| Role | Permissions |
| :--- | :--- |
| **Admin** | Full system access across Payroll, Accounts, Production, and User Management. |
| **Accountant** | Full access to Payroll and Accounts; View-only on Production floor. |
| **Quality Controller** | Full access to Production Floor and Challans; Blocked from Accounts & Payroll. |
