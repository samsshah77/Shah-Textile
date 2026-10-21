'use client'

import { Paperclip } from 'lucide-react'

/** Small "📎 n" link to a bill's pictures (opens the first; the bill editor shows all). */
export function BillPhotosLink({ urls }: { urls?: string[] }) {
  if (!urls?.length) return null
  return (
    <a
      href={urls[0]}
      target="_blank"
      rel="noreferrer"
      title={`Bill ki ${urls.length} tasveer${urls.length > 1 ? 'ein' : ''} — pehli kholein (sab bill edit mein)`}
      className="ml-1 inline-flex items-center gap-0.5 rounded bg-sky-50 px-1 text-[10px] font-bold text-sky-700 hover:bg-sky-100 print:hidden"
    >
      <Paperclip className="size-3" />
      {urls.length}
    </a>
  )
}
