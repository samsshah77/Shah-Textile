import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { dbAccountsDelete, dbAccountsGetAll, dbAccountsSave } from '@/server/accountsDb'
import { currentUser } from '@/server/current-user'
import { isAccountsController } from '@/lib/accountsAccess'
import { isAccountsStoreKey } from '@/lib/accountsKeys'

export const runtime = 'nodejs'

async function requireSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  return token ? await verifySession(token) : null
}

export async function GET() {
  try {
    const store = await dbAccountsGetAll()
    return NextResponse.json({ ok: true, store })
  } catch (err) {
    console.error('[accounts/store GET]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Load failed' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const claims = await requireSession(req)
    if (!claims) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const actor = await currentUser(req)
    if (!isAccountsController(actor)) {
      return NextResponse.json(
        { ok: false, error: 'Account changes are limited to Tufail.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const key = String(body?.key || '')
    const value = body?.value

    if (!isAccountsStoreKey(key)) {
      return NextResponse.json({ ok: false, error: `Unknown key: ${key}` }, { status: 400 })
    }

    if (value == null) {
      await dbAccountsDelete(key)
    } else {
      await dbAccountsSave(key, value)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[accounts/store PUT]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 }
    )
  }
}
