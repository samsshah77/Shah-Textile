import { describe, it, expect } from 'vitest'
import { emailErrorText } from '@/server/email/mailer'

describe('emailErrorText — a reason the user can act on', () => {
  it('refused connection with an empty message (AggregateError)', () => {
    const e = Object.assign(new Error(''), { code: 'ESOCKET', errors: [{ code: 'ECONNREFUSED', message: '' }] })
    expect(emailErrorText(e)).toMatch(/rabta nahi.*ESOCKET.*localhost/)
  })
  it('wrong password', () => {
    expect(emailErrorText(Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }))).toMatch(/password ghalat/)
  })
  it('certificate mismatch', () => {
    expect(emailErrorText(Object.assign(new Error('self-signed certificate'), { code: 'ESOCKET' }))).toMatch(/certificate/)
  })
  it('never empty', () => {
    expect(emailErrorText({})).not.toBe('')
  })
})
