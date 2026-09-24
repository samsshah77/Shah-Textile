import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function dbPayrollGetAll(): Promise<Record<string, unknown>> {
  const rows = await prisma.payrollStore.findMany()
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    out[row.key] = row.payload
  }
  return out
}

export async function dbPayrollGet(key: string): Promise<unknown | null> {
  const row = await prisma.payrollStore.findUnique({ where: { key } })
  return row?.payload ?? null
}

export async function dbPayrollSave(key: string, value: unknown): Promise<void> {
  await prisma.payrollStore.upsert({
    where: { key },
    create: { key, payload: value as Prisma.InputJsonValue },
    update: { payload: value as Prisma.InputJsonValue },
  })
}

export async function dbPayrollIsEmpty(): Promise<boolean> {
  if (!prisma?.payrollStore) {
    throw new Error(
      'Prisma payrollStore model missing — restart `npm run dev` after `npx prisma generate` / `db push`.'
    )
  }
  const count = await prisma.payrollStore.count()
  return count === 0
}
