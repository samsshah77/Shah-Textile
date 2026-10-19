'use client'

import { useEffect, useState } from 'react'

type Problem = { id: number; status: number; message: string }

/**
 * Shows a red banner whenever the server refuses a floor save (data-safety guard,
 * approval lock, or view-only access), so nobody walks away thinking it was saved.
 */
export function FloorSaveAlerts({ eventName = 'floor:save-problem' }: { eventName?: string } = {}) {
  const [problems, setProblems] = useState<Problem[]>([])

  useEffect(() => {
    let seq = 0
    const onProblem = (ev: Event) => {
      const detail = (ev as CustomEvent<{ status: number; message: string }>).detail
      if (!detail?.message) return
      setProblems((prev) => {
        if (prev.some((p) => p.message === detail.message)) return prev
        return [...prev.slice(-2), { id: ++seq, status: detail.status, message: detail.message }]
      })
    }
    window.addEventListener(eventName, onProblem)
    return () => window.removeEventListener(eventName, onProblem)
  }, [eventName])

  if (problems.length === 0) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      {problems.map((p) => (
        <div
          key={p.id}
          style={{
            background: '#fdecea',
            border: '1px solid #f5c2c0',
            color: '#7a1c17',
            borderRadius: 8,
            padding: '10px 14px',
            boxShadow: '0 4px 14px rgba(0,0,0,.12)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            fontSize: 14,
          }}
        >
          <strong style={{ whiteSpace: 'nowrap' }}>{p.status === 200 ? 'Note' : 'Not saved'}</strong>
          <span style={{ flex: 1 }}>{p.message}</span>
          <button
            type="button"
            onClick={() => setProblems((prev) => prev.filter((x) => x.id !== p.id))}
            style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 16 }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
