import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { getWhatsAppStatus } from '@/server/whatsapp/evolution'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = await getWhatsAppStatus()
  return NextResponse.json(status)
}
