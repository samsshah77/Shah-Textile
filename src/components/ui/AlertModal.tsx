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
  message: string
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
  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, loading, onClose])

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
        }
      case 'error':
        return {
          icon: <AlertCircle className="size-6 text-rose-600" />,
          iconBg: 'bg-rose-50 border-rose-200 text-rose-600',
          btnBg: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
          badgeText: 'Error',
          badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
        }
      case 'warning':
        return {
          icon: <AlertTriangle className="size-6 text-amber-600" />,
          iconBg: 'bg-amber-50 border-amber-200 text-amber-600',
          btnBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
          badgeText: 'Attention',
          badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
        }
      case 'confirm':
        return {
          icon: <ShieldAlert className="size-6 text-[#0066cc]" />,
          iconBg: 'bg-blue-50 border-blue-200 text-[#0066cc]',
          btnBg: 'bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs',
          badgeText: 'Confirmation Required',
          badgeBg: 'bg-blue-50 text-[#0066cc] border-blue-200',
        }
      default:
        return {
          icon: <Info className="size-6 text-[#0066cc]" />,
          iconBg: 'bg-blue-50 border-blue-200 text-[#0066cc]',
          btnBg: 'bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs',
          badgeText: 'Notice',
          badgeBg: 'bg-blue-50 text-[#0066cc] border-blue-200',
        }
    }
  }

  const styles = getModalStyles()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-5 animate-in zoom-in-95 duration-150 relative"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        {!loading && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        )}

        {/* Modal Header & Icon */}
        <div className="flex items-start gap-4">
          <div
            className={`flex size-12 shrink-0 items-center justify-center rounded-xl border ${styles.iconBg} shadow-xs`}
          >
            {styles.icon}
          </div>

          <div className="space-y-1 pr-6">
            <span
              className={`inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${styles.badgeBg}`}
            >
              {styles.badgeText}
            </span>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight leading-snug">
              {title}
            </h3>
          </div>
        </div>

        {/* Modal Body Message */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
          {message}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          {(type === 'confirm' || (onConfirm && cancelText)) && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
            >
              {cancelText}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (onConfirm) {
                onConfirm()
              } else {
                onClose()
              }
            }}
            disabled={loading}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50 ${styles.btnBg}`}
          >
            <span>{loading ? 'Processing...' : confirmText}</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
