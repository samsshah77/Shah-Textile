/** AdminLTE body classes for mobile push-menu (breakpoint matches sidebar-expand-lg). */
export const SIDEBAR_MOBILE_BREAKPOINT = 991.98

export function isSidebarMobileViewport() {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= SIDEBAR_MOBILE_BREAKPOINT
}

export function closeSidebar() {
  if (typeof document === 'undefined') return
  document.body.classList.remove('sidebar-open')
  document.body.classList.add('sidebar-collapse')
}

export function openSidebar() {
  if (typeof document === 'undefined') return
  document.body.classList.remove('sidebar-collapse')
  if (isSidebarMobileViewport()) {
    document.body.classList.add('sidebar-open')
  }
}

export function toggleSidebar() {
  if (typeof document === 'undefined') return
  if (document.body.classList.contains('sidebar-open')) {
    closeSidebar()
    return
  }
  // Desktop collapsed OR mobile closed
  if (
    document.body.classList.contains('sidebar-collapse') ||
    isSidebarMobileViewport()
  ) {
    openSidebar()
    return
  }
  closeSidebar()
}

/** Ensure AdminLTE-style overlay exists so tapping outside closes the sidebar on mobile. */
export function ensureSidebarOverlay() {
  if (typeof document === 'undefined') return
  const wrapper = document.querySelector('.app-wrapper')
  if (!wrapper) return
  let overlay = wrapper.querySelector(':scope > .sidebar-overlay') as HTMLElement | null
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.className = 'sidebar-overlay'
    wrapper.appendChild(overlay)
  }
  if (!overlay.dataset.saraBound) {
    overlay.dataset.saraBound = '1'
    overlay.addEventListener('click', () => closeSidebar())
  }
}
