'use client'

import { useEffect, useState } from 'react'

type PrintBrandHeaderProps = {
  /** Sheet / page name shown under company name (e.g. Looms) */
  sheetTitle?: string
}

/**
 * Print/PDF only brand strip: logo + company name + sheet + date/time.
 * Screen-hidden. Turn off browser “Headers and footers” in the print dialog
 * so only this header appears (not the URL/filename chrome).
 */
export function PrintBrandHeader({ sheetTitle }: PrintBrandHeaderProps) {
  const [printedAt, setPrintedAt] = useState('')
  const [activeSheet, setActiveSheet] = useState(sheetTitle || '')

  useEffect(() => {
    setActiveSheet(sheetTitle || '')
  }, [sheetTitle])

  useEffect(() => {
    const stamp = () => {
      setPrintedAt(
        new Date().toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      )
      const fromBtn = document.body?.dataset?.printSheet
      if (fromBtn) setActiveSheet(fromBtn)
    }
    stamp()
    window.addEventListener('beforeprint', stamp)
    return () => window.removeEventListener('beforeprint', stamp)
  }, [])

  return (
    <div className="sara-print-doc-header" aria-hidden="true">
      <div className="sara-print-doc-header__left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/saratextile.png"
          alt=""
          className="sara-print-doc-header__logo"
          width={40}
          height={40}
        />
        <div>
          <div className="sara-print-doc-header__company">SARA TEXTILES</div>
          <div className="sara-print-doc-header__sheet">
            {activeSheet || sheetTitle || 'Mill statement'}
          </div>
        </div>
      </div>
      <div className="sara-print-doc-header__right">
        <div className="sara-print-doc-header__meta-label">Printed</div>
        <div className="sara-print-doc-header__meta-value">{printedAt || '—'}</div>
      </div>
    </div>
  )
}
