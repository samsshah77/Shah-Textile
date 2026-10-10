'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { AlertModal, type ModalType } from '@/components/ui/AlertModal'

type ConfirmOptions = {
  title: string
  message: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

type FeedbackOptions = {
  type?: Extract<ModalType, 'success' | 'error' | 'info' | 'warning'>
  title: string
  message: ReactNode
  confirmText?: string
}

/**
 * Confirm before destructive/important actions + success/error feedback modals.
 */
export function usePayrollModals() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmOpts, setConfirmOpts] = useState<ConfirmOptions | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackOpts, setFeedbackOpts] = useState<FeedbackOptions | null>(null)

  const askConfirm = useCallback((opts: ConfirmOptions) => {
    setConfirmOpts(opts)
    setConfirmOpen(true)
  }, [])

  const showFeedback = useCallback((opts: FeedbackOptions) => {
    setFeedbackOpts(opts)
    setFeedbackOpen(true)
  }, [])

  const showSuccess = useCallback(
    (title: string, message: ReactNode) => {
      showFeedback({ type: 'success', title, message, confirmText: 'OK' })
    },
    [showFeedback]
  )

  const showError = useCallback(
    (title: string, message: ReactNode) => {
      showFeedback({ type: 'error', title, message, confirmText: 'OK' })
    },
    [showFeedback]
  )

  const closeConfirm = useCallback(() => {
    if (confirmLoading) return
    setConfirmOpen(false)
  }, [confirmLoading])

  const runConfirm = useCallback(async () => {
    if (!confirmOpts) return
    setConfirmLoading(true)
    try {
      await confirmOpts.onConfirm()
      setConfirmOpen(false)
    } finally {
      setConfirmLoading(false)
    }
  }, [confirmOpts])

  const modals = (
    <>
      <AlertModal
        isOpen={confirmOpen}
        onClose={closeConfirm}
        onConfirm={runConfirm}
        type="confirm"
        title={confirmOpts?.title || 'Confirm'}
        message={confirmOpts?.message}
        confirmText={confirmOpts?.confirmText || 'Confirm'}
        cancelText={confirmOpts?.cancelText || 'Cancel'}
        danger={confirmOpts?.danger}
        loading={confirmLoading}
      />
      <AlertModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        type={feedbackOpts?.type || 'success'}
        title={feedbackOpts?.title || 'Done'}
        message={feedbackOpts?.message}
        confirmText={feedbackOpts?.confirmText || 'OK'}
      />
    </>
  )

  return { askConfirm, showSuccess, showError, showFeedback, modals }
}
