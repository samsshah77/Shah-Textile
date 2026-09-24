import { NextRequest, NextResponse } from 'next/server'
import { seedSheet20260923 } from '@/server/seedSheet20260923'

export const runtime = 'nodejs'

const DEPLOY_SEED_KEY = 'sara_deploy_secret_key_2026'

function unauthorized() {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
}

async function handle(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== DEPLOY_SEED_KEY) return unauthorized()

  try {
    const result = await seedSheet20260923()
    return NextResponse.json({
      success: true,
      message: `Sheet ${result.date} seeded (${result.looms} looms, A+B=${result.totalAB}).`,
      ...result,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Seed failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
