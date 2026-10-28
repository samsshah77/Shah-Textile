import nodemailer from 'nodemailer'

export interface EmailAttachment {
  filename: string
  content: string // base64 string
  encoding?: string
  contentType?: string
}

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  attachments?: EmailAttachment[]
}

/**
 * Creates nodemailer transport using available free SMTP configuration.
 *
 * Supported free SMTP sources:
 * 1. Free Gmail Account:
 *    - GMAIL_USER / SMTP_USER (e.g. your-email@gmail.com)
 *    - GMAIL_APP_PASS / SMTP_PASS (Google 16-character App Password - 100% free)
 * 2. Plesk VPS / Domain Postfix:
 *    - SMTP_HOST (e.g. localhost, mail.saratextilesweaving.com)
 *    - SMTP_PORT (25, 465, or 587)
 *    - SMTP_USER & SMTP_PASS (if auth required)
 * 3. Any standard free SMTP (Brevo, Resend, Zoho, Outlook, etc.)
 */
/** True when the server has a mailbox to send from (Gmail app password or an SMTP server). */
export function emailConfigured(): boolean {
  const gmail = Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASS?.trim())
  return gmail || Boolean(process.env.SMTP_HOST?.trim())
}

export function getEmailTransporter() {
  const host = process.env.SMTP_HOST || (process.env.GMAIL_USER ? 'smtp.gmail.com' : '')
  const port = Number(process.env.SMTP_PORT) || (host === 'smtp.gmail.com' ? 465 : 587)
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || ''
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASS || ''

  if (!user && !host) {
    return null
  }

  if (host === 'smtp.gmail.com' || (user && user.endsWith('@gmail.com'))) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
    })
  }

  const smtpHost = host || 'localhost'
  // The mail server on this same machine (Plesk): nothing leaves the server, and Plesk's own
  // mail certificate is often self-signed, so the certificate name check is skipped only here.
  const local = smtpHost === 'localhost' || smtpHost === '127.0.0.1'
  return nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 15_000,
    ...(local ? { tls: { rejectUnauthorized: false } } : {}),
  })
}

/** A plain reason for a failed send — the raw error can be empty (e.g. a refused connection). */
export function emailErrorText(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string; errors?: Array<{ code?: string; message?: string }> }
  const code = e?.code || e?.errors?.[0]?.code || ''
  const msg = e?.message || e?.errors?.[0]?.message || ''
  if (code === 'EAUTH' || e?.responseCode === 535) return 'Email ya password ghalat hai (SMTP_USER / SMTP_PASS check karein).'
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ENOTFOUND'].includes(code) && !/certificate/i.test(msg))
    return `Mail server se rabta nahi ho saka (${code}). SMTP_HOST / SMTP_PORT check karein — isi server par ho to SMTP_HOST=localhost likhein.`
  if (/certificate|self.signed|altname/i.test(msg) || /CERT|SELF_SIGNED/.test(code))
    return 'Mail server ka certificate match nahi hua. Isi server ka mail ho to SMTP_HOST=localhost likhein.'
  if (e?.responseCode && e.responseCode >= 500) return `Mail server ne mana kiya (${e.responseCode}): ${msg}`
  return msg || code || 'Email nahi gayi (wajah maloom nahi — server log dekhein).'
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
}: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = getEmailTransporter()
    if (!transporter) {
      return {
        success: false,
        error:
          'Server par SMTP / Gmail settings configure nahi hain. (GMAIL_USER & GMAIL_APP_PASS ya SMTP_HOST env add karein). Aap "Open Email App" se bhi direct email bhej sakte hain.',
      }
    }

    const fromAddress =
      process.env.SMTP_FROM ||
      (process.env.GMAIL_USER
        ? `"Sara Textile ERP" <${process.env.GMAIL_USER}>`
        : process.env.SMTP_USER
          ? `"Sara Textile ERP" <${process.env.SMTP_USER}>`
          : '"Sara Textile ERP" <noreply@saratextilesweaving.com>')

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: (a.encoding || 'base64') as 'base64',
        contentType: a.contentType || 'application/pdf',
      })),
    })

    return { success: true, messageId: info.messageId }
  } catch (err) {
    console.error('[sendEmail Error]', err)
    return { success: false, error: emailErrorText(err) }
  }
}
