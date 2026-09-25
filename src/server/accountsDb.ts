import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function dbAccountsGetAll(): Promise<Record<string, unknown>> {
  const rows = await prisma.accountsStore.findMany()
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    out[row.key] = row.payload
  }
  return out
}

export async function dbAccountsSave(key: string, value: unknown): Promise<void> {
  await prisma.accountsStore.upsert({
    where: { key },
    create: { key, payload: value as Prisma.InputJsonValue },
    update: { payload: value as Prisma.InputJsonValue },
  })
}

export async function dbAccountsDelete(key: string): Promise<void> {
  await prisma.accountsStore.deleteMany({ where: { key } })
}
