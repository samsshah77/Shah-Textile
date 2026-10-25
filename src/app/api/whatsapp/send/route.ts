import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { currentUser } from '@/server/current-user'
import {
  cleanWhatsAppNumber,
  sendWhatsAppDocument,
  sendWhatsAppText,
} from '@/server/whatsapp/evolution'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    number?: string
    text?: string
    fileBase64?: string
    filename?: string
    caption?: string
    mimeType?: string
  } | null

  const rawNumber = body?.number?.trim() || ''
  const number = cleanWhatsAppNumber(rawNumber)
  if (!number || number.length < 10) {
    return NextResponse.json(
      { error: 'Valid WhatsApp number darj karein (e.g. 0300 1234567)' },
      { status: 400 }
    )
  }

  try {
    if (body?.fileBase64) {
      const res = await sendWhatsAppDocument({
        number,
        filename: body.filename?.trim() || 'Report.pdf',
        base64: body.fileBase64,
        caption: body.caption || body.text,
        mimeType: body.mimeType || 'application/pdf',
      })
      return NextResponse.json({ success: true, messageId: res.messageId })
    }

    if (body?.text?.trim()) {
      const res = await sendWhatsAppText({
        number,
        text: body.text.trim(),
      })
      return NextResponse.json({ success: true, messageId: res.messageId })
    }

    return NextResponse.json(
      { error: 'Bhejne ke liye message ya PDF file chahiye' },
      { status: 400 }
    )
  } catch (err) {
    console.error('[whatsapp-send]', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'WhatsApp message send nahi ho saka. Server connection check karein.',
      },
      { status: 502 }
    )
  }
}
