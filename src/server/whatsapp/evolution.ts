/**
 * Server-side Evolution API integration for WhatsApp.
 * Enables sending direct PDF documents and text messages straight from the VPS,
 * with zero monthly cost and automated session persistence.
 */

export interface WhatsAppConnectionStatus {
  configured: boolean
  connected: boolean
  state: 'open' | 'connecting' | 'close' | 'offline'
  qrcode?: string
  instanceName: string
  error?: string
}

export function evolutionConfig() {
  const baseUrl = (process.env.EVOLUTION_API_URL?.trim() || 'http://127.0.0.1:8080').replace(/\/$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY?.trim() || 'sara_evolution_secret_key_2026'
  const instance = process.env.EVOLUTION_INSTANCE_NAME?.trim() || 'sara-textile'
  return { baseUrl, apiKey, instance }
}

/** Standardize Pakistan and international numbers: 0300 1234567 -> 923001234567 */
export function cleanWhatsAppNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0092')) return `92${digits.slice(4)}`
  if (digits.startsWith('03') && digits.length === 11) return `92${digits.slice(1)}`
  if (digits.length === 10 && digits.startsWith('3')) return `92${digits}`
  return digits
}

/** Check connection status or fetch QR code to pair phone */
export async function getWhatsAppStatus(): Promise<WhatsAppConnectionStatus> {
  const { baseUrl, apiKey, instance } = evolutionConfig()

  try {
    // 1. Check if the instance is currently connected
    const stateRes = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (stateRes.status === 404) {
      // Instance does not exist yet — create it
      const createRes = await fetch(`${baseUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({
          instanceName: instance,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
        signal: AbortSignal.timeout(10000),
      })
      const createData = (await createRes.json().catch(() => null)) as {
        qrcode?: { base64?: string }
        instance?: { state?: string }
      } | null

      return {
        configured: true,
        connected: false,
        state: 'connecting',
        qrcode: createData?.qrcode?.base64,
        instanceName: instance,
      }
    }

    if (!stateRes.ok) {
      return {
        configured: true,
        connected: false,
        state: 'offline',
        instanceName: instance,
        error: `Evolution API returned status ${stateRes.status}`,
      }
    }

    const stateData = (await stateRes.json().catch(() => null)) as {
      instance?: { state?: string }
      state?: string
    } | null

    const state = (stateData?.instance?.state || stateData?.state || 'close').toLowerCase()

    if (state === 'open') {
      return {
        configured: true,
        connected: true,
        state: 'open',
        instanceName: instance,
      }
    }

    // If not open (connecting / close), fetch the QR code
    const connectRes = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    const connectData = (await connectRes.json().catch(() => null)) as {
      base64?: string
      code?: string
    } | null

    return {
      configured: true,
      connected: false,
      state: state === 'connecting' ? 'connecting' : 'close',
      qrcode: connectData?.base64 || connectData?.code,
      instanceName: instance,
    }
  } catch (err) {
    return {
      configured: false,
      connected: false,
      state: 'offline',
      instanceName: instance,
      error: err instanceof Error ? err.message : 'WhatsApp service unreachable on VPS',
    }
  }
}

/** Send direct PDF / document to a recipient number via Evolution API v1 */
export async function sendWhatsAppDocument({
  number,
  filename,
  base64,
  caption,
  mimeType = 'application/pdf',
}: {
  number: string
  filename: string
  base64: string
  caption?: string
  mimeType?: string
}): Promise<{ success: boolean; messageId?: string }> {
  const { baseUrl, apiKey, instance } = evolutionConfig()
  const cleanNum = cleanWhatsAppNumber(number)
  if (!cleanNum || cleanNum.length < 10) {
    throw new Error('Valid WhatsApp phone number chahiye (e.g. 0300 1234567)')
  }

  // Extract raw base64 data, stripping any non-standard parameters (e.g. jsPDF's ;filename=generated.pdf)
  const rawBase64 = base64.includes(',') ? base64.split(',')[1].trim() : base64.trim()
  const mediaPayload = `data:${mimeType};base64,${rawBase64}`

  const sendPayload = async (body: Record<string, unknown>) => {
    return await fetch(`${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      signal: AbortSignal.timeout(35000),
      body: JSON.stringify(body),
    })
  }

  // 1. Primary: Evolution API Baileys schema with mediaMessage container (strictly required by server)
  let res = await sendPayload({
    number: cleanNum,
    options: {
      delay: 800,
      presence: 'composing',
    },
    mediaMessage: {
      mediatype: 'document',
      mimetype: mimeType,
      caption: caption || '',
      media: mediaPayload,
      fileName: filename,
    },
  })

  // 2. Retry with rawBase64 inside mediaMessage if status 400
  if (!res.ok && res.status === 400) {
    const retryRes = await sendPayload({
      number: cleanNum,
      options: {
        delay: 800,
        presence: 'composing',
      },
      mediaMessage: {
        mediatype: 'document',
        mimetype: mimeType,
        caption: caption || '',
        media: rawBase64,
        fileName: filename,
      },
    }).catch(() => null)
    if (retryRes && retryRes.ok) {
      res = retryRes
    }
  }

  // 3. Fallback: flat schema if still 400
  if (!res.ok && res.status === 400) {
    const flatRes = await sendPayload({
      number: cleanNum,
      mediatype: 'document',
      mimetype: mimeType,
      caption: caption || '',
      media: mediaPayload,
      fileName: filename,
      delay: 800,
    }).catch(() => null)
    if (flatRes && flatRes.ok) {
      res = flatRes
    }
  }

  const data = (await res.json().catch(() => null)) as {
    key?: { id?: string }
    error?: string
    message?: string | string[]
    response?: { message?: string | string[] }
  } | null

  if (!res.ok) {
    const rawMsg = data?.response?.message || data?.message || data?.error
    let errorMsg = Array.isArray(rawMsg)
      ? rawMsg.join(', ')
      : typeof rawMsg === 'string'
        ? rawMsg
        : `Failed to send WhatsApp document (HTTP ${res.status})`

    if (/connection|session|closed|not connected|disconnected/i.test(errorMsg)) {
      errorMsg = 'WhatsApp phone server se linked nahi hai. Pehle QR Code scan karke connect karein.'
    }
    throw new Error(errorMsg)
  }

  return { success: true, messageId: data?.key?.id }
}

/** Send direct text message to a recipient number via Evolution API */
export async function sendWhatsAppText({
  number,
  text,
}: {
  number: string
  text: string
}): Promise<{ success: boolean; messageId?: string }> {
  const { baseUrl, apiKey, instance } = evolutionConfig()
  const cleanNum = cleanWhatsAppNumber(number)
  if (!cleanNum || cleanNum.length < 10) {
    throw new Error('Valid WhatsApp phone number chahiye (e.g. 0300 1234567)')
  }

  const sendTextPayload = async (body: Record<string, unknown>) => {
    return await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify(body),
    })
  }

  // 1. Primary: Evolution API textMessage container
  let res = await sendTextPayload({
    number: cleanNum,
    options: {
      delay: 600,
      presence: 'composing',
    },
    textMessage: {
      text,
    },
  })

  // 2. Fallback: flat schema if 400
  if (!res.ok && res.status === 400) {
    const flatRes = await sendTextPayload({
      number: cleanNum,
      text,
      delay: 600,
    }).catch(() => null)
    if (flatRes && flatRes.ok) {
      res = flatRes
    }
  }

  const data = (await res.json().catch(() => null)) as {
    key?: { id?: string }
    error?: string
    message?: string | string[]
    response?: { message?: string | string[] }
  } | null

  if (!res.ok) {
    const rawMsg = data?.response?.message || data?.message || data?.error
    let errorMsg = Array.isArray(rawMsg)
      ? rawMsg.join(', ')
      : typeof rawMsg === 'string'
        ? rawMsg
        : `Failed to send WhatsApp text (HTTP ${res.status})`

    if (/connection|session|closed|not connected|disconnected/i.test(errorMsg)) {
      errorMsg = 'WhatsApp phone server se linked nahi hai. Pehle QR Code scan karke connect karein.'
    }
    throw new Error(errorMsg)
  }

  return { success: true, messageId: data?.key?.id }
}
