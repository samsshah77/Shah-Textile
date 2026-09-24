import { NextRequest, NextResponse } from 'next/server'
import { ensureFloorPayrollTables } from '@/server/ensureFloorPayrollTables'

export const runtime = 'nodejs'

const DEPLOY_SEED_KEY = 'sara_deploy_secret_key_2026'

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== DEPLOY_SEED_KEY) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await ensureFloorPayrollTables()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ensure failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
