/**
 * What is loading right now, for the loaders in the page area:
 * 'page' = another page is opening (sidebar / link to a new page),
 * 'tab'  = the same page with another tab / filter in the address (?tab=…),
 * null   = nothing. Set by NavigationProgress, read by RouteLoader.
 */
export type NavLoadingKind = 'page' | 'tab' | null

let current: NavLoadingKind = null
const listeners = new Set<() => void>()

export function setNavLoading(kind: NavLoadingKind) {
  if (current === kind) return
  current = kind
  listeners.forEach((l) => l())
}

export function getNavLoading(): NavLoadingKind {
  return current
}

export function subscribeNavLoading(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
