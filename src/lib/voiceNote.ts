/**
 * Records a short voice note in the browser and turns it into a small WAV
 * (16 kHz mono, 16-bit) — a format every speech model accepts, whatever the phone records.
 */

export interface VoiceRecording {
  stop: () => Promise<Blob>
  cancel: () => void
}

export const MAX_VOICE_SECONDS = 120

export async function startVoiceNote(onAutoStop?: () => void): Promise<VoiceRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Is browser mein mic nahi chalta (Chrome istemal karein, website https par ho).')
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.start()
  const timer = setTimeout(() => onAutoStop?.(), MAX_VOICE_SECONDS * 1000)
  const release = () => {
    clearTimeout(timer)
    stream.getTracks().forEach((t) => t.stop())
  }
  return {
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onstop = async () => {
          release()
          try {
            resolve(await toWav(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })))
          } catch (e) {
            reject(e)
          }
        }
        if (recorder.state !== 'inactive') recorder.stop()
      }),
  }
}

async function toWav(blob: Blob): Promise<Blob> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const rate = 16000
    const length = Math.max(1, Math.ceil(decoded.duration * rate))
    const offline = new OfflineAudioContext(1, length, rate)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const mono = (await offline.startRendering()).getChannelData(0)
    return encodeWav(mono, rate)
  } finally {
    void ctx.close()
  }
}

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}
