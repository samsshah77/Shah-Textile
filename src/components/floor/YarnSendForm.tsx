'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getCalendarToday } from '@/constants/productionCalendar'
import { longDayDateFromYmd } from '@/lib/longDate'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { SectionLoader } from '@/components/shared/Loaders'
import { fetchYarnSupply, fmtKg, yarnSupplyAction, type MillYarnStock, type YarnDispatch } from '@/lib/floor/yarnSupply'

const MAX_BAGS = 200

/** "20/1 Pv-China" and "20/1-pv china" are the same yarn (same rule as Add Yarn and the server). */
const yarnKey = (s: string) => s.toLowerCase().replace(/[\s\-_.]+/g, '')

function sanitizeKg(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  return `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Yarn Supply → Send yarn (its own page, works on a phone): yarn, date, challan / lot /
 * vehicle #, and the weight of every bag. With `editId` it corrects an entry the mill has not
 * verified yet (e.g. after "Issue reported") and sends it back for checking.
 */
export function YarnSendForm({ editId }: { editId?: string | null }) {
  const router = useRouter()
  const { showSuccessSoon } = useAlertDialog()
  const [stock, setStock] = useState<MillYarnStock[] | null>(null)
  const [editing, setEditing] = useState<YarnDispatch | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [yarnType, setYarnType] = useState('')
  const [sentDate, setSentDate] = useState(getCalendarToday())
  const [challanNo, setChallanNo] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [vehicleNo, setVehicleNo] = useState('')
  const [remarks, setRemarks] = useState('')
  const [bagCountText, setBagCountText] = useState('5')
  const [bagKg, setBagKg] = useState<string[]>(Array(5).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const bagRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    let alive = true
    fetchYarnSupply()
      .then((d) => {
        if (!alive) return
        if (!d.canSend) {
          setLoadError('Only the supplier can send yarn entries.')
          return
        }
        setStock(d.stock)
        if (editId) {
          const e = d.dispatches.find((x) => x.id === editId)
          if (!e) return setLoadError('This entry was not found (it may have been deleted).')
          if (e.status === 'VERIFIED') return setLoadError('The mill has already verified this entry — it can no longer be changed.')
          setEditing(e)
          setYarnType(e.yarnType)
          setSentDate(e.sentDate)
          setChallanNo(e.challanNo)
          setLotNo(e.lotNo)
          setVehicleNo(e.vehicleNo)
          setRemarks(e.remarks)
          setBagCountText(String(e.bagKg.length || 1))
          setBagKg(e.bagKg.map((w) => w.toFixed(2)))
        }
      })
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : 'Could not load.'))
    return () => {
      alive = false
    }
  }, [editId])

  const bagCount = bagKg.length
  const setBags = (n: number) => {
    const next = Math.min(MAX_BAGS, Math.max(1, Math.floor(n) || 1))
    setBagKg((prev) => {
      const copy = prev.slice(0, next)
      while (copy.length < next) copy.push('')
      return copy
    })
  }

  const weights = bagKg.map((v) => r2(parseFloat(v) || 0))
  const filled = weights.filter((w) => w > 0).length
  const totalKg = r2(weights.reduce((a, b) => a + b, 0))
  const matched = useMemo(() => {
    const k = yarnKey(yarnType)
    return k ? (stock || []).find((y) => yarnKey(y.yarnType) === k) || null : null
  }, [stock, yarnType])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = matched ? matched.yarnType : yarnType.trim()
    if (!name) return setError('Enter the yarn.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sentDate) || sentDate > getCalendarToday()) return setError('Pick a valid date (today or earlier).')
    if (filled !== bagCount) return setError(`Enter the weight of all ${bagCount} bags.`)
    setBusy(true)
    setError(null)
    try {
      const entry = { yarnType: name, sentDate, bagKg: weights, challanNo: challanNo.trim(), lotNo: lotNo.trim(), vehicleNo: vehicleNo.trim(), remarks: remarks.trim() }
      if (editing) await yarnSupplyAction({ action: 'update', id: editing.id, entry })
      else await yarnSupplyAction({ action: 'create', entry })
      showSuccessSoon({
        title: editing ? 'Saved' : 'Sent',
        message: editing ? 'Sent to the mill again to be checked.' : 'The mill will check it when the yarn arrives.',
      })
      router.push('/yarn-supply')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="alert alert-warning mt-3">
        {loadError} <Link href="/yarn-supply">Back to Yarn Supply</Link>
      </div>
    )
  }
  if (!stock) return <SectionLoader />

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 860 }}>
      <div className="card-header d-flex align-items-center gap-2">
        <Link href="/yarn-supply" className="btn btn-sm btn-outline-secondary">
          <i className="bi bi-arrow-left" /> Back
        </Link>
        <h3 className="card-title mb-0">{editing ? 'Correct yarn sent' : 'Send yarn to the mill'}</h3>
      </div>
      <div className="card-body">
        {editing?.status === 'ISSUE' && (
          <div className="alert alert-danger py-2 px-3 small">
            <b>Mill reported an issue:</b> {editing.issueNote}
            {editing.issueBy ? ` — ${editing.issueBy}` : ''}
          </div>
        )}
        {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}

        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold mb-1" htmlFor="ys-yarn">
              Yarn
            </label>
            <input
              id="ys-yarn"
              className="form-control"
              list="ys-yarn-list"
              placeholder="e.g. 20/1 Pv China"
              autoComplete="off"
              maxLength={120}
              value={yarnType}
              onChange={(e) => {
                setYarnType(e.target.value)
                setError(null)
              }}
              required
            />
            <datalist id="ys-yarn-list">
              {stock.map((y) => (
                <option key={y.id} value={y.yarnType} />
              ))}
            </datalist>
            {yarnType.trim() && (
              <div className={`form-text small ${matched ? 'text-success' : 'text-secondary'}`}>
                {matched ? `The mill has ${fmtKg(matched.balanceKg)} of this yarn.` : 'A yarn the mill does not have yet.'}
              </div>
            )}
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold mb-1" htmlFor="ys-date">
              Date sent
            </label>
            <input id="ys-date" type="date" className="form-control" value={sentDate} max={getCalendarToday()} onChange={(e) => setSentDate(e.target.value)} required />
            <div className="form-text small">{longDayDateFromYmd(sentDate)}</div>
          </div>
          <div className="col-6 col-md-4">
            <label className="form-label small fw-semibold mb-1" htmlFor="ys-challan">
              Challan / DC #
            </label>
            <input id="ys-challan" className="form-control" maxLength={60} value={challanNo} onChange={(e) => setChallanNo(e.target.value)} />
          </div>
          <div className="col-6 col-md-4">
            <label className="form-label small fw-semibold mb-1" htmlFor="ys-lot">
              Lot #
            </label>
            <input id="ys-lot" className="form-control" maxLength={60} value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold mb-1" htmlFor="ys-vehicle">
              Vehicle #
            </label>
            <input id="ys-vehicle" className="form-control" maxLength={40} value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold mb-1" htmlFor="ys-remarks">
              Remarks <span className="text-secondary fw-normal">(optional)</span>
            </label>
            <input id="ys-remarks" className="form-control" maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>

          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold mb-1" htmlFor="ys-bags">
              Bags
            </label>
            <input
              id="ys-bags"
              inputMode="numeric"
              className="form-control"
              value={bagCountText}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
                setBagCountText(digits)
                if (digits !== '') setBags(Number(digits))
              }}
              onBlur={() => {
                const n = Math.min(MAX_BAGS, Math.max(1, Number(bagCountText) || 1))
                setBags(n)
                setBagCountText(String(n))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                  bagRefs.current[0]?.focus()
                }
              }}
            />
          </div>
          <div className="col-6 col-md-9 d-flex align-items-end">
            <div className="w-100 rounded border bg-light px-3 py-2 d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div>
                <div className="small text-secondary">Total sent</div>
                <div className="fw-bold">
                  {fmtKg(totalKg)}{' '}
                  <span className="fw-normal text-secondary small">
                    · {bagCount} bag{bagCount === 1 ? '' : 's'} · {filled} of {bagCount} filled
                  </span>
                </div>
              </div>
              {parseFloat(bagKg[0]) > 0 && bagCount > 1 && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => setBagKg(Array(bagCount).fill(parseFloat(bagKg[0]).toFixed(2)))}
                >
                  Same weight for all ({parseFloat(bagKg[0]).toFixed(2)} kg)
                </button>
              )}
            </div>
          </div>

          <div className="col-12">
            <div className="small fw-semibold mb-1">Bag weight (kg)</div>
            <div className="row g-2">
              {bagKg.map((v, i) => (
                <div key={i} className="col-6 col-md-4 col-lg-3">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text" style={{ minWidth: 64 }}>
                      Bag {i + 1}
                    </span>
                    <input
                      ref={(el) => {
                        bagRefs.current[i] = el
                      }}
                      inputMode="decimal"
                      className="form-control text-end"
                      placeholder="0.00"
                      value={v}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        const val = sanitizeKg(e.target.value)
                        setBagKg((prev) => prev.map((p, j) => (j === i ? val : p)))
                        setError(null)
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim()
                        if (raw !== '' && !isNaN(Number(raw))) {
                          const f = parseFloat(raw).toFixed(2)
                          setBagKg((prev) => prev.map((p, j) => (j === i ? f : p)))
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (i + 1 < bagCount) bagRefs.current[i + 1]?.focus()
                          else document.getElementById('ys-send-btn')?.focus()
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="card-footer d-flex justify-content-end gap-2">
        <Link href="/yarn-supply" className="btn btn-outline-secondary">
          Cancel
        </Link>
        <button id="ys-send-btn" type="submit" className="btn btn-primary px-4" disabled={busy || !yarnType.trim() || filled !== bagCount}>
          <i className={`bi ${editing ? 'bi-check-lg' : 'bi-send'} me-1`} />
          {busy ? 'Saving…' : editing ? 'Save & send again' : 'Send'}
        </button>
      </div>
    </form>
  )
}
