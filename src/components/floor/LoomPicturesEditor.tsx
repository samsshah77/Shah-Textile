'use client'

import { useRef, useState } from 'react'
import { MAX_LOOM_PICTURES } from '@/services/productionMastersService'
import { uploadImageFile } from '@/lib/uploadImage'
import { useAlertDialog } from '@/context/AlertDialogContext'

interface LoomPicturesEditorProps {
  images: string[]
  onChange: (images: string[]) => void
  loomLabel?: string
}

/** Multi-photo manager for edit loom modal — add / remove / set cover. */
export function LoomPicturesEditor({ images, onChange, loomLabel = 'Loom' }: LoomPicturesEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showConfirm } = useAlertDialog()
  const canAdd = images.length < MAX_LOOM_PICTURES && !uploading

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || images.length >= MAX_LOOM_PICTURES || uploading) return
    const remaining = MAX_LOOM_PICTURES - images.length
    const slice = Array.from(files).slice(0, remaining)
    setError(null)
    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of slice) {
        const url = await uploadImageFile(file)
        urls.push(url)
      }
      if (urls.length) onChange([...images, ...urls])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const removeAt = (index: number) => {
    showConfirm({
      title: 'Photo Delete Karein?',
      message: 'Kya aap ye photo delete karna chahte hain? Ye action undo nahi hoga.',
      type: 'confirm',
      confirmText: 'Haan, Delete',
      cancelText: 'Cancel',
      onConfirm: () => onChange(images.filter((_, i) => i !== index)),
    })
  }

  const setCover = (index: number) => {
    if (index <= 0) return
    const next = [...images]
    const [picked] = next.splice(index, 1)
    onChange([picked, ...next])
  }

  const moveImage = (from: number, to: number) => {
    if (uploading) return
    if (to < 0 || to >= images.length || from === to) return
    const next = [...images]
    const [picked] = next.splice(from, 1)
    next.splice(to, 0, picked)
    onChange(next)
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div>
          <div className="fw-semibold text-dark small">Loom Pictures</div>
          <div className="text-secondary" style={{ fontSize: 11 }}>
            Up to {MAX_LOOM_PICTURES} photos. First image is the cover (table thumbnail).
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={!canAdd}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden />
              Uploading…
            </>
          ) : (
            <>
              <i className="bi bi-plus-lg me-1" /> Add Photos
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={uploading}
          onChange={async (e) => {
            await addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 small mb-2" role="alert">
          {error}
        </div>
      )}

      {images.length === 0 ? (
        <button
          type="button"
          className="btn btn-outline-secondary w-100 py-4 d-flex flex-column align-items-center gap-1"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden />
              <span className="small">Uploading…</span>
            </>
          ) : (
            <>
              <i className="bi bi-images fs-4" />
              <span className="small">Upload {loomLabel} pictures</span>
            </>
          )}
        </button>
      ) : (
        <div className="d-flex flex-wrap gap-2 justify-content-center">
          {images.map((src, i) => (
            <div
              key={`${i}-${src.slice(0, 32)}`}
              className="position-relative border rounded overflow-hidden bg-light d-flex flex-column"
              style={{ width: 88 }}
            >
              <div style={{ width: 88, height: 72, position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                />
                {i === 0 && (
                  <span
                    className="position-absolute top-0 start-0 badge bg-primary rounded-0"
                    style={{ fontSize: 9 }}
                  >
                    Cover
                  </span>
                )}
              </div>
              <div className="d-flex border-top">
                <button
                  type="button"
                  className="btn btn-sm btn-light flex-fill rounded-0 py-0 border-0 border-end"
                  style={{ fontSize: 11 }}
                  title="Move left"
                  disabled={uploading || i === 0}
                  onClick={() => moveImage(i, i - 1)}
                >
                  <i className="bi bi-chevron-left" />
                </button>
                {i > 0 ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-light flex-fill rounded-0 py-0 border-0 border-end"
                    style={{ fontSize: 10 }}
                    title="Set as cover"
                    disabled={uploading}
                    onClick={() => setCover(i)}
                  >
                    Cover
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm btn-light flex-fill rounded-0 py-0 border-0 border-end"
                  style={{ fontSize: 11 }}
                  title="Move right"
                  disabled={uploading || i === images.length - 1}
                  onClick={() => moveImage(i, i + 1)}
                >
                  <i className="bi bi-chevron-right" />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger flex-fill rounded-0 py-0 border-0"
                  style={{ fontSize: 11 }}
                  title="Remove"
                  disabled={uploading}
                  onClick={() => removeAt(i)}
                >
                  <i className="bi bi-trash" />
                </button>
              </div>
            </div>
          ))}
          {canAdd && (
            <button
              type="button"
              className="btn btn-outline-secondary d-flex align-items-center justify-content-center"
              style={{ width: 88, height: 88 }}
              onClick={() => inputRef.current?.click()}
              title="Add more"
            >
              <i className="bi bi-plus-lg fs-5" />
            </button>
          )}
          {uploading && (
            <div
              className="d-flex align-items-center justify-content-center border rounded bg-light text-secondary"
              style={{ width: 88, height: 88 }}
            >
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
