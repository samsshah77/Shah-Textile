'use client'

import { useRef, useState } from 'react'
import { MAX_LOOM_PICTURES } from '@/services/productionMastersService'
import { LoomPicturesGallery } from '@/components/floor/LoomPicturesGallery'
import { uploadImageFile } from '@/lib/uploadImage'

interface LoomPictureThumbProps {
  images: string[]
  alt: string
  /** Short side of rectangular thumb (width = size * 1.25). */
  size?: number
  /** Admin can add/delete photos (gallery + overlay). */
  editable?: boolean
  onImagesChange?: (images: string[]) => void
}

/** Rectangular loom thumb — click opens gallery; admin can add/delete photos. */
export function LoomPictureThumb({
  images,
  alt,
  size = 40,
  editable = false,
  onImagesChange,
}: LoomPictureThumbProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = images.filter(Boolean)
  const cover = list[0]
  const extra = Math.max(0, list.length - 1)
  const width = Math.round(size * 1.25)
  const height = size
  const canAdd = editable && !!onImagesChange && list.length < MAX_LOOM_PICTURES && !uploading

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !onImagesChange || uploading) return
    const remaining = MAX_LOOM_PICTURES - list.length
    if (remaining <= 0) return
    const slice = Array.from(files).slice(0, remaining)
    setError(null)
    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of slice) {
        urls.push(await uploadImageFile(file))
      }
      if (urls.length) onImagesChange([...list, ...urls])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const fileInput = editable ? (
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
  ) : null

  const gallery = (
    <LoomPicturesGallery
      images={list}
      title={alt}
      open={open}
      onClose={() => setOpen(false)}
      editable={editable}
      onImagesChange={onImagesChange}
    />
  )

  if (!cover) {
    return (
      <>
        <div className="d-inline-flex flex-column align-items-center gap-1">
          <div className="avatar-upload avatar-upload--rect" style={{ width, height }}>
            {uploading ? (
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden />
            ) : (
              <i className="bi bi-image avatar-upload__placeholder" aria-hidden />
            )}
            {editable && (
              <button
                type="button"
                className="avatar-upload__overlay border-0"
                title="Add photos"
                disabled={!canAdd}
                onClick={() => inputRef.current?.click()}
              >
                <span className="small fw-semibold">Add</span>
              </button>
            )}
          </div>
          {fileInput}
          {error && <span className="text-danger" style={{ fontSize: 9 }}>{error}</span>}
        </div>
        {gallery}
      </>
    )
  }

  return (
    <>
      <div className="d-inline-flex flex-column align-items-center gap-1">
        <div className="avatar-upload avatar-upload--rect position-relative" style={{ width, height }}>
          <button
            type="button"
            className="border-0 p-0 bg-transparent w-100 h-100"
            style={{ display: 'block', cursor: 'pointer' }}
            title={
              editable
                ? 'View / manage pictures'
                : list.length > 1
                  ? `View ${list.length} pictures`
                  : 'View picture'
            }
            onClick={() => setOpen(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt={alt} />
          </button>
          {extra > 0 && (
            <span
              className="position-absolute bottom-0 end-0 badge rounded-pill bg-dark"
              style={{ fontSize: 9, transform: 'translate(15%, 15%)', zIndex: 2, pointerEvents: 'none' }}
            >
              +{extra}
            </span>
          )}
          {editable && (
            <button
              type="button"
              className="avatar-upload__overlay border-0"
              title="Manage photos"
              onClick={() => setOpen(true)}
            >
              {uploading ? (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden />
              ) : (
                <span className="small fw-semibold text-center lh-1 px-1">
                  <i className="bi bi-images d-block mb-1" />
                  Edit
                </span>
              )}
            </button>
          )}
        </div>
        {fileInput}
        {error && <span className="text-danger" style={{ fontSize: 9 }}>{error}</span>}
      </div>
      {gallery}
    </>
  )
}
