import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { allows, requireAccess } from '@/server/userAccess'
import { writeAudit } from '@/server/auditLog'
import { FloorLockedError } from '@/server/floor/locks'
import { YarnError, yarnSnapshot } from '@/server/floor/yarn'
import {
  correctVerifiedYarnDispatch,
  createYarnDispatch,
  deleteYarnDispatch,
  getYarnDispatch,
  listYarnDispatches,
  millYarnStock,
  reportYarnDispatchIssue,
  updateYarnDispatch,
  verifyYarnDispatch,
  type YarnDispatchInput,
  type YarnReceiveInput,
} from '@/server/floor/yarnSupply'

export const runtime = 'nodejs'

/**
 * Yarn Supply. The supplier (Permissions → Yarn Supply, Edit) sends / corrects / deletes
 * entries; the mill (Yarn Stock, Edit) verifies them into Yarn Stock or reports an issue.
 */
export async function GET(request: NextRequest) {
  const check = await requireAccess(request, ['yarn_supply', 'prod_yarn'], 'view')
  if (check.error) return check.error
  try {
    const [dispatches, stock] = await Promise.all([listYarnDispatches(), millYarnStock()])
    return NextResponse.json({
      ok: true,
      dispatches,
      stock,
      canSend: allows(check.access, 'yarn_supply', 'edit'),
      canVerify: allows(check.access, 'prod_yarn', 'edit'),
    })
  } catch (err) {
    console.error('[yarn-supply GET]', err)
    return NextResponse.json({ ok: false, error: 'Could not load the yarn supply list.' }, { status: 500 })
  }
}

type Body = {
  action?: string
  id?: string
  entry?: YarnDispatchInput
  receive?: YarnReceiveInput
  note?: string
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null
  const action = String(body?.action || '')
  const supplierAction = action === 'create' || action === 'update' || action === 'delete'
  const millAction = action === 'issue' || action === 'verify' || action === 'correct'
  if (!supplierAction && !millAction) return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 })

  const check = supplierAction
    ? await requireAccess(request, 'yarn_supply', 'edit', 'Only the supplier can send or change these entries.')
    : await requireAccess(request, 'prod_yarn', 'edit', 'You need Yarn Stock (Edit) to check yarn arrivals.')
  if (check.error) return check.error
  const name = check.user.name || check.user.email || 'User'
  const id = String(body?.id || '')

  try {
    const before = id ? await getYarnDispatch(id) : null
    let after = null
    if (action === 'create') after = await createYarnDispatch(body?.entry as YarnDispatchInput, { id: check.user.id, name })
    else if (action === 'update') after = await updateYarnDispatch(id, body?.entry as YarnDispatchInput, name)
    else if (action === 'delete') await deleteYarnDispatch(id)
    else if (action === 'issue') after = await reportYarnDispatchIssue(id, String(body?.note || ''), name)
    else if (action === 'verify') after = await verifyYarnDispatch(id, body?.receive as YarnReceiveInput, name)
    else if (action === 'correct') after = await correctVerifiedYarnDispatch(id, body?.receive as YarnReceiveInput, name)
    await writeAudit({
      req: request,
      actor: check.user,
      module: 'floor',
      action: `yarnSupply.${action}`,
      entityKey: 'floor_yarn_dispatches',
      entityId: after?.id || id || null,
      before,
      after,
    })
    const stockChanged = action === 'verify' || action === 'correct'
    return NextResponse.json({ ok: true, dispatch: after, ...(stockChanged ? { yarnState: await yarnSnapshot() } : {}) })
  } catch (err) {
    if (err instanceof YarnError || err instanceof FloorLockedError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
    }
    console.error('[yarn-supply POST]', action, err)
    return NextResponse.json({ ok: false, error: 'Could not save. Please try again.' }, { status: 500 })
  }
}
