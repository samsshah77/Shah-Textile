import { isAccountsStoreKey } from '@/lib/accountsKeys'

const memory = new Map<string, string>()
let hydrated = false
let hydratePromise: Promise<void> | null = null

function isClient(): boolean {
  return typeof window !== 'undefined'
}

async function persistAccountsKey(key: string, value: unknown): Promise<void> {
  if (!isClient() || !hydrated) return
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
        Object.entries(data.store as Record<string, unknown>).forEach(([key, value]) => {
          remember(key, value)
          present.add(key)
        })
      }
      hydrated = true
      migrateLegacy(present)
    } catch (err) {
      console.error('[accounts] hydrate failed — using browser copy', err)
      hydrated = true
      migrateLegacy(new Set())
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
        const parsed = JSON.parse(legacy) as T
        if (hydrated) void persistAccountsKey(key, parsed)
        return parsed
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
