'use client'

import { useRef, useState } from 'react'

interface AvatarImageUploadProps {
  src?: string | null
  alt?: string
  disabled?: boolean
  size?: number
  /** Click image to open large preview. */
  previewable?: boolean
  /** Allow file upload (camera overlay / Change Picture). Default true. */
  uploadable?: boolean
  onChange?: (dataUrl: string) => void
}

function readPictureAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Circular avatar — preview and/or upload depending on props. */
export function AvatarImageUpload({
  src,
  alt = 'Picture',
  disabled,
  size = 48,
  previewable = false,
  uploadable = true,
  onChange,
}: AvatarImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const canUpload = Boolean(uploadable && !disabled && onChange)

  const openFilePicker = () => {
    if (canUpload) inputRef.current?.click()
  }

  return (
    <>
      <button
        type="button"
        className="avatar-upload"
        style={{ width: size, height: size }}
        disabled={!previewable && !canUpload}
        title={
          previewable
            ? 'Click to view picture'
            : canUpload
              ? 'Click to upload picture'
              : alt
        }
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (previewable && src) {
            setPreviewOpen(true)
            return
          }
          openFilePicker()
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} />
        ) : (
          <i className="bi bi-person-bounding-box avatar-upload__placeholder" aria-hidden />
        )}
        {canUpload && !previewable && (
          <span className="avatar-upload__overlay" aria-hidden>
            <i className="bi bi-camera-fill" />
          </span>
        )}
        {canUpload && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file || !onChange) return
              const dataUrl = await readPictureAsDataUrl(file)
              onChange(dataUrl)
            }}
          />
        )}
      </button>

      {previewOpen && src && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(3px)', zIndex: 1080 }}
          onClick={(e) => {
            e.stopPropagation()
            setPreviewOpen(false)
          }}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-lg"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14, overflow: 'hidden' }}>
              <div className="modal-header py-2 px-3 border-bottom">
                <h6 className="modal-title mb-0 fw-semibold text-truncate">{alt}</h6>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setPreviewOpen(false)}
                />
              </div>
              <div className="modal-body p-3 text-center bg-dark">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={alt}
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }}
                />
              </div>
              <div className="modal-footer py-2 px-3">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary ms-auto"
                  onClick={() => setPreviewOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
