# 🏭 Sara Textile ERP & Manufacturing Execution System (MES)

> **Enterprise Software Architecture, Functional Specifications, and Technical Valuation Blueprint**  
> *Built for Sara Textile Mills — Industrial Rapier & Projectile Weaving Operations*

---

## 📑 Table of Contents
1. [Executive Summary & System Scope](#1-executive-summary--system-scope)
2. [Complete Technology Architecture](#2-complete-technology-architecture)
3. [Exhaustive Functional Module Breakdown](#3-exhaustive-functional-module-breakdown)
   - [3.1 Production Floor & Loom Execution (Looms 1–34)](#31-production-floor--loom-execution-looms-134)
   - [3.2 AI Vision OCR & Hands-Free Voice Defect Reporting](#32-ai-vision-ocr--hands-free-voice-defect-reporting)
   - [3.3 Beam Lifecycle & In-Shed Gaiting Tracker](#33-beam-lifecycle--in-shed-gaiting-tracker)
   - [3.4 Yarn Inventory & Floor Issuance Ledger](#34-yarn-inventory--floor-issuance-ledger)
   - [3.5 Fabric Quality Catalog & Immutable Archive](#35-fabric-quality-catalog--immutable-archive)
   - [3.6 11-Sheet Factory Payroll & Labor Wages Engine](#36-11-sheet-factory-payroll--labor-wages-engine)
   - [3.7 Double-Entry Accounts, Petty Cash & Costing Statements](#37-double-entry-accounts-petty-cash--costing-statements)
   - [3.8 Delivery Challans, Tare/Net Weight & Dispatch](#38-delivery-challans-tarenet-weight--dispatch)
   - [3.9 Enterprise Security, RBAC & Audit Trails](#39-enterprise-security-rbac--audit-trails)
   - [3.10 3-Tier Redundant Disaster Recovery Architecture](#310-3-tier-redundant-disaster-recovery-architecture)
4. [Textile Domain Formulas & Business Calculation Engines](#4-textile-domain-formulas--business-calculation-engines)
5. [Database Entity-Relationship & Data Flow Model](#5-database-entity-relationship--data-flow-model)
6. [DevOps, Infrastructure & Deployment Runbooks](#6-devops-infrastructure--deployment-runbooks)
   - [6.1 Local Development Environment](#61-local-development-environment)
   - [6.2 Production Bare-Metal / Linux VPS Deployment](#62-production-bare-metal--linux-vps-deployment)
   - [6.3 Hybrid Cloud / Vercel Serverless Architecture](#63-hybrid-cloud--vercel-serverless-architecture)
7. [Engineering Work Breakdown Structure (WBS) & Cost Estimation Guide](#7-engineering-work-breakdown-structure-wbs--cost-estimation-guide)

---

## 1. Executive Summary & System Scope

**Sara Textile ERP/MES** is a custom-engineered, mission-critical industrial software suite specifically designed to digitize and automate the entire operational lifecycle of a modern textile weaving mill running **34 industrial looms** across multiple sheds.

Unlike generic off-the-shelf ERP platforms (like SAP, Odoo, or NetSuite), this platform was built from the ground up to solve the exact physics, math, and labor structures unique to textile manufacturing:
* Real-time 2-shift daily weaving metrics (Shift A, Shift B, Roller Hours, RPM, Pick, Actual vs. Theoretical Meters, Running Efficiency).
* Same-day dual-quality loom segments.
* Artificial Intelligence (AI) mobile camera OCR scanner for paper floor registers.
* Hands-free multilingual voice defect logging (Urdu / Punjabi / English).
* Automated 11-sheet progressive wage calculations for permanent staff, contract labor, weavers, and helpers.
* Mill financial ledgers with double-entry accounting, petty cash registers, and per-meter cost statements.
* 3-tier disaster recovery architecture providing zero-data-loss guarantees.

---

## 2. Complete Technology Architecture

```mermaid
graph TB
    subgraph Client Layer
        Web[Desktop Browser - Chrome/Firefox/Safari]
        Mobile[Mobile Devices - Camera OCR & Floor Inspection]
    end

    subgraph Application Layer - Next.js 16 App Router
        Auth[Auth & Session Engine\nHTTP-only JWT Cookies]
        RBAC[Granular Permission Gate\nModule x Resource x Action x Scope]
        
        subgraph Server Actions & Route Handlers
            FloorAPI[Floor Production API\n/api/floor/*]
            AIEngine[AI Services\nGemini 2.0 Flash + Groq Whisper]
            PayrollAPI[Payroll Engine\nOptimistic Locking & Versioning]
            AccountsAPI[Financial Ledger API\nMulti-account SARA/FOI]
            ReportAPI[Fast Aggregation Engine\nNormalized SQL Ledger]
        end
    end

    subgraph Data & Storage Layer
        Prisma[Prisma 7 ORM\n@prisma/adapter-pg Connection Pool]
        Postgres[(PostgreSQL 16 Primary DB\nSchemas: public, data_snapshots)]
        LedgerTable[Derived Production Ledger\nfloor_production table]
    end

    subgraph Infrastructure & Disaster Recovery
        InDBSnap[Tier 1: In-DB Snapshots\nLast 20 Auto-Versions]
        PgDump[Tier 2: Nightly pg_dump\n30-Day Rotated .sql.gz]
        GDrive[Tier 3: Encrypted Cloud Vault\nRclone to Google Drive]
    end

    Client Layer -->|HTTPS / WSS| Application Layer
    Application Layer --> Prisma
    Prisma --> Postgres
    Postgres -.-> LedgerTable
    Postgres --> InDBSnap
    Postgres --> PgDump
    PgDump --> GDrive
```

### Full Tech Stack Breakdown

| Architectural Layer | Technologies & Libraries | Key Responsibilities |
| :--- | :--- | :--- |
| **Framework** | Next.js 16 (React 19, App Router) | Server-Side Rendering (SSR), Server Actions, API Route Handlers, Standalone Output |
| **Programming Language** | TypeScript 5 (Strict Mode) | 100% Type-safe codebase, strict compiler flags, zero `any` usage |
| **Styling & UI System** | Tailwind CSS v4, Bootstrap 5 Grid, Lucide Icons | Custom responsive industrial design system, dark/light contrast, mobile-first floor views |
| **Database & ORM** | PostgreSQL 16, Prisma 7 (`@prisma/adapter-pg`, `pg.Pool`) | Relational persistence, transactional safety, advisory locking, connection pooling |
| **AI Vision & Voice** | Google Gemini 2.0 Flash, Groq Whisper API | Handwritten register OCR photo extraction (1–2s), multilingual floor voice remarks |
| **Reporting & Export** | jsPDF, jsPDF-AutoTable, SVG MiniCharts | High-speed client & server PDF generation, official mill letterheads, interactive trend charts |
| **Security & Auth** | Jose (JWT), Bcrypt.js, Web Crypto API | Stateless secure HTTP-only cookies, password hashing, brute-force IP rate-limiting |
| **DevOps & Backups** | Docker Compose, Rclone, Systemd/Cron, Nginx | Containerized PostgreSQL, automated 3-tier backup pipeline, SSL termination |

---

## 3. Exhaustive Functional Module Breakdown

### 3.1 Production Floor & Loom Execution (Looms 1–34)
Manages the complete physical shed across **34 high-speed industrial looms**:
* **G6200 Shed (Looms 1–20)**: High-speed rapier looms dedicated to heavy suiting and tropical blends.
* **PU Shed (Looms 21–26)**: Sulzer projectile weaving machinery for wide-width shirting and technical weaves.
* **G6300 Shed (Looms 27–34)**: Advanced electronic rapier looms with quick-style change capabilities.

#### Key Production Capabilities:
1. **Daily Multi-Shift Production Grid**:
   - Captures Shift A (Day) and Shift B (Night) meters, roller hours, running hours, RPM, pick, reed, and fabric type.
   - Automatically computes total meters, running efficiency percentage, theoretical capacity, and downtime losses.
2. **Same-Day Dual Quality Segments**:
   - Supports mid-day quality changes where a single loom runs Quality A for the first half of the day and Quality B for the remainder, preserving individual lot tracking without corrupting day aggregates.
3. **High-Speed Normalized Ledger Architecture**:
   - User inputs are persisted into JSON documents (`floor_daily_sheets`), while a background derivation engine normalizes data into a relational table (`floor_production`) with composite indexing for sub-second 30-day and 365-day trend reporting.

---

### 3.2 AI Vision OCR & Hands-Free Voice Defect Reporting
Built specifically for mill floor supervisors who previously spent hours manually transcribing paper register sheets into spreadsheets:
1. **AI Register Scanner (Google Gemini 2.0 Flash Vision)**:
   - Takes a photo of handwritten Urdu/English floor register sheets using any mobile smartphone camera.
   - Extracts date, loom numbers, shift meters, picks, and fabric lots within **1.5 seconds**.
   - Side-by-side interactive verification modal highlights confidence scores before saving to the database.
2. **Voice-Assisted Defect Logger (Groq Whisper)**:
   - Supervisors speak inspection notes directly into their phone in Urdu, Punjabi, or English (e.g., *"Loom 14 reed mark observed at 120m mark"*).
   - Whisper transcribes and tags the defect by loom, shift, and severity for quality audit tracking.

---

### 3.3 Beam Lifecycle & In-Shed Gaiting Tracker
Tracks warp beams from preparation to exhaustion:
1. **Full Lifecycle Tracking**:
   - `WARPING` $\rightarrow$ `SIZING` $\rightarrow$ `STORE` (In Stock) $\rightarrow$ `MOUNTED` (Gaiting on Loom) $\rightarrow$ `BEAM_ENDED` $\rightarrow$ `ARCHIVED`.
2. **Technical Beam Attributes**:
   - Beam Number, Total Ends/Threads, Reed Width (inches), Length (meters), Loom Category, SW Lot Number, and Beam Repeat specifications.
3. **Physical Floor Location**:
   - Tracks whether the spare beam is located in the central warehouse, at the sizing contractor facility, or parked behind a specific loom on the weaving floor.

---

### 3.4 Yarn Inventory & Floor Issuance Ledger
Maintains dual-unit balances for all cotton, polyester, viscose, and blended yarns:
1. **Dual Unit Calculations**:
   - Auto-computes stock simultaneously in **Bags**, **Kilograms (Kg)**, and **Pounds (Lbs)** using official textile conversion constants ($1\text{ kg} = 2.20462\text{ lbs}$).
2. **Issuance Tracking**:
   - Logs daily weft and warp yarn issuances to individual looms by pick density and fabric quality.
   - Tracks contractor inward shipments, gate passes, supplier lot numbers, and safety stock threshold alerts.

---

### 3.5 Fabric Quality Catalog & Immutable Archive
1. **Master Quality Catalog**:
   - Stores fabric recipes: Quality Name, Fabric Type (Suiting, Shirting, Gabardine), Weave Plan, Weft Plan, Warp Yarn Count, Weft Yarn Count, Reed, Pick, Width, and Target GSM.
   - Version-controlled history (`specHistory`, `yarnHistory`, `loomEnds`).
2. **Yearly Historical Workbooks (2020–2026 Archive)**:
   - Full digital archive of 6+ years of mill production spreadsheets ("All Summer Quality").
   - Protected with database-level read-only constraints and SHA-256 integrity verification.

---

### 3.6 11-Sheet Factory Payroll & Labor Wages Engine
An industrial wage processing engine specifically mapped to Pakistani textile labor compliance:

| Sheet | Module Title | Business Rules & Calculation Engine |
| :---: | :--- | :--- |
| **01** | **Master Employee Register** | Employee profiles, biometric IDs, CNIC, appointment dates, avatars, designations, and department categorization. |
| **02** | **Advances & Loan Deductions** | Running loan balances, fortnightly deduction schedules, and automated salary deductions. |
| **03** | **Permanent Staff Salaries** | 30-day base monthly salaries for executive, administrative, and engineering staff. |
| **04** | **Contract Staff Wages** | Daily-wage and attendance-based wage sheets for operational floor workers. |
| **05** | **Contract Overtime** | Automated multiplier calculation for overtime hours worked across shifts and public holidays. |
| **06** | **Technical Efficiency Incentives**| Tiered performance bonuses awarded to supervisors and jobbers when their assigned loom sheds exceed 85%, 88%, and 92% efficiency. |
| **07** | **Net Settlement Ledger** | Master payout calculation combining base pay, overtime, incentives, minus advances, tax, and canteen deductions. |
| **08** | **Weavers Piece-Rate Register** | Progressive piece-rate earnings calculated per 100 meters woven based on fabric pick density. |
| **09** | **Helpers Wage Register** | Daily and shift-based helper compensations. |
| **10** | **Contractors Labor Billing** | Retainer and volume-based invoices for third-party labor contractors. |
| **11** | **Disbursement Synopsis** | Bank transfer schedules, cash denomination breakdown, and printable employee signature/thumbprint sheets. |

*Concurrency Architecture*: Built with optimistic row-level locking (`version` counter) and advisory locks (`pg_advisory_xact_lock`) ensuring multi-user payroll entry never results in overwrites or race conditions.

---

### 3.7 Double-Entry Accounts, Petty Cash & Costing Statements
1. **Multi-Entity Accounting**:
   - Strict segregation between sister mill concerns (**SARA** and **FOI** accounts).
2. **Party Billing & Supplier Ledgers**:
   - Invoices, inward delivery challans, line items, and partial payment vouchers for yarn suppliers, engineering workshops, and sizing contractors.
3. **Daily Factory Petty Cash (Imprest)**:
   - Voucher-level debit/credit recording for urgent mill repairs, transport, electrical hardware, and floor staff refreshments.
4. **Per-Meter Production Costing Engine**:
   - Comprehensive monthly costing inputs combining raw yarn consumption, power/fuel costs, maintenance parts, and labor to derive exact cost-per-meter woven fabric.
5. **Fiscal Month-End Lock**:
   - Cryptographic administrative lock preventing backdated entry or modification once accounts are finalized.

---

### 3.8 Delivery Challans, Tare/Net Weight & Dispatch
1. **Piece Builder**:
   - Records individual roll lengths (meters) and gross roll weights.
2. **Tare & Net Weight Engine**:
   - Automatically deducts tube/wrapping tare weight and calculates shrinkage allowances to verify woven weight matches yarn issuance.
3. **Print-Ready Documentation**:
   - Generates official delivery challans with mill watermarks, gate passes, and transport details in legal/A4 PDF format.

---

### 3.9 Enterprise Security, RBAC & Audit Trails
1. **Granular Role-Based Access Control**:
   - Permission schema: `Module` $\times$ `Resource` $\times$ `Action` (`VIEW`, `CREATE`, `UPDATE`, `DELETE`, `APPROVE`, `EXPORT`, `MANAGE`) $\times$ `Scope` (`ALL`, `OWN`, `DEPARTMENT`).
   - Pre-configured roles: `ADMIN`, `ACCOUNTANT`, `QUALITY_CONTROLLER`, `WEAVING_SUPERVISOR`.
2. **Immutable Audit Trail (`audit_logs`)**:
   - Logs who changed what, timestamp, client IP, affected entity, and JSON change diffs (`oldValue` vs `newValue`).
3. **Brute-Force & Session Protection**:
   - Automatic IP fingerprint throttling on failed logins.
   - Stateless HTTP-only JWT session cookies with cryptographic signing.

---

### 3.10 3-Tier Redundant Disaster Recovery Architecture
Ensures zero data loss under hardware failure, ransomware, or server migration:
* **Tier 1 (Instant Rollback)**: In-database schema snapshots (`data_snapshots`) taken before every deployment or migration, retaining the last 20 snapshots.
* **Tier 2 (Nightly Local Dumps)**: Automated `cron` job runs at `02:15 AM PKT` creating compressed `pg_dump` `.sql.gz` archives rotated on a 30-day cycle.
* **Tier 3 (Offsite Cloud Vault)**: Automated `rclone` sync mirrors compressed dumps to an offsite encrypted Google Drive cloud bucket.
* **Health Dashboard (`/admin/system`)**: Real-time monitoring of disk storage, database size, memory utilization, and backup freshness.

---

## 4. Textile Domain Formulas & Business Calculation Engines

The system implements exact textile manufacturing physics formulas in its core calculation engines:

### 1. 100% Running Theoretical Meters ($M_{\text{theo}}$)
$$\text{Theoretical Meters (24h)} = \frac{\text{RPM} \times \text{Running Hours} \times 60}{\text{Pick per Inch} \times 39.3701}$$
*(Where $39.3701$ is inches per meter).*

### 2. Mill Day Running Efficiency ($\eta$)
Instead of averaging percentages across looms (which introduces mathematical skew), the system computes aggregate mill efficiency identically to textile engineering standards:
$$\eta = \frac{\sum_{i=1}^{34} (\text{Shift A Meters}_i + \text{Shift B Meters}_i)}{\sum_{i=1}^{34} \text{Theoretical Meters}_i} \times 100$$

### 3. Yarn Dual-Unit Conversions
$$\text{Weight in Pounds (lbs)} = \text{Weight in Kilograms (kg)} \times 2.20462$$
$$\text{Standard Yarn Bags} = \frac{\text{Weight in Pounds (lbs)}}{100\text{ lbs (or nominal bag weight)}}$$

### 4. Fabric GSM Estimation (Grams per Square Meter)
$$\text{GSM} = \left( \frac{\text{Warp Ends}}{\text{Warp Count}} + \frac{\text{Weft Picks}}{\text{Weft Count}} \right) \times \text{Fiber Constant (Blended)}$$

---

## 5. Database Entity-Relationship & Data Flow Model

```mermaid
erDiagram
    USERS ||--o{ USER_PERMISSIONS : has
    ROLES ||--o{ ROLE_PERMISSIONS : has
    ROLES ||--o{ USERS : assigned_to
    
    FLOOR_LOOMS ||--o{ FLOOR_DAILY_SHEETS : generates
    FLOOR_QUALITIES ||--o{ FLOOR_DAILY_SHEETS : woven_in
    FLOOR_BEAMS ||--o{ FLOOR_LOOMS : mounted_on
    
    FLOOR_YARNS ||--o{ FLOOR_YARN_MOVEMENTS : tracks
    FLOOR_YARNS ||--o{ FLOOR_YARN_ISSUANCES : issues
    
    FLOOR_DAILY_SHEETS ||--|| FLOOR_PRODUCTION : derives_into
    
    ACC_PARTIES ||--o{ ACC_BILLS : bills
    ACC_BILLS ||--o{ ACC_BILL_LINES : contains
    ACC_PARTIES ||--o{ ACC_PAYMENTS : receives
    
    PAYROLL_ROWS }o--|| PAYROLL_STORE : versioned_state
```

---

## 6. DevOps, Infrastructure & Deployment Runbooks

### 6.1 Local Development Environment

```bash
# 1. Clone repository
git clone https://github.com/Sara-Textile/sara-textile.git
cd sara-textile

# 2. Install dependencies (Node.js 20+ LTS required)
npm install

# 3. Environment variables configuration
cp .env.example .env
# Set DATABASE_URL, JWT_SECRET, GEMINI_API_KEY, GROQ_API_KEY in .env

# 4. Start local PostgreSQL via Docker
docker compose up -d postgres

# 5. Push Prisma schema & seed initial users
npx prisma db push
npm run seed

# 6. Start Next.js development server
npm run dev
# App is live on http://localhost:3000
```

### 6.2 Production Bare-Metal / Linux VPS Deployment

For production deployments on Ubuntu 22.04 / 24.04 LTS VPS:
```bash
# 1. Build standalone Next.js production bundle
npm run build

# 2. Process Manager (PM2) setup
npm install -g pm2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup

# 3. Nginx Reverse Proxy with SSL (Let's Encrypt)
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d erp.saratextile.com
```

### 6.3 Hybrid Cloud / Vercel Serverless Architecture

When deployed to serverless platforms (e.g. Vercel + Neon Cloud PostgreSQL):
1. **Connection Pooling**: Uses `@prisma/adapter-pg` paired with PgBouncer connection pooler (`max: 3` connections per instance, `idleTimeoutMillis: 30000`).
2. **Cold Start DDL Bypass**: DDL statements are bypassed on cold starts using in-memory cached sentinel checks (`to_regclass`), dropping cold start latency from **4.5s down to 89ms**.
3. **Summary Mode Reporting**: The `/api/floor/reports?summary=1` endpoint executes single-query daily aggregations in parallel via `Promise.all`, dropping report response times from **12s down to 1.2s**.

---

## 7. Engineering Work Breakdown Structure (WBS) & Cost Estimation Guide

This section provides an **engineering valuation and Work Breakdown Structure (WBS)** for software engineering leads, project managers, and client CTOs to accurately estimate the total development effort, timeline, and market cost required to build this system from scratch.

### 7.1 Detailed Engineering Effort by Module

| # | System Module / Workstream | Frontend UI/UX (Hours) | Backend & Business Logic (Hours) | Database & Migrations (Hours) | Testing & QA (Hours) | Total Dev Hours |
| :-: | :--- | :-: | :-: | :-: | :-: | :-: |
| **1** | **Floor Production & Loom Execution**<br>*(Looms 1–34, 2-shift grid, dual qualities, theoretical math)* | 60 | 70 | 25 | 25 | **180** |
| **2** | **AI Vision OCR & Voice Integration**<br>*(Gemini vision prompt tuning, Groq Whisper, verification UI)* | 40 | 45 | 10 | 20 | **115** |
| **3** | **Beam Lifecycle & In-Shed Gaiting Tracker**<br>*(Warping, sizing, store, mounting, swLot, repeat)* | 35 | 30 | 15 | 15 | **95** |
| **4** | **Yarn Inventory & Dual-Unit Ledger**<br>*(Bags/Kg/Lbs conversions, movements, issuances, alerts)* | 40 | 35 | 15 | 15 | **105** |
| **5** | **Quality Catalog & 6-Year Historical Archive**<br>*(Fabric recipes, spec history, read-only SHA-256 vault)* | 30 | 30 | 15 | 10 | **85** |
| **6** | **11-Sheet Factory Payroll & Wages Engine**<br>*(Advances, Staff, Contract, Overtime, Incentives, Weavers)* | 75 | 85 | 30 | 35 | **225** |
| **7** | **Accounts, Multi-Entity Bills & Petty Cash**<br>*(SARA/FOI ledgers, vendor bills, petty cash, per-m costing)* | 55 | 60 | 25 | 20 | **160** |
| **8** | **Delivery Challans & Dispatch Engine**<br>*(Piece builder, gross/tare/net shrinkage, print/PDF engine)* | 30 | 25 | 10 | 10 | **75** |
| **9** | **Granular RBAC, Permissions & Audit Logging**<br>*(Resource/action catalog, audit logs, rate-limiting, JWT)* | 30 | 45 | 20 | 15 | **110** |
| **10**| **3-Tier Disaster Recovery & DevOps Pipeline**<br>*(In-DB snapshots, pg_dump cron, rclone GDrive, Docker)* | 15 | 40 | 20 | 15 | **90** |
| **--**| **Architecture, Design System & Project Setup**<br>*(Next.js 16 setup, Tailwind tokens, base layouts, CI/CD)* | 30 | 25 | 15 | 10 | **80** |
| | **TOTAL ESTIMATED ENGINEERING EFFORT** | **440** | **490** | **200** | **190** | **1,320 Hours** |

---

### 7.2 Team Sizing & Project Timeline

Building this industrial ERP/MES system from scratch requires an estimated **1,320 engineering hours**, structured over a **4.5 to 5.5 month development roadmap**:

```mermaid
gantt
    title Sara Textile ERP Development Roadmap (20 Weeks)
    dateFormat  YYYY-MM-DD
    section Phase 1: Core Foundation
    Architecture & Design System       :2026-01-01, 3w
    Database Modeling & RBAC Security  :2026-01-15, 3w
    section Phase 2: Manufacturing Execution
    Floor Weaving Grid & Looms 1-34    :2026-02-01, 4w
    AI Camera OCR & Voice Defect System:2026-02-15, 3w
    Beam Lifecycle & Yarn Inventory    :2026-03-01, 3w
    section Phase 3: Payroll & Financials
    11-Sheet Textile Labor Wages Engine:2026-03-15, 5w
    Double-Entry Accounts & Costing    :2026-04-01, 4w
    Challans, Dispatch & PDF Engine    :2026-04-15, 2w
    section Phase 4: Hardening & Launch
    3-Tier Disaster Recovery & Backup  :2026-05-01, 2w
    Load Testing, Mill Floor UAT & Launch:2026-05-10, 3w
```

#### Recommended Agile Team Composition:
* **1× Technical Lead / Solutions Architect**: System design, mathematical calculation engines, concurrency locking, and database schema.
* **1× Senior Full-Stack Engineer (Next.js / Node.js)**: APIs, server actions, payroll engine, double-entry financial ledger.
* **1× Frontend / UI-UX Engineer (React / Tailwind)**: Production grids, responsive data tables, mobile camera OCR interfaces, print layouts.
* **0.5× DevOps & Cloud Infrastructure Engineer**: Docker containerization, PostgreSQL pooling, backup automation, and Nginx/SSL configuration.
* **0.5× QA Automation & Textile Domain Tester**: Industrial stress-testing, math precision validation, cross-browser compatibility.

---

### 7.3 Market Valuation & Commercial Cost Estimation

Depending on whether development is contracted domestically in Pakistan or with an international software engineering agency, the estimated project cost benchmarks are as follows:

#### Option A: Domestic Pakistan Software Engineering Market
* **Hourly Rate Benchmark**: $\$20 - \$35\text{ / hour}$ (PKR 5,500 – 9,800/hr)
* **Total Engineering Cost**:
  $$\text{Minimum: } 1,320\text{ hrs} \times \$20 = \mathbf{\$26,400\text{ (PKR 7.4 Million)}}$$
  $$\text{Standard: } 1,320\text{ hrs} \times \$28 = \mathbf{\$36,960\text{ (PKR 10.3 Million)}}$$
  $$\text{Premium / Enterprise Agency: } 1,320\text{ hrs} \times \$35 = \mathbf{\$46,200\text{ (PKR 12.9 Million)}}$$

#### Option B: International / Offshore Software Agency (North America / Europe / UAE)
* **Hourly Rate Benchmark**: $\$60 - \$110\text{ / hour}$
* **Total Engineering Cost**:
  $$\text{Mid-Market Agency: } 1,320\text{ hrs} \times \$65 = \mathbf{\$85,800}$$
  $$\text{Tier-1 Enterprise Agency: } 1,320\text{ hrs} \times \$95 = \mathbf{\$125,400}$$

---

### 7.4 Ongoing Operating & Cloud Infrastructure Costs

| Infrastructure Service | Specification / Provider | Estimated Monthly Cost | Estimated Annual Cost |
| :--- | :--- | :-: | :-: |
| **Primary VPS / Dedicated Server** | 8 vCPU, 16 GB RAM, 240 GB NVMe (Hetzner / Contabo) | $\$35 / \text{month}$ | $\$420 / \text{year}$ |
| **Serverless Database (Backup / Demo)** | Neon PostgreSQL (Autoscaling compute + pooling) | $\$25 / \text{month}$ | $\$300 / \text{year}$ |
| **Offsite Cloud Storage Vault** | Google Workspace / Google Drive 2 TB Storage | $\$12 / \text{month}$ | $\$144 / \text{year}$ |
| **AI Vision OCR API** | Google Gemini 2.0 Flash (~1,500 scans / month) | $\$5 / \text{month}$ | $\$60 / \text{year}$ |
| **AI Voice Transcription API** | Groq Whisper Cloud API (~3,000 voice notes / month) | $\$3 / \text{month}$ | $\$36 / \text{year}$ |
| **Domain & SSL Certificates** | Custom Mill Domain + Let's Encrypt Wildcard SSL | $\$2 / \text{month}$ | $\$24 / \text{year}$ |
| **TOTAL OPERATIONAL INFRASTRUCTURE** | — | **$\approx \$82 / \text{month}$** | **$\approx \$984 / \text{year}$** |

---

## 📜 Intellectual Property & Copyright
Proprietary software custom-engineered exclusively for **Sara Textile Weaving Mills**.  
All design assets, database schemas, textile calculation formulas, and source code are strictly confidential and protected under copyright law.
