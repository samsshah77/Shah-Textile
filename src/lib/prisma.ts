import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/sara_textile?schema=public'

/** Bump when Prisma models change so hot-reload drops stale PrismaClient. */
const PRISMA_CLIENT_GEN = 4

const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaGen?: number
}

function createClient() {
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

if (!globalForPrisma.prisma || globalForPrisma.prismaGen !== PRISMA_CLIENT_GEN) {
  globalForPrisma.prisma = createClient()
  globalForPrisma.prismaGen = PRISMA_CLIENT_GEN
}

export const prisma = globalForPrisma.prisma
