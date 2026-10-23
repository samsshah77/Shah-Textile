import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminUser } from '@/server/adminAccess'
import { ensureAuditTable } from '@/server/auditLog'

export const runtime = 'nodejs'

const PAGE = 50
const isYmd = (s: string | null): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s))

type Row = {
  id: string
  createdAt: Date
  actorName: string | null
  actorRole: string | null
  module: string
  action: string
  entityKey: string
  entityId: string | null
  changes: unknown
  meta: unknown
  ip: string | null
}

/**
 * Change history (who changed what, when) — read only. Filters: module, actor, from / to
 * dates, free text (action / table / id). Newest first, 50 per page. Admin only.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdminUser(req))) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  await ensureAuditTable()
  const sp = req.nextUrl.searchParams
  const where: string[] = []
  const args: unknown[] = []
  const add = (sql: string, v: unknown) => {
    args.push(v)
    where.push(sql.replace('?', `$${args.length}`))
  }
  const mod = sp.get('module')
  if (mod) add(`"module" = ?`, mod)
  const actor = sp.get('actor')
  if (actor) add(`"actorName" = ?`, actor)
  const from = sp.get('from')
  if (isYmd(from)) add(`"createdAt" >= ?::date`, from)
  const to = sp.get('to')
  if (isYmd(to)) add(`"createdAt" < (?::date + 1)`, to)
  const q = (sp.get('q') || '').trim().slice(0, 80)
  if (q) {
    args.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`)
    const n = `$${args.length}`
    where.push(`("action" ILIKE ${n} OR "entityKey" ILIKE ${n} OR coalesce("entityId",'') ILIKE ${n} OR coalesce("meta"::text,'') ILIKE ${n})`)
  }
  const page = Math.max(1, Math.min(1000, Number(sp.get('page')) || 1))
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [rows, total, actors] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT "id","createdAt","actorName","actorRole","module","action","entityKey","entityId","changes","meta","ip"
       FROM "audit_logs" ${clause} ORDER BY "createdAt" DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
      ...args
    ),
    prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM "audit_logs" ${clause}`, ...args),
    prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT DISTINCT "actorName" AS name FROM "audit_logs" WHERE "actorName" IS NOT NULL ORDER BY 1 LIMIT 100`
    ),
  ])

  return NextResponse.json({
    rows: rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })),
    total: Number(total[0]?.n ?? 0),
    page,
    pageSize: PAGE,
    actors: actors.map((a) => a.name),
  })
}
