import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/server/userAccess'
import { writeAudit } from '@/server/auditLog'
import { QualityTargetError, listQualityTargets, setQualityTarget } from '@/server/floor/qualityTargets'

export const runtime = 'nodejs'

/** Active Qualities → Target (meters) per quality. */
export async function GET(request: NextRequest) {
  const check = await requireAccess(request, ['prod_quality', 'quality_archive'], 'view')
  if (check.error) return check.error
  try {
    return NextResponse.json({ ok: true, targets: await listQualityTargets() })
  } catch (err) {
    console.error('[quality-targets GET]', err)
    return NextResponse.json({ ok: false, error: 'Could not load targets.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAccess(request, 'prod_quality', 'edit', 'You need Quality (Edit) to set targets.')
  if (check.error) return check.error
  const body = (await request.json().catch(() => null)) as { qualityId?: string; target?: number | null } | null
  const qualityId = String(body?.qualityId || '')
  try {
    const before = (await listQualityTargets())[qualityId] ?? null
    const target = await setQualityTarget(qualityId, body?.target ?? null, check.user.name || check.user.email || 'User')
    await writeAudit({
      req: request,
      actor: check.user,
      module: 'floor',
      action: 'quality.target',
      entityKey: 'floor_quality_targets',
      entityId: qualityId,
      before: { target: before },
      after: { target },
    })
    return NextResponse.json({ ok: true, target })
  } catch (err) {
    if (err instanceof QualityTargetError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
    console.error('[quality-targets POST]', err)
    return NextResponse.json({ ok: false, error: 'Could not save the target.' }, { status: 500 })
  }
}
