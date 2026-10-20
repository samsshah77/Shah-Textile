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
* Only salary controllers (Tufail / admin — `isAccountsController`) may write (403 otherwise).

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
