# Salary (payroll) data — PostgreSQL

## In one line
The server (Postgres table `payroll_rows`) is the only copy of the salary data. Screens send
only the rows they changed; the server applies them in one transaction, checks versions and
month locks, and records every change in `audit_logs`. Opening a page never changes data.

## Local vs live — testing strategy

| | Recommendation |
|--|----------------|
| **Same physical DB for local + live?** | **No.** Do not put the VPS `DATABASE_URL` into local `.env`. One shared DB = conflicts, slow UI, easy accidental wipes. |
| **Same *data* while testing?** | **Yes.** Keep two DBs; seed or copy payroll rows on both when you need parity. |
| **Later go-live** | Enter or fix data locally, then copy `payroll_rows` to the VPS — or continue on live once you are satisfied. |

You do **not** need extra VPS settings beyond the existing server `DATABASE_URL`. The salary tables are created by the app itself on first use.

## Tables
| Table | What it holds |
|---|---|
| `payroll_rows` | One row per sheet row: `sheet` (storage key, e.g. `sara_payroll_weavers_v6`), `id`, `month`, `position` (row order), `payload` (the row as JSON), `version`, `updatedAt`, `updatedBy`. HR settings (`sara_payroll_hr_meta_v1`) are stored one row per field (`monthLocks`, `activeSalariedMonth`, `deletedEmployeeIds`, …). |
| `payroll_import_log` | Proof that the one-time copy from the old table ran (and what it copied). |
| `payroll_store` | **Old** table (one JSON blob per sheet). Copied once into `payroll_rows`, then never read or written again — it stays as a backup of the data at the moment of the update. |

## Saving
* Screens still work on whole sheets (`readStore` / `writeStore` in
  `src/services/payroll/payrollStorage.ts`). Each write is compared with the last copy the
  server confirmed (`src/lib/payroll/sync.ts`) and only the difference is sent:
  `put` (row added / changed, with the version it was based on), `del` (row removed), and the
  new row order when rows were moved.
* Writes made by one user action are sent together (`POST /api/payroll/data`) and applied
  all-or-nothing (`src/server/payroll/rows.ts → applyChangeSet`). All salary writes are
  serialized with a Postgres advisory lock.
* **Two tabs / computers:** a row changed elsewhere since this browser loaded it → the whole
  save is refused (409); the browser reloads the fresh data and shows a red message.
  Different rows never conflict.
* **Locked month:** rows of a locked month are not added, changed or removed; the rest of
  the save goes through and the screen shows the stored rows again with a message.
* **HR settings:** a field that a save leaves out is unchanged (never deleted). Month locks and
  delete-markers can no longer be wiped by a partial settings write.
* **No internet / server down:** the change stays in the browser, a red message is shown,
  and it is retried automatically (3 s → 30 s). Closing the page while something is unsaved
  shows the browser's "leave page?" warning. A repeated request (lost answer) is applied once.
* Only Tufail may write; Javed may read; nobody else may read (see below).

## Loading
* `GET /api/payroll/data` returns every sheet plus each row's version. It never writes.
* Salary pages render only after the data has loaded (`PayrollHydrate`); there is no
  placeholder / seed data on screen that could be saved by mistake.
* Nothing is kept in `localStorage` any more. Old browser copies are deleted on first load.

## Month generation
* `POST /api/payroll/generate-month` creates Staff / Company Contract / Efficiency rows for
  a month in one transaction (refused for a locked month). Efficiency rows are carried over
  only for people still working that month.
* Weaver / Helper / Contractor fortnights are created by **Generate fortnight** on the
  Weavers page. They are not created automatically on page load any more.

## What was removed (and why)
The old code ran "repairs" every time any page was opened, by any user, without an audit
trail. They rewrote stored data, for example:
* a weaver's new daily wage was pushed into **all earlier months** (even locked ones);
* Company Contract rate per day was forced to salary ÷ 30 in every month;
* rows were added to / removed from past months based on joining / resign dates.

Generating a month (and saving the petty-cash inflow on Synopsis) also overwrote HR settings
without the month locks and delete-markers, so locks silently disappeared.

These now happen only when a person does them on purpose (saving a profile still places the
person on the right sheets of the chosen month and removes them from months before joining /
after resigning — locked months excepted).

## Who can do what (Salary and Accounts)
`src/lib/accountsAccess.ts` is the single rule, used by pages, menus and every API:
* **Tufail** (Accountant) — sees and changes Salary and Accounts.
* **Javed** (Admin) — sees both, cannot change anything ("View only").
* **Everyone else** (e.g. Ahmer, Quality Controller) — no Salary / Accounts at all (menus
  hidden, pages closed, APIs answer 403). Production only.

## Profile changes and months
Rules (`src/services/payroll/service/personSheets.ts → applyProfileToSheets`), used by Add
profile, Edit profile, Resign / Rejoin and the General Wages save:
1. A sheet row belongs to a person by **employeeId** only. Two people with the same name stay
   two people (names are used only for very old rows without an id).
2. A change made while working in month M applies to M and later months. Earlier months keep
   their name, designation, pay and category. Later months take a new pay only when they
   still had the same pay as M.
3. **Dates decide membership** in every month: joining date moved to September while working
   in October → the person is added to September's sheets (unlocked months); a later joining
   date or a resign date takes them off months they no longer belong to.
4. **Category change** (Weaver → Staff in October): moved from October on; September stays on
   the Weavers sheet.
5. Rows where something was already entered are never removed automatically — they are kept
   and a message names them. Locked months are never touched.

Deleting a resigned profile hides only that person (by id); another person with the same
name is not affected.

## Petty cash
Petty cash is kept in **Accounts › Petty Cash** only. The salary module's old petty-cash
register is copied there once (`src/server/accounts/payrollPetty.ts`: Dr → Cash in, Cr →
Expense / Salary, "Balance b/f" not copied, existing entries skipped; logged in
`acc_import_log` as `payroll:petty-cash`). The old salary rows stay in the database.

The Synopsis "Petty Cash Transfer Inflow" is the total of that fortnight's **Cash in** entries
in Accounts (read-only). Locked salary months keep the value they had.

## Data Check
`/payroll/data-check` lists old rows that look wrong (same person twice in a period, one
person on two pay sheets in a month, a row named after a namesake, rows outside joining /
resign dates, rows whose profile is gone). It only shows; it never changes data.

## Profile page by month

A profile holds the current job only. When someone changes job (e.g. Contractor in
September → Weaver from October), the sheets keep September as Contractor. The profile
page shows the chosen month as the sheets have it (`employeeAsOfMonth` in
`src/services/payroll/service/employeeSync.ts`): choosing September shows "Contractor"
with a note, and editing is off for that month (saving there would change the current job
back). Choose the current month to edit the profile.

## Old browser tabs during the update
`/api/payroll/store` is kept only for tabs opened before the update: reading works, saving is
refused with "page refresh karein". Refresh every open salary tab after the deploy.

## Rolling back the code
If the code is ever reverted, first rebuild the old table from the new one (run on the server):

```sql
INSERT INTO payroll_store (key, payload, "updatedAt")
SELECT sheet,
       CASE WHEN sheet = 'sara_payroll_hr_meta_v1' THEN jsonb_object_agg(id, payload)
            ELSE jsonb_agg(payload ORDER BY position, id) END,
       now()
FROM payroll_rows GROUP BY sheet
ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now();
```

## Tests
* `src/__tests__/payroll.test.ts` — Excel salary rules, contractor sheets, change detection.
* `src/__tests__/payrollRows.test.ts` — the storage SQL against Postgres (set
  `TEST_DATABASE_URL` to a scratch database; never the live one).
