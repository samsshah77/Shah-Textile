'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { getProductionToday } from '@/constants/productionCalendar'
import { longDateFromYmd } from '@/lib/longDate'
import { formatSwLotForDailyEntry } from '@/services/beamTrack'
import { editBeamStint, fetchBeamRuns, fillRunLots, planRunLots, type BeamStint } from '@/lib/floor/beamStints'
import { reloadFromServer } from '@/services/production/floorSync'
import { KEY_BEAMS, KEY_SHEET } from '@/services/production/floorStore'
import { SectionLoader } from '@/components/shared/Loaders'

/** Date box that saves when it loses focus / Enter (not on every key). */
/** Text box that saves when you leave it (or press Enter) — only if the value changed. */
function TextCommit({
  value,
  onCommit,
  label,
  width,
  numeric,
}: {
  value: string
  onCommit: (v: string) => void
  label: string
  width: number
  numeric?: boolean
}) {
  const commit = (el: HTMLInputElement) => {
    const v = el.value.trim()
    if (v !== value) onCommit(v)
  }
  return (
    <input
      key={value}
      type="text"
      inputMode={numeric ? 'decimal' : undefined}
      aria-label={label}
      className="form-control form-control-sm"
      style={{ width, display: 'inline-block' }}
      defaultValue={value}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

function DayInput({ value, min, max, onCommit, label }: { value: string; min?: string; max?: string; onCommit: (v: string) => void; label: string }) {
  return (
    <input
      key={value}
      type="date"
      className="form-control form-control-sm"
      style={{ width: 'auto', minWidth: 140 }}
      defaultValue={value}
      min={min}
      max={max}
      aria-label={label}
      onBlur={(e) => {
        const v = e.currentTarget.value
        if (v && v !== value) onCommit(v)
        else e.currentTarget.value = value
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

/**
 * Beam History — every time this beam sat on a loom (Laga → Utra). The dates can be put right
 * here and a run made by mistake removed. Only the beam's history changes: Daily Entry
 * production stays as it is; the beam's Din / Bana / Zaya and quality tracking follow the
 * new dates.
 */
export function BeamHistoryDialog({
  beamNo,
  canEdit,
  onClose,
  onChanged,
}: {
  beamNo: string
  canEdit: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const { showConfirm, showError, showSuccessSoon, showInfo } = useAlertDialog()
  const [runs, setRuns] = useState<BeamStint[] | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const today = getProductionToday()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ loom: '', swLot: '', from: '', to: '' })

  useEffect(() => {
    let live = true
    fetchBeamRuns(beamNo)
      .then((list) => {
        if (live) {
          setRuns(list)
          setError('')
        }
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : 'Could not load.')
      })
    return () => {
      live = false
    }
  }, [beamNo, reload])

  const save = useCallback(
    async (body: Parameters<typeof editBeamStint>[0], done: string): Promise<boolean> => {
      try {
        await editBeamStint(body)
        setReload((n) => n + 1)
        // The beam's own mount date may have changed (run on a loom now).
        await reloadFromServer(KEY_BEAMS)
        onChanged?.()
        showSuccessSoon({ title: 'Saved', message: done })
        return true
      } catch (err) {
        showError({ title: 'Not saved', message: err instanceof Error ? err.message : 'Could not save.' })
        setReload((n) => n + 1)
        return false
      }
    },
    [onChanged, showError, showSuccessSoon]
  )

  const ask = (title: string, message: string, confirmText: string, run: () => void) =>
    showConfirm({ title, message, type: 'confirm', confirmText, cancelText: 'Cancel', onConfirm: run })

  const changeStart = (r: BeamStint, from: string) =>
    ask(
      `Beam ${beamNo} — change the Mounted date?`,
      `The date it was mounted on Loom ${r.loom} changes from ${longDateFromYmd(r.from)} to ${longDateFromYmd(from)}. Production (Daily Entry) does not change — only the beam figures (Days / Woven / Wastage) and quality tracking.`,
      'Yes, change',
      () => void save({ action: 'setStart', beamNo, firstId: r.firstId!, from, oldFrom: r.from }, `Mounted date set to ${longDateFromYmd(from)}.`)
    )

  const changeEnd = (r: BeamStint, to: string) =>
    ask(
      `Beam ${beamNo} — change the Removed date?`,
      `The date it came off Loom ${r.loom} changes from ${longDateFromYmd(r.to!)} to ${longDateFromYmd(to)}. Production (Daily Entry) does not change — only the beam figures and quality tracking.`,
      'Yes, change',
      () => void save({ action: 'setEnd', beamNo, firstId: r.firstId!, to, oldTo: r.to! }, `Removed date set to ${longDateFromYmd(to)}.`)
    )

  /** An ended run's own Sw # / Warp / Length — the beam as it is now does not change. */
  const changeDetail = (r: BeamStint, field: 'swLot' | 'warp' | 'length', v: string) => {
    if (field === 'length' && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      showError({ title: 'Invalid length', message: 'Enter the length as a number.' })
      setReload((n) => n + 1)
      return
    }
    void save(
      { action: 'details', beamNo, firstId: r.firstId!, [field]: field === 'length' ? Number(v) : v || null },
      `${field === 'swLot' ? 'Sw #' : field === 'warp' ? 'Warp' : 'Length'} changed for the Loom ${r.loom} run (the current beam is unchanged).`
    )
  }

  const remove = (r: BeamStint) =>
    ask(
      `Remove this run of beam ${beamNo}?`,
      `Loom ${r.loom} · Mounted ${longDateFromYmd(r.from)} · Removed ${longDateFromYmd(r.to!)}. Only remove a run created by mistake. Production (Daily Entry) does not change.`,
      'Yes, remove',
      () => void save({ action: 'remove', beamNo, firstId: r.firstId!, oldTo: r.to! }, 'Run hata diya.')
    )

  const shortDays = (days: string[]) =>
    days.length <= 6 ? days.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7)).join(', ') : `${days.length} days`

  /** Daily Entry Sw # for a run: show what would change, then write the empty cells only. */
  const lotsToSheet = async (r: BeamStint) => {
    try {
      const { loom, from, to, plan } = await planRunLots(beamNo, r.firstId!)
      const lines = [
        `Loom ${loom} · ${longDateFromYmd(from)} → ${longDateFromYmd(to)} · Sw #: ${plan.lot}`,
        plan.empty.length ? `✔ ${plan.empty.length} days have an empty Sw # — "${plan.lot}" will be written there (${shortDays(plan.empty)}).` : '',
        plan.same.length ? `• ${plan.same.length} days already have this Sw #.` : '',
        plan.other.length
          ? `• ${plan.other.length} days have a different Sw # — those stay unchanged (${plan.other
              .slice(0, 4)
              .map((o) => `${o.date.slice(8, 10)}/${o.date.slice(5, 7)}: ${o.lot}`)
              .join(', ')}${plan.other.length > 4 ? ' …' : ''}). If they are wrong, change them in Daily Entry.`
          : '',
        plan.noRow.length ? `• ${plan.noRow.length} days have no Daily Entry (${shortDays(plan.noRow)}).` : '',
      ].filter(Boolean)
      if (!plan.empty.length) {
        showInfo({ title: 'Nothing to write', message: lines.join('\n') })
        return
      }
      ask(
        'Write the Sw # into Daily Entry?',
        `${lines.join('\n')}\n\nOnly the Sw # column changes — meters and quality stay the same.`,
        'Yes, write',
        () =>
          void (async () => {
            try {
              const res = await fillRunLots(beamNo, r.firstId!)
              // Fresh copies of the days written, so an open Daily Entry shows the Sw # (and no save conflict).
              for (const d of res.filled) await reloadFromServer(`${KEY_SHEET}_${d}`).catch(() => false)
              onChanged?.()
              setReload((n) => n + 1)
              if (res.failed.length) {
                showError({
                  title: `${res.filled.length} days written, ${res.failed.length} days not`,
                  message: res.failed.map((f) => `${f.date}: ${f.reason}`).join('\n'),
                })
              } else {
                showSuccessSoon({ title: 'Saved', message: `"${res.lot}" written into Daily Entry for ${res.filled.length} days.` })
              }
            } catch (err) {
              showError({ title: 'Not saved', message: err instanceof Error ? err.message : 'Could not save.' })
            }
          })()
      )
    } catch (err) {
      showError({ title: 'Could not load', message: err instanceof Error ? err.message : 'Could not load.' })
    }
  }

  const addRun = () => {
    const loom = Number(form.loom)
    if (!Number.isInteger(loom) || loom <= 0) return showError({ title: 'Loom required', message: 'Enter the loom number.' })
    if (!form.from || !form.to) return showError({ title: 'Dates required', message: 'Enter both the Mounted and Removed dates.' })
    if (form.to < form.from) return showError({ title: 'Invalid date', message: 'Removed date cannot be before the Mounted date.' })
    ask(
      `Beam ${beamNo} — add a past run?`,
      `Loom ${loom} · Mounted ${longDateFromYmd(form.from)} · Removed ${longDateFromYmd(form.to)}${form.swLot.trim() ? ` · Sw # ${form.swLot.trim()}` : ''}. This is added to the beam history only — the beam stays where it is now and Daily Entry production does not change. The quality comes from that loom's Daily Entry.`,
      'Yes, add',
      () =>
        void save(
          { action: 'add', beamNo, loom, from: form.from, to: form.to, swLot: form.swLot.trim() || null },
          `Loom ${loom} run added.`
        ).then(async (ok) => {
          if (!ok) return
          setAdding(false)
          setForm({ loom: '', swLot: '', from: '', to: '' })
          // Then offer to write its Sw # into Daily Entry (empty cells only).
          const added = (await fetchBeamRuns(beamNo).catch(() => [])).find(
            (x) => x.loom === loom && x.from === form.from && x.to === form.to
          )
          if (added?.firstId) window.setTimeout(() => void lotsToSheet(added), 1200)
        })
    )
  }

  return (
    <div
      className="sara-allow-readonly-zone position-fixed top-0 start-0 w-100 h-100 d-flex align-items-start justify-content-center p-3"
      style={{ background: 'rgba(15,23,42,0.55)', zIndex: 1060, overflowY: 'auto' }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="card shadow-lg w-100 mt-4" style={{ maxWidth: 1040 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex align-items-center justify-content-between">
          <h3 className="card-title mb-0">
            <i className="bi bi-clock-history me-2" />
            Beam {beamNo} — History
          </h3>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="card-body p-0">
          {error ? (
            <div className="p-3 text-danger small">{error}</div>
          ) : runs == null ? (
            <SectionLoader compact />
          ) : runs.length === 0 ? (
            <div className="p-3 small text-secondary">No loom records for this beam.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered align-middle mb-0 text-center" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Loom</th>
                    <th>Sw / Wp #</th>
                    <th>Warp</th>
                    <th>Length</th>
                    <th>Mounted</th>
                    <th>Removed</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => {
                    const next = runs[i + 1]
                    const edit = canEdit && Boolean(r.firstId)
                    return (
                      <tr key={`${r.firstId}-${r.from}`}>
                        <td>{i + 1}</td>
                        <td className="fw-semibold">{r.loom}</td>
                        {edit && r.to != null ? (
                          <>
                            <td>
                              <TextCommit value={r.swLot || ''} width={90} label="Sw #" onCommit={(v) => changeDetail(r, 'swLot', v)} />
                            </td>
                            <td>
                              <TextCommit value={r.warp || ''} width={150} label="Warp" onCommit={(v) => changeDetail(r, 'warp', v)} />
                            </td>
                            <td>
                              <TextCommit
                                value={r.length ? String(r.length) : ''}
                                width={80}
                                numeric
                                label="Length"
                                onCommit={(v) => changeDetail(r, 'length', v)}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td title={r.to == null && edit ? 'Current run — change it in the Beams table' : undefined}>
                              {r.swLot ? formatSwLotForDailyEntry(r.swLot) : '—'}
                            </td>
                            <td className="text-start">{r.warp || '—'}</td>
                            <td>{r.length ? r.length.toLocaleString('en-US') : '—'}</td>
                          </>
                        )}
                        <td>
                          {edit ? (
                            <DayInput value={r.from} max={r.to || today} onCommit={(v) => changeStart(r, v)} label="Mounted" />
                          ) : (
                            longDateFromYmd(r.from)
                          )}
                        </td>
                        <td>
                          {r.to == null ? (
                            <span className="badge text-bg-success">On loom now</span>
                          ) : !r.closeOffLoom ? (
                            <span className="small" title="Went straight to the next loom this day — change the next run's Mounted date">
                              {longDateFromYmd(r.to)} <span className="text-secondary">→ Loom {next?.loom ?? ''}</span>
                            </span>
                          ) : edit ? (
                            <DayInput value={r.to} min={r.from} max={next ? next.from : today} onCommit={(v) => changeEnd(r, v)} label="Removed" />
                          ) : (
                            longDateFromYmd(r.to)
                          )}
                        </td>
                        {canEdit && (
                          <td>
                            <div className="d-flex gap-1 justify-content-center flex-wrap">
                              {r.firstId ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary py-0"
                                  onClick={() => void lotsToSheet(r)}
                                  title="Write this run's Sw # into the empty Sw # cells of Daily Entry"
                                >
                                  <i className="bi bi-journal-arrow-down me-1" />
                                  Daily Entry Sw #
                                </button>
                              ) : null}
                              {r.to != null && r.firstId ? (
                                <button type="button" className="btn btn-sm btn-outline-danger py-0" onClick={() => remove(r)} title="Remove a run created by mistake">
                                  <i className="bi bi-trash me-1" />
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {canEdit && runs != null && !error && (
            <div className="p-2 border-top">
              {!adding ? (
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setAdding(true)}>
                  <i className="bi bi-plus-lg me-1" />
                  Add past run
                </button>
              ) : (
                <div className="d-flex flex-wrap align-items-end gap-2 small">
                  <label className="d-flex flex-column">
                    Loom
                    <input
                      type="number"
                      min={1}
                      className="form-control form-control-sm"
                      style={{ width: 90 }}
                      value={form.loom}
                      onChange={(e) => setForm((f) => ({ ...f, loom: e.target.value }))}
                    />
                  </label>
                  <label className="d-flex flex-column">
                    Sw # (optional)
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ width: 110 }}
                      value={form.swLot}
                      onChange={(e) => setForm((f) => ({ ...f, swLot: e.target.value }))}
                    />
                  </label>
                  <label className="d-flex flex-column">
                    Mounted
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      max={today}
                      value={form.from}
                      onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                    />
                  </label>
                  <label className="d-flex flex-column">
                    Removed
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      min={form.from || undefined}
                      max={today}
                      value={form.to}
                      onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
                    />
                  </label>
                  <button type="button" className="btn btn-sm btn-primary" onClick={addRun}>
                    Save
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setAdding(false)}>
                    Cancel
                  </button>
                  <div className="w-100 text-secondary">
                    Past dates only. If Sw # is left empty, all production on that loom on those days counts for this beam.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="card-footer small text-dark">
          Change a date and press Enter. Only the beam figures (Days, Woven, Wastage) and quality tracking change —
          Daily Entry production stays the same. A date that overlaps the run before or after is not saved.
          <br />
          Change an ended run’s Sw # / Warp / Length here — it changes only that run; the beam running now stays the same.
          Change the current run’s details in the Beams table.
        </div>
      </div>
    </div>
  )
}
