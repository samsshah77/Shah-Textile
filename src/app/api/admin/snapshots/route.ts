import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { listSnapshots, takeSnapshot } from '@/server/dbSnapshot'
import { writeAudit } from '@/server/auditLog'

export const runtime = 'nodejs'

async function requireAdmin(req: NextRequest) {
  const user = await currentUser(req)
  return user && (user.roleKey || '').toLowerCase() === 'admin' ? user : null
}

/** GET: list in-database snapshots (admin only). */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }
  try {
    return NextResponse.json({ ok: true, snapshots: await listSnapshots() })
  } catch (err) {
    console.error('[admin/snapshots GET]', err)
    return NextResponse.json({ ok: false, error: 'Could not list snapshots' }, { status: 500 })
  }
}

/** POST: take a snapshot now, e.g. before a risky change (admin only). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }
  try {
    const result = await takeSnapshot(`manual:${admin.name || admin.email}`)
    await writeAudit({ req, actor: admin, module: 'system', action: 'snapshot', entityKey: 'data_snapshots', entityId: result.id, changes: result })
    return NextResponse.json({ ok: true, snapshot: result })
  } catch (err) {
    console.error('[admin/snapshots POST]', err)
    return NextResponse.json({ ok: false, error: 'Snapshot failed' }, { status: 500 })
  }
}
