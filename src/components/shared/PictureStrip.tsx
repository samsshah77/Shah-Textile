'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { uploadImageFile, type UploadKind } from '@/lib/uploadImage'

/**
 * A row of picture thumbnails with "add" and "remove". Pictures are made smaller in the
 * browser and uploaded right away; the caller saves the list of links with its record.
 */
export function PictureStrip({
  urls,
  onChange,
  kind,
  editable,
  max = 12,
  label = 'Tasveer lagayein',
}: {
  urls: string[]
  onChange: (next: string[]) => void
  kind: UploadKind
  editable: boolean
  max?: number
  label?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    const next = [...urls]
    try {
      for (const f of Array.from(files)) {
        if (next.length >= max) {
          setError(`Zyada se zyada ${max} tasveerein.`)
          break
        }
        next.push(await uploadImageFile(f, kind))
        onChange([...next])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tasveer upload nahi hui.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {urls.map((u) => (
          <div key={u} className="relative">
            <a href={u} target="_blank" rel="noreferrer" title="Bari tasveer dekhein">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="size-16 rounded-md border border-slate-300 object-cover" />
            </a>
            {editable && (
              <button
                type="button"
                onClick={() => onChange(urls.filter((x) => x !== u))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-0.5 text-white shadow cursor-pointer"
                aria-label="Tasveer hatayein"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
        {editable && urls.length < max && (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-slate-400 text-[10px] text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            {busy ? 'Upload…' : label}
          </button>
        )}
        {!editable && urls.length === 0 && <span className="text-[11px] text-slate-400">Koi tasveer nahi</span>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => void add(e.target.files)} />
      {error && <div className="text-[11px] text-rose-700">{error}</div>}
    </div>
  )
}
