import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { canViewFinance } from '@/lib/accountsAccess'
import { dbAccountsGetAll } from '@/server/accountsDb'
import { ensureFloorPayrollTables } from '@/server/ensureFloorPayrollTables'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const actor = await currentUser(req)
    if (!actor) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    if (!canViewFinance({ ...actor, role: actor.roleKey }))
      return NextResponse.json({ ok: false, error: 'Accounts sirf Tufail aur Javed sahab dekh sakte hain.' }, { status: 403 })
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
