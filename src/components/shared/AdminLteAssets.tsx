'use client'

import { useEffect } from 'react'

const STYLES = [
  {
    id: 'lte-font-source-sans',
    href: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
  },
  {
    id: 'lte-overlayscrollbars',
    href: 'https://cdn.jsdelivr.net/npm/overlayscrollbars@2.11.0/styles/overlayscrollbars.min.css',
  },
  {
    id: 'lte-bootstrap-icons',
    href: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css',
  },
  {
    id: 'lte-adminlte-css',
    href: '/adminlte/css/adminlte.min.css',
  },
  {
    id: 'lte-adminlte-colors',
    href: '/adminlte/css/adminlte-colors.min.css',
  },
] as const

const SCRIPTS = [
  {
    id: 'lte-popper',
    src: 'https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js',
  },
  {
    id: 'lte-bootstrap',
    src: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.min.js',
  },
  {
    id: 'lte-adminlte-js',
    src: '/adminlte/js/adminlte.min.js',
  },
] as const

function ensureLink(id: string, href: string) {
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.getElementById(id)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.body.appendChild(script)
  })
}

/** Force AdminLTE default light skin (Bootstrap primary blue). */
function forceLightTheme() {
  const root = document.documentElement
  root.setAttribute('data-lte-color-mode', 'off')
  root.setAttribute('data-bs-theme', 'light')
  root.removeAttribute('data-lte-primary')
  root.style.colorScheme = 'light'
  root.classList.remove('dark')
  try {
    localStorage.setItem('lte-theme', 'light')
  } catch {
    // ignore
  }
}

/** Loads AdminLTE CSS/JS only for authenticated ERP shell routes. */
export function AdminLteAssets() {
  useEffect(() => {
    forceLightTheme()
    STYLES.forEach((s) => ensureLink(s.id, s.href))

    let cancelled = false
    ;(async () => {
      for (const s of SCRIPTS) {
        if (cancelled) return
        await loadScript(s.id, s.src)
      }
      if (!cancelled) forceLightTheme()
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
