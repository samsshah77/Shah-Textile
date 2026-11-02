'use client'

import { useState, useEffect, useCallback } from 'react'
import { ImageIcon, X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BillPhotosLinkProps {
  urls?: string[]
  title?: string
}

/**
 * Photo icon button for bill attachments.
 * - Displays a photo icon (no count number).
 * - Clicking opens an interactive dialog preview modal with full-size picture and multi-photo navigation.
 */
export function BillPhotosLink({ urls, title = 'Bill Photo' }: BillPhotosLinkProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  const hasPhotos = Boolean(urls && urls.length > 0)
  const photoList = urls || []
  const count = photoList.length

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : count - 1))
  }, [count])

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < count - 1 ? prev + 1 : 0))
  }, [count])

  // Keyboard navigation for dialog
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNext()
      }
    }

    // Lock body scroll
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handlePrev, handleNext])

  if (!hasPhotos) return null

  const currentUrl = photoList[currentIndex] || photoList[0]

  return (
    <>
      {/* Trigger: Photo Icon Only (no count badge) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setCurrentIndex(0)
          setIsOpen(true)
        }}
        title={`Bill photo dekhein${count > 1 ? ` (${count} photos)` : ''}`}
        aria-label="View bill photo"
        className="sara-allow-readonly ml-1.5 inline-flex items-center justify-center rounded p-1 text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-400 dark:hover:bg-sky-900/80 border border-sky-200/80 dark:border-sky-800/70 transition-all shadow-2xs hover:shadow-xs active:scale-95 print:hidden cursor-pointer"
      >
        <ImageIcon className="size-3.5" />
      </button>

      {/* Picture Dialog Modal */}
      {isOpen && (
        <div
          className="sara-allow-readonly-zone fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative flex flex-col max-h-[92vh] max-w-4xl w-full bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/95">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-sky-400" />
                <h3 className="font-semibold text-sm text-slate-100">{title}</h3>
                {count > 1 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-medium">
                    {currentIndex + 1} / {count}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Asal tasveer nayi tab mein kholein"
                >
                  <ExternalLink className="size-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Band karein (Esc)"
                  aria-label="Close dialog"
                >
                  <X className="size-4.5" />
                </button>
              </div>
            </div>

            {/* Dialog Body / Main Image */}
            <div className="relative flex-1 flex items-center justify-center p-3 sm:p-6 min-h-[300px] max-h-[75vh] bg-slate-950/80 overflow-hidden select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt={`${title} attachment ${currentIndex + 1}`}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-xl"
              />

              {/* Multi-Photo Arrows */}
              {count > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800/85 hover:bg-slate-700 text-white shadow-lg backdrop-blur-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    title="Pichli tasveer (Left Arrow)"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800/85 hover:bg-slate-700 text-white shadow-lg backdrop-blur-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    title="Agli tasveer (Right Arrow)"
                    aria-label="Next image"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail Strip (if multiple photos) */}
            {count > 1 && (
              <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 border-t border-slate-800/90 overflow-x-auto">
                {photoList.map((url, idx) => (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      'relative size-12 shrink-0 rounded-md overflow-hidden border-2 transition-all cursor-pointer',
                      idx === currentIndex
                        ? 'border-sky-400 ring-2 ring-sky-400/30 scale-105'
                        : 'border-slate-700 opacity-60 hover:opacity-100 hover:border-slate-500'
                    )}
                    aria-label={`Thumbnail ${idx + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
