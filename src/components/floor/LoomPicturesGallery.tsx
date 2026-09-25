'use client'

import { useEffect, useRef, useState } from 'react'
import { MAX_LOOM_PICTURES } from '@/services/productionMastersService'
import { uploadImageFile } from '@/lib/uploadImage'
import { useAlertDialog } from '@/context/AlertDialogContext'

interface LoomPicturesGalleryProps {
  images: string[]
  title: string
  open: boolean
  initialIndex?: number
  onClose: () => void
  /** When set, user can add/remove photos from this dialog. */
  editable?: boolean
  onImagesChange?: (images: string[]) => void
}

/** Gallery dialog — prev/next, thumbnails; optional add/remove in edit mode. */
export function LoomPicturesGallery({
  images,
  title,
  open,
  initialIndex = 0,
  onClose,
  editable = false,
  onImagesChange,
}: LoomPicturesGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [index, setIndex] = useState(initialIndex)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showConfirm } = useAlertDialog()

  useEffect(() => {
    if (open) {
      setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)))
      setError(null)
    }
  }, [open, initialIndex, images.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setIndex((i) => (images.length ? (i - 1 + images.length) % images.length : 0))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setIndex((i) => (images.length ? (i + 1) % images.length : 0))
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, images.length, onClose])

  if (!open) return null

  const list = images.filter(Boolean)
  const current = list[index] || list[0]
  const hasMany = list.length > 1
  const canAdd = editable && !!onImagesChange && list.length < MAX_LOOM_PICTURES && !uploading

  const goPrev = () => {
    if (!list.length) return
    setIndex((i) => (i - 1 + list.length) % list.length)
  }
  const goNext = () => {
    if (!list.length) return
    setIndex((i) => (i + 1) % list.length)
  }

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !onImagesChange || !canAdd) return
    const remaining = MAX_LOOM_PICTURES - list.length
    const slice = Array.from(files).slice(0, remaining)
    setError(null)
    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of slice) {
        urls.push(await uploadImageFile(file))
      }
      if (urls.length) {
        const next = [...list, ...urls]
        onImagesChange(next)
        setIndex(list.length)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const applyRemoveAt = (i: number) => {
    if (!onImagesChange || !list.length) return
    const next = list.filter((_, idx) => idx !== i)
    onImagesChange(next)
    setIndex((cur) => {
      if (next.length === 0) return 0
      if (cur === i) return Math.min(i, next.length - 1)
      if (cur > i) return cur - 1
      return cur
    })
  }

  const confirmRemoveAt = (i: number) => {
    if (!onImagesChange || uploading) return
    showConfirm({
      title: 'Photo Delete Karein?',
      message: 'Kya aap ye photo delete karna chahte hain? Ye action undo nahi hoga.',
      type: 'confirm',
      confirmText: 'Haan, Delete',
      cancelText: 'Cancel',
      onConfirm: () => applyRemoveAt(i),
    })
  }

  const confirmRemoveCurrent = () => {
    if (!list.length) return
    confirmRemoveAt(index)
  }

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(3px)', zIndex: 1080 }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <div className="modal-header py-2 px-3 border-bottom">
            <h6 className="modal-title mb-0 fw-semibold text-truncate">
              {title}
              {list.length > 0 && (
                <span className="text-muted fw-normal ms-2">
                  {`${index + 1} / ${list.length}`}
                </span>
              )}
            </h6>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <div
            className="modal-body p-3 bg-dark position-relative d-flex align-items-center justify-content-center"
            style={{ minHeight: 280 }}
          >
            {list.length === 0 ? (
              <div className="text-white-50 py-5 text-center">
                <i className="bi bi-images fs-2 d-block mb-2" />
                No pictures yet
                {editable && onImagesChange && (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={!canAdd}
                      onClick={() => inputRef.current?.click()}
                    >
                      <i className="bi bi-plus-lg me-1" /> Add Photos
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {hasMany && (
                  <button
                    type="button"
                    className="btn btn-sm btn-light position-absolute top-50 start-0 translate-middle-y ms-2"
                    style={{ zIndex: 2 }}
                    aria-label="Previous"
                    onClick={goPrev}
                  >
                    <i className="bi bi-chevron-left" />
                  </button>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current}
                  alt={`${title} ${index + 1}`}
                  className="loom-gallery-main-img"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '65vh',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    borderRadius: 8,
                    margin: '0 auto',
                    display: 'block',
                  }}
                />
                {hasMany && (
                  <button
                    type="button"
                    className="btn btn-sm btn-light position-absolute top-50 end-0 translate-middle-y me-2"
                    style={{ zIndex: 2 }}
                    aria-label="Next"
                    onClick={goNext}
                  >
                    <i className="bi bi-chevron-right" />
                  </button>
                )}
                {editable && onImagesChange && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2"
                    style={{ zIndex: 2 }}
                    title="Delete this photo"
                    disabled={uploading}
                    onClick={confirmRemoveCurrent}
                  >
                    <i className="bi bi-trash me-1" /> Delete
                  </button>
                )}
              </>
            )}
          </div>

          {(list.length > 0 || (editable && onImagesChange)) && (
            <div className="px-3 py-2 d-flex gap-2 overflow-auto bg-light border-top align-items-center justify-content-center">
              {list.map((src, i) => (
                <div
                  key={`${i}-${src.slice(0, 24)}`}
                  className="loom-gallery-thumb position-relative flex-shrink-0"
                  style={{ width: 56, height: 56 }}
                >
                  <button
                    type="button"
                    className={`btn p-0 border w-100 h-100 ${i === index ? 'border-primary border-2' : 'border-secondary-subtle'}`}
                    style={{ overflow: 'hidden', borderRadius: 8 }}
                    onClick={() => setIndex(i)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                    />
                  </button>
                  {editable && onImagesChange && (
                    <button
                      type="button"
                      className="loom-gallery-thumb__del btn btn-danger btn-sm position-absolute top-50 start-50 translate-middle p-0 d-flex align-items-center justify-content-center"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        zIndex: 2,
                      }}
                      title="Delete photo"
                      disabled={uploading}
                      onClick={(e) => {
                        e.stopPropagation()
                        confirmRemoveAt(i)
                      }}
                    >
                      <i className="bi bi-trash" style={{ fontSize: 12 }} />
                    </button>
                  )}
                </div>
              ))}
              {editable && onImagesChange && canAdd && (
                <button
                  type="button"
                  className="btn btn-outline-primary d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: 56, height: 56, borderRadius: 8 }}
                  title="Add photos"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? (
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden />
                  ) : (
                    <i className="bi bi-plus-lg" />
                  )}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="alert alert-danger py-2 px-3 small mb-0 rounded-0" role="alert">
              {error}
            </div>
          )}

          <div className="modal-footer py-2 px-3 d-flex flex-wrap gap-2">
            {editable && onImagesChange && (
              <>
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
              </>
            )}
            <button
              type="button"
              className="btn btn-sm btn-primary ms-auto"
              disabled={uploading}
              onClick={onClose}
            >
              <i className="bi bi-check-lg me-1" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
