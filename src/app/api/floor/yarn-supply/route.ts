import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { allows, requireAccess } from '@/server/userAccess'
import { writeAudit } from '@/server/auditLog'
import { FloorLockedError } from '@/server/floor/locks'
import { karachiToday, resetMillYarnStock, YarnError, yarnSnapshot } from '@/server/floor/yarn'
import {
  correctVerifiedYarnDispatch,
  createYarnDispatch,
  createYarnRequest,
  listYarnRequests,
  setYarnRequestStatus,
  updateYarnRequest,
  deleteYarnDispatch,
  getYarnDispatch,
  listYarnDispatches,
  millYarnStock,
  reportYarnDispatchIssue,
  updateYarnDispatch,
  verifyYarnDispatch,
  type YarnDispatchInput,
  type YarnReceiveInput,
  type YarnRequestInput,
  addSupplierStock,
  deleteSupplierStock,
  listDeptDispatches,
  listSupplierStock,
  supplierStoreBalances,
  supplierStoreMoves,
  updateSupplierStock,
  type SupplierStockInput,
  addSupplierTwisting,
  deleteSupplierTwisting,
  finishSupplierTwisting,
  listSupplierTwisting,
  undoSupplierTwisting,
  updateSupplierTwisting,
  type SupplierTwistingInput,
  type SupplierTwistingOut,
  updateFinishedTwisting,
  supplierBalanceReset,
  resetSupplierBalance,
  undoSupplierBalanceReset,
} from '@/server/floor/yarnSupply'

export const runtime = 'nodejs'

/** Resetting Fazal Umer Balance to zero: the admin only (Javed Sir). */
const isAdmin = (user: { roleKey?: string | null }) => (user.roleKey || '').toLowerCase() === 'admin'

/**
 * Yarn Supply. The supplier (Permissions → Yarn Supply, Edit) sends / corrects / deletes
 * entries; the mill (Yarn Stock, Edit) verifies them into Yarn Stock or reports an issue.
 */
export async function GET(request: NextRequest) {
  const check = await requireAccess(request, ['yarn_supply', 'prod_yarn'], 'view')
  if (check.error) return check.error
  try {
    // Fazal Umer's store and his Sizing / Warping lots: for Yarn Supply users; mill requestors also see store balances for suggestions.
    const seesStore = allows(check.access, 'yarn_supply', 'view')
    const seesStoreBalances = seesStore || allows(check.access, 'prod_yarn', 'edit')
    const [dispatches, requests, stock, store, storeEntries, deptDispatches, twisting, balanceReset, storeMoves] = await Promise.all([
      listYarnDispatches(),
      listYarnRequests(),
      millYarnStock(),
      seesStoreBalances ? supplierStoreBalances() : Promise.resolve([]),
      seesStore ? listSupplierStock() : Promise.resolve([]),
      seesStore ? listDeptDispatches() : Promise.resolve([]),
      seesStore ? listSupplierTwisting() : Promise.resolve([]),
      seesStore ? supplierBalanceReset() : Promise.resolve(null),
      seesStore ? supplierStoreMoves() : Promise.resolve([]),
    ])
    return NextResponse.json({
      ok: true,
      dispatches,
      requests,
      store,
      storeMoves,
      storeEntries,
      deptDispatches,
      twisting,
      balanceReset,
      canReset: seesStore && isAdmin(check.user),
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
  request?: YarnRequestInput
  stock?: SupplierStockInput
  twist?: SupplierTwistingInput
  out?: SupplierTwistingOut
  note?: string
}

const STOCK_ACTIONS = ['stockAdd', 'stockUpdate', 'stockDelete', 'twistAdd', 'twistUpdate', 'twistDelete', 'twistDone', 'twistUndo', 'twistEdit']

const RESET_ACTIONS = ['balanceReset', 'balanceResetUndo']

const REQUEST_ACTIONS = ['requestCreate', 'requestUpdate', 'requestClose', 'requestCancel', 'requestReopen']

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null
  const action = String(body?.action || '')

  if (RESET_ACTIONS.includes(action)) {
    const check = await requireAccess(request, 'yarn_supply', 'view')
    if (check.error) return check.error
    if (!isAdmin(check.user)) return NextResponse.json({ ok: false, error: 'Only the admin can reset the Balance.' }, { status: 403 })
    const name = check.user.name || check.user.email || 'Admin'
    try {
      const before = await supplierBalanceReset()
      const after =
        action === 'balanceReset' ? await resetSupplierBalance({ id: check.user.id, name }) : await undoSupplierBalanceReset(name)
      await writeAudit({
        req: request,
        actor: check.user,
        module: 'floor',
        action: `yarnSupply.${action}`,
        entityKey: 'floor_supplier_balance_resets',
        entityId: null,
        before,
        after,
      })
      return NextResponse.json({ ok: true, balanceReset: after })
    } catch (err) {
      if (err instanceof YarnError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
      console.error('[yarn-supply POST]', action, err)
      return NextResponse.json({ ok: false, error: 'Could not save. Please try again.' }, { status: 500 })
    }
  }
  if (action === 'millStockReset') {
    const check = await requireAccess(request, 'prod_yarn', 'edit')
    if (check.error) return check.error
    if (!isAdmin(check.user)) return NextResponse.json({ ok: false, error: 'Only the admin can reset Yarn Stock.' }, { status: 403 })
    try {
      const reset = await resetMillYarnStock(karachiToday())
      await writeAudit({
        req: request,
        actor: check.user,
        module: 'floor',
        action: 'yarnSupply.millStockReset',
        entityKey: 'floor_yarns',
        entityId: null,
        after: reset,
      })
      return NextResponse.json({ ok: true, reset, yarnState: await yarnSnapshot() })
    } catch (err) {
      if (err instanceof YarnError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
      console.error('[yarn-supply POST]', action, err)
      return NextResponse.json({ ok: false, error: 'Could not reset Yarn Stock.' }, { status: 500 })
    }
  }
  const supplierAction = action === 'create' || action === 'update' || action === 'delete' || STOCK_ACTIONS.includes(action)
  const millAction = action === 'issue' || action === 'verify' || action === 'correct' || REQUEST_ACTIONS.includes(action)
  if (!supplierAction && !millAction) return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 })

  const check = supplierAction
    ? await requireAccess(request, 'yarn_supply', 'edit', 'Only the supplier can send or change these entries.')
    : await requireAccess(request, 'prod_yarn', 'edit', 'You need Yarn Stock (Edit) to check yarn arrivals.')
  if (check.error) return check.error
  const name = check.user.name || check.user.email || 'User'
  const id = String(body?.id || '')

  if (STOCK_ACTIONS.includes(action)) {
    try {
      let saved = null
      if (action === 'stockAdd') saved = await addSupplierStock(body?.stock as SupplierStockInput, { id: check.user.id, name })
      else if (action === 'stockUpdate') saved = await updateSupplierStock(id, body?.stock as SupplierStockInput)
      else if (action === 'stockDelete') await deleteSupplierStock(id)
      else if (action === 'twistAdd') saved = await addSupplierTwisting(body?.twist as SupplierTwistingInput, { id: check.user.id, name })
      else if (action === 'twistUpdate') saved = await updateSupplierTwisting(id, body?.twist as SupplierTwistingInput)
      else if (action === 'twistDelete') await deleteSupplierTwisting(id)
      else if (action === 'twistDone') saved = await finishSupplierTwisting(id, body?.out as SupplierTwistingOut, { id: check.user.id, name })
      else if (action === 'twistUndo') saved = await undoSupplierTwisting(id)
      else if (action === 'twistEdit') saved = await updateFinishedTwisting(id, body?.out as SupplierTwistingOut, { id: check.user.id, name })
      await writeAudit({
        req: request,
        actor: check.user,
        module: 'floor',
        action: `yarnSupply.${action}`,
        entityKey: action.startsWith('twist') ? 'floor_supplier_twisting' : 'floor_supplier_stock',
        entityId: saved?.id || id || null,
        after: saved,
      })
      return NextResponse.json({ ok: true, stock: saved })
    } catch (err) {
      if (err instanceof YarnError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
      console.error('[yarn-supply POST]', action, err)
      return NextResponse.json({ ok: false, error: 'Could not save. Please try again.' }, { status: 500 })
    }
  }

  if (REQUEST_ACTIONS.includes(action)) {
    try {
      let saved
      if (action === 'requestCreate') saved = await createYarnRequest(body?.request as YarnRequestInput, { id: check.user.id, name })
      else if (action === 'requestUpdate') saved = await updateYarnRequest(id, body?.request as YarnRequestInput, name)
      else
        saved = await setYarnRequestStatus(
          id,
          action === 'requestClose' ? 'CLOSED' : action === 'requestCancel' ? 'CANCELLED' : 'OPEN',
          String(body?.note || ''),
          name
        )
      await writeAudit({
        req: request,
        actor: check.user,
        module: 'floor',
        action: `yarnSupply.${action}`,
        entityKey: 'floor_yarn_requests',
        entityId: saved?.id || id || null,
        after: saved,
      })
      return NextResponse.json({ ok: true, request: saved })
    } catch (err) {
      if (err instanceof YarnError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
      console.error('[yarn-supply POST]', action, err)
      return NextResponse.json({ ok: false, error: 'Could not save. Please try again.' }, { status: 500 })
    }
  }

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
