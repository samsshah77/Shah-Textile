'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AlertModal, type ModalType } from '@/components/ui/AlertModal'

export interface AlertOptions {
  title?: string
  message: React.ReactNode
  type?: ModalType
  confirmText?: string
  cancelText?: string
}

export interface ConfirmOptions extends AlertOptions {
  onConfirm: () => void | Promise<void>
  confirmText?: string
  cancelText?: string
}

interface AlertDialogContextValue {
  showAlert: (options: AlertOptions | string) => void
  showWarning: (options: AlertOptions | string) => void
  showError: (options: AlertOptions | string) => void
  showSuccess: (options: AlertOptions | string) => void
  /** Success dialog after confirm/modal closes (avoids clobbering the confirm). */
  showSuccessSoon: (options: AlertOptions | string, delayMs?: number) => void
  showInfo: (options: AlertOptions | string) => void
  showConfirm: (options: ConfirmOptions) => void
}

const AlertDialogContext = createContext<AlertDialogContextValue | null>(null)

const DEFAULT_TITLES: Record<ModalType, string> = {
  success: 'Done',
  error: 'Not allowed',
  warning: 'Attention',
  info: 'Notice',
  confirm: 'Please confirm',
}

function normalizeOptions(options: AlertOptions | string, fallbackType: ModalType): AlertOptions {
  if (typeof options === 'string') {
    return { message: options, type: fallbackType, title: DEFAULT_TITLES[fallbackType] }
  }
  return {
    type: options.type || fallbackType,
    title: options.title || DEFAULT_TITLES[options.type || fallbackType],
    message: options.message,
    confirmText: options.confirmText,
    cancelText: options.cancelText,
  }
}

export function AlertDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [state, setState] = useState<AlertOptions>({
    title: 'Notice',
    message: '',
    type: 'info',
    confirmText: 'OK',
  })
  const confirmActionRef = useRef<(() => void | Promise<void>) | null>(null)

  const close = useCallback(() => {
    if (loading) return
    setOpen(false)
    confirmActionRef.current = null
  }, [loading])

  const openDialog = useCallback((opts: AlertOptions, onConfirm?: () => void | Promise<void>) => {
    confirmActionRef.current = onConfirm || null
    setState({
      title: opts.title || DEFAULT_TITLES[opts.type || 'info'],
      message: opts.message,
      type: opts.type || 'info',
      confirmText: opts.confirmText || (onConfirm ? 'Confirm' : 'OK'),
      cancelText: opts.cancelText || 'Cancel',
    })
    setLoading(false)
    setOpen(true)
  }, [])

  const showAlert = useCallback(
    (options: AlertOptions | string) => {
      openDialog(normalizeOptions(options, 'warning'))
    },
    [openDialog]
  )

  const showWarning = useCallback(
    (options: AlertOptions | string) => {
      openDialog(normalizeOptions(options, 'warning'))
    },
    [openDialog]
  )

  const showError = useCallback(
    (options: AlertOptions | string) => {
      openDialog(normalizeOptions(options, 'error'))
    },
    [openDialog]
  )

  const showSuccess = useCallback(
    (options: AlertOptions | string) => {
      openDialog(normalizeOptions(options, 'success'))
    },
    [openDialog]
  )

  const showSuccessSoon = useCallback(
    (options: AlertOptions | string, delayMs = 80) => {
      window.setTimeout(() => {
        openDialog(normalizeOptions(options, 'success'))
      }, delayMs)
    },
    [openDialog]
  )

  const showInfo = useCallback(
    (options: AlertOptions | string) => {
      openDialog(normalizeOptions(options, 'info'))
    },
    [openDialog]
  )

  const showConfirm = useCallback(
    (options: ConfirmOptions) => {
      openDialog(
        {
          ...normalizeOptions(options, 'confirm'),
          type: 'confirm',
          confirmText: options.confirmText || 'Confirm',
          cancelText: options.cancelText || 'Cancel',
        },
        options.onConfirm
      )
    },
    [openDialog]
  )

  const handleConfirm = useCallback(async () => {
    const action = confirmActionRef.current
    if (!action) {
      close()
      return
    }
    try {
      setLoading(true)
      await action()
      setOpen(false)
      confirmActionRef.current = null
    } catch {
      // keep dialog open on failure; caller can show another alert
    } finally {
      setLoading(false)
    }
  }, [close])

  const value = useMemo(
    () => ({
      showAlert,
      showWarning,
      showError,
      showSuccess,
      showSuccessSoon,
      showInfo,
      showConfirm,
    }),
    [showAlert, showWarning, showError, showSuccess, showSuccessSoon, showInfo, showConfirm]
  )

  return (
    <AlertDialogContext.Provider value={value}>
      {children}
      <AlertModal
        isOpen={open}
        onClose={close}
        onConfirm={confirmActionRef.current ? handleConfirm : undefined}
        type={state.type}
        title={state.title || 'Notice'}
        message={state.message}
        confirmText={state.confirmText}
        cancelText={state.cancelText}
        loading={loading}
      />
    </AlertDialogContext.Provider>
  )
}

export function useAlertDialog(): AlertDialogContextValue {
  const ctx = useContext(AlertDialogContext)
  if (!ctx) {
    throw new Error('useAlertDialog must be used within an AlertDialogProvider')
  }
  return ctx
}

/** Safe fallback when provider might be missing (e.g. tests). */
export function useAlertDialogOptional(): AlertDialogContextValue | null {
  return useContext(AlertDialogContext)
}
