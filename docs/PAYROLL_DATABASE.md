# Payroll data → PostgreSQL

Payroll masters (employees, advances, staff/contract salaries, wages, petty cash, HR meta) save to **PostgreSQL**, not browser localStorage.

## Local vs live — testing strategy

| | Recommendation |
|--|----------------|
| **Same physical DB for local + live?** | **No.** Do not put the VPS `DATABASE_URL` into local `.env`. One shared DB = conflicts, slow UI, easy accidental wipes. |
| **Same *data* while testing?** | **Yes.** Keep two DBs; seed or copy payroll rows on both when you need parity. |
| **Later go-live** | Enter or fix data locally, then migrate `payroll_store` rows to VPS — or continue on live once you are satisfied. |

You do **not** need extra VPS settings beyond the existing server `DATABASE_URL`. The `payroll_store` table is created by `prisma db push`.

## Local setup

```bash
docker compose up -d postgres
npx prisma db push
npx prisma generate
npm run dev
```

Open any Payroll page → `PayrollHydrate` calls `GET /api/payroll/store`, seeds Excel/JSON defaults if `payroll_store` is empty, then every save hits the DB via `PUT /api/payroll/store`.

Legacy browser `localStorage` keys are read once on first access and migrated into the DB automatically.

## Live (VPS) one-time after schema / code change

On the server (with production `DATABASE_URL`):

```bash
npx prisma generate
npx prisma db push
# restart the Node app / Passenger
```

Then open the live site once (or `curl https://your-domain/api/payroll/store`) to seed if empty.

If the API says `payrollStore model missing`, clear the Next build cache (`.next`) and restart after `prisma generate`.

## API

- `GET /api/payroll/store` — bootstrap / load all payroll keys (auto-seed if empty)
- `PUT /api/payroll/store` — `{ key, value }` persist one collection (session cookie required)

Table: `payroll_store` (one row per storage key, JSON `payload`).

Allowed keys match `STORAGE_KEYS` in `payrollService.ts` (employees, advances, staff, contract, efficiency, weavers, helpers, contractors, petty cash, hr_meta).
