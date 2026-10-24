/**
 * Global handler for expired session / 401 Unauthorized.
 * Immediately halts background polling intervals and navigates to /login with a clean notice.
 * This completely prevents the client from flooding the server with 401 requests,
 * protecting client IPs from ever getting banned by Fail2ban / server firewalls.
 */

let isRedirecting = false

export function handleSessionExpired() {
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/login')) return
  if (isRedirecting) return
  isRedirecting = true

  // Dispatch a global event so any active polling hooks stop immediately
  window.dispatchEvent(new CustomEvent('auth:session-expired'))

  // Redirect to login page
  window.location.href = '/login?expired=1'
}

export function isSessionExpired(): boolean {
  return isRedirecting
}
