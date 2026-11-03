import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const connectionString =
  process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_fb74ZlaKLGDh@ep-hidden-union-azivgio9-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'

/** Bump when Prisma models change so hot-reload drops stale PrismaClient. */
const PRISMA_CLIENT_GEN = 6

const isSsl = connectionString.includes('sslmode=require') || connectionString.includes('neon.tech')

const pool = new pg.Pool({
  connectionString,
  ssl: isSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 3,
})
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
