# Floor data → PostgreSQL

Floor masters (looms, beams, yarn, qualities, daily sheets) save to **PostgreSQL**, not browser localStorage.

## Local vs live — testing strategy

| | Recommendation |
|--|----------------|
| **Same physical DB for local + live?** | **No.** Do not put the VPS `DATABASE_URL` into local `.env`. One shared DB = fights, slow UI, easy wipe. |
| **Same *data* while testing?** | **Yes.** Keep two DBs, seed the same sheet on both (local script + live curl). |
| **Later “real” go-live** | Enter / fix data on local (or live), then dump floor tables local → restore on VPS — or just keep using live once you’re happy. |

You do **not** need extra VPS settings beyond the existing server `DATABASE_URL` (Postgres on the VPS). Floor tables are created by `prisma db push`.

## Local setup

```bash
docker compose up -d postgres
npx prisma db push
npm run dev
```

Open Floor → first load calls `GET /api/floor/store`, seeds Excel defaults if `floor_looms` is empty, then every save hits the DB.

### Seed printed sheet 2026-09-23 (local)

```bash
npx tsx scripts/seed-sheet-2026-09-23.ts
```

## Live (VPS) one-time after schema / code change

On the server (with production `DATABASE_URL`):

```bash
npx prisma generate
npx prisma db push
# restart the Node app / Passenger
```

Then open the live site once (or `curl https://your-domain/api/floor/store`) to seed if empty.

### Seed printed sheet 2026-09-23 (live)

After this code is deployed:

```bash
curl -s "https://saratextilesweaving.com/api/floor/seed-sheet?key=sara_deploy_secret_key_2026"
```

Expect JSON: `{ success: true, date: "2026-09-23", looms: 34, totalAB: 3078, ... }`.

If the API says `floorLoom model missing`, clear the Next build cache (`.next`) and restart after `prisma generate`.

## API (`src/app/api/floor/store/route.ts`)

- `GET /api/floor/store` — load masters (auto-seed if empty) + a hash of every loom / beam /
  quality row + the locked production months.
- `POST { action: "getSheet" | "getAllSheets", date }` — day rows + the hash of each row.
- `POST { action: "saveRows", key, upserts: [{ row, base }], deletes: [{ id, base }] }` —
  changed loom / beam / quality rows only (see "Row-level saving" in PRODUCTION_SAFETY.md).
- `POST { action: "saveSheetRows", date, rows: [{ entry, base, explicit?, clearQuality? }] }` —
  changed rows of one day.
- Yarn: `yarnInward`, `yarnIssue`, `yarnCorrect`, `yarnAdd`, `yarnRename`, `yarnDelete` —
  the server records the movement and recomputes the stock.
- `setMonthLock { month, locked }` (admin), plus the existing targeted actions
  (patchBeam, upsertBeam, deleteBeam, upsertQuality, patchQualityStatus, reuseQuality,
  deleteQuality, deleteLoomSegment, deleteSheet, submit / approve / unlock sheet).
- `PUT` (whole list / whole day) is no longer accepted — it answers 409 "refresh the page".

Every write is validated (`src/lib/floor/schemas.ts`); bad input gets 400.

Tables: `floor_looms`, `floor_beams`, `floor_yarns`, `floor_yarn_movements` (+ `kind`),
`floor_yarn_issuances`, `floor_qualities`, `floor_daily_sheets`, `floor_month_locks`,
`floor_migrations` (one-time jobs that already ran).
