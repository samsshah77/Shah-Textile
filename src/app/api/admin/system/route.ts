import { readdir, stat, statfs } from 'fs/promises'
import path from 'path'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminUser } from '@/server/adminAccess'
import { listSnapshots } from '@/server/dbSnapshot'

export const runtime = 'nodejs'

const startedAt = new Date()

/** Snapshot ids are the UTC time they were taken (20261024_0127) — exact whatever the database clock zone. */
function snapshotTime(id: string, fallback: Date): string {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/.exec(id)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString() : new Date(fallback).toISOString()
}

/** Size and count of the files in one folder (one level of sub-folders). */
async function folderUsage(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0
  let files = 0
  const walk = async (d: string, depth: number) => {
    const entries = await readdir(d, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory() && depth < 2) await walk(p, depth + 1)
      else if (e.isFile() && !e.name.startsWith('.')) {
        const s = await stat(p).catch(() => null)
        if (s) {
          bytes += s.size
          files++
        }
      }
    }
  }
  await walk(dir, 0)
  return { bytes, files }
}

/** Nightly pg_dump files (see docs/PRODUCTION_SAFETY.md) — if the app may read that folder. */
async function nightlyBackups() {
  const dir = process.env.BACKUP_DIR?.trim() || '/root/sara-backups'
  try {
    const names = (await readdir(dir)).filter((n) => /\.(sql|gz|dump|backup)$/i.test(n))
    const files = await Promise.all(
      names.map(async (n) => {
        const s = await stat(path.join(dir, n))
        return { name: n, bytes: s.size, at: s.mtime.toISOString() }
      })
    )
    files.sort((a, b) => (a.at < b.at ? 1 : -1))
    return { dir, readable: true, count: files.length, latest: files.slice(0, 5) }
  } catch {
    return { dir, readable: false, count: 0, latest: [] as Array<{ name: string; bytes: number; at: string }> }
  }
}

/** Health of the server and data: database size, pictures, disk, backups, AI keys. Admin only. */
export async function GET(req: NextRequest) {
  if (!(await requireAdminUser(req))) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const [dbSize, tables, users] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ bytes: bigint; name: string; version: string; now: Date }>>(
      `SELECT pg_database_size(current_database()) AS bytes, current_database() AS name, version() AS version, now() AS now`
    ),
    prisma.$queryRawUnsafe<Array<{ name: string; bytes: bigint; rows: bigint }>>(
      `SELECT relname AS name, pg_total_relation_size(relid) AS bytes, n_live_tup AS rows
       FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(relid) DESC LIMIT 15`
    ),
    prisma.user.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []),
  ])

  const uploadsRoot = path.join(process.cwd(), 'public', 'uploads')
  const sub = await readdir(uploadsRoot, { withFileTypes: true }).catch(() => [])
  const uploads = await Promise.all(
    sub.filter((d) => d.isDirectory()).map(async (d) => ({ folder: d.name, ...(await folderUsage(path.join(uploadsRoot, d.name))) }))
  )
  uploads.sort((a, b) => b.bytes - a.bytes)

  let disk: { total: number; free: number } | null = null
  try {
    const s = await statfs(process.cwd())
    disk = { total: Number(s.blocks) * Number(s.bsize), free: Number(s.bavail) * Number(s.bsize) }
  } catch {
    disk = null
  }

  const snapshots = await listSnapshots().catch(() => [])

  return NextResponse.json({
    server: {
      time: new Date().toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      startedAt: startedAt.toISOString(),
      node: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    },
    database: {
      name: dbSize[0]?.name,
      bytes: Number(dbSize[0]?.bytes ?? 0),
      version: String(dbSize[0]?.version || '').split(' ').slice(0, 2).join(' '),
      tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.rows) })),
    },
    uploads,
    disk,
    snapshots: snapshots.slice(0, 10).map((s) => ({
      id: s.id,
      createdAt: snapshotTime(s.id, s.createdAt),
      reason: s.reason,
      rows: Object.values(s.tables || {}).reduce((a, b) => a + Number(b || 0), 0),
    })),
    snapshotCount: snapshots.length,
    nightly: await nightlyBackups(),
    ai: {
      claude: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    },
    users: Object.fromEntries((users as Array<{ status: string; _count: { _all: number } }>).map((u) => [u.status, u._count._all])),
  })
}
