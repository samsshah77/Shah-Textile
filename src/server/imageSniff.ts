/**
 * The real file type, read from the file's first bytes. The name and the type the browser
 * sends are never trusted — a file is saved only as .jpg / .png / .webp / .gif, so nothing
 * uploaded can ever run on the server (e.g. a ".php" pretending to be a photo).
 */
export function sniffImage(buf: Buffer): '.jpg' | '.png' | '.webp' | '.gif' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png'
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp'
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('ascii'))) return '.gif'
  return null
}
