/** Session memory: loom pe newly assigned qualities — Quality page pe brief row highlight. */

const KEY = 'sara_quality_new_assign_flash_v1'
const MAX_AGE_MS = 6 * 60 * 60 * 1000

type FlashEntry = { id: string; at: number }

function readEntries(): FlashEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FlashEntry[]
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed.filter((e) => e?.id && now - Number(e.at || 0) < MAX_AGE_MS)
  } catch {
    return []
  }
}

function writeEntries(entries: FlashEntry[]) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // ignore quota
  }
}

/** Loom table se naya quality assign hone par call karo. */
export function rememberQualityAssignFlash(qualityId: string | null | undefined) {
  const id = String(qualityId || '').trim()
  if (!id) return
  const now = Date.now()
  const rest = readEntries().filter((e) => e.id !== id)
  writeEntries([{ id, at: now }, ...rest].slice(0, 40))
}

export function peekQualityAssignFlashIds(): string[] {
  return readEntries().map((e) => e.id)
}

export function clearQualityAssignFlashIds() {
  writeEntries([])
}

/**
 * Quality Active page open hone par pending IDs lo aur clear kar do
 * (ek baar highlight — dubara tab switch pe spam nahi).
 */
export function takeQualityAssignFlashIds(): string[] {
  const entries = readEntries()
  writeEntries([])
  return entries.map((e) => e.id)
}
