'use client'

import { useRef } from 'react'

interface AvatarImageUploadProps {
  src?: string | null
  alt?: string
  disabled?: boolean
  size?: number
  onChange: (dataUrl: string) => void
}

function readPictureAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Circular avatar; hover shows upload icon (no file-name input). */
export function AvatarImageUpload({
  src,
  alt = 'Picture',
  disabled,
  size = 48,
  onChange,
}: AvatarImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <button
      type="button"
      className="avatar-upload"
      style={{ width: size, height: size }}
      disabled={disabled}
      title={disabled ? alt : 'Click or hover to upload picture'}
      onClick={() => {
        if (!disabled) inputRef.current?.click()
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} />
      ) : (
        <i className="bi bi-person-bounding-box avatar-upload__placeholder" aria-hidden />
      )}
      {!disabled && (
        <span className="avatar-upload__overlay" aria-hidden>
          <i className="bi bi-camera-fill" />
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const dataUrl = await readPictureAsDataUrl(file)
          onChange(dataUrl)
        }}
      />
    </button>
  )
}
