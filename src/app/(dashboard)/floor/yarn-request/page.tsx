'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { YarnRequestForm } from '@/components/floor/YarnRequestsPanel'
import { SectionLoader } from '@/components/shared/Loaders'
import { useAuth } from '@/context/AuthContext'
import { useAlertDialog } from '@/context/AlertDialogContext'
import {
  bagsText,
  fetchYarnSupply,
  fmtKg,
  yarnRequestShareText,
  type YarnSupplyList,
} from '@/lib/floor/yarnSupply'

function YarnRequestContent() {
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get('id')
  const back = params.get('back') || '/floor/production?tab=yarn'
  const { showConfirm, showSuccessSoon } = useAlertDialog()
  const [data, setData] = useState<YarnSupplyList | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchYarnSupply()
      .then((d) => {
        setData(d)
        setLoadError(null)
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Could not load.'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const goBack = () => router.push(back)

  if (loadError) {
    return (
      <div className="py-3">
        <div className="alert alert-danger">{loadError}</div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={goBack}>
          <i className="bi bi-arrow-left me-1" /> Back
        </button>
      </div>
    )
  }

  if (!data) return <SectionLoader />

  const editing = id ? data.requests.find((r) => r.id === id) ?? null : null
  if (id && !editing) {
    return (
      <div className="py-3">
        <div className="alert alert-warning">This yarn request was not found.</div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={goBack}>
          <i className="bi bi-arrow-left me-1" /> Back
        </button>
      </div>
    )
  }

  return (
    <YarnRequestForm
      key={editing?.id || 'new'}
      q={editing}
      store={data.store}
      onBack={goBack}
      onSaved={(savedItems, created) => {
        if (created && savedItems.length > 0) {
          const summary = savedItems
            .map((it) => `${it.yarnType} (${it.bags ? bagsText(it.bags) : fmtKg(it.kg)})`)
            .join(', ')
          goBack()
          showConfirm({
            title: 'Request saved',
            message: `${summary}. The supplier sees it on Yarn Supply. Send it on WhatsApp too?`,
            type: 'confirm',
            confirmText: 'WhatsApp',
            cancelText: 'Not now',
            onConfirm: () => {
              const text = savedItems.map((it) => yarnRequestShareText(it)).join('\n\n')
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
            },
          })
        } else {
          showSuccessSoon({ title: 'Saved', message: 'Request changed.' })
          goBack()
        }
      }}
    />
  )
}

export default function YarnRequestPage() {
  const { canEdit } = useAuth()
  if (!canEdit('prod_yarn')) {
    return <div className="alert alert-warning mt-3">You do not have access to request yarn.</div>
  }
  return (
    <div className="py-3">
      <Suspense fallback={<SectionLoader />}>
        <YarnRequestContent />
      </Suspense>
    </div>
  )
}

