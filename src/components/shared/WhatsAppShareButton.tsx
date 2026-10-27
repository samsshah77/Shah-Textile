'use client'

import { useState } from 'react'
import { WhatsAppShareModal } from './WhatsAppShareModal'

export interface WhatsAppShareButtonProps {
  documentTitle: string
  /** Built when the button is pressed, so the numbers are current. */
  message: string | (() => string)
  onDownloadPdf?: () => void
  className?: string
  /** Automatic PDF document attachment builder for server-side WhatsApp transmission */
  getPdfAttachment?: () => Promise<{ base64: string; filename: string } | null> | { base64: string; filename: string } | null
}

/** The one WhatsApp button used on every page — same look as the other toolbar buttons. */
export function WhatsAppShareButton({
  documentTitle,
  message,
  onDownloadPdf,
  className = '',
  getPdfAttachment,
}: WhatsAppShareButtonProps) {
  const [text, setText] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className={`btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1.5 d-print-none ${className}`}
        onClick={() => setText(typeof message === 'function' ? message() : message)}
        title="WhatsApp ya Email par bhejein"
      >
        <i className="bi bi-whatsapp" />
        <span>WhatsApp / Email</span>
      </button>
      <WhatsAppShareModal
        isOpen={text !== null}
        onClose={() => setText(null)}
        documentTitle={documentTitle}
        defaultMessage={text || ''}
        onDownloadPdf={onDownloadPdf}
        getPdfAttachment={getPdfAttachment}
      />
    </>
  )
}

