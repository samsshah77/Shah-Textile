import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { dbAccountsGetAll } from '@/server/accountsDb'
import { ensureFloorPayrollTables } from '@/server/ensureFloorPayrollTables'

export const runtime = 'nodejs'

async function requireSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  return token ? await verifySession(token) : null
}

export async function GET(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production' && !(await requireSession(req))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    await ensureFloorPayrollTables()
    const store = await dbAccountsGetAll()
    return NextResponse.json({ ok: true, store })
  } catch (err) {
    console.error('[accounts/store GET]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Load failed' },
      { status: 500 }
    )
  }
}

/**
 * The old pages saved whole blobs here. Since the move to real tables (Oct 2026) this
 * store is a read-only backup; an old open tab must not write to it, or the copy could
 * bring back bills deleted in the new system.
 */
export async function PUT() {
  return NextResponse.json(
    { ok: false, error: 'Accounts ka naya version aa gaya hai — page refresh karein (Ctrl+F5).' },
    { status: 410 }
  )
}
