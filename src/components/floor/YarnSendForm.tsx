'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getCalendarToday } from '@/constants/productionCalendar'
import { longDayDateFromYmd } from '@/lib/longDate'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { SectionLoader } from '@/components/shared/Loaders'
import { NamedDateInput } from '@/components/shared/NamedDateInput'
import {
  DESTINATION_LABEL,
  fetchYarnSupply,
  fmtKg,
  requestRemainingKg,
  yarnSupplyAction,
  type MillYarnStock,
  type YarnDispatch,
  type YarnRequest,
  type YarnDestination,
  type SupplierStoreBalance,
} from '@/lib/floor/yarnSupply'

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

interface QualityBatch {
  yarnType: string
  bagCountText: string
  bagKg: string[]
  requestId?: string | null
}

function makeBatch(yarnType: string, bags = 5, requestId: string | null = null): QualityBatch {
  const count = Math.min(MAX_BAGS, Math.max(1, bags))
  return { yarnType, bagCountText: String(count), bagKg: Array(count).fill(''), requestId }
}

/**
 * Yarn Supply → Send yarn (its own page, works on a phone):
 *  - Create mode: pre-renders all mill yarn qualities so the supplier can select one or multiple
 *    qualities (or add a new one), enter bag count and bag weights for each, and send together.
 *  - Edit mode (`editId`): corrects a single existing dispatch and sends it back for checking.
 */
export function YarnSendForm({
  editId,
  requestId: fromRequest,
  to,
}: {
  editId?: string | null
  requestId?: string | null
  /** SIZING / WARPING: Fazal Umer's own departments (record only); TWISTING: issue to Twisting. Default: the mill. */
  to?: string | null
}) {
  const router = useRouter()
  const { showSuccessSoon } = useAlertDialog()
  const [stock, setStock] = useState<MillYarnStock[] | null>(null)
  const [editing, setEditing] = useState<YarnDispatch | null>(null)
  const [requests, setRequests] = useState<YarnRequest[]>([])
  const [requestId, setRequestId] = useState<string>('')
  const [destination, setDestination] = useState<YarnDestination>(
    to === 'SIZING' ? 'SIZING' : to === 'WARPING' ? 'WARPING' : to === 'TWISTING' ? 'TWISTING' : 'MILL'
  )
  const [storeBal, setStoreBal] = useState<SupplierStoreBalance[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [sentDate, setSentDate] = useState(getCalendarToday())
  const [challanNo, setChallanNo] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [vehicleNo, setVehicleNo] = useState('')
  const [remarks, setRemarks] = useState('')

  // Multi-quality batches (create mode) or single batch (edit mode)
  const [batches, setBatches] = useState<QualityBatch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        setRequests(d.requests)
        setStoreBal(d.store)
        if (!editId && fromRequest) {
          const q = d.requests.find((x) => x.id === fromRequest)
          if (q && q.status === 'OPEN') {
            const st = d.store.find((s) => yarnKey(s.yarnType) === yarnKey(q.yarnType))
            if (!st || st.balanceKg <= 0) {
              setError(`${q.yarnType} is not in Fazal Umer Balance — add it to the Balance first, then send.`)
            } else {
              setRequestId(q.id)
              setBatches([makeBatch(q.yarnType, q.bags || 5, q.id)])
            }
          }
        }
        if (editId) {
          const e = [...d.dispatches, ...d.deptDispatches].find((x) => x.id === editId)
          if (!e) return setLoadError('This entry was not found (it may have been deleted).')
          if (e.status === 'VERIFIED') return setLoadError('Sara Textile has already verified this entry — it can no longer be changed.')
          if (e.destination === 'TWISTING' && d.twisting.some((t) => t.dispatchId === e.id && t.status === 'DONE')) {
            return setLoadError('This lot has already come back from Twisting to the Balance — Undo that on the Twisting page first.')
          }
          setEditing(e)
          setDestination(e.destination)
          setSentDate(e.sentDate)
          setChallanNo(e.challanNo)
          setLotNo(e.lotNo)
          setVehicleNo(e.vehicleNo)
          setRemarks(e.remarks)
          setRequestId(e.requestId || '')
          setBatches([
            {
              yarnType: e.yarnType,
              bagCountText: String(e.bagKg.length || 1),
              bagKg: e.bagKg.map((w) => w.toFixed(2)),
            },
          ])
        }
      })
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : 'Could not load.'))
    return () => {
      alive = false
    }
  }, [editId, fromRequest])

  /** Kg that can be sent for a yarn: Fazal Umer Balance left (+ this entry's own kg when correcting it). */
  const availableKg = (name: string) => {
    const st = storeBal.find((s) => yarnKey(s.yarnType) === yarnKey(name))
    const own = editing && yarnKey(editing.yarnType) === yarnKey(name) ? editing.weightKg : 0
    return r2((st ? st.balanceKg : 0) + own)
  }

  const isSelected = (name: string) => batches.some((b) => yarnKey(b.yarnType) === yarnKey(name))

  const toggleQuality = (name: string) => {
    setError(null)
    if (!isSelected(name) && availableKg(name) <= 0) {
      setError(`${name} is not in Fazal Umer Balance — add it to the Balance first.`)
      return
    }
    if (editing) {
      setBatches((prev) => (prev[0] ? [{ ...prev[0], yarnType: name }] : [makeBatch(name)]))
      return
    }
    setBatches((prev) => {
      const k = yarnKey(name)
      if (prev.some((b) => yarnKey(b.yarnType) === k)) {
        return prev.filter((b) => yarnKey(b.yarnType) !== k)
      }
      return [...prev, makeBatch(name)]
    })
  }

  const updateBatchBags = (idx: number, n: number) => {
    const next = Math.min(MAX_BAGS, Math.max(1, Math.floor(n) || 1))
    setBatches((prev) =>
      prev.map((b, i) => {
        if (i !== idx) return b
        const copy = b.bagKg.slice(0, next)
        while (copy.length < next) copy.push('')
        return { ...b, bagKg: copy }
      })
    )
  }

  const setBatchBagCountText = (idx: number, text: string) => {
    setBatches((prev) => prev.map((b, i) => (i === idx ? { ...b, bagCountText: text } : b)))
  }

  const setBatchBagWeight = (idx: number, bagIdx: number, val: string) => {
    setBatches((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, bagKg: b.bagKg.map((w, j) => (j === bagIdx ? val : w)) } : b))
    )
    setError(null)
  }

  const fillSameWeight = (idx: number, weightStr: string) => {
    setBatches((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, bagKg: Array(b.bagKg.length).fill(weightStr) } : b))
    )
    setError(null)
  }

  const toggleRequestCard = (q: YarnRequest) => {
    setError(null)
    if (!batches.some((b) => b.requestId === q.id) && availableKg(q.yarnType) <= 0) {
      setError(`${q.yarnType} is not in Fazal Umer Balance — add it to the Balance first.`)
      return
    }
    setBatches((prev) => {
      if (prev.some((b) => b.requestId === q.id)) {
        return prev.filter((b) => b.requestId !== q.id)
      }
      const reqBags = q.bags ?? 0
      const remaining = reqBags > 0 ? Math.max(1, reqBags - (q.sentBags || 0)) : 5
      const idx = prev.findIndex((b) => yarnKey(b.yarnType) === yarnKey(q.yarnType) && !b.requestId)
      if (idx >= 0) {
        return prev.map((b, i) => (i === idx ? { ...b, requestId: q.id } : b))
      }
      return [...prev, makeBatch(q.yarnType, remaining, q.id)]
    })
    setRequestId((prevId) => (prevId === q.id ? '' : prevId || q.id))
  }

  const linkable = requests.filter((q) => q.status === 'OPEN' || q.id === requestId)
  const linked = requests.find((q) => q.id === requestId) || null
  const toMill = destination === 'MILL'
  const toTwisting = destination === 'TWISTING'
  /** Where this page came from / goes back to. */
  const doneHref = toTwisting
    ? '/yarn-supply/twisting'
    : toMill
      ? '/yarn-supply?tab=sent'
      : destination === 'SIZING'
        ? '/yarn-supply/sizing'
        : '/yarn-supply/warping'
  const backHref = toMill && fromRequest ? '/yarn-supply?tab=requests' : doneHref
  /** Qualities asking for more kg than the Balance has (the Send button stays off). */
  const overBatches = batches.filter((b) => b.bagKg.reduce((s, v) => s + r2(parseFloat(v) || 0), 0) > availableKg(b.yarnType) + 0.001)

  const allBatchesReady =
    batches.length > 0 &&
    batches.every((b) => {
      const weights = b.bagKg.map((v) => r2(parseFloat(v) || 0))
      return weights.length > 0 && weights.every((w) => w > 0)
    })

  const grandTotalKg = r2(
    batches.reduce((sum, b) => sum + b.bagKg.reduce((s, v) => s + r2(parseFloat(v) || 0), 0), 0)
  )
  const grandTotalBags = batches.reduce((sum, b) => sum + b.bagKg.length, 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (batches.length === 0) return setError('Select at least one yarn quality.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sentDate) || sentDate > getCalendarToday()) {
      return setError('Pick a valid date (today or earlier).')
    }
    for (const b of batches) {
      const weights = b.bagKg.map((v) => r2(parseFloat(v) || 0))
      const filled = weights.filter((w) => w > 0).length
      if (filled !== b.bagKg.length) {
        return setError(`Enter the weight of all ${b.bagKg.length} bags for ${b.yarnType}.`)
      }
      const left = availableKg(b.yarnType)
      if (r2(weights.reduce((x, w) => x + w, 0)) > left + 0.001) {
        return setError(
          left <= 0
            ? `${b.yarnType} is not in Fazal Umer Balance — add it to the Balance first.`
            : `Only ${fmtKg(left)} of ${b.yarnType} is in Fazal Umer Balance — lower the bags or weights.`
        )
      }
    }

    setBusy(true)
    setError(null)
    try {
      if (editing) {
        const b = batches[0]
        const weights = b.bagKg.map((v) => r2(parseFloat(v) || 0))
        await yarnSupplyAction({
          action: 'update',
          id: editing.id,
          entry: {
            yarnType: b.yarnType.trim(),
            sentDate,
            bagKg: weights,
            challanNo: challanNo.trim(),
            lotNo: lotNo.trim(),
            vehicleNo: vehicleNo.trim(),
            remarks: remarks.trim(),
            requestId: toMill ? requestId || null : null,
            destination,
          },
        })
      } else {
        for (const b of batches) {
          const weights = b.bagKg.map((v) => r2(parseFloat(v) || 0))
          const matchedStock = (stock || []).find((y) => yarnKey(y.yarnType) === yarnKey(b.yarnType))
          await yarnSupplyAction({
            action: 'create',
            entry: {
              yarnType: matchedStock ? matchedStock.yarnType : b.yarnType.trim(),
              sentDate,
              bagKg: weights,
              challanNo: challanNo.trim(),
              lotNo: lotNo.trim(),
              vehicleNo: vehicleNo.trim(),
              remarks: remarks.trim(),
              requestId: !toMill
                ? null
                : (b.requestId ?? (linked && yarnKey(linked.yarnType) === yarnKey(b.yarnType) ? requestId : null)),
              destination,
            },
          })
        }
      }
      showSuccessSoon({
        title: editing ? 'Saved' : toTwisting ? 'Issued' : 'Sent',
        message: toTwisting
          ? editing
            ? 'The lot in Twisting is changed.'
            : `${batches.length} ${batches.length === 1 ? 'lot' : 'lots'} issued to Twisting — taken out of the Balance.`
          : !toMill
          ? `${batches.length} ${batches.length === 1 ? 'entry' : 'entries'} recorded as sent to ${DESTINATION_LABEL[destination]}.`
          : editing
            ? 'Sent to Sara Textile again to be checked.'
            : `${batches.length} ${batches.length === 1 ? 'entry' : 'entries'} sent — Sara Textile will check when the yarn arrives.`,
      })
      router.push(doneHref)
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

  // The mill's yarns + yarns in Fazal Umer's store + any custom ones currently in batches
  const chipYarns: MillYarnStock[] = [
    ...stock,
    ...storeBal
      .filter((s) => !stock.some((y) => yarnKey(y.yarnType) === yarnKey(s.yarnType)))
      .map((s) => ({ id: `store-${s.yarnType}`, yarnType: s.yarnType, balanceKg: 0 })),
  ]
  const customNames = batches
    .map((b) => b.yarnType)
    .filter((name) => !chipYarns.some((y) => yarnKey(y.yarnType) === yarnKey(name)))

  return (
    <form onSubmit={submit} className="w-100">
      {/* A full page (not a card): title row, the form, and a bar with Send at the bottom. */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pb-3 mb-3 border-bottom">
        <div className="d-flex align-items-center gap-2">
          <Link href={backHref} className="btn btn-sm btn-outline-secondary">
            <i className="bi bi-arrow-left" /> Back
          </Link>
          <h3 className="h5 fw-bold mb-0">
            {toTwisting
              ? editing
                ? 'Correct yarn issued to Twisting'
                : 'Issue yarn to Twisting'
              : editing
                ? 'Correct yarn sent'
                : toMill
                  ? 'Send yarn to Sara Textile'
                  : `Send yarn to ${DESTINATION_LABEL[destination]}`}
          </h3>
        </div>
        {batches.length > 0 && (
          <span className="badge text-bg-primary">
            {batches.length} {batches.length === 1 ? 'quality' : 'qualities'} · {grandTotalBags} bags · {fmtKg(grandTotalKg)}
          </span>
        )}
      </div>

      <div className="pb-2">
        {editing?.status === 'ISSUE' && (
          <div className="alert alert-danger py-2 px-3 small">
            <b>Sara Textile reported an issue:</b> {editing.issueNote}
            {editing.issueBy ? ` — ${editing.issueBy}` : ''}
          </div>
        )}
        {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}

        <div className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-semibold mb-1">Send to</label>
            <div className="row g-2" role="group" aria-label="Send to">
              {(['MILL', 'SIZING', 'WARPING', 'TWISTING'] as const).map((k) => (
                <div key={k} className="col-6 col-md-3">
                  <button
                    type="button"
                    className={`btn w-100 h-100 ${destination === k ? 'btn-primary' : 'btn-outline-primary'}`}
                    disabled={Boolean(
                      editing &&
                        // A Twisting lot stays a Twisting lot; another lot cannot become one by editing.
                        ((editing.destination === 'TWISTING') !== (k === 'TWISTING') ||
                          (editing.destination === 'MILL' && editing.status !== 'PENDING' && k !== 'MILL'))
                    )}
                    onClick={() => {
                      setDestination(k)
                      if (k !== 'MILL') setRequestId('')
                    }}
                  >
                    <i className={`bi ${k === 'MILL' ? 'bi-building' : k === 'TWISTING' ? 'bi-arrow-repeat' : 'bi-diagram-3'} me-1`} />
                    {DESTINATION_LABEL[k]}
                  </button>
                </div>
              ))}
            </div>
            <div className="form-text small">
              {toMill
                ? 'Sara Textile checks it when it arrives (Verify / Report issue).'
                : toTwisting
                  ? 'Taken out of Fazal Umer Balance and shown on the Twisting page. When twisting is done, use “Move to Balance” there to bring the twisted yarn back.'
                  : `Fazal Umer's own ${DESTINATION_LABEL[destination]} — recorded only; it is taken out of the Balance.`}
            </div>
          </div>
          {toMill && !editing && linkable.length > 0 && (
            <div className="col-12">
              <label className="form-label small fw-semibold mb-1">
                Sara Textile’s Open Requests <span className="text-secondary fw-normal">(tap to select)</span>
              </label>
              <div className="row g-2">
                {linkable.map((q) => {
                  const selected = batches.some((b) => b.requestId === q.id)
                  const noStock = !selected && availableKg(q.yarnType) <= 0
                  return (
                    <div key={q.id} className="col-12 col-sm-6 col-md-4">
                      <button
                        type="button"
                        disabled={noStock}
                        title={noStock ? 'Not in Fazal Umer Balance' : undefined}
                        onClick={() => toggleRequestCard(q)}
                        className={`w-100 text-start p-2 rounded border transition-all ${
                          selected
                            ? 'bg-primary-subtle border-primary text-dark'
                            : noStock
                              ? 'bg-light border-danger-subtle text-dark'
                              : 'bg-white border-secondary-subtle text-dark'
                        }`}
                        style={noStock ? { cursor: 'not-allowed' } : undefined}
                      >
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div className="fw-bold small text-truncate">{q.yarnType}</div>
                          <span className={`badge ${selected ? 'text-bg-primary' : 'text-bg-light border text-dark'}`}>
                            {q.kg > 0 ? fmtKg(q.kg) : `${q.bags ?? 0} bags`}
                          </span>
                        </div>
                        <div className="small text-secondary mt-1 d-flex flex-wrap gap-2">
                          {q.neededBy && <span>By {longDayDateFromYmd(q.neededBy)}</span>}
                          {q.lots > 0 && <span className="text-warning-emphasis fw-semibold">Sent: {q.sentBags} bags</span>}
                          {noStock && <span className="text-danger fw-semibold">Not in Fazal Umer Balance — cannot be sent</span>}
                        </div>
                        {q.note && <div className="small text-secondary text-truncate mt-1">{q.note}</div>}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pre-rendered Yarn Qualities (multi-select in create mode) */}
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label className="form-label small fw-semibold mb-0">
                {editing ? 'Yarn Quality' : 'Select Yarn Qualities (tap to select one or multiple)'}
              </label>
            </div>
            <div className="d-flex flex-wrap gap-2 p-2 border rounded bg-light">
              {/* Only qualities with stock in Fazal Umer Balance can be picked; the rest are listed below. */}
              {chipYarns
                .filter((y) => isSelected(y.yarnType) || availableKg(y.yarnType) > 0)
                .map((y) => {
                  const active = isSelected(y.yarnType)
                  const left = availableKg(y.yarnType)
                  return (
                    <button
                      key={y.id}
                      type="button"
                      onClick={() => toggleQuality(y.yarnType)}
                      className={`btn ${active ? 'btn-primary' : 'btn-light border border-secondary-subtle text-dark'} d-inline-flex align-items-center gap-2 py-1 px-2`}
                    >
                      <i className={`bi ${active ? 'bi-check-circle-fill' : 'bi-plus-circle text-primary'}`} />
                      <span className="fw-semibold">{y.yarnType}</span>
                      <span className={`badge sara-num ${active ? 'bg-white text-primary' : 'text-bg-success'}`}>{fmtKg(Math.max(0, left))}</span>
                    </button>
                  )
                })}
              {chipYarns.every((y) => !isSelected(y.yarnType) && availableKg(y.yarnType) <= 0) && customNames.length === 0 && (
                <div className="small text-dark p-1">Nothing in Fazal Umer Balance yet — add stock to the Balance first.</div>
              )}
              {customNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleQuality(name)}
                  className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
                >
                  <i className="bi bi-check-circle-fill" />
                  <span>{name}</span>
                </button>
              ))}
            </div>
            {chipYarns.some((y) => !isSelected(y.yarnType) && availableKg(y.yarnType) <= 0) && (
              <div className="small mt-2 text-dark">
                <span className="fw-semibold text-danger">
                  <i className="bi bi-slash-circle me-1" />
                  Not in Fazal Umer Balance (0 kg) — cannot be sent:
                </span>{' '}
                {chipYarns
                  .filter((y) => !isSelected(y.yarnType) && availableKg(y.yarnType) <= 0)
                  .map((y) => y.yarnType)
                  .join(' · ')}
              </div>
            )}
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold mb-1">{toTwisting ? 'Date issued' : 'Date sent'}</label>
            <div>
              <NamedDateInput
                size="sm"
                className="w-100"
                value={sentDate}
                max={getCalendarToday()}
                ariaLabel={toTwisting ? 'Date issued' : 'Date sent'}
                onChange={(v) => v && setSentDate(v)}
              />
            </div>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold mb-1" htmlFor="ys-lot">
              Lot #
            </label>
            <input id="ys-lot" className="form-control form-control-sm" maxLength={60} value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold mb-1" htmlFor="ys-remarks">
              Remarks <span className="text-secondary fw-normal">(optional)</span>
            </label>
            <input id="ys-remarks" className="form-control form-control-sm" maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>

          {/* Per-quality bag count & weights */}
          {batches.length === 0 ? (
            <div className="col-12">
              <div className="border rounded p-3 text-center text-secondary small bg-light">
                Select one or more yarn qualities above to enter bag count and weights.
              </div>
            </div>
          ) : (
            batches.map((b, bIdx) => {
              const weights = b.bagKg.map((v) => r2(parseFloat(v) || 0))
              const filled = weights.filter((w) => w > 0).length
              const totalKg = r2(weights.reduce((s, w) => s + w, 0))
              const bagCount = b.bagKg.length
              const firstW = parseFloat(b.bagKg[0])

              return (
                <div key={`${b.yarnType}-${bIdx}`} className="col-12">
                  <div className="border rounded p-3 bg-white">
                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 border-bottom pb-2 mb-2">
                      <div>
                        <div className="fw-bold text-primary">
                          {bIdx + 1}. {b.yarnType}
                        </div>
                        {(() => {
                          const left = availableKg(b.yarnType)
                          if (left <= 0) return <div className="small text-danger fw-semibold">Not in Fazal Umer Balance — cannot be sent</div>
                          return (
                            <div className={`small ${left - totalKg < 0 ? 'text-danger fw-semibold' : 'text-secondary'}`}>
                              In Balance: {fmtKg(left)}
                              {left - totalKg < 0 ? ` — only ${fmtKg(left)} can be sent` : ''}
                            </div>
                          )
                        })()}
                      </div>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <div className="input-group input-group-sm" style={{ width: 176 }}>
                          <span className="input-group-text">Bags</span>
                          <button
                            type="button"
                            className="btn btn-outline-secondary px-2"
                            aria-label="Decrease bags"
                            disabled={bagCount <= 1}
                            onClick={() => {
                              const next = Math.max(1, bagCount - 1)
                              updateBatchBags(bIdx, next)
                              setBatchBagCountText(bIdx, String(next))
                            }}
                          >
                            −
                          </button>
                          <input
                            inputMode="numeric"
                            className="form-control text-center fw-semibold px-1"
                            value={b.bagCountText}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
                              setBatchBagCountText(bIdx, digits)
                              if (digits !== '') updateBatchBags(bIdx, Number(digits))
                            }}
                            onBlur={() => {
                              const n = Math.min(MAX_BAGS, Math.max(1, Number(b.bagCountText) || 1))
                              updateBatchBags(bIdx, n)
                              setBatchBagCountText(bIdx, String(n))
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-outline-secondary px-2"
                            aria-label="Increase bags"
                            disabled={bagCount >= MAX_BAGS}
                            onClick={() => {
                              const next = Math.min(MAX_BAGS, bagCount + 1)
                              updateBatchBags(bIdx, next)
                              setBatchBagCountText(bIdx, String(next))
                            }}
                          >
                            +
                          </button>
                        </div>
                        <span className="small text-secondary">
                          <strong className="text-dark">{fmtKg(totalKg)}</strong> · {filled}/{bagCount} filled
                        </span>
                        {firstW > 0 && bagCount > 1 && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary py-0 px-2"
                            onClick={() => fillSameWeight(bIdx, firstW.toFixed(2))}
                          >
                            Same weight ({firstW.toFixed(2)} kg)
                          </button>
                        )}
                        {!editing && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger py-0 px-2"
                            title="Remove quality"
                            onClick={() => toggleQuality(b.yarnType)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="row g-2">
                      {b.bagKg.map((v, i) => (
                        <div key={i} className="col-6 col-md-4 col-lg-3">
                          <div className="input-group input-group-sm">
                            <span className="input-group-text" style={{ minWidth: 64 }}>
                              Bag {i + 1}
                            </span>
                            <input
                              inputMode="decimal"
                              className="form-control text-end"
                              placeholder="kg"
                              value={v}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setBatchBagWeight(bIdx, i, sanitizeKg(e.target.value))}
                              onBlur={(e) => {
                                const raw = e.target.value.trim()
                                if (raw !== '' && !isNaN(Number(raw))) {
                                  setBatchBagWeight(bIdx, i, parseFloat(raw).toFixed(2))
                                }
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div
        className="d-flex justify-content-end gap-2 border-top py-3 mt-3 position-sticky bottom-0"
        style={{ background: 'var(--background, #f8f9fa)', zIndex: 5 }}
      >
        <Link href={backHref} className="btn btn-outline-secondary">
          Cancel
        </Link>
        <button id="ys-send-btn" type="submit" className="btn btn-primary px-4" disabled={busy || !allBatchesReady || overBatches.length > 0}>
          <i className={`bi ${editing ? 'bi-check-lg' : toTwisting ? 'bi-arrow-repeat' : 'bi-send'} me-1`} />
          {busy
            ? 'Saving…'
            : toTwisting
              ? editing
                ? 'Save'
                : `Issue to Twisting${batches.length > 1 ? ` (${batches.length})` : ''}`
              : editing
                ? 'Save & send again'
                : `Send${batches.length > 1 ? ` (${batches.length})` : ''}`}
        </button>
      </div>
    </form>
  )
}
