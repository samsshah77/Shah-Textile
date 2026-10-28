/**
 * Paper direction for one print / PDF. The app prints A4 landscape by default (globals.css);
 * a page that offers a choice calls this right before window.print(). The rule is removed
 * again after printing, so other pages keep their default.
 */
export type PrintOrientation = 'portrait' | 'landscape'

const STYLE_ID = 'sara-print-orientation'

export function applyPrintOrientation(orientation?: PrintOrientation): () => void {
  if (typeof document === 'undefined' || !orientation) return () => {}
  document.getElementById(STYLE_ID)?.remove()
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `@media print { @page { size: A4 ${orientation}; } }`
  document.head.appendChild(style)
  return () => style.remove()
}
