'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { YarnSendForm } from '@/components/floor/YarnSendForm'
import { SectionLoader } from '@/components/shared/Loaders'

/** Yarn Supply → Send yarn (?request=… against a mill request, ?id=… to correct an entry). */
function SendYarn() {
  const params = useSearchParams()
  const id = params.get('id')
  const request = params.get('request')
  return <YarnSendForm key={id || request || 'new'} editId={id} requestId={request} />
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
