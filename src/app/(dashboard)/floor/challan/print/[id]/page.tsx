'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DeliveryChallan } from '@/types/challan'
import { challanService } from '@/services/challanService'
import { ChallanPrintPreview } from '@/components/challan/ChallanPrintPreview'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function ChallanPrintPage() {
  const params = useParams()
  const [challan, setChallan] = useState<DeliveryChallan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!params?.id) return
      const id = Array.isArray(params.id) ? params.id[0] : params.id
      const data = await challanService.getChallanById(id)
      setChallan(data)
      setLoading(false)
    }
    load()
  }, [params])

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!challan) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-4">
        <h2 className="text-lg font-bold text-foreground">Delivery Challan Not Found</h2>
        <p className="text-xs text-muted-foreground">The requested challan identifier could not be retrieved from the records.</p>
        <Link
          href="/floor/challan"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          <ArrowLeft className="size-4" />
          <span>Return to Challans</span>
        </Link>
      </div>
    )
  }

  return <ChallanPrintPreview challan={challan} />
}
