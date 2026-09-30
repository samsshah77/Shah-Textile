'use client'

import React, { useEffect } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  HelpCircle,
} from 'lucide-react'

export type ModalType = 'success' | 'error' | 'warning' | 'info' | 'confirm'

export interface AlertModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm?: () => void
  type?: ModalType
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  loading?: boolean
  /** Force danger (red) styling — also auto for Delete confirms. */
  danger?: boolean
}

type ModalSkin = {
  Icon: typeof Info
  accent: string
  accentSoft: string
  primaryBtnStyle: React.CSSProperties
  primaryBtnHover: string
  ring: string
}

function looksLikeDelete(title: string, confirmText?: string): boolean {
  return /delete/i.test(title) || /delete/i.test(confirmText || '')
}

function skinFor(type: ModalType, danger: boolean): ModalSkin {
  if (danger || type === 'error') {
    return {
      Icon: type === 'confirm' ? HelpCircle : AlertCircle,
      accent: '#dc3545',
      accentSoft: 'rgba(220, 53, 69, 0.12)',
      primaryBtnStyle: { backgroundColor: '#dc3545', borderColor: '#dc3545', color: '#fff' },
      primaryBtnHover: '#bb2d3b',
      ring: 'ring-rose-600/10',
    }
  }
  switch (type) {
    case 'success':
      return {
        Icon: CheckCircle2,
        accent: '#198754',
        accentSoft: 'rgba(25, 135, 84, 0.12)',
        primaryBtnStyle: { backgroundColor: '#198754', borderColor: '#198754', color: '#fff' },
        primaryBtnHover: '#157347',
        ring: 'ring-emerald-600/10',
      }
    case 'warning':
      return {
        Icon: AlertTriangle,
        accent: '#fd7e14',
        accentSoft: 'rgba(253, 126, 20, 0.14)',
        primaryBtnStyle: { backgroundColor: '#fd7e14', borderColor: '#fd7e14', color: '#fff' },
        primaryBtnHover: '#e96b02',
        ring: 'ring-amber-600/10',
      }
    case 'confirm':
      return {
        Icon: HelpCircle,
        accent: '#0d6efd',
        accentSoft: 'rgba(13, 110, 253, 0.12)',
        primaryBtnStyle: { backgroundColor: '#0d6efd', borderColor: '#0d6efd', color: '#fff' },
        primaryBtnHover: '#0b5ed7',
        ring: 'ring-blue-600/10',
      }
    default:
      return {
        Icon: Info,
        accent: '#0d6efd',
        accentSoft: 'rgba(13, 110, 253, 0.12)',
        primaryBtnStyle: { backgroundColor: '#0d6efd', borderColor: '#0d6efd', color: '#fff' },
        primaryBtnHover: '#0b5ed7',
        ring: 'ring-blue-600/10',
      }
  }
}

export function AlertModal({
  isOpen,
  onClose,
  onConfirm,
  type = 'info',
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  loading = false,
  danger = false,
}: AlertModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) onClose()
      if (e.key === 'Enter' && isOpen && !loading && type !== 'confirm') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, loading, onClose, type])

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isOpen) return null

  const isDanger = danger || looksLikeDelete(title, confirmText)
  const skin = skinFor(type, isDanger)
  const Icon = skin.Icon
  const isConfirm = type === 'confirm' || Boolean(onConfirm)

  return (
    <div
      className="fixed inset-0 z-[1080] flex items-center justify-center p-4"
      role="presentation"
      style={{ background: 'rgba(15, 23, 42, 0.48)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div
        className={`w-full max-w-[380px] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5 ${skin.ring}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sara-alert-title"
        aria-describedby="sara-alert-message"
      >
        <div className="relative px-5 pt-5 pb-4">
          {!loading && (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          )}

          <div className="flex gap-3.5 pr-6">
            <div
              className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: skin.accentSoft }}
            >
              <Icon className="size-5" strokeWidth={2} style={{ color: skin.accent }} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <h3
                id="sara-alert-title"
                className="text-[15px] font-semibold leading-snug tracking-tight"
                style={{ color: isDanger ? skin.accent : '#0f172a' }}
              >
                {title}
              </h3>
              <div
                id="sara-alert-message"
                className="text-[13.5px] leading-relaxed text-slate-600 whitespace-pre-line"
              >
                {message}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
          {isConfirm && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (onConfirm) onConfirm()
              else onClose()
            }}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50"
            style={skin.primaryBtnStyle}
            onMouseEnter={(e) => {
              if (loading) return
              e.currentTarget.style.backgroundColor = skin.primaryBtnHover
              e.currentTarget.style.borderColor = skin.primaryBtnHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = String(skin.primaryBtnStyle.backgroundColor || '')
              e.currentTarget.style.borderColor = String(skin.primaryBtnStyle.borderColor || '')
            }}
          >
            {loading ? 'Processing…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
