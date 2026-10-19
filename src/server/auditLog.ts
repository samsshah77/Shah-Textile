import { randomUUID } from 'crypto'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requestIp } from '@/lib/http'
import { sameJson } from '@/server/stableJson'

/**
 * Append-only change history for payroll, accounts and floor data.
 *
 * Every save records WHO changed WHAT and WHEN, plus the old and new values of
 * the rows/fields that actually changed. Removed rows are stored in full, so any
 * accidental overwrite or delete can be traced and restored.
 *
 * Writing the audit row must never block a business save: failures are logged
 * and swallowed.
 */

export type AuditActor = {
  id?: string | null
  name?: string | null
  roleKey?: string | null
} | null

export type AuditInput = {
  req?: NextRequest
  actor: AuditActor
  module: 'payroll' | 'accounts' | 'floor' | 'auth' | 'system'
  action: string
  entityKey: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  /** Pre-computed change summary. When omitted it is derived from before/after. */
  changes?: unknown
  meta?: Record<string, unknown>
}

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  "actorName" TEXT,
  "actorRole" TEXT,
  "module" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityKey" TEXT NOT NULL,
  "entityId" TEXT,
  "changes" JSONB,
  "meta" JSONB,
  "ip" TEXT,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
)`
const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "audit_logs_module_entityKey_idx" ON "audit_logs"("module", "entityKey")`,
]

let tableReady: Promise<void> | null = null

export function ensureAuditTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await prisma.$executeRawUnsafe(CREATE_TABLE)
      for (const sql of CREATE_INDEXES) await prisma.$executeRawUnsafe(sql)
    })().catch((err) => {
      tableReady = null
      throw err
    })
  }
  return tableReady
}

type Row = Record<string, unknown>

function isPlainObject(v: unknown): v is Row {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

/** Stable identity for a row across saves (payroll/accounts rows use `id`; floor masters use natural keys). */
export function rowIdentity(row: unknown): string | null {
  if (!isPlainObject(row)) return null
  if (row.id != null && row.id !== '') return String(row.id)
  if (row.beamNo != null && row.beamNo !== '') return `beam:${row.beamNo}`
  if (row.loomNumber != null) return `loom:${row.loomNumber}:${row.segmentIndex ?? 1}`
  return null
}


/** Field-level diff between two objects: { field: [old, new] } for changed fields only. */
export function diffFields(before: Row, after: Row): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) {
    // Edit stamps change on every save and add noise, not information.
    if (k === 'lastEditedAt' || k === 'updatedAt') continue
    if (!sameJson(before[k], after[k])) out[k] = [before[k] ?? null, after[k] ?? null]
  }
  return out
}

export type ChangeSummary =
  | { kind: 'none' }
  | {
      kind: 'rows'
      added: unknown[]
      removed: unknown[]
      changed: Array<{ id: string; fields: Record<string, [unknown, unknown]> }>
    }
  | { kind: 'object'; fields: Record<string, [unknown, unknown]> }
  | { kind: 'snapshot'; before: unknown; after: unknown }

/**
 * Compact description of what changed. Arrays of identifiable rows are diffed
 * row-by-row; objects are diffed by top-level key. Anything else is stored as a
 * full before/after snapshot so nothing is ever lost.
 */
export function summarizeChange(before: unknown, after: unknown): ChangeSummary {
  if (sameJson(before, after)) return { kind: 'none' }

  const beforeArr = before == null ? [] : before
  const afterArr = after == null ? [] : after
  if (Array.isArray(beforeArr) && Array.isArray(afterArr)) {
    const allIdentified = [...beforeArr, ...afterArr].every((r) => rowIdentity(r) !== null)
    if (allIdentified) {
      const prev = new Map(beforeArr.map((r) => [rowIdentity(r) as string, r as Row]))
      const next = new Map(afterArr.map((r) => [rowIdentity(r) as string, r as Row]))
      const added: unknown[] = []
      const removed: unknown[] = []
      const changed: Array<{ id: string; fields: Record<string, [unknown, unknown]> }> = []
      for (const [id, row] of next) {
        const old = prev.get(id)
        if (!old) added.push(row)
        else {
          const fields = diffFields(old, row)
          if (Object.keys(fields).length > 0) changed.push({ id, fields })
        }
      }
      for (const [id, row] of prev) if (!next.has(id)) removed.push(row)
      if (added.length === 0 && removed.length === 0 && changed.length === 0) return { kind: 'none' }
      return { kind: 'rows', added, removed, changed }
    }
  }

  if (isPlainObject(before ?? {}) && isPlainObject(after ?? {})) {
    const fields = diffFields((before ?? {}) as Row, (after ?? {}) as Row)
    if (Object.keys(fields).length === 0) return { kind: 'none' }
    return { kind: 'object', fields }
  }

  return { kind: 'snapshot', before: before ?? null, after: after ?? null }
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const changes =
      input.changes !== undefined ? input.changes : summarizeChange(input.before, input.after)
    if (
      input.changes === undefined &&
      (changes as ChangeSummary).kind === 'none' &&
      !input.action.startsWith('delete')
    ) {
      return // nothing actually changed — don't add noise
    }
    await ensureAuditTable()
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? null,
        actorRole: input.actor?.roleKey ?? null,
        module: input.module,
        action: input.action,
        entityKey: input.entityKey,
        entityId: input.entityId ?? null,
        changes: changes == null ? undefined : (changes as Prisma.InputJsonValue),
        meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: input.req ? requestIp(input.req) : null,
      },
    })
  } catch (err) {
    console.error('[audit] failed to record change', input.module, input.action, input.entityKey, err)
  }
}
