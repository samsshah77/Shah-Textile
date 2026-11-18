'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { longDateFromYmd } from '@/lib/longDate'
import { SectionLoader } from '@/components/shared/Loaders'
import { DESTINATION_LABEL, bagsText, fetchYarnSupply, fmtKg, type YarnDispatch } from '@/lib/floor/yarnSupply'

/** Yarn Supply → Print challan: one lot sent to the mill, every bag's weight, A4 portrait. */
function Challan() {
  const id = useSearchParams().get('id') || ''
  const [d, setD] = useState<YarnDispatch | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchYarnSupply()
      .then((list) => {
        if (!alive) return
        const found = [...list.dispatches, ...list.deptDispatches].find((x) => x.id === id)
        if (found) setD(found)
        else setError('This entry was not found (it may have been deleted).')
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Could not load.'))
    return () => {
      alive = false
    }
  }, [id])

  if (error) {
    return (
      <div className="alert alert-warning mt-3">
        {error} <Link href="/yarn-supply?tab=sent">Back to Yarn Supply</Link>
      </div>
    )
  }
  if (!d) return <SectionLoader />

  const status = d.destination !== 'MILL' ? `Sent to ${DESTINATION_LABEL[d.destination]}` : d.status === 'VERIFIED' ? 'Received & verified by Sara Textile' : d.status === 'ISSUE' ? 'Issue reported by Sara Textile' : 'Sent — waiting for Sara Textile check'
  const cell: React.CSSProperties = { border: '1px solid #334155', padding: '4px 8px' }

  return (
    <>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } body { font-size: 10.5pt !important; } }`}</style>
      <div className="d-flex gap-2 my-3 d-print-none">
        <Link href="/yarn-supply?tab=sent" className="btn btn-sm btn-outline-secondary">
          <i className="bi bi-arrow-left" /> Back
        </Link>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => window.print()}>
          <i className="bi bi-printer me-1" /> Print
        </button>
      </div>

      <div className="bg-white border rounded p-4 mx-auto" style={{ maxWidth: 800, color: '#0f172a' }}>
        <div className="d-flex justify-content-between align-items-start border-bottom border-dark pb-2 mb-3">
          <div>
            <div className="fs-4 fw-bold">Yarn Delivery Challan</div>
            <div className="small">To: {d.destination === 'MILL' ? 'Sara Textile' : `${DESTINATION_LABEL[d.destination]} (Fazal Umer)`}</div>
            {d.createdBy && <div className="small">From: {d.createdBy}</div>}
          </div>
          <div className="text-end small">
            <div>
              <b>Challan / DC #:</b> {d.challanNo || '—'}
            </div>
            <div>
              <b>Date:</b> {longDateFromYmd(d.sentDate)}
            </div>
            <div>
              <b>Lot #:</b> {d.lotNo || '—'}
            </div>
            <div>
              <b>Vehicle #:</b> {d.vehicleNo || '—'}
            </div>
          </div>
        </div>

        <div className="mb-2">
          <b>Yarn:</b> <span className="fs-5 fw-semibold">{d.yarnType}</span>
        </div>

        <table className="w-100 mb-3" style={{ borderCollapse: 'collapse', fontSize: '0.95em' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ ...cell, width: 80 }}>Bag #</th>
              <th style={{ ...cell, textAlign: 'right' }}>Weight (kg)</th>
              <th style={{ ...cell, width: 80 }}>Bag #</th>
              <th style={{ ...cell, textAlign: 'right' }}>Weight (kg)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.ceil(d.bagKg.length / 2) }, (_, r) => (
              <tr key={r}>
                {[r * 2, r * 2 + 1].map((i) =>
                  i < d.bagKg.length ? (
                    <FragmentCells key={i} n={i + 1} kg={d.bagKg[i]} cell={cell} />
                  ) : (
                    <FragmentCells key={i} cell={cell} />
                  )
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
              <td style={cell} colSpan={2}>
                Total: {bagsText(d.bags)}
              </td>
              <td style={{ ...cell, textAlign: 'right' }} colSpan={2}>
                {fmtKg(d.weightKg)}
              </td>
            </tr>
          </tfoot>
        </table>

        {d.remarks && (
          <div className="mb-2">
            <b>Remarks:</b> {d.remarks}
          </div>
        )}
        <div className="small mb-4">
          <b>Status:</b> {status}
          {d.status === 'VERIFIED' && d.receivedKg != null && (
            <>
              {' '}
              — received {d.receivedDate ? longDateFromYmd(d.receivedDate) : ''}: {bagsText(d.receivedBags)}, {fmtKg(d.receivedKg)}
            </>
          )}
        </div>

        <div className="d-flex justify-content-between pt-5 small">
          <div className="text-center" style={{ width: 220, borderTop: '1px solid #0f172a', paddingTop: 4 }}>
            Sent by (signature)
          </div>
          <div className="text-center" style={{ width: 220, borderTop: '1px solid #0f172a', paddingTop: 4 }}>
            Received by (signature)
          </div>
        </div>
      </div>
    </>
  )
}

function FragmentCells({ n, kg, cell }: { n?: number; kg?: number; cell: React.CSSProperties }) {
  return (
    <>
      <td style={{ ...cell, textAlign: 'center' }}>{n ?? ''}</td>
      <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{kg != null ? kg.toFixed(2) : ''}</td>
    </>
  )
}

export default function YarnChallanPage() {
  return (
    <Suspense fallback={<SectionLoader />}>
      <Challan />
    </Suspense>
  )
}
