# Production module — data safety (Phase A)

What protects floor/production data now, and what to do if something goes wrong.

## The rules the server now enforces

| Rule | What happens if broken |
|---|---|
| A full-day save may not zero the meters of **2+ looms**, wipe the quality of **2+ looms**, or **halve the day's total** | Save refused (HTTP 409), nothing written, red "Not saved" banner on screen |
| Looms / beams: a save may not delete **more than 2 records and >10%** at once | Save refused (409) |
| A row changed by someone else since this screen loaded it | Save refused (409), screen reloads |
| A locked production month | Any change refused (423) |
| Bad input (negative meters, wrong date, …) | Refused (400) |
| Deleting a whole day that has meters | Admin only (409 for others) |
| Approved sheet | Only admin can edit, delete, or re-submit it (403 for others) |
| Approval fields (`approvalStatus`, `approvedBy`, …) | Can only change through Approve / Unlock / Submit — a normal save cannot forge or remove them |
| Floor writes | Need floor UPDATE permission: QC + admin. Accountant is view-only (403) |
| Reading a day | The server returns **every** stored row. Never add filters in `dbGetSheet` — hidden rows make the browser rebuild and overwrite the day (16–18 Oct 2026) |

Correcting a single loom (even to 0) is always allowed — edit that row.

Guards live in `src/server/floorGuards.ts` and are unit-tested in
`src/__tests__/floorGuards.test.ts` (including a replay of the 16-Oct failure).

## Row-level saving (Oct 2026)

The browser used to send the whole list / the whole day on every save, so two open tabs
or computers overwrote each other. Now (`src/lib/floor/rowSync.ts`,
`src/services/production/floorSync.ts`, `src/server/floor/rowSync.ts`):

- every row read from the server comes with a hash of its stored content;
- the browser sends only the rows it changed, each with the hash it started from;
- the server checks those hashes inside one transaction (with a per-list / per-day lock).
  If someone else changed the same row meanwhile → **409, nothing saved**, the user sees
  "Ye tabdeeli save nahi hui …", and the screen reloads what is really saved;
- rows nobody else touched always save, so two people on different looms of the same
  day do not disturb each other;
- saves of one list / day go one after another from the browser; a refused save is never
  re-sent from the old copy (if the reload fails, nothing is sent until it works).

Fields the server owns on a day row (approval, last edited by / at, quality id) are not
counted as changes and are kept from the stored row when a day is rebuilt.

## No browser-only copies (Oct 2026)

The browser used to keep its own copies of unsent quality ends, new / reused qualities, new
beams and beam Sw# in localStorage, and re-sent them on every page load — without the row
checks above, so an old tab could end a quality again or bring back a deleted one. These
copies are gone (`src/services/production/floorLocalCache.ts`); the old keys are removed on
load. A save that fails shows the red "Not saved" banner and is simply done again.

## Yarn stock = movements

`floor_yarns` totals are a cache recomputed from `floor_yarn_movements` after every change:
received = Σ IN kg, issued = Σ OUT kg, balance = received − issued, bags = Σ IN bags.
A total typed in the stock table is saved as a **Correction** movement of the difference.
When this went live, any yarn whose stored totals did not match its movements got one
Opening / Correction movement dated that day (`floor_migrations` row
`yarn-totals-from-movements`), so no balance changed.

## Production month lock

Javed Sir (admin) can lock a month from the Daily Entry screen. A locked month is
view-only for everyone: day rows, deleting days / parts, approvals and yarn movements dated
in it are refused (423). Unlock the same way.

## Audit log

Every floor write is recorded in the `audit_logs` table: who, when, and old → new value
of each changed field. Deleted rows are stored in full.

```sql
SELECT "createdAt", "actorName", action, "entityKey", "entityId", changes
FROM audit_logs WHERE module = 'floor'
ORDER BY "createdAt" DESC LIMIT 50;
```

Example `changes`: `{"kind":"rows","changed":[{"id":"e7","fields":{"shiftAMeters":[67,0]}}]}`
— loom row `e7` shift A went from 67 to 0.

## Automatic snapshots

On every app start (= every deploy) the server copies these tables into the
`data_snapshots` schema (skipped if the last copy is < 6 h old; last 20 kept):
`floor_daily_sheets, floor_looms, floor_beams, floor_qualities, floor_yarns,
floor_yarn_movements, floor_yarn_issuances, payroll_store, payroll_rows, accounts_store` and the `acc_*` accounts tables.

Admin can also take one on demand: `POST /api/admin/snapshots` (list: `GET`).

List snapshots:

```sql
SELECT id, "createdAt", reason, tables FROM data_snapshots.snapshot_log ORDER BY id DESC;
```

### Emergency: restore specific days from a snapshot

Take a fresh backup first, then (replace the snapshot id and dates):

```sql
BEGIN;
-- what the snapshot has for those days
SELECT date, count(*), sum((payload->>'shiftAMeters')::numeric + (payload->>'shiftBMeters')::numeric)
FROM data_snapshots."floor_daily_sheets__20261019_0519"
WHERE date BETWEEN '2026-10-10' AND '2026-10-12' GROUP BY date ORDER BY date;

DELETE FROM floor_daily_sheets WHERE date BETWEEN '2026-10-10' AND '2026-10-12';
INSERT INTO floor_daily_sheets
SELECT * FROM data_snapshots."floor_daily_sheets__20261019_0519"
WHERE date BETWEEN '2026-10-10' AND '2026-10-12';
-- check, then:
COMMIT;   -- or ROLLBACK; if anything looks wrong
```

The database user must be allowed to create a schema. If startup logs show
`[snapshot] startup snapshot failed`, run once as the postgres superuser:
`GRANT CREATE ON DATABASE sara_textiles TO sara_app;`

## Nightly disk backup

Root crontab runs `pg_dump` at 02:15 into `/root/sara-backups/` (30 days kept).
Copy one off the server regularly.

## Production ledger (`floor_production`)

A normalized copy of the daily sheets with real columns (date, loom, quality id,
shift A/B/total meters, efficiency …). Code: `src/server/productionLedger.ts`.

- The JSON sheets (`floor_daily_sheets`) remain the source of truth. The ledger is
  re-derived from them after every sheet write and fully rebuilt on every app start,
  so it can be dropped and rebuilt at any time without losing anything.
- Each row is linked to a quality by exact name (case/space-insensitive), preferring
  same pick, then the quality run whose dates cover the row.
- Reports: `GET /api/floor/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` → totals by day,
  quality and loom, `unlinked` rows (name not in quality master) and `mismatches`
  (ledger vs raw sheets — must be empty).

```sql
SELECT "qualityId", "qualityName", sum("totalMeters") FROM floor_production
WHERE date BETWEEN '2026-10-01' AND '2026-10-31' GROUP BY 1,2 ORDER BY 3 DESC;
```

## Rules for future changes (any developer / AI tool)

1. Never filter, hide, or "clean" rows in server read functions.
2. Never run scripts against the live database. Test on a copy.
3. Run `npm run typecheck && npm test` before every push.
4. Big floor changes: take an admin snapshot first.

## Code layout of the floor service (Oct 2026)

`src/services/productionMastersService.ts` used to be one 3,300-line file. It is now split
by subject — callers still use `productionMastersService.X()` exactly as before:

| File | What |
|---|---|
| `src/services/production/floorStore.ts` | in-memory copy of the server data, loading (hydrate / preload), targeted saves, month locks |
| `src/services/production/service/looms.ts` | loom master, quality pose on a loom |
| `src/services/production/service/beams.ts` | beams: mount / unmount, sizing, beam end, beam track |
| `src/services/production/service/yarn.ts` | yarn actions (stock = movements, worked out on the server) |
| `src/services/production/service/qualities.ts` | quality master: create, edit, end, reuse |
| `src/services/production/service/sheets.ts` | daily sheet: building a day, editing rows, approval |
| `src/services/production/service/matrix.ts` | monthly matrix report |

## Row figures are worked out on the server

For every hand-edited day row the server works out theoretical meters, total meters,
efficiency and loss itself (`src/lib/floor/rowMetrics.ts`) from roller hours, RPM, pick and
shift A / B meters — figures sent by a browser are never stored as they are. The Daily
Entry screen uses the same function, so the screen and the server always agree. A row
with no pick and no meters (e.g. a loom whose quality ended) has no theoretical output, so
it adds no false "loss" to the reports. Rows nobody edits keep their stored figures.

## One day builder; "Start New Day" runs on the server

How a production day is built from the masters (which quality is on which loom, the
"Quality Ended" rows, carried-over status and RPM, beam SW #, the recipe) lives in one pure
function, `src/lib/floor/dayBuilder.ts`, used by the Daily Entry screen and by the server.

"Start New Day" is done by the server (`startDay` action, `src/server/floor/dayBuild.ts`):
it builds the day from the database and saves it through the normal row save (month lock,
quality run ids, conflict check). A day that already has rows is returned unchanged, so
pressing it twice or from two computers cannot create or overwrite anything.

## Quality on a loom / Quality End / beams are saved as one change

Putting a quality on a loom from a date writes the loom master, the quality list and the
loom's row on every day from that date to today. Ending a quality, adding / removing a
part (+P), and beam mount / unmount also touch several lists or days. These are now sent
as ONE save (`saveBatch`, `applyBatch` in `src/server/floor/rowSync.ts`) inside one
database transaction: if any row was changed by someone else meanwhile (409), a month is
locked (423) or a guard refuses, **nothing** is saved and the screen reloads what is
really stored — a half-written quality pose can no longer be left behind. The methods
saved this way are listed in `BATCHED_METHODS` (`src/services/productionMastersService.ts`).
If the network fails, the edits are kept and sent again list by list / day by day.

## Production Data Check (`/floor/reports/check`)

Read-only page (sidebar "Data Check") listing, for a month: rows with "loss" on a loom that
had no quality and no meters (false loss in reports), rows whose total / efficiency do not
match their meters, rows with meters but no quality name, past days with meters that were
never approved, plus the report checks (unknown quality names, rows outside a quality's
run, report vs sheet totals). Logic: `src/lib/floor/dataCheck.ts`; API
`GET /api/floor/data-check?from&to`. Nothing is changed by it.
