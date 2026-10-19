# Production module — data safety (Phase A)

What protects floor/production data now, and what to do if something goes wrong.

## The rules the server now enforces

| Rule | What happens if broken |
|---|---|
| A full-day save may not zero the meters of **2+ looms**, wipe the quality of **2+ looms**, or **halve the day's total** | Save refused (HTTP 409), nothing written, red "Not saved" banner on screen |
| Yarn movements / issuances / yarn stock / beams: a save may not delete **more than 2 records and >10%** at once, or empty the list | Save refused (409) |
| Deleting a whole day that has meters | Admin only (409 for others) |
| Approved sheet | Only admin can edit, delete, or re-submit it (403 for others) |
| Approval fields (`approvalStatus`, `approvedBy`, …) | Can only change through Approve / Unlock / Submit — a normal save cannot forge or remove them |
| Floor writes | Need floor UPDATE permission: QC + admin. Accountant is view-only (403) |
| Reading a day | The server returns **every** stored row. Never add filters in `dbGetSheet` — hidden rows make the browser rebuild and overwrite the day (16–18 Oct 2026) |

Correcting a single loom (even to 0) is always allowed — edit that row.

Guards live in `src/server/floorGuards.ts` and are unit-tested in
`src/__tests__/floorGuards.test.ts` (including a replay of the 16-Oct failure).

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
floor_yarn_movements, floor_yarn_issuances, payroll_store, accounts_store`.

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
