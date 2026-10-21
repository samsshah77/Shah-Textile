# Accounts module — how it works

## One purchase, one place

Every purchase is a **Bill** with its **Lines** in Postgres. These pages are all views
of the same bills, so they can never disagree:

| Page | What it shows |
|---|---|
| Daily Inward & Expenses | The month's bills in sheet order (add / edit / delete here) |
| Traders · Workshops | Each party's bills, payments and balance for a month or all months |
| Party ledger (`/accounts/traders/<slug>`) | Date-wise lines + payments with running balance and b/f |
| Monthly Purchases | The month's lines, by party |
| Payables (A/P Synopsis) | What we owe every supplier on a date, split Sara Textile / FOI |
| Final Cost Statement | Salaries (salary sheets) + contractors + this month's purchases by cost block + petty cash + manual lines |

## Tables (created at startup, `src/server/accounts/schema.ts`)

- `acc_parties` — name, slug (old URLs keep working), **kind** (Trader / Workshop), category,
  **costBucket** (Machinery / Electric / Repair → Cost Statement block), active.
- `acc_bills` + `acc_bill_lines` — month (`YYYY-MM`, the sheet month), date, bill no., inward no.;
  lines with qty, rate and amount (= round(qty × rate), always computed on the server).
- `acc_payments` — entries against a party's payable. **kind**: Payment (cheque / cash paid),
  Opening (balance carried from the old ledger), Adjustment (set-off such as scrap sale, discount,
  return; minus = adds back). **paidFrom**: Sara / FOI.
- `acc_parties.account` — whose books carry the party's payable (Sara / FOI) for the A/P Synopsis.
- `acc_petty_cash` — journal entries; kind = Opening / Cash in / Mill expense / Salary paid.
  Balance b/f and running balance are computed, never typed.
- `acc_cost_inputs` — the month's manual Cost Statement lines (JSON). A month without its own
  inputs shows the last saved month's recurring lines ("pichle mahine se").
- `acc_month_locks` — a locked month cannot be changed (API returns 423).
- `acc_import_log` — which old store keys were copied (each only once).

Money columns are `NUMERIC` (exact). Every editable row has a `version`; a save sent from an
older copy is refused with 409, so two tabs / computers cannot overwrite each other.

## API (`src/app/api/accounts/*`)

Reads need a login. Writes need Admin or Accountant (`isAccountsController`). Each write
changes one bill / entry, is validated with zod (`src/lib/accounts/schemas.ts`) and is
written to `audit_logs` with before / after.

## Old data

The old pages kept whole JSON blobs in `accounts_store` (or showed the Excel seed when a blob
was never saved). On first start the server copies exactly what the old pages showed into
the new tables (`src/server/accounts/migrate.ts`), skipping duplicate copies of the same bill
line. `accounts_store` is left untouched as a backup and is read-only from now on
(`PUT /api/accounts/store` → 410). A browser that still holds data the server never had sends
it once (`/api/accounts/legacy`); keys the server already has are ignored.

## Code map

- `src/lib/accounts/` — shared types, helpers, request schemas
- `src/server/accounts/` — tables, repository (SQL), reports (pure, tested), import, API wrapper
- `src/services/accounts/accountsApi.ts` — browser client (shows the red banner on any refused save)
- `src/hooks/useAccounts.ts` — selected month + data loading
- `src/components/accounts/` — bill editor, party directory / form, ledger, shared bits
- Tests: `src/__tests__/accounts.test.ts` (includes the Aug 2026 Excel Cost Statement: 6,091,868 · 58.47/m)

## Who can do what
Tufail changes Accounts; Javed (Admin) only views; everyone else (e.g. Ahmer) has no access —
menus hidden, pages closed, APIs 403 (`src/lib/accountsAccess.ts`).

## Petty cash from the salary module
Petty cash lives only here. The salary module's old petty-cash register is copied into
Petty Cash once during setup (`src/server/accounts/payrollPetty.ts`, logged as
`payroll:petty-cash`). The salary Synopsis reads each fortnight's **Cash in** total from here.

## Payables (A/P) — the old "Traders Ledger AP" workbook

The workbook had one sheet per supplier (Debit = bill, Credit = payment / set-off,
Balance = still payable) and a **Synopsis** sheet listing each party's payable under
Sara or FOI. In the ERP:

- Debit = bills from Daily Inward (never typed twice).
- Credit = Payment / Adjustment entries on the party page ("Payment / entry").
- A party's balance before the ERP is one **Opening balance** entry (dated the day the
  ERP figures start), so the 2019+ history does not need retyping.
- `balance = opening + bills − paid − adjustments`; negative = advance / we are owed.
- `/accounts/payables?asOf=` computes the Synopsis for any date (`payablesReport` in
  `src/server/accounts/reports.ts`, API `GET /api/accounts/payables?asOf=YYYY-MM-DD`).

## Importing a month kept in Excel (`/accounts/import?month=2026-09`)

September 2026 was kept in Excel (Daily Expense: bills + petty cash). The file's rows are
in `src/data/accountsImports/2026-09.json` (made from the Excel, no hand typing). The page:

- shows first what would be added — nothing is written by opening it;
- adds only what the ERP does not have: a bill with the same party + bill no., or the same
  party + date + total, or all of whose lines are present, counts as present; a bill whose
  number exists with different lines is listed as "mukhtalif" and not added;
- petty cash: "Balance b/f" is never imported; an entry with the same side and amount
  dated within 5 days of an ERP entry counts as present (each ERP entry once);
- never changes or deletes anything, refuses a locked month, runs once (`acc_import_log`
  source `file:2026-09`), all in one transaction, Tufail only; written to the audit log.

## Bill pictures and inward order

- A bill can carry pictures of the paper bill (`acc_bills.attachments`, up to 12). They are
  added in the bill editor ("Bill photo"), shown as 📎 on Daily Inward and on the party
  ledger. Only links under `/uploads/bills/` are accepted.
- Bills of a month are listed by **inward number**: a bill entered later with an earlier
  inward number goes to its place automatically. Bills without an inward number come last
  (by date).

## Picture uploads (looms, profiles, bills)

`POST /api/upload?kind=loom|profile|bill` → `public/uploads/<looms|profiles|bills>/`.
Looms: production editors; profiles and bills: the accounts editor (Tufail). The file type
is read from the file's bytes (JPG / PNG / WEBP / GIF only) and the server picks the
extension, so a file can never be saved as e.g. `.php`. The browser shrinks photos first
(longest side 1600 px, JPEG). `src/app/uploads/[...path]/route.ts` serves pictures added
after the app started when the web server does not. Back up `public/uploads` together with
the database.
