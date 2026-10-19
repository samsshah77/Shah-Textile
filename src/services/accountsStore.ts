import { isAccountsStoreKey } from '@/lib/accountsKeys'

const memory = new Map<string, string>()
const pendingPersists = new Map<string, unknown>()
let hydrated = false
let hydratePromise: Promise<void> | null = null

function isClient(): boolean {
  return typeof window !== 'undefined'
}

async function persistAccountsKey(key: string, value: unknown): Promise<void> {
  if (!isClient()) return
  if (!hydrated) {
    pendingPersists.set(key, value)
    return
  }
  try {
    const res = await fetch('/api/accounts/store', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    if (!res.ok) {
      console.error('[accounts] persist failed', key, res.status)
    }
  } catch (err) {
    console.error('[accounts] persist failed', key, err)
  }
}

function remember(key: string, value: unknown): void {
  memory.set(key, JSON.stringify(value))
}

/** One-time: browser copies that are not in Postgres yet. */
function migrateLegacy(present: Set<string>): void {
  if (!isClient()) return
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || !isAccountsStoreKey(key) || present.has(key)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      memory.set(key, raw)
      void persistAccountsKey(key, JSON.parse(raw))
    }
  } catch (err) {
    console.error('[accounts] legacy migrate failed', err)
  }
}

/** Show the browser copy without sending it to the server (used when the server is unreachable). */
function loadLegacyIntoMemory(): void {
  if (!isClient()) return
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || !isAccountsStoreKey(key) || memory.has(key)) continue
      const raw = localStorage.getItem(key)
      if (raw) memory.set(key, raw)
    }
  } catch {
    // ignore
  }
}

export async function hydrateAccountsFromDb(): Promise<void> {
  if (!isClient()) return
  if (hydrated) return
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    try {
      const res = await fetch('/api/accounts/store', { method: 'GET', cache: 'no-store' })
      const data = await res.json()
      const present = new Set<string>()
      if (data?.ok && data.store && typeof data.store === 'object') {
        Object.entries(data.store as Record<string, unknown>).forEach(([key, remoteVal]) => {
          let mergedVal = remoteVal

          // Non-destructive merge for inventory control store
          if (key === 'sara_textile_inventory_control_v2' && isClient()) {
            try {
              const localRaw = localStorage.getItem(key)
              if (localRaw) {
                const localObj = JSON.parse(localRaw)
                if (localObj && typeof localObj === 'object') {
                  const combined = { ...(remoteVal as Record<string, any>) }
                  let hasLocalAdditions = false

                  for (const [mKey, mVal] of Object.entries(localObj as Record<string, any>)) {
                    if (!combined[mKey]) {
                      combined[mKey] = mVal
                      hasLocalAdditions = true
                    } else if (
                      Array.isArray(mVal?.items) &&
                      Array.isArray(combined[mKey]?.items) &&
                      mVal.items.length > combined[mKey].items.length
                    ) {
                      combined[mKey] = mVal
                      hasLocalAdditions = true
                    }
                  }

                  mergedVal = combined
                  if (hasLocalAdditions) {
                    void persistAccountsKey(key, combined)
                  }
                }
              }
            } catch (err) {
              console.error('[accounts] merge error for inventory control', err)
            }
          }

          remember(key, mergedVal)
          if (isClient()) {
            try {
              localStorage.setItem(key, JSON.stringify(mergedVal))
            } catch {}
          }
          present.add(key)
        })
      }
      hydrated = true
      // Only push browser-only keys when the server answered properly; on an error
      // response we cannot know what is stored, so we must not overwrite it.
      if (data?.ok) migrateLegacy(present)
      else loadLegacyIntoMemory()

      // Flush any pending persists that were queued prior to hydration
      if (pendingPersists.size > 0) {
        const queue = Array.from(pendingPersists.entries())
        pendingPersists.clear()
        for (const [qKey, qVal] of queue) {
          void persistAccountsKey(qKey, qVal)
        }
      }
    } catch (err) {
      console.error('[accounts] hydrate failed — using browser copy', err)
      hydrated = true
      loadLegacyIntoMemory()
    }
  })()

  return hydratePromise
}

export function accountsRead<T>(key: string, fallback: T): T {
  const raw = memory.get(key)
  if (raw) {
    try {
      return JSON.parse(raw) as T
    } catch {
      // fall through
    }
  }
  if (isClient()) {
    try {
      const legacy = localStorage.getItem(key)
      if (legacy) {
        memory.set(key, legacy)
        return JSON.parse(legacy) as T
      }
    } catch (err) {
      console.error(err)
    }
  }
  return fallback
}

export function accountsWrite(key: string, value: unknown): void {
  remember(key, value)
  if (isClient()) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore quota
    }
  }
  void persistAccountsKey(key, value)
}

export function accountsRemove(key: string): void {
  memory.delete(key)
  if (isClient()) {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
  void persistAccountsKey(key, null)
}
