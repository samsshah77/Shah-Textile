'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { YarnSendForm } from '@/components/floor/YarnSendForm'
import { SectionLoader } from '@/components/shared/Loaders'

/** Yarn Supply → Send yarn (or ?id=… to correct an entry). */
function SendYarn() {
  const id = useSearchParams().get('id')
  return <YarnSendForm key={id || 'new'} editId={id} />
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
