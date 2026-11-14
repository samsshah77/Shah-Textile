'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { YarnSendForm } from '@/components/floor/YarnSendForm'
import { SectionLoader } from '@/components/shared/Loaders'

/** Yarn Supply → Send yarn (?to=SIZING|WARPING, ?request=… against a mill request, ?id=… to correct an entry). */
function SendYarn() {
  const params = useSearchParams()
  const id = params.get('id')
  const request = params.get('request')
  const to = params.get('to')
  return <YarnSendForm key={id || request || to || 'new'} editId={id} requestId={request} to={to} />
}

export default function YarnSendPage() {
  return (
    <div className="py-3">
      <Suspense fallback={<SectionLoader />}>
        <SendYarn />
      </Suspense>
    </div>
  )
}
