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
| Final Cost Statement | Salaries (salary sheets) + contractors + this month's purchases by cost block + petty cash + manual lines |

## Tables (created at startup, `src/server/accounts/schema.ts`)

- `acc_parties` — name, slug (old URLs keep working), **kind** (Trader / Workshop), category,
  **costBucket** (Machinery / Electric / Repair → Cost Statement block), active.
- `acc_bills` + `acc_bill_lines` — month (`YYYY-MM`, the sheet month), date, bill no., inward no.;
  lines with qty, rate and amount (= round(qty × rate), always computed on the server).
- `acc_payments` — FOI cash / cheque paid to a party.
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
