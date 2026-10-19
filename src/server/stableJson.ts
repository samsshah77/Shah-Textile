/**
 * JSON.stringify with object keys sorted, so two values compare equal regardless
 * of key order. Needed because Postgres JSONB does not preserve key order: a row
 * read back from the database stringifies differently from the same row sent by
 * the browser.
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k]
      return sorted
    }
    return v
  })
}

export function sameJson(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b)
}
