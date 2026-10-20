/**
 * Yarn stock is worked out from the movements (like a bank passbook):
 *
 *   received = Σ INWARD kg      issued = Σ OUTWARD kg      balance = received − issued
 *   bags     = Σ INWARD bags
 *
 * Nobody types a balance. Arrivals are INWARD movements, issues to looms are OUTWARD,
 * and a fix to the totals in the stock table is saved as a CORRECTION movement of the
 * difference (it may be negative). The yarn row keeps the totals only as a cache that
 * the server recomputes after every change.
 */
import { kgToLbs } from '@/services/production/loomBeamHelpers'

export type YarnMovementKind = 'NORMAL' | 'OPENING' | 'CORRECTION'

export type YarnMovementLike = {
  yarnId: string
  type: string
  weightKg: number
  bags?: number | null
}

export type YarnTotals = {
  bags: number
  receivedKg: number
  issuedKg: number
  balanceKg: number
  receivedLbs: number
  issuedLbs: number
  balanceLbs: number
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export function totalsFromKg(receivedKg: number, issuedKg: number, bags: number): YarnTotals {
  const rec = r2(receivedKg)
  const iss = r2(issuedKg)
  const bal = r2(rec - iss)
  return {
    bags: Math.round(Number(bags) || 0),
    receivedKg: rec,
    issuedKg: iss,
    balanceKg: bal,
    receivedLbs: kgToLbs(rec),
    issuedLbs: kgToLbs(iss),
    balanceLbs: kgToLbs(bal),
  }
}

/** Totals per yarn id, from its movements. Yarns without movements get zeros. */
export function deriveYarnTotals(yarnIds: string[], movements: YarnMovementLike[]): Map<string, YarnTotals> {
  const acc = new Map<string, { rec: number; iss: number; bags: number }>()
  for (const id of yarnIds) acc.set(id, { rec: 0, iss: 0, bags: 0 })
  for (const m of movements) {
    const a = acc.get(m.yarnId)
    if (!a) continue
    const kg = Number(m.weightKg) || 0
    if (m.type === 'INWARD') {
      a.rec += kg
      a.bags += Number(m.bags) || 0
    } else if (m.type === 'OUTWARD') {
      a.iss += kg
    }
  }
  const out = new Map<string, YarnTotals>()
  for (const [id, a] of acc) out.set(id, totalsFromKg(a.rec, a.iss, a.bags))
  return out
}

export type PlannedMovement = { type: 'INWARD' | 'OUTWARD'; weightKg: number; bags: number }

/**
 * Movements that take the derived totals `now` to the wanted totals.
 * Used for corrections typed in the stock table and, once, to carry over stored
 * totals that did not match their movements (so nobody's balance changes).
 */
export function planYarnCorrection(
  now: { receivedKg: number; issuedKg: number; bags: number },
  want: { receivedKg?: number; issuedKg?: number; bags?: number }
): PlannedMovement[] {
  const out: PlannedMovement[] = []
  const dRec = want.receivedKg === undefined ? 0 : r2(want.receivedKg - now.receivedKg)
  const dBags = want.bags === undefined ? 0 : Math.round(want.bags - now.bags)
  const dIss = want.issuedKg === undefined ? 0 : r2(want.issuedKg - now.issuedKg)
  if (dRec !== 0 || dBags !== 0) out.push({ type: 'INWARD', weightKg: dRec, bags: dBags })
  if (dIss !== 0) out.push({ type: 'OUTWARD', weightKg: dIss, bags: 0 })
  return out
}
