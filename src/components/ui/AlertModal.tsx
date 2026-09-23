'use client'

import React, { useEffect } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  ArrowRight,
  ShieldAlert,
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
}: AlertModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, loading, onClose])

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isOpen) return null

  const getModalStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: <CheckCircle2 className="size-6 text-emerald-600" />,
          iconBg: 'bg-emerald-50 border-emerald-200 text-emerald-600',
          btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20',
          badgeText: 'Success',
          badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          accent: '#198754',
        }
      case 'error':
        return {
          icon: <AlertCircle className="size-6 text-rose-600" />,
          iconBg: 'bg-rose-50 border-rose-200 text-rose-600',
          btnBg: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
          badgeText: 'Blocked',
          badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
          accent: '#dc3545',
        }
      case 'warning':
        return {
          icon: <AlertTriangle className="size-6 text-amber-600" />,
          iconBg: 'bg-amber-50 border-amber-200 text-amber-600',
          btnBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
          badgeText: 'Attention',
          badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
          accent: '#fd7e14',
        }
      case 'confirm':
        return {
          icon: <ShieldAlert className="size-6 text-[#0066cc]" />,
          iconBg: 'bg-blue-50 border-blue-200 text-[#0066cc]',
          btnBg: 'bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs',
          badgeText: 'Confirmation',
          badgeBg: 'bg-blue-50 text-[#0066cc] border-blue-200',
          accent: '#0d6efd',
        }
      default:
        return {
          icon: <Info className="size-6 text-[#0066cc]" />,
          iconBg: 'bg-blue-50 border-blue-200 text-[#0066cc]',
          btnBg: 'bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs',
          badgeText: 'Notice',
          badgeBg: 'bg-blue-50 text-[#0066cc] border-blue-200',
          accent: '#0d6efd',
        }
    }
  }

  const styles = getModalStyles()
  const isConfirm = type === 'confirm' || Boolean(onConfirm)

  return (
    <div
      className="fixed inset-0 z-[1080] flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sara-alert-title"
        style={{ borderTop: `4px solid ${styles.accent}` }}
      >
        <div className="relative p-6 pb-4 space-y-4">
          {!loading && (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}

          <div className="flex items-start gap-4">
            <div
              className={`flex size-12 shrink-0 items-center justify-center rounded-xl border ${styles.iconBg}`}
            >
              {styles.icon}
            </div>

            <div className="space-y-1.5 pr-6 min-w-0">
              <span
                className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border ${styles.badgeBg}`}
              >
                {styles.badgeText}
              </span>
              <h3
                id="sara-alert-title"
                className="text-base font-semibold text-slate-900 tracking-tight leading-snug"
              >
                {title}
              </h3>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {message}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-200">
          {isConfirm && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-sm font-medium transition-all disabled:opacity-50"
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
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-50 ${styles.btnBg}`}
          >
            <span>{loading ? 'Processing…' : confirmText}</span>
            {!loading && <ArrowRight className="size-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
