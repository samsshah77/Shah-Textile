'use client'

import { useEffect, useState } from 'react'

export interface FloorFaultMediaItem {
  url: string
  kind: 'image' | 'video'
}

export interface FloorFaultReportItem {
  id: string
  loomNumber: number
  shift?: 'A' | 'B'
  text: string
  media: FloorFaultMediaItem[]
  createdBy: string
  createdAt?: string
}

interface FabricFaultMediaDialogProps {
  open: boolean
  loomNumber: number | null
  qualityName?: string
  date?: string
  reports: FloorFaultReportItem[]
  onClose: () => void
}

function formatReportTime(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function FabricFaultMediaDialog({
  open,
  loomNumber,
  qualityName,
  date,
  reports,
  onClose,
}: FabricFaultMediaDialogProps) {
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null)

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreenImage) {
          setFullscreenImage(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, fullscreenImage, onClose])

  if (!open || loomNumber === null) return null

  const loomReports = reports.filter((r) => r.loomNumber === loomNumber)
  const totalPhotos = loomReports.reduce(
    (sum, r) => sum + (r.media?.filter((m) => m.kind === 'image').length || 0),
    0
  )
  const totalVideos = loomReports.reduce(
    (sum, r) => sum + (r.media?.filter((m) => m.kind === 'video').length || 0),
    0
  )

  return (
    <>
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fabric-fault-media-title"
        style={{ background: 'rgba(15, 23, 42, 0.65)', zIndex: 1050 }}
        onClick={onClose}
      >
        <div
          className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-content border-0 shadow-lg">
            {/* Modal Header */}
            <div className="modal-header bg-light py-2 px-3 border-bottom">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className="badge bg-primary fs-6 px-2.5 py-1.5">
                  Loom #{loomNumber}
                </span>
                <h5 id="fabric-fault-media-title" className="modal-title fs-6 fw-bold mb-0">
                  Floor Faults, Photos & Videos
                </h5>
                {qualityName && (
                  <span className="text-secondary small">· {qualityName}</span>
                )}
                {date && <span className="text-secondary small">· {date}</span>}
              </div>
              <div className="d-flex align-items-center gap-2">
                <div className="small text-secondary me-2">
                  {totalPhotos > 0 && (
                    <span className="badge text-bg-light border me-1">
                      <i className="bi bi-camera me-1" />
                      {totalPhotos} Photo{totalPhotos > 1 ? 's' : ''}
                    </span>
                  )}
                  {totalVideos > 0 && (
                    <span className="badge text-bg-light border">
                      <i className="bi bi-camera-video me-1" />
                      {totalVideos} Video{totalVideos > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={onClose}
                />
              </div>
            </div>

            {/* Modal Body */}
            <div className="modal-body p-3 bg-light-subtle">
              {loomReports.length === 0 ? (
                <div className="text-center py-5 text-secondary">
                  <i className="bi bi-camera-video fs-1 d-block mb-2 text-muted" />
                  <p className="mb-0 fw-semibold">Is loom par koi floor report nahi mili.</p>
                  <p className="small text-muted">
                    Floor inspectors jab mobile se photo ya video bhejenge to yahan dikhegi.
                  </p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {loomReports.map((report, idx) => {
                    const shift = report.shift || 'A'
                    const timeStr = formatReportTime(report.createdAt)
                    const images = (report.media || []).filter((m) => m.kind === 'image')
                    const videos = (report.media || []).filter((m) => m.kind === 'video')

                    return (
                      <div
                        key={report.id || idx}
                        className="card border shadow-sm overflow-hidden"
                      >
                        {/* Report Header */}
                        <div className="card-header bg-white py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 border-bottom">
                          <div className="d-flex align-items-center gap-2">
                            <span
                              className={`badge ${
                                shift === 'B'
                                  ? 'bg-warning text-dark'
                                  : 'bg-info text-dark'
                              } fw-bold`}
                            >
                              Shift {shift}
                            </span>
                            <span className="fw-semibold small">
                              Fault #{idx + 1}
                            </span>
                            <span className="text-secondary small">
                              · <i className="bi bi-person me-1" />
                              {report.createdBy || 'Floor Inspector'}
                            </span>
                            {timeStr && (
                              <span className="text-secondary small">
                                · <i className="bi bi-clock me-1" />
                                {timeStr}
                              </span>
                            )}
                          </div>
                          <div className="small text-muted">
                            {report.media?.length ? (
                              <span>
                                {report.media.length} file
                                {report.media.length > 1 ? 's' : ''} attached
                              </span>
                            ) : (
                              <span>Sirf text note</span>
                            )}
                          </div>
                        </div>

                        {/* Report Content */}
                        <div className="card-body p-3">
                          {/* Fault Note Text */}
                          {report.text ? (
                            <div className="p-2.5 rounded bg-light border mb-3">
                              <div className="small text-muted fw-semibold mb-1">
                                <i className="bi bi-chat-left-quote me-1 text-primary" />
                                Fault Note / Awaz ka matan:
                              </div>
                              <div
                                className="fw-medium text-dark"
                                style={{ whiteSpace: 'pre-wrap', fontSize: '14.5px' }}
                              >
                                {report.text}
                              </div>
                            </div>
                          ) : (
                            <div className="small text-muted fst-italic mb-2">
                              (Text note nahi likha gaya — sirf photo / video bheji gayi)
                            </div>
                          )}

                          {/* Media: Photos */}
                          {images.length > 0 && (
                            <div className="mb-3">
                              <div className="small fw-semibold text-secondary mb-2 d-flex align-items-center gap-1">
                                <i className="bi bi-images text-primary" /> Photos ({images.length}):
                              </div>
                              <div className="d-flex flex-wrap gap-2">
                                {images.map((img, imgIdx) => (
                                  <div
                                    key={img.url || imgIdx}
                                    className="position-relative border rounded overflow-hidden shadow-sm group"
                                    style={{
                                      width: 140,
                                      height: 140,
                                      cursor: 'pointer',
                                      backgroundColor: '#f1f5f9',
                                    }}
                                    onClick={() => setFullscreenImage(img.url)}
                                    title="Full view dekhne ke liye click karein"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={img.url}
                                      alt={`Loom ${loomNumber} fault`}
                                      loading="lazy"
                                      className="w-100 h-100"
                                      style={{ objectFit: 'cover' }}
                                    />
                                    <div
                                      className="position-absolute bottom-0 start-0 end-0 py-1 px-1.5 text-center small text-white"
                                      style={{
                                        background: 'rgba(15, 23, 42, 0.75)',
                                        fontSize: '11px',
                                      }}
                                    >
                                      <i className="bi bi-zoom-in me-1" />
                                      Full View
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Media: Videos */}
                          {videos.length > 0 && (
                            <div>
                              <div className="small fw-semibold text-secondary mb-2 d-flex align-items-center gap-1">
                                <i className="bi bi-camera-video text-primary" /> Videos ({videos.length}):
                              </div>
                              <div className="d-flex flex-wrap gap-3">
                                {videos.map((vid, vidIdx) => (
                                  <div
                                    key={vid.url || vidIdx}
                                    className="border rounded overflow-hidden shadow-sm bg-black"
                                    style={{ width: 280, maxWidth: '100%' }}
                                  >
                                    <video
                                      src={vid.url}
                                      controls
                                      preload="metadata"
                                      playsInline
                                      className="w-100 d-block"
                                      style={{ maxHeight: 200, objectFit: 'contain' }}
                                    />
                                    <div className="p-1.5 bg-dark text-white-50 small text-center" style={{ fontSize: '11px' }}>
                                      <i className="bi bi-play-circle me-1" /> Video #{vidIdx + 1}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer py-2 px-3 bg-light border-top">
              <span className="small text-muted me-auto">
                <i className="bi bi-info-circle me-1" />
                Photos ko click karke bara karke dekh sakte hain.
              </span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox / Fullscreen Image Viewer */}
      {fullscreenImage && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            zIndex: 1100,
          }}
          onClick={() => setFullscreenImage(null)}
        >
          {/* Top Bar */}
          <div
            className="position-absolute top-0 start-0 end-0 d-flex align-items-center justify-content-between p-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="small fw-semibold">
              <i className="bi bi-camera me-1" /> Loom #{loomNumber} Fault Photo
            </div>
            <div className="d-flex align-items-center gap-2">
              <a
                href={fullscreenImage}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-outline-light py-1 px-2"
                title="Nayi tab mein asil photo kholein"
              >
                <i className="bi bi-box-arrow-up-right me-1" />
                Original
              </a>
              <button
                type="button"
                className="btn btn-sm btn-danger py-1 px-2"
                aria-label="Close full view"
                onClick={() => setFullscreenImage(null)}
              >
                <i className="bi bi-x-lg me-1" /> Close
              </button>
            </div>
          </div>

          {/* Full Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullscreenImage}
            alt="Full view fault"
            className="rounded shadow-lg"
            style={{
              maxWidth: '92vw',
              maxHeight: '85vh',
              objectFit: 'contain',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
