import { describe, expect, it } from 'vitest'
import { cleanMedia } from '@/server/floor/faultReports'
import { encodeWav } from '@/lib/voiceNote'

describe('fault reports', () => {
  it('accepts only our own upload paths as media', () => {
    const media = cleanMedia([
      { url: '/uploads/faults/fault-20261024-abcdef12.jpg', kind: 'image' },
      { url: '/uploads/faults/fault-20261024-0123abcd.mp4', kind: 'video' },
      { url: 'https://evil.example/x.jpg', kind: 'image' },
      { url: '/uploads/faults/../../.env', kind: 'image' },
      { url: '/uploads/faults/fault-20261024-abcdef12.php', kind: 'image' },
      { url: '/uploads/faults/fault-20261024-abcdef12.jpg', kind: 'pdf' },
    ])
    expect(media.map((m) => m.kind)).toEqual(['image', 'video'])
    expect(cleanMedia('nope')).toEqual([])
  })

  it('voice note WAV has a valid header (16 kHz mono 16-bit)', async () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16000)
    const b = Buffer.from(await wav.arrayBuffer())
    expect(b.subarray(0, 4).toString()).toBe('RIFF')
    expect(b.subarray(8, 12).toString()).toBe('WAVE')
    expect(b.readUInt32LE(24)).toBe(16000)
    expect(b.readUInt16LE(22)).toBe(1)
    expect(b.length).toBe(44 + 4 * 2)
  })
})
