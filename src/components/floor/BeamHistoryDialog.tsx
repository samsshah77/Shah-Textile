'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAlertDialog } from '@/context/AlertDialogContext'
import { getProductionToday } from '@/constants/productionCalendar'
import { longDateFromYmd } from '@/lib/longDate'
import { formatSwLotForDailyEntry } from '@/services/beamTrack'
import { editBeamStint, fetchBeamRuns, type BeamStint } from '@/lib/floor/beamStints'
import { reloadFromServer } from '@/services/production/floorSync'
import { KEY_BEAMS } from '@/services/production/floorStore'

/** Date box that saves when it loses focus / Enter (not on every key). */
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
  const { showConfirm, showError, showSuccessSoon } = useAlertDialog()
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
        if (live) setError(err instanceof Error ? err.message : 'Load nahi hua.')
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
        showError({ title: 'Save nahi hua', message: err instanceof Error ? err.message : 'Save nahi ho saka.' })
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
      `Beam ${beamNo} — Laga ki date badlein?`,
      `Loom ${r.loom} pe lagne ki date ${longDateFromYmd(r.from)} se ${longDateFromYmd(from)} ho jayegi. Production (Daily Entry) nahi badlegi — sirf beam ka hisaab (Din / Bana / Zaya) aur quality tracking.`,
      'Haan, badlo',
      () => void save({ action: 'setStart', beamNo, firstId: r.firstId!, from, oldFrom: r.from }, `Laga date ${longDateFromYmd(from)} ho gayi.`)
    )

  const changeEnd = (r: BeamStint, to: string) =>
    ask(
      `Beam ${beamNo} — Utra ki date badlein?`,
      `Loom ${r.loom} se utarne ki date ${longDateFromYmd(r.to!)} se ${longDateFromYmd(to)} ho jayegi. Production (Daily Entry) nahi badlegi — sirf beam ka hisaab aur quality tracking.`,
      'Haan, badlo',
      () => void save({ action: 'setEnd', beamNo, firstId: r.firstId!, to, oldTo: r.to! }, `Utra date ${longDateFromYmd(to)} ho gayi.`)
    )

  const remove = (r: BeamStint) =>
    ask(
      `Beam ${beamNo} ka ye run hatayein?`,
      `Loom ${r.loom} · Laga ${longDateFromYmd(r.from)} · Utra ${longDateFromYmd(r.to!)}. Sirf ghalti se bana run hatayein. Production (Daily Entry) nahi badlegi.`,
      'Haan, hatao',
      () => void save({ action: 'remove', beamNo, firstId: r.firstId!, oldTo: r.to! }, 'Run hata diya.')
    )

  const addRun = () => {
    const loom = Number(form.loom)
    if (!Number.isInteger(loom) || loom <= 0) return showError({ title: 'Loom chahiye', message: 'Loom number likhein.' })
    if (!form.from || !form.to) return showError({ title: 'Dates chahiye', message: 'Laga aur Utra dono dates bharein.' })
    if (form.to < form.from) return showError({ title: 'Date sahi nahi', message: 'Utra Laga se pehle nahi ho sakta.' })
    ask(
      `Beam ${beamNo} — purana run jodein?`,
      `Loom ${loom} · Laga ${longDateFromYmd(form.from)} · Utra ${longDateFromYmd(form.to)}${form.swLot.trim() ? ` · Sw # ${form.swLot.trim()}` : ''}. Sirf beam ki history mein judega — beam abhi jahan hai wahin rahega, Daily Entry production nahi badlegi. Quality us loom ki Daily Entry se aayegi.`,
      'Haan, jodo',
      () =>
        void save(
          { action: 'add', beamNo, loom, from: form.from, to: form.to, swLot: form.swLot.trim() || null },
          `Loom ${loom} ka run jud gaya.`
        ).then((ok) => {
          if (!ok) return
          setAdding(false)
          setForm({ loom: '', swLot: '', from: '', to: '' })
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
      <div className="card shadow-lg w-100 mt-4" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex align-items-center justify-content-between">
          <h3 className="card-title mb-0">
            <i className="bi bi-clock-history me-2" />
            Beam {beamNo} — History
          </h3>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Band karein
          </button>
        </div>
        <div className="card-body p-0">
          {error ? (
            <div className="p-3 text-danger small">{error}</div>
          ) : runs == null ? (
            <div className="p-3 small text-secondary">Load ho raha hai…</div>
          ) : runs.length === 0 ? (
            <div className="p-3 small text-secondary">Is beam ka koi loom record nahi.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered align-middle mb-0 text-center" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Loom</th>
                    <th>Sw / Wp #</th>
                    <th>Laga</th>
                    <th>Utra</th>
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
                        <td>{r.swLot ? formatSwLotForDailyEntry(r.swLot) : '—'}</td>
                        <td>
                          {edit ? (
                            <DayInput value={r.from} max={r.to || today} onCommit={(v) => changeStart(r, v)} label="Laga" />
                          ) : (
                            longDateFromYmd(r.from)
                          )}
                        </td>
                        <td>
                          {r.to == null ? (
                            <span className="badge text-bg-success">Abhi laga hai</span>
                          ) : !r.closeOffLoom ? (
                            <span className="small" title="Is din seedha agli loom pe gaya — agle run ki Laga date badlein">
                              {longDateFromYmd(r.to)} <span className="text-secondary">→ Loom {next?.loom ?? ''}</span>
                            </span>
                          ) : edit ? (
                            <DayInput value={r.to} min={r.from} max={next ? next.from : today} onCommit={(v) => changeEnd(r, v)} label="Utra" />
                          ) : (
                            longDateFromYmd(r.to)
                          )}
                        </td>
                        {canEdit && (
                          <td>
                            {r.to != null && r.firstId ? (
                              <button type="button" className="btn btn-sm btn-outline-danger py-0" onClick={() => remove(r)} title="Ghalti se bana run hatayein">
                                <i className="bi bi-trash me-1" />
                                Hatayein
                              </button>
                            ) : null}
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
                  Purana run jodein
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
                    Laga
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      max={today}
                      value={form.from}
                      onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                    />
                  </label>
                  <label className="d-flex flex-column">
                    Utra
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
                    Sirf guzri hui dates. Sw # khali chhorein to us loom ki un dinon ki saari production is beam ki ginni jayegi.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="card-footer small text-dark">
          Date box mein date badal kar Enter dabayein. Sirf beam ka hisaab (Din, Bana, Zaya) aur quality tracking badalti hai —
          Daily Entry ki production waisi hi rehti hai. Aage peeche ke runs se takrane wali date save nahi hogi.
        </div>
      </div>
    </div>
  )
}
