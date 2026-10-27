import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import { sendEmail } from '@/server/email/mailer'

export const runtime = 'nodejs'

const MAX_FILE_BASE64 = 15 * 1024 * 1024 // 15 MB cap
/** Per user, per hour — the mill's mailbox can't be used to spam (Gmail would block it). */
const SENDS_PER_HOUR = 30
const recentSends = new Map<string, number[]>()

function underLimit(userId: string): boolean {
  const now = Date.now()
  const list = (recentSends.get(userId) || []).filter((t) => now - t < 3_600_000)
  const ok = list.length < SENDS_PER_HOUR
  if (ok) list.push(now)
  recentSends.set(userId, list)
  return ok
}

export async function POST(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!underLimit(user.id)) {
    return NextResponse.json({ error: 'Ek ghante me bohat zyada emails — thori der baad bhejein.' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as {
    to?: string
    subject?: string
    text?: string
    fileBase64?: string
    filename?: string
  } | null

  const to = (body?.to || '').trim()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!to || !emailRegex.test(to)) {
    return NextResponse.json(
      { error: 'Valid email address darj karein (e.g. name@domain.com)' },
      { status: 400 }
    )
  }

  if (body?.fileBase64 && body.fileBase64.length > MAX_FILE_BASE64) {
    return NextResponse.json({ error: 'File size 15 MB se bari hai.' }, { status: 413 })
  }

  const subject = (body?.subject || '').trim().slice(0, 200) || 'Sara Textile Report'
  const text = (body?.text || '').trim().slice(0, 5000) || 'Report attached.'
  const filename = (body?.filename || 'Sara_Textile_Report.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 120)

  const attachments = body?.fileBase64
    ? [
        {
          filename,
          content: body.fileBase64,
          encoding: 'base64',
          contentType: 'application/pdf',
        },
      ]
    : undefined

  const result = await sendEmail({
    to,
    subject,
    text,
    attachments,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Email send nahi ho saki.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, messageId: result.messageId })
}
